# SARVEDA NATIVE ACCOUNTING — PHASE 3D
# INVENTORY VALUATION + COGS ARCHITECTURE AUDIT

**Date:** 2026-08-23  
**Mode:** READ-ONLY design — **no implementation**  
**Depends on:** Phase 3C complete (VendorBill AP, VendorPayment, Expense, purchase recon + cutover)  
**Zoho Books:** remains authoritative during shadow mode  

Legend used below:
- **CODE FACT** — verified in repository source / Prisma schema
- **DB OBSERVATION** — query against reachable DB (this workspace: local Postgres only)
- **ARCHITECTURAL DECISION** — recommended design for Phase 3D implementation

---

## 1. Executive Summary

Sarveda already has a clear **operational** inventory lifecycle and a deliberate Phase 3B decision that stock VendorBill lines debit **1210 Inventory Purchases Clearing**, not **1200 Inventory Asset**.

```
PO → PurchaseReceipt (onHand ↑, costInPaise := PO rate)
       ↘
VendorBill (OPEN) → VENDOR_BILL_POSTED → Dr 1210 / Cr 2000 (+ provisional Input GST)

Checkout → reserve → ORDER_PAID / confirmStock (onHand ↓)
                 → ORDER_PAID_V1 revenue (no COGS today)

Full refund / RTO cancel → restock onHand ↑ (money vs goods not always separated)
```

**What is missing financially:**
- No native cost layers / valuation ledger
- No 1210 → 1200 capitalization
- No COGS (5000) recognition
- `OrderItem` has **no cost-at-sale snapshot**
- `ProductVariant.costInPaise` is **latest mutable cost**, sparsely populated, **not** a safe COGS source
- Opening inventory will be required at cutover because historical FIFO rebuild is unreliable

**Recommended native design (high level):**
1. Accounting-owned **FIFO cost layers** + **consumptions** (do not mutate ops `Inventory`)
2. Keep `VENDOR_BILL_POSTED` → 1210 as-is; add separate capitalization event when billed qty is received
3. Recognize COGS on **ORDER_PAID** (same economic moment as revenue + stock confirm), discovery-driven
4. Fail-closed when layers insufficient; never invent cost from sale price or latest `costInPaise`
5. Opening inventory layers + valuation journal at cutover from Zoho/legacy TB
6. Reverse COGS only when stock is actually restocked, using **original consumption cost**

**Verdict at end of this document.**

---

## 2. Existing Inventory Model

### CODE FACT — core catalog / stock

| Model | Role | Qty | Cost | Price | Notes |
|-------|------|-----|------|-------|-------|
| `Product` | Catalog parent | — | — | — | `productType`: SIMPLE / VARIABLE / DIGITAL |
| `ProductVariant` | Sellable SKU | — | `costInPaise Int?` (optional, mutable) | `mrp*` / `sale*` | No warehouse |
| `Inventory` | **Operational quantity authority** | `onHand`, `reserved` | — | — | 1:1 with variant; `available ≈ onHand − reserved` |
| `OrderItem` | Sale line snapshot | `qtyOrdered` | **none** | `unitPriceInPaise`, tax, discount, line total | Immutable commercial snapshots only |
| `Order` | Sale header | — | — | totals | Status / payment / fulfillment enums |
| `Shipment` | Carrier tracking | — | — | — | `status` includes RTO; `rtoAt` |
| `Refund` | Money refund row | — | — | `amountInPaise` | Linked to `Payment`; **no restock flag** |
| `PurchaseOrder` | Procurement commitment | line `quantity` / `receivedQty` | line `rateInPaise` | — | Status DRAFT→SENT→PARTIALLY_RECEIVED→RECEIVED |
| `PurchaseOrderLine` | PO line | qty + receivedQty | rateInPaise | tax | Optional `variantId` |
| `PurchaseReceipt` | Goods receipt header | — | — | — | Linked to PO only (**not** to VendorBill) |
| `PurchaseReceiptLine` | Receipt qty | `quantityReceived` | **none on receipt line** | — | Cost inferred from PO line rate at receive time |
| `VendorBill` / `VendorBillLine` | Supplier invoice | qty | `rateInPaise` | tax, totals | Optional `purchaseOrderId`; optional `variantId` |
| `Expense` | Standalone opex | — | amount/tax | — | Not inventory |

**No models found for:** goods-return notes, purchase returns, inventory movement history, stock adjustment audit table, warehouse/bin locations on Inventory.

**Immutable vs mutable:**
- Mutable current stock: `Inventory.onHand` / `reserved`
- Mutable latest cost: `ProductVariant.costInPaise`
- Immutable commercial sale snapshots: OrderItem price fields
- Receipt qty immutable after create (no update path found); PO `receivedQty` accumulates
- Accounting journals (when posted) already immutable by Phase 1.5 rules

---

## 3. Inventory Quantity Writers

All writers found under `backend/src` (scripts also mutate stock for migration — classify IMPORT/MIGRATION).

| Class | File / function | Trigger | Delta | Tx boundary | Financial evidence | Idempotency |
|-------|-----------------|---------|-------|-------------|--------------------|-------------|
| **SALE_RESERVATION** | `orders.service.ts` `reserveStockTx` | Checkout create-order | `reserved += qty` if `(onHand−reserved) ≥ qty` | Checkout tx | Order + OrderItems | Per order create; SQL predicate prevents oversell at reserve |
| **SALE_CONFIRMATION** | `confirmStockTx` | Paid / COD place | `onHand -= qty`, `reserved -= min(qty,reserved)` | Payment/checkout tx | Order PAID / payment CAPTURED | Called once on pay path; **no floor on onHand** |
| **ORDER_CANCEL** (unpaid) | `releaseStockTx` / `cancelUnpaidOrderWithRelease` | Timeout / fail | `reserved -=` | Tx | Order CANCELLED unpaid | Status-gated |
| **REFUND** (full) | `restockPaidOrderTx` via `handlePaidOrderStatusChange(..., REFUNDED)` | Full refund paths | `onHand += qtyOrdered` | Tx | Refund + order REFUNDED | Status change path; **always restocks if stock was confirmed** |
| **ORDER_CANCEL** (paid) | same restock path with CANCELLED | Admin cancel / RTO | `onHand +=` | Tx | Status history | Same as refund restock |
| **RTO** | `orderLifecycle.handleRtoShipment` → cancel+restock | Shiprocket RTO webhook | `onHand +=` via cancel path | Multi-step | Shipment RTO + order CANCELLED | Webhook path |
| **RTO (tracking only)** | `persistShipmentTrackingFromCarrier` | Poll/webhook non-handleRto | **No stock change** — only `fulfillmentStatus=RETURNED` | Update | Shipment RTO | **Divergence risk** vs handleRtoShipment |
| **PURCHASE_RECEIPT** | `purchases.service.receivePurchaseOrder` | Admin receive PO | `onHand += qtyReceived` | Prisma `$transaction` | `PurchaseReceipt` + PO lines | Not journaled; qty capped by remaining PO qty |
| **ADMIN_ADJUSTMENT** | `admin.handlers` patch/bulk/import | Admin UI | Absolute `onHand = n` (min 0) | updateMany / upsert | Weak (no reason/cost audit table) | Overwrites |
| **MANUAL_STOCK** | `productAdmin.service` upsert on product save | Admin product form | set `onHand` | Save path | Weak | Overwrites |
| **MANUAL_STOCK** | `productXlSheet.service` save | XL sheet qty | set `onHand = qty` | Per row | Weak | Overwrites |
| **IMPORT / ZOHO** | `zoho-inventory.ts`, `zoho-webhook.ts` | Pull / webhook | set `onHand` from Zoho | Upsert | Zoho stock | Overwrites Sarveda qty |
| **OTHER** | `course-checkout-product.ts` | Course stub | set onHand 999 | Upsert | Digital stub | N/A |

**Partial refund CODE FACT:** `refund.service` restocks only when **fully** refunded; partial refund updates payment status only — **no partial restock**.

**Customer return as distinct entity:** **NOT IMPLEMENTED** (no return document). Restock is coupled to order status CANCELLED/REFUNDED when stock was confirmed.

---

## 4. Existing Cost Semantics

### CODE FACT — who writes `ProductVariant.costInPaise`

| Writer | Behavior |
|--------|----------|
| `receivePurchaseOrder` | If `line.rateInPaise > 0`, sets `costInPaise = PO line rate` (**latest overwrite**) |
| Admin XL sheet schema | Accepts `costInPaise` in save payload / displays it |
| Admin XL sheet **persist** | **Does not write** `costInPaise` to `ProductVariant` (staging prices only) |
| VendorBill create/post | Does **not** write `costInPaise` |
| ORDER_PAID / OrderItem | Does **not** snapshot cost |
| Accounting journals | Do **not** read `costInPaise` for COGS today |

### Implications

- `costInPaise` = **latest purchase rate hint**, not historical valuation.
- Historical cost of sold units is **not recoverable** from OrderItem.
- Safe COGS source requires **accounting-owned layers/consumptions** (or opening valuation + forward layers).
- Using current `costInPaise` for COGS is **rejected**.

---

## 5. Purchase Receipt / Bill Lifecycle

### CODE FACT — schema-supported sequences

| Sequence | Supported? | Notes |
|----------|------------|-------|
| PO → receipt → VendorBill | **Yes** | Bill optionally links `purchaseOrderId`; receipt always under PO |
| PO → VendorBill → receipt | **Yes** | No hard dependency bill↔receipt |
| Receipt without bill | **Yes** | Stock ↑; no AP |
| Bill without receipt | **Yes** | AP + 1210; stock may lag |
| Bill without PO | **Yes** | `purchaseOrderId` nullable |
| Partial receipt | **Yes** | `receivedQty` / multiple `PurchaseReceipt`s |
| Partial bill | **Yes** (ops) | Bill lines independent; no qty-matched-to-receipt enforcement |
| Multiple receipts / bills per PO | **Yes** | Multiple receipts; multiple bills can share same PO id (no unique constraint) |

### Linkage gap (critical)

There is **no** `VendorBillLine ↔ PurchaseReceiptLine` join. Matching must be derived by:
- optional shared `purchaseOrderId`, and/or
- same `variantId` + qty allocation rules, and/or
- admin explicit match (future)

**ARCHITECTURAL DECISION:** Do not replace 1210 in the VendorBill builder. Keep AP recognition separate from capitalization. Capitalize with a **new** event that requires valuation evidence and (for V1) preferred receipt↔bill matching rules.

---

## 6. Recommended Costing Method

Evaluated:

| Method | Fit | Issues for Sarveda |
|--------|-----|--------------------|
| **Latest cost** | Easy | Mutable; wrong for COGS/returns; sparse population | 
| **Moving / weighted average** | Moderate ops scale | Return-to-original-cost harder; average drifts; weaker audit of which purchase funded which sale |
| **FIFO cost layers** | Best audit + return reversal | Needs new accounting tables + concurrency control |

### ARCHITECTURAL DECISION — **FIFO (accounting-owned cost layers)**

**Why not easiest (latest cost):** fails matching principle and return accuracy; contradicts Phase 3A finding.

**Why FIFO over weighted average:**
- Ecommerce needs **auditable** unit cost per sale and **original cost** on restock/COGS reverse
- Opening inventory can seed layers; forward receipts add layers — fits migration reality
- Concurrent sales need layer locking anyway; FIFO makes consumption deterministic
- Scale is manageable with per-variant layer rows + `SELECT … FOR UPDATE`

**V1 simplification:** Single “warehouse” (no location dimension) unless pickup/location later becomes stock-bearing.

---

## 7. Cost Layer Model

### Proposed (do not implement yet)

**`AccountingInventoryCostLayer`**
- `id`, `variantId`
- `sourceType` (`OPENING` | `PURCHASE_RECEIPT` | `CAPITALIZATION_TRUE_UP` | …)
- `sourceId` (receipt line id / opening batch id)
- `receiptId` nullable
- `vendorBillId` / `vendorBillLineId` nullable (valuation source)
- `quantityReceived`, `quantityRemaining`
- `unitCostInPaise`, `totalCostInPaise` (ex-recoverable GST)
- `receivedAt`, `currency` (`INR`)
- `sourceFingerprint`, `createdAt`

**Uniqueness / idempotency**
- `@@unique([sourceType, sourceId])` for layer creation
- Check: `quantityRemaining >= 0` and `quantityRemaining <= quantityReceived`

**`AccountingInventoryCostConsumption`**
- `id`, `costLayerId`
- `orderId`, `orderItemId`
- `quantityConsumed`, `unitCostInPaise`, `costInPaise`
- `consumedAt`
- `postingEventId` / `journalEntryId`
- `sourceFingerprint`

**Uniqueness**
- `@@unique([orderItemId, costLayerId])` or stronger: one consumption set per `orderItemId` tied to posting event
- Prefer: consumptions created only inside COGS posting transaction with event unique key `cogs_order:{orderId}`

---

## 8. Quantity Ledger Decision

### ARCHITECTURAL DECISION — **Defer full `AccountingInventoryMovement` ledger in V1**

**Sufficient for V1:**
- Operational `Inventory` = quantity authority for commerce
- Cost layers `quantityRemaining` = accounting quantity for valuation
- Recon compares `onHand` vs Σ layer remaining

**Optional later:** movement ledger (RECEIPT / SALE / RETURN / ADJUSTMENT / OPENING) if audit needs chronological qty trail beyond layers.

**Hard rule:** financial accounting **must not** mutate `Inventory.onHand` / `reserved`.

---

## 9. Purchase Capitalization Boundary

| Event | Ops effect | Current GL | Proposed GL (3D) |
|-------|------------|------------|------------------|
| PO | commitment | none | none |
| Receipt | onHand ↑, latest cost | none | Create/update **pending** valuation evidence; capitalize when bill match exists (see §10) |
| VendorBill OPEN | AP | Dr 1210 Cr 2000 (+ GST) | **Unchanged** |
| VendorPayment | bank | Dr 2000 Cr bank | Unchanged |
| Non-stock bill line | — | Dr 5300 | Unchanged |
| Expense | bank/expense | EXPENSE_RECORDED | Unchanged — never invent inventory layers |

---

## 10. 1210 → 1200 Design

### Do **not** change Phase 3B VendorBill builder to post 1200 directly.

### Recommended V1 capitalization event: `INVENTORY_CAPITALIZED_V1`

**Economic meaning:** move clearing into inventory asset for quantities that are **both billed and received**, valued at **bill net unit cost** (ex recoverable Input GST already on 220x).

Conceptual journal:

```
Dr 1200 Inventory Asset
    Cr 1210 Inventory Purchases Clearing
```

Amount = Σ (matched qty × bill allocated net unit cost)

**Matching policy (V1):**
1. Prefer bill with `purchaseOrderId` + stock lines with `variantId`
2. Match against PO receipt qty for same variant (FIFO of receipts under that PO)
3. Capitalize `min(unreceived_capitalized_bill_qty, uncapitalized_receipt_qty)`
4. Remainder:
   - Billed not received → leave in **1210** (`INVOICED_NOT_RECEIVED`)
   - Received not billed → **no layer value yet** / `PENDING_BILL` (`RECEIVED_NOT_INVOICED`) — do not invent AP or 1200 from PO rate alone in V1 **unless** opening policy explicitly allows provisional capitalization with true-up

**Why bill cost over PO rate for layers:** AP/tax already recognized from bill; PO rate is ops estimate and can diverge.

**True-up (later slice if needed):** if provisional PO capitalization allowed, variance journal when bill arrives.

**Receipt without variantId:** non-stock — never capitalize to 1200.

---

## 11. COGS Recognition Event

### Candidates evaluated

| Event | When stock moves | When revenue posts | Reliability |
|-------|------------------|--------------------|-------------|
| ORDER_PAID | `confirmStockTx` at pay | ORDER_PAID_V1 | High |
| PROCESSING / PACKED / SHIPPED | later | revenue already | Lag; multi-status |
| DELIVERED | later | revenue already | Weak for prepaid ecommerce |

### ARCHITECTURAL DECISION — **ORDER_PAID**

- Matches revenue recognition period already chosen for shadow sales
- Aligns with physical stock decrement already happening at payment
- Discovery-driven `INVENTORY_COGS_RECOGNIZED` after/alongside ORDER_PAID without commerce hook changes
- COD: stock confirmed at placement while payment may stay PENDING — still treat as sale confirmation moment for COGS when order enters paid pipeline with confirmed stock (same `orderStockWasConfirmed` semantics)

**Do not** require FULFILLED/DELIVERED for V1 COGS.

---

## 12. COGS Journal Design

### `INVENTORY_COGS_RECOGNIZED_V1`

```
Dr 5000 Cost of Goods Sold
    Cr 1200 Inventory Asset
```

- Amount = Σ FIFO consumptions for order’s stocked OrderItems
- Per-item breakdown retained in consumption rows + journal memo / payload diagnostics
- Prefer **one journal per Order** (matches ORDER_PAID pattern; simpler discovery/idempotency)
- Payload includes per-`orderItemId` cost lines for audit

**Never** use: sale price, margin %, current `costInPaise`, guessed landed %.

**Non-stock / shipping / digital:** excluded from COGS (see §19).

---

## 13. Insufficient Cost Handling

If sale qty > Σ `quantityRemaining` for variant:

| Classification | Meaning |
|----------------|---------|
| `INSUFFICIENT_COST_LAYERS` | Need more layers / capitalization |
| `OPENING_INVENTORY_REQUIRED` | Pre-cutover stock without opening layers |
| `COST_DATA_GAP` | Receipt exists but no bill valuation yet |

**Fail-closed:** do not post COGS; do not fabricate remainder.

**Revenue:** ORDER_PAID remains posted — **do not roll back** revenue because COGS is missing.

Recon flags `COGS_UNPOSTED` until layers exist (opening or capitalization).

---

## 14. Opening Inventory Architecture

At final cutover (after freeze + import):

**Inputs (trusted):**
- Operational `Inventory.onHand` (post-import)
- Zoho / legacy inventory valuation (unit or total per SKU)
- `ACCOUNTING_CUTOVER_DATE`

**Create:**
1. Opening cost layers: `sourceType=OPENING`, qty = opening qty, unit cost from valuation file
2. Opening journal:

```
Dr 1200 Inventory Asset
    Cr Opening Balance Equity (or designated opening equity account — seed if missing)
```

**Do not** rebuild FIFO from incomplete Woo/commerce history.

**Do not** fabricate historical VendorPayments / receipts solely for layers.

Pre-cutover receipts/bills: treat via opening + forward-only capitalization after cutover (consistent with Phase 3C3 cutover).

---

## 15. Customer Refund / Return

### CODE FACT — money vs goods today

| Path | Money | Stock |
|------|-------|-------|
| Full gateway refund | Refund row + order REFUNDED | **Always restocks** full `qtyOrdered` if stock was confirmed |
| Partial refund | Money only | **No restock** |
| Paid cancel | Status CANCELLED | Restock if confirmed |

There is **no** explicit “physical return accepted” flag separate from refund/cancel.

### ARCHITECTURAL DECISION

- **Do not** reverse COGS solely because `Refund` exists (Phase 2C revenue reverse ≠ goods return).
- Reverse COGS when **restock actually occurs** (same gates as `restockPaidOrderTx`), using **original consumption** rows:

```
Dr 1200 Inventory
    Cr 5000 COGS
```

- Restore layers: prefer re-open consumption-linked qty at original unit cost (new layer `SALE_RETURN` sourced from consumption), not current cost.
- Partial money refund without restock: **no COGS reverse**.
- Future: add explicit restock/return document before decoupling refund from restock in ops — until then, accounting follows **actual restock writer**.

---

## 16. RTO

### CODE FACT

1. **Shiprocket RTO webhook** → `handleRtoShipment` → `handlePaidOrderStatusChange(CANCELLED)` → **restocks** + order CANCELLED; email `order_returned`.
2. **Generic tracking persist** on shipment status RTO → sets `fulfillmentStatus=RETURNED` only — **does not restock**.

Revenue: ORDER_PAID may already exist; cancel does **not** auto-run ORDER_REFUNDED_FULL (money may still be captured until refunded).

### ARCHITECTURAL DECISION

- COGS reverse only if restock path ran (same as §15).
- Reliable event source for reverse: restock + order CANCELLED with RTO reason / shipment `rtoAt` — not fulfillmentStatus alone.
- Flag tracking-only RTO without restock as `DATA_GAP` / ops inconsistency in inventory recon.
- Sellability: restocked qty returns to `onHand` immediately (no QC hold model exists).

---

## 17. Purchase Returns

### CODE FACT — **not implemented** operationally (no debit note / purchase return models).

**Design only / defer** to a later 3D slice or Phase 3E:
- Reference original layer / receipt
- Dr AP (or vendor receivable) / Cr 1200 (+ GST reverse)

Do not invent purchase-return posting until ops document exists.

---

## 18. Stock Adjustments

### CODE FACT

Admin can set absolute `onHand` via:
- inventory patch / bulk / CSV import
- product admin save
- XL sheet qty
- Zoho pull/webhook overwrite

**Evidence gaps:** typically no reason code, no unit cost, no adjustment document, no actor-linked audit table dedicated to stock adjustments.

### ARCHITECTURAL DECISION — **defer GL for admin/Zoho absolute adjustments in V1**

- Recon: `QUANTITY_MISMATCH` / `VALUE_DATA_GAP` when ops qty ≠ layer qty
- Later: `INVENTORY_ADJUSTED` only when adjustment carries qty + valuation + reason + actor

Zoho overwrite is especially dangerous for native layers — treat as ops sync, not capitalization source.

---

## 19. Non-stock / Shipping

### CODE FACT

- VendorBill line `variantId` present → STOCK → 1210; else NON_STOCK → 5300
- ORDER_PAID posts Product Sales + Shipping Income separately; shipping is not inventory
- `ProductType.DIGITAL` exists; course/event checkout variants may have stub inventory

### Rules for 3D

| Item | Cost layer? | COGS? |
|------|-------------|-------|
| Variant with inventory sale | Yes | Yes |
| Shipping charge | No | No |
| Non-stock purchase line | No | No |
| Standalone Expense | No | No |
| Digital/course (if no real stock movement / or stub 999) | Exclude via productType / zero confirm effect policy | No |

Need eligibility: OrderItem consumes layers only if `confirmStock` affected real inventory and product is not digital stub — classify carefully in implementation.

---

## 20. Negative Stock

### CODE FACT

- Reserve path blocks oversell: `(onHand - reserved) >= qty`
- Confirm path **decrements onHand without non-negative guard** → negative `onHand` possible if qty changed between reserve and confirm, or via concurrent admin/Zoho writes
- Admin schemas enforce `onHand >= 0` on writes; DB column has **no CHECK** constraint found in schema

### ARCHITECTURAL DECISION

- Do **not** create negative cost layers
- If ops `onHand < 0`: recon `NEGATIVE_STOCK`; COGS still fail-closed on insufficient layers
- Prefer ops fix + opening true-up over silent negative valuation

---

## 21. Concurrency

### ARCHITECTURAL DECISION

Inside COGS posting transaction:

```sql
SELECT ... FROM AccountingInventoryCostLayer
WHERE variantId = $1 AND quantityRemaining > 0
ORDER BY receivedAt ASC, id ASC
FOR UPDATE;
```

Then consume with atomic:

```sql
UPDATE ... SET quantityRemaining = quantityRemaining - $qty
WHERE id = $id AND quantityRemaining >= $qty;
```

- Abort / retry if row count 0
- No Node mutexes; works across multiple API workers
- Capitalization similarly locks bill/receipt allocation rows or uses unique posting events

---

## 22. Idempotency

| Event | Unique key (proposed) |
|-------|------------------------|
| Layer from receipt capitalization | `inv_layer:receipt_line:{receiptLineId}:bill_line:{billLineId}` (or opening id) |
| Capitalization journal | `inventory_capitalized:{billId}:{variantId}:{window}` or per matched allocation id |
| COGS | `cogs_order:{orderId}` |
| COGS reverse / return | `cogs_return:{orderId}:{restockEventId}` |

Replay must not duplicate layers, consumptions, or journals — reuse Phase 1 `AccountingPostingEvent` pattern.

---

## 23. Source Fingerprints

Fingerprint inputs:

- Receipt: receiptLineId, qty, variantId, PO rate / bill unit cost used
- Capitalization: bill line net allocation, matched qty
- COGS: orderItemId, qty, consumed layer ids + unit costs
- Return: original consumption ids + restock qty

On drift after POSTED: `SOURCE_CHANGED_AFTER_POST` + `REVERSAL_REQUIRED` — never silent mutate posted journals/layers.

---

## 24. GST / Inventory Cost Boundary

### CODE FACT (Phase 3B)

- Recoverable Input GST provisionally posted to 2200/2201/2202 when evidence allows
- Stock clearing base is **net of tax** (tax separate)

### ARCHITECTURAL DECISION (V1)

- Layer `unitCostInPaise` = **ex recoverable Input GST**
- Do not capitalize amounts already in Input GST
- Non-recoverable GST / RCM: deferred (data gap today)
- Landed cost (freight into 1200): **deferred** — freight via Expense stays expense unless later allocation module exists

---

## 25. Inventory Reconciliation V1

Per variant:

| Field | Source |
|-------|--------|
| Operational onHand | Inventory |
| Native layer qty remaining | Σ layers |
| Qty variance | onHand − layer qty |
| Native inventory value | Σ (remaining × unitCost) |
| Latest ops cost | `costInPaise` (display only) |
| Effective native unit cost | value / layer qty |
| Uncosted qty | max(0, onHand − layer qty) or pending receipt |
| Negative qty | onHand < 0 |
| Pending receipts / uncapitalized billed qty | derived |
| COGS posted / missing | posting events |
| Opening status | opening layer present? |

Statuses: `MATCHED`, `QUANTITY_MISMATCH`, `VALUE_DATA_GAP`, `OPENING_INVENTORY_REQUIRED`, `INSUFFICIENT_COST_LAYERS`, `COGS_UNPOSTED`, `SOURCE_CHANGED_AFTER_POST`, `NEGATIVE_STOCK`, `ERROR`.

---

## 26. GL Control Reconciliation

| Control | Invariant (paise) |
|---------|-------------------|
| 1200 GL balance | = Σ layer `quantityRemaining * unitCost` (posted layers only) |
| 1210 GL balance | = billed stock net not yet capitalized |
| 5000 COGS GL | = Σ posted consumptions − Σ return reversals |

Drift → recon ERROR / DATA_GAP; investigate before authoritative cutover.

---

## 27. Historical Migration Strategy

### ARCHITECTURAL DECISION

**Prefer opening inventory at cutover + native costing forward.**

Do **not** attempt full historical FIFO rebuild from Woo/migrated orders unless a complete receipt+cost history is proven (it is not).

Lightsail/pre-launch DB is disposable and will be refreshed — opening procedure must be **repeatable** (Phase 3C3 migration-day sequence + inventory opening step).

---

## 28. Zoho Comparison Boundary

Useful at final cutover (manual / one-shot import, not aggressive API dashboards):

- Inventory asset valuation
- COGS YTD (comparison only)
- Stock on hand by SKU

Shadow mode: Zoho authoritative; native vs Zoho inventory value = **DATA_GAP** until import file exists.

Do not implement Zoho inventory valuation API ingestion in early 3D slices.

---

## 29. Feature / Production Guards

Recommended flags (default OFF):

```env
ACCOUNTING_INVENTORY_VALUATION_ENABLED=0
ACCOUNTING_COGS_POSTING_ENABLED=0
# Capitalization may share valuation flag or separate:
# ACCOUNTING_INVENTORY_CAPITALIZATION_ENABLED=0
```

Plus existing:

- `NATIVE_ACCOUNTING_ENABLED`
- `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` for production-like persist
- bulk discovery positive guard
- `ACCOUNTING_CUTOVER_DATE` / `ACCOUNTING_CUTOVER_FORWARD_ONLY`

No commerce hook activation for initial shadow validation — discovery workers only.

---

## 30. Proposed Phase 3D Implementation Slices

Adjusted to **actual** code (sub-slices of Phase 3D — not new roadmap modules):

### **3D1 — Foundation: cost layers + opening inventory**
- Prisma models for layers/consumptions
- Opening import tool (admin-only, flagged)
- Opening journal to 1200
- Inventory Recon V1 (qty/value vs layers)
- No change to VendorBill / ORDER_PAID builders

### **3D2 — Capitalization: 1210 → 1200**
- Match billed stock lines to receipts
- `INVENTORY_CAPITALIZED_V1` journals
- Leave unmatched 1210 / uncosted receipts visible in recon
- Do not alter Phase 3B bill posting shape

### **3D3 — Sale COGS consumption**
- Discovery on ORDER_PAID candidates
- FIFO consume + `INVENTORY_COGS_RECOGNIZED_V1`
- Fail-closed insufficient layers
- Per-order journal + item breakdown

### **3D4 — Restock reverse COGS + hardening**
- Reverse COGS on confirmed restock (full refund / RTO cancel path)
- Concurrency stress tests, fingerprints, GL controls
- Explicit handling of tracking-only RTO without restock
- Optional adjustment deferral remains

**Out of 3D unless later approved:** purchase returns, landed cost allocation, weighted-average alternative, movement ledger table, ops refund/restock decoupling.

---

## 31. Risk Matrix

| Risk | Rating | Notes |
|------|--------|-------|
| Mutable latest `costInPaise` used as COGS | **BLOCKER** if used | Architecture forbids |
| Missing historical cost / sparse costInPaise | **HIGH** | Opening inventory required |
| Receipt vs bill timing / no line link | **HIGH** | Matching rules + 1210 residual |
| Partial receipts / multiple bills | **HIGH** | Allocation complexity |
| Concurrent sales over-consuming layers | **HIGH** | FOR UPDATE mandatory |
| Refund money without intending restock | **HIGH** | Ops always restocks on full refund today |
| RTO path divergence (restock vs status-only) | **MEDIUM** | Two code paths |
| Negative onHand possible | **MEDIUM** | Fail-closed layers |
| Migrated opening inventory quality | **HIGH** | Depends on Zoho valuation file |
| Duplicate COGS consumption | **HIGH** | Event unique keys |
| Source mutation after post | **MEDIUM** | Fingerprints + reversal |
| GST double capitalization | **MEDIUM** | Use net costs only |
| Ops qty vs accounting qty divergence (Zoho overwrite) | **HIGH** | Recon QUANTITY_MISMATCH |
| Digital/stub inventory generating COGS | **MEDIUM** | Eligibility filters |
| Landed cost ignored | **LOW** (V1 accept) | Documented deferral |

---

## 32. Lightsail Read-Only Findings

### Access note

- This workspace `DATABASE_URL` points to **localhost**.
- SSH to documented Lightsail host (`13.204.112.165`) and legacy EC2 (`13.206.192.106`) was **not available** from this environment (permission denied / timeout).
- Therefore **no live Lightsail DB statistics** were collected in this audit run.

### LOCAL_DB_OBSERVATION (reachable Postgres — illustrative only; not Lightsail)

| Metric | Value |
|--------|-------|
| ProductVariants | 1945 |
| Inventory rows | 1158 |
| Variants with `costInPaise > 0` | **11** |
| Null/zero cost | **1934** |
| Negative onHand | 0 |
| Σ onHand | 1,021,887 |
| PurchaseOrders / Receipts | **0 / 0** |
| VendorBills | 1 (no PO link; 0 stock lines) |
| Paid-ish orders / order items | 4 / 4 |
| Refunds / RTO shipments | 0 / 0 |

**Interpretation:** Even local migrated-like catalog shows **cost almost entirely missing** and **no purchase receipt history** — strongly supports **opening inventory at cutover**, not historical FIFO rebuild.

When Lightsail is reachable, re-run the same read-only aggregates before 3D1 implementation.

---

## 33. Files That Future Implementation Would Need To Touch

*(Design list only — not modified in this phase.)*

**Likely new**
- `backend/prisma/schema.prisma` + migration for cost layer / consumption models
- `backend/src/modules/accounting/inventory-*.ts` (layers, capitalization, COGS, opening, recon)
- Admin accounting pages for inventory recon / opening import
- Feature flags in `accounting-flag.ts`, `.env.example`
- Tests under `backend/test/accounting/`
- Lightsail validation scripts

**Extend carefully (no commerce behavior change)**
- `vendor-bill-journal.builder.ts` — **read-only reuse**; do not switch 1210→1200 in-place
- `order-paid` discovery patterns — parallel COGS discovery
- `reconciliation.service.ts` / purchase recon — add inventory recon
- `seed-coa.ts` — opening equity account if missing
- `accounting.routes.ts` / handlers

**Must not change for shadow 3D1–3D3**
- `checkout.service.ts`, `orders.service.ts` stock writers (observe only)
- `purchases.service.ts` receive/mark-paid behavior
- Zoho inventory overwrite semantics (document risk only)

---

## 34. Recommendation

Phase 3D is **architecturally ready** to implement in **safe sub-slices**, with these non-negotiables:

1. Keep **1210** on VendorBill; capitalize separately to **1200**
2. Use **FIFO accounting layers**, not `costInPaise`
3. COGS at **ORDER_PAID**, discovery-driven, fail-closed
4. **Opening inventory** mandatory at cutover
5. Reverse COGS only on **actual restock**, original cost
6. Flags default OFF; Zoho remains authoritative in shadow mode
7. No inventory/COGS work should mutate operational stock writers

Proceed to **Phase 3D1** (layers + opening + recon) after stakeholder review of matching rules for receipt↔bill capitalization.

---

READY FOR PHASE 3D IMPLEMENTATION
