# SARVEDA NATIVE ACCOUNTING — PHASE 3A
# PURCHASES, VENDORS, EXPENSES & ACCOUNTS PAYABLE ARCHITECTURE

**Date:** 2026-08-23  
**Mode:** READ-ONLY architecture / analysis — **no implementation**  
**Depends on:** Phase 2 sales shadow (ORDER_PAID, ORDER_REFUNDED_FULL, PAYMENT_GATEWAY_SETTLED, Reconciliation V3)  
**Zoho Books:** remains authoritative during shadow mode  

---

## 1. Executive Summary

Sarveda already has a **feature-flagged Purchases Phase 1** module. It is **not** starting from scratch.

```
Vendor → PurchaseOrder → PurchaseReceipt (stock ↑) → VendorBill → (Mark paid)
                                                      Expense (standalone, parallel)
```

| Area | Status |
|------|--------|
| Vendor master | **Usable** for AP (GSTIN/PAN/address/state; no bank details) |
| Purchase Order | **Implemented** — procurement document only |
| Goods receipt | **Implemented** — increases `Inventory.onHand`; updates `costInPaise` (latest) |
| Vendor Bill | **Implemented** — best candidate for financial recognition when `OPEN` |
| Expense | **Implemented** — standalone operating spend; **not** linked to bills |
| Vendor Payment document | **NOT IMPLEMENTED** — only `paidInPaise` + status flip |
| Purchase returns / debit notes | **NOT IMPLEMENTED** |
| Supplier invoice attachments | **NOT IMPLEMENTED** |
| Zoho AP push (bills/vendors/payments) | **NOT IMPLEMENTED** (columns exist; no writers) |
| Native purchase journals | **NOT IMPLEMENTED** (`ACCOUNTING_PURCHASES_POSTING_ENABLED` exists, unused for posting) |

**Accounting boundary (recommended):**

| Event | Creates GL? |
|-------|-------------|
| PO create/send | **No** (commitment only) |
| Goods receipt | **No** in Phase 3B (stock ops; inventory GL deferred) |
| VendorBill → `OPEN` | **Yes** — `VENDOR_BILL_POSTED` (AP recognition) |
| Expense → `RECORDED` | **Yes** — separate `EXPENSE_RECORDED` if paid-through / expense path |
| Mark bill PAID | **Not yet** as bank journal until payment evidence exists |
| Receipt alone / PO alone | **Never** expense the same purchase again |

**Readiness verdict:** Operational purchases foundation is sufficient to design and start **bounded Phase 3B (Vendor Bill + AP shadow)**. Vendor payment journals, inventory asset/COGS, and ITC claimability require later slices after evidence gaps are closed.

---

## 2. Existing Purchases Module

### Feature flags

| Flag | Role |
|------|------|
| `PURCHASES_MODULE_ENABLED` | Backend gate for `/api/admin/purchases/*` |
| `NEXT_PUBLIC_PURCHASES_ENABLED` | Frontend sidebar / UI gate |
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | Declared in `accounting-flag.ts` / `.env.example` — **no purchase posting service yet** |

### Migration

`backend/prisma/migrations/20260822143856_purchases_module_phase1/` — additive Vendor / PO / Receipt / Bill / Expense tables.

### Source layout

| Layer | Path |
|-------|------|
| Schema | `backend/prisma/schema.prisma` (Purchases section ~1534–1747) |
| Service | `backend/src/modules/purchases/purchases.service.ts` |
| Handlers | `backend/src/modules/purchases/purchases.handlers.ts` |
| Routes | `backend/src/modules/purchases/purchases.routes.ts` |
| Numbers | `backend/src/modules/purchases/purchases-number.ts` |
| Flag | `backend/src/modules/purchases/purchases-flag.ts` |
| Mount | `backend/src/modules/admin/admin.routes.ts` → `/purchases` |
| API client | `frontend/lib/purchases-api.ts` |
| Admin UI | `frontend/app/admin/purchases/**` |

### End-to-end process (as coded)

| Step | Model / status | Stock | Money | Accounting today |
|------|----------------|-------|-------|------------------|
| 1. Vendor | `Vendor` | — | — | — |
| 2. PO | `PurchaseOrder` DRAFT → SENT | — | Totals computed | **None** |
| 3. Receive | `PurchaseReceipt` + lines; PO PARTIALLY_RECEIVED / RECEIVED | `Inventory.onHand += qty`; optional `ProductVariant.costInPaise = rate` | Cost rate from PO line | **None** |
| 4. Bill | `VendorBill` DRAFT → OPEN | — | Bill totals | **None** |
| 5. Mark paid | `status=PAID`, `paidInPaise` | — | Scalar only | **None** |
| 6. Expense | `Expense` RECORDED | — | Amount + optional tax | **None** |
| 7. Payment doc / return | — | — | — | **N/A** |

**Transaction boundaries:**

- PO create / bill create / expense create: single Prisma writes (not multi-step commerce payment txs).
- **Receive** is the critical transaction: `prisma.$transaction` creates receipt, updates PO line `receivedQty`, increments inventory, optionally updates variant cost, derives PO status (`receivePurchaseOrder`).

---

## 3. Vendor Model

`Vendor` fields (schema):

| Field | Present | AP / GST relevance |
|-------|---------|-------------------|
| name, displayName | Yes | Required |
| email, phone | Yes | Contact |
| gstin, pan | Yes | GST / KYC |
| paymentTerms (string) | Yes | Soft terms; **no numeric credit days** |
| currency | Yes (default INR) | Multi-currency deferred |
| billing address + state + country | Yes | Place-of-supply proxy |
| shipping address | Yes | Ops |
| notes | Yes | — |
| zohoContactId | Yes | **Manual / unused by Zoho push** |
| isActive | Yes | Soft disable |
| bank account / IFSC / UPI | **No** | Optional for payment remittance UI later |
| creditDays (int) | **No** | Can derive aging from `dueDate` on bills without this |

**Verdict:** Vendor master is **sufficient for Phase 3B AP + GST party identification**. Missing bank details are **not** blockers for liability recognition. Numeric credit days not required if bills carry `dueDate`.

---

## 4. Purchase Order Flow

### Header (`PurchaseOrder`)

- Number: `PO-#####` via `generatePoNumber()`
- Status: `DRAFT | SENT | PARTIALLY_RECEIVED | RECEIVED | CANCELLED`
- Vendor link, optional `pickupLocationId`, dates, payment terms, reverse charge flag, tax treatment string
- Money: `subtotalInPaise`, `discountPercent` / `discountInPaise`, `adjustmentInPaise`, `taxInPaise`, `totalInPaise`
- **No dedicated freight field** (use adjustment / notes)
- Currency: inherited from vendor practice (document totals in paise; no PO-level currency column — Vendor.currency exists)

### Lines (`PurchaseOrderLine`)

- Optional `variantId`, `itemName`, `sku`, `hsnCode`, `quantity`, `receivedQty`, `rateInPaise`, `taxClass`, `taxInPaise`, `lineTotalInPaise`
- Tax: `computeLineTotals` = **exclusive base + (base × rate%)** then `lineTotal = base + tax` (unlike sales storefront inclusive pricing)

### Approval

- **No multi-step approval workflow.** Status transitions are admin PATCH (DRAFT ↔ SENT; CANCELLED; receive advances receipt statuses). Edit blocked once `RECEIVED` or `CANCELLED`.

### Accounting boundary

**PO is a procurement commitment, not a GL event.**  
Do **not** post `Dr Inventory / Cr AP` on PO create or send.

---

## 5. Goods Receipt / Stock Flow

### Models

- `PurchaseReceipt` — `purchaseOrderId`, `receivedAt`, `notes`
- `PurchaseReceiptLine` — `poLineId`, `quantityReceived`  
  **No cost fields on receipt lines** — cost implied from PO line `rateInPaise` at receive time.

### Behavior (`receivePurchaseOrder`)

1. Reject DRAFT / CANCELLED PO.
2. Enforce remaining qty (no over-receipt).
3. Create receipt + lines.
4. Increment `PurchaseOrderLine.receivedQty`.
5. If `variantId`: create/update `Inventory.onHand += quantityReceived`.
6. If `rateInPaise > 0`: set `ProductVariant.costInPaise = rateInPaise` (**latest cost overwrite**).
7. Derive PO status PARTIALLY_RECEIVED / RECEIVED.

### Partial / over / under

| Case | Support |
|------|---------|
| Partial receipts | **Yes** (multiple receipts) |
| Over-receipt | **Blocked** |
| Under-receipt forever | Allowed (PO stays PARTIALLY_RECEIVED) |
| Receipt without variant | Stock **not** updated (non-catalog lines) |
| Purchase return / reverse stock | **Not implemented** |

### Inventory valuation readiness

| Signal | Assessment |
|--------|------------|
| Qty on hand | Reliable for catalog variants received via this path |
| Unit cost | Latest PO rate only — **no cost layers / history** |
| Landed cost / freight allocation | **Not modeled** |
| Receipt ↔ Bill linkage | **No FK** — only optional bill→PO |

**Conclusion:** Receipt is authoritative for **quantity**. It is **not** yet reliable enough alone for Inventory Asset GL or rigorous COGS without a costing method + layers (see §13).

**Phase 3B:** treat receipt as **operational only** (no inventory journal).

---

## 6. Vendor Bill Flow

### `VendorBill`

| Field | Notes |
|-------|-------|
| `billNumber` | Internal `BILL-#####` (Sarveda), **not** supplier invoice # |
| `referenceNumber` | Soft field — **intended** supplier invoice / ref |
| `billDate`, `dueDate` | Present |
| `subtotalInPaise`, `discountInPaise`, `adjustmentInPaise`, `taxInPaise`, `totalInPaise` | Present |
| `paidInPaise` | Scalar paid-to-date |
| `status` | DRAFT / OPEN / PAID / VOID |
| `purchaseOrderId` | Optional link to PO (**not** to receipt) |
| `zohoBillId` | Column only |
| CGST / SGST / IGST columns | **Absent** — single `taxInPaise` |
| Place of supply | **Absent** on bill (vendor billing state available) |
| Supplier GSTIN snapshot | Via `vendor.gstin` join — **not** snapshotted on bill |
| Attachment | **Absent** |
| Linked receipt | **Absent** |

### `VendorBillLine`

Same pattern as PO lines (variant optional, rate, taxClass, tax, lineTotal). **No `hsnCode` on bill lines** (unlike PO lines).

### Authoritative financial recognition (from code behavior)

| Candidate | Reality |
|-----------|---------|
| Bill created DRAFT | Editable draft — **not** recognition |
| Bill `OPEN` | Outstanding AP in list summary (`total − paid`) — **best recognition trigger** |
| Goods received | Stock only — **not** AP |
| Expense created | Parallel path — **not** bill recognition |
| Mark PAID | Settlement of liability scalar — weak payment evidence |

**Recommended authority:**  
`VENDOR_BILL_POSTED` when status becomes **`OPEN`** (or created as OPEN), using `billDate` as accounting date, with idempotency on bill id.

VOID / edit-after-post must fail closed or require adjustment architecture (mirror sales).

---

## 7. Expense Flow

### Model `Expense`

- `expenseAccount` — **free-text** (not CoA code FK)
- Optional `vendorId`
- `amountInPaise`, `taxInPaise`, `taxInclusive`
- `paidThrough` — free-text bank/cash label
- `expenseType` GOODS | SERVICES
- GST helpers: `gstTreatment`, `sourceOfSupply`, `destinationOfSupply` (default KA), `reverseCharge`, `hsnSac`
- `invoiceNumber`, `referenceNumber`, `notes`
- Status: DRAFT | RECORDED (UI defaults RECORDED)

### Capabilities vs gaps

| Capability | Status |
|------------|--------|
| A. Linked to VendorBill | **No** |
| B. Standalone | **Yes** |
| C. Paid immediately (semantic) | Implied by `paidThrough` free text — **no payment row** |
| D. Unpaid / payable expense | **Not modeled** (no AP link) |
| E. Employee reimbursement | **Not modeled** |
| F. Cash / bank / card | Free-text `paidThrough` only |

**Nature:** Expense currently represents a **recorded operating spend document**, often with implied payment, **not** a payment allocation against bills.

**Double-count risk:** Recording the same supplier invoice as both `VendorBill` and `Expense` would double expense/AP. Policy: **inventory/trade purchases → Bill**; **non-stock opex without AP bill → Expense**; never both for one economic event.

---

## 8. Vendor Payment Capability

**There is no `VendorPayment` (or equivalent) model.**

What exists:

- `VendorBill.paidInPaise` + `status` OPEN/PAID via `markBillPaid()` / PATCH
- UI “Mark paid” sets full paid amount (`patchBill({ status: "PAID" })`)
- No payment date distinct from bill update time beyond `updatedAt`
- No UTR / bank account / allocation table
- No multi-bill payment, advances, or partial allocation document (partial `paidInPaise` possible in API but UI is all-or-nothing)

**Explicit statement:** Sarveda does **not** currently support accounting-grade supplier payment evidence.  
Do **not** invent payment journals from “Mark paid” alone in Phase 3B. Phase 3C should introduce an accounting-owned or purchases payment document first.

Outstanding (ops UI): `totalInPaise − paidInPaise` for OPEN bills — usable for **reporting**, not bank recon.

---

## 9. Zoho Purchases Integration

Verified under `backend/src/modules/zoho/`:

| Action | Implemented? |
|--------|----------------|
| Sales contacts / invoices / credit notes | Yes (commerce) |
| Zoho vendor contact create from `Vendor` | **No** (`zohoContactId` stored only) |
| Zoho purchase orders | **No** |
| Zoho bills from `VendorBill` | **No** (`zohoBillId` unused) |
| Zoho expenses | **No** |
| Zoho vendor payments | **No** |
| Zoho purchase credits | **No** |

`zoho-inventory-sync-flag.ts` states Sarveda is stock master; Zoho for accounting — but **purchase-side Zoho API writers are absent**.

For each Zoho purchase-side action today:

```
SOURCE EVENT → (none)
SOURCE FILE → (none)
DATA SENT → (none)
ZOHO OBJECT → (none)
WHEN → N/A
```

Shadow native AP can proceed **without** Zoho push. Later optional sync: OPEN bill → Zoho Bill, payment → Zoho Vendor Payment.

---

## 10. Input GST Readiness

### What exists on purchases

| Data | PO | Bill | Expense |
|------|----|------|---------|
| Aggregate tax paise | Yes | Yes | Yes |
| Per-line taxClass → rate | Yes | Yes | Manual taxInPaise |
| HSN | Line `hsnCode` | **Missing on lines** | `hsnSac` |
| CGST/SGST/IGST split persisted | **No** | **No** | **No** |
| Supplier GSTIN | Vendor | Join vendor | Join vendor |
| Invoice # / date | ref / dates | ref / billDate | invoiceNumber / expenseDate |
| Place of supply | — | — | source/destination fields |
| Inclusive vs exclusive | Exclusive add-on | Exclusive add-on | `taxInclusive` flag |

Sales `isInterState()` / invoice PDF split is **not** reused in purchases totals today.

### CoA ready

- `2200` Input CGST, `2201` Input SGST, `2202` Input IGST

### Recognition vs ITC eligibility

| Concept | Rule |
|---------|------|
| **Accounting recognition** | May Dr Input GST clearing/holding when bill OPEN **if** tax amounts + party GSTIN + invoice identity exist |
| **GST ITC eligibility** | Separate — claim only after documentary tax invoice / GSTR match policy (mirror Phase 2D gateway ITC: do not auto-claim) |

**Phase 3B recommendation:**

1. Persist or compute **provisional** CGST/SGST vs IGST at journal build from vendor billing state vs seller state (`SELLER_STATE`).
2. Post to Input GST accounts **only when** vendor GSTIN present and tax > 0; else Dr expense/inventory gross or hold `GST_DATA_GAP`.
3. Track ITC status analogous to settlements: e.g. `UNVERIFIED_PENDING_TAX_INVOICE` until attachment + verification workflow exists.

---

## 11. Proposed Accounting Events

Only events justified by current data:

### A. `VENDOR_BILL_POSTED` — **Phase 3B (primary)**

| Attribute | Definition |
|-----------|------------|
| Source | `VendorBill` |
| Trigger | Status `OPEN` (not DRAFT/VOID) |
| Event date | `billDate` |
| Unique key | `vendor_bill:{billId}` |
| Money | subtotal, discount, adjustment, tax, total |
| GST | taxInPaise + computed split; vendor GSTIN |
| Document | VendorBill (+ optional PO) |
| Reconstructable | Yes from bill rows |
| Phase | **3B** |

### B. `EXPENSE_RECORDED` — **Phase 3C**

| Attribute | Definition |
|-----------|------------|
| Source | `Expense` status `RECORDED` |
| Trigger | Created/updated to RECORDED with amount > 0 |
| Event date | `expenseDate` |
| Unique key | `expense:{expenseId}` |
| Money | amountInPaise, taxInPaise, taxInclusive semantics |
| Credit side | Bank/Cash **only if** `paidThrough` mapped; else AP or fail `DATA_GAP` |
| Phase | **3C** (after CoA mapping for `expenseAccount`) |

### C. `VENDOR_PAYMENT_MADE` — **Phase 3C (after payment model)**

| Attribute | Definition |
|-----------|------------|
| Source | **New** payment document (not yet present) |
| Trigger | Payment posted + bill allocations |
| Do **not** fire from Mark paid alone | Until UTR/bank/date exist |
| Phase | **3C** |

### D. `GOODS_RECEIVED` — **Deferred / optional memo**

Operational stock event. Inventory Asset journal **deferred to 3D** when costing policy exists. May remain discovery-only.

### E. Not proposed now

| Event | Reason |
|-------|--------|
| PO posted | Not financial |
| `PURCHASE_RETURN` | No model |
| `VENDOR_ADVANCE_PAID` | No model |
| `EXPENSE_PAID` separate | Expense already implies paid-through; avoid split until unpaid expenses exist |

---

## 12. Journal Entry Matrix

### Normal unpaid inventory / trade bill (conceptual Phase 3B)

When lines map to catalog variants (stock purchase):

```
Dr 1200 Inventory Asset          (taxable / exclusive base ± discount allocation)
Dr 2200/2201 or 2202 Input GST   (if GSTIN + tax recognized; else omit / DATA_GAP)
    Cr 2000 Accounts Payable     totalInPaise
```

When lines are non-stock / services on a bill:

```
Dr 5300 Purchase / Operating Expense   (or mapped expense)
Dr Input GST (if appropriate)
    Cr 2000 Accounts Payable
```

Freight/adjustment: if `adjustmentInPaise` used as freight → prefer `5200 Shipping Expense` or capitalize to inventory **only** under explicit landed-cost policy (defer capitalization to 3D).

### Immediate cash expense (Phase 3C)

```
Dr 5300 (mapped from expenseAccount)
Dr Input GST (if appropriate)
    Cr 1010 Bank / 1000 Cash     (from paidThrough mapping table)
```

### Vendor payment (Phase 3C — after payment evidence)

```
Dr 2000 Accounts Payable
    Cr 1010 Bank
```

All journals must balance exactly in paise; fail closed on unexplained imbalance. No Round Off to hide missing GST split without policy.

---

## 13. Inventory / COGS Readiness

### Data chain today

```
PO line rateInPaise
  → Receipt (qty only; cost not stored on receipt)
  → ProductVariant.costInPaise := latest rate
  → Inventory.onHand += qty
```

Sales Phase 2 **deferred COGS** deliberately. Purchases do **not** yet close that gap.

### Costing methods vs Sarveda data

| Method | Fit |
|--------|-----|
| Latest purchase cost | **Matches current code** — poor for COGS accuracy when costs change |
| Weighted average | Needs running avg layers or recompute from receipts+bills |
| FIFO | Needs receipt layers — **not present** |
| Standard cost | Needs maintained standards — **not present** |

### Recommendation

1. **Phase 3B–3C:** Do **not** post Inventory Asset / COGS GL from receipts or sales.  
2. **Phase 3D:** Prefer simplest accounting-correct method that fits additive history:  
   - Introduce **receipt (or bill-line) cost layers** keyed by variant + qty remaining, valued at **bill rate when bill linked**, else PO rate;  
   - COGS on sale = consume layers (FIFO) **or** maintain weighted average updated on each capitalized receipt.  
3. Until then, `costInPaise` remains **ops/analytics**, not GL authority.

**If forced to choose one shadow memo without layers:** latest cost × onHand is **management estimate only**, not audit-ready Inventory Asset.

---

## 14. Accounts Payable Design

### Derivable today (ops)

```
Outstanding = VendorBill.totalInPaise − VendorBill.paidInPaise
  for status OPEN (and optionally PAID with residual)
```

List API already aggregates outstanding + overdue (dueDate < now).

### Aging (design)

Buckets Current / 1–30 / 31–60 / 61–90 / >90 from `dueDate` (fallback `billDate`) — **feasible for OPEN bills** using existing dates.

### Gaps for true AP subledger

- No payment allocation rows → partial payments are a single scalar (lossy if multiple payments)
- No credits/returns
- Mark paid without bank proof → aging “PAID” may not match bank

**Phase 3B:** AP balance from posted `VENDOR_BILL_POSTED` journals (Cr 2000) is the shadow truth; ops `paidInPaise` is **informational** until 3C payments post Dr 2000.

---

## 15. Purchase Returns

**Not implemented** in purchases module (no PurchaseReturn / debit note models).  
`MarketplaceReturn` is marketplace channel — **out of scope**.

Later design (not inventing current support):

- Return header linked to bill/PO/receipt  
- Stock decrement  
- Supplier credit (Dr AP / Cr Inventory or Expense; reverse Input GST)  
- Event `PURCHASE_RETURN_POSTED`

---

## 16. Opening Balance / Migration Strategy

Lightsail/pre-launch may have empty or thin purchases data (module is new + gated). Woo/legacy may have supplier history **outside** these tables.

| Approach | Use when |
|----------|----------|
| A. Historical backfill of every old purchase | **Avoid** — incomplete evidence, Zoho already holds books |
| B. Opening balances | **Preferred** at cutover: Dr/Cr opening Inventory / AP / Bank to match Zoho TB |
| C. Hybrid | Opening AP/Inventory + **forward** `VENDOR_BILL_POSTED` from go-live date |

**Safest before launch:** **B + forward-only native purchases posting** after a chosen cutover date. Do not journal every legacy PO/bill unless reconstructed with supplier invoices.

---

## 17. Document & Audit Trail

| Need | Today |
|------|-------|
| Supplier invoice PDF/image on VendorBill | **Missing** |
| Expense attachment | **Missing** |
| `AccountingDocumentLink` | Used for sales/settlement journals — **extend** with `documentType=VENDOR_BILL` / `EXPENSE` |
| Audit | Purchases mutations not in dedicated accounting audit yet; `AccountingAuditLog` available |

**Phase 3B minimum:** link journal ↔ VendorBill id.  
**Phase 3E:** S3 attachment on bill + ITC verification status.

---

## 18. Chart of Accounts Gap Review

### Already present (seed-coa)

1000 Cash, 1010 Bank, 1200 Inventory, 2000 AP, 2200–2202 Input GST, 5000 COGS, 5200 Shipping, 5300 Purchase/Operating Expense.

### Recommend later (do not add yet) — only if workflow needs

| Account | Justify |
|---------|---------|
| Vendor Advances | When advance payments exist |
| GST ITC Pending Verification | If Input GST posted before claim eligibility |
| Purchase Returns | When returns implemented |
| Freight-In clearing | If landed cost capitalization needed |

**Not required for 3B:** Purchases clearing if bills post straight to Inventory/Expense + AP.

---

## 19. Double-Counting Risk Analysis *(mandatory)*

Same economic purchase can appear as:

```
PO (commitment)
+ Receipt (stock)
+ VendorBill (AP)
+ Expense (opex)
+ Mark paid (status)
```

| Artifact | Role | Creates liability/expense? |
|----------|------|----------------------------|
| PO | Procurement | **No** |
| Receipt | Stock qty (+ latest cost) | **No** GL in 3B–3C |
| VendorBill OPEN | Supplier invoice | **Yes — sole AP recognition for trade purchases** |
| Expense RECORDED | Standalone opex | **Yes — only if no VendorBill for same invoice** |
| Mark paid / paidInPaise | Ops flag | **No bank GL until payment document** |

**Hard rules for implementation:**

1. Never post AP from PO or receipt.  
2. Never post expense from receipt.  
3. One supplier invoice → either Bill **or** Expense, not both.  
4. Inventory Asset capitalization (3D) must not also expense the same line via 5300.  
5. Discovery workers must dedupe by bill id / expense id unique keys.

---

## 20. Production Integration Risks

### Files future accounting may touch (prefer discovery, not in-tx hooks)

| File | Risk |
|------|------|
| `purchases.service.ts` (`receivePurchaseOrder`) | Stock correctness — **do not break**; avoid heavy accounting inside this tx |
| `purchases.handlers.ts` | Bill/expense create — optional enqueue posting event **after** commit |
| `Inventory` / `ProductVariant.costInPaise` | Commerce/stock dependent |
| Admin purchases UI | Ops UX — keep working behind `PURCHASES_MODULE_ENABLED` |

### Preferred pattern (mirror Phase 2)

- Read committed VendorBill / Expense state  
- Accounting-owned posting events + journals  
- Additive schema OK  
- **Do not regress** receive → onHand behavior  

Core rule: **DO NOT REGRESS EXISTING COMMERCE / PURCHASE / STOCK FUNCTIONALITY.**

---

## 21. Feature Flags

Existing:

- `NATIVE_ACCOUNTING_ENABLED`
- `ACCOUNTING_PURCHASES_POSTING_ENABLED` (gate purchases shadow; default OFF)
- `PURCHASES_MODULE_ENABLED` (ops module; independent)

Recommended Phase 3 splits (all default OFF):

| Flag | Purpose |
|------|---------|
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | Vendor bill AP shadow (3B) |
| `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED` | Payment journals (3C) |
| `ACCOUNTING_EXPENSE_POSTING_ENABLED` | Expense journals (3C) — or fold under purchases flag initially |
| `ACCOUNTING_INVENTORY_COGS_POSTING_ENABLED` | Inventory/COGS (3D) |

Production-like persist still requires `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` + existing dual/bulk guards.

---

## 22. Reconciliation V4 Design

### Per vendor bill

| Field |
|-------|
| Vendor, GSTIN |
| Internal bill #, supplier reference, billDate, dueDate |
| Linked PO #, receipt ids (via PO) |
| Bill total, tax, computed GST split |
| Native journal # / posting status |
| AP amount (Cr 2000) |
| Payments allocated (3C+), outstanding |
| Zoho bill id (when present) |
| Attachment status |
| Variance / status |

### Statuses

`MATCHED | UNPAID | PARTIALLY_PAID | PAID | MISSING_RECEIPT | MISSING_BILL | GST_DATA_GAP | DUPLICATE | ERROR`

`MISSING_RECEIPT` is **informational** for inventory bills (stock may lag bill) — not always an error.

---

## 23. Required Tests (future implementation)

1. Vendor bill OPEN → AP journal balanced  
2. Inventory-line bill → Dr 1200 path (when 3D; else 5300 policy)  
3. Service/non-variant bill → Dr 5300  
4. Intra-state GST split  
5. Inter-state IGST  
6. No-GST / unregistered vendor  
7. Partial receipt (ops) without double AP  
8. Multiple receipts then one bill  
9. Bill before receipt / receipt before bill (AP still once)  
10. Duplicate bill discovery / idempotent post  
11. Duplicate supplier `referenceNumber` warning  
12. Vendor payment + allocation (3C)  
13. Partial / multiple payments  
14. Overpayment fail closed  
15. Vendor advance (when model exists)  
16. Purchase return (when model exists)  
17. Cancelled PO — no bill forced  
18. VOID bill — no post / reverse policy  
19. Missing GST data → GST_DATA_GAP  
20. Missing vendor  
21. Opening balance journal (migration)  
22. Concurrent posts → one event  
23. Production dual guard  
24. Receive stock unchanged by accounting flags  
25. PO+receipt+bill+expense same invoice → only one GL recognition path  
26. Expense posting does not touch Inventory.onHand  
27. Mark paid alone does not create bank journal (until 3C)

---

## 24. Recommended Phase 3 Implementation Slices

Derived from traced gaps (not a single bang):

### Phase 3B — Vendor Bill + AP shadow *(start here)*

- Preview/post `VENDOR_BILL_POSTED` for OPEN bills  
- Journals: Expense/Inventory policy (initially **expense non-stock; inventory lines → 5300 or hold 1200 only if explicitly approved**) — **recommend 3B debit 5300 for all bill lines OR 1200 only when variantId present as provisional asset without COGS**  
- Prefer: **variant lines → Dr 1200; non-variant → Dr 5300** as shadow AP foundation, still **defer COGS**  
- Input GST provisional split + ITC unverified status  
- Idempotency, flags, admin preview, Recon V4 unpaid/matched skeleton  
- **No** payment journals; **no** receipt journals  

### Phase 3C — Expenses + Vendor Payments

- Map `expenseAccount` → CoA  
- `EXPENSE_RECORDED` with bank mapping  
- Introduce payment document + allocations → `VENDOR_PAYMENT_MADE`  
- Stop treating Mark paid as GL  

### Phase 3D — Inventory valuation / COGS *(if layers added)*

- Cost layers from receipt/bill  
- Inventory Asset true-up  
- COGS on sale consumption  
- Landed cost optional  

### Phase 3E — Recon / attachments / opening balances / Zoho AP optional

- Attachments + ITC verification  
- Opening AP/Inventory  
- Optional Zoho bill push  

---

## 25. Explicit Files Inspected

**Schema / migration**

- `backend/prisma/schema.prisma` (Vendor → Expense; Accounting CoA; AccountingDocumentLink)
- `backend/prisma/migrations/20260822143856_purchases_module_phase1/migration.sql`

**Purchases module**

- `backend/src/modules/purchases/purchases.service.ts`
- `backend/src/modules/purchases/purchases.handlers.ts`
- `backend/src/modules/purchases/purchases.routes.ts`
- `backend/src/modules/purchases/purchases-number.ts`
- `backend/src/modules/purchases/purchases-flag.ts`
- `backend/src/modules/admin/admin.routes.ts` (mount)

**Accounting flags / CoA**

- `backend/src/modules/accounting/accounting-flag.ts`
- `backend/src/modules/accounting/seed-coa.ts`
- `backend/.env.example`, `frontend/.env.example`
- `backend/test/setup.ts` (purchases posting flag default)

**GST**

- `backend/src/utils/gst.ts`

**Zoho (purchase-side absence)**

- `backend/src/modules/zoho/zoho-contacts.ts`
- `backend/src/modules/zoho/zoho-invoices.ts`
- `backend/src/modules/zoho/zoho-financials.ts`
- `backend/src/modules/zoho/zoho-inventory-sync-flag.ts`
- `backend/src/modules/zoho/zoho-items.ts` (sales_and_purchases item type only)
- Grep across `backend/src/modules/zoho` for bill/vendor payment writers — **none found**

**Frontend**

- `frontend/lib/purchases-api.ts`
- `frontend/app/admin/purchases/bills/page.tsx`
- `frontend/app/admin/purchases/expenses/page.tsx`
- `frontend/app/admin/purchases/purchase-orders/[id]/page.tsx`
- Related list/new pages under `frontend/app/admin/purchases/**`

**Prior status docs (cross-check, not authority over code)**

- `SARVEDA_ACCOUNTING_CURRENT_STATUS.md` §9 Purchases
- `SARVEDA_ACCOUNTING_SAFE_ARCHITECTURE_PLAN.md` (flag naming)

---

## 26. Code Modification Statement

```
CODE MODIFICATIONS: NONE
SCHEMA CHANGES: NONE
MIGRATIONS: NONE
DB WRITES: NONE
STOCK CHANGES: NONE
VENDOR DATA CHANGES: NONE
ZOHO WRITES: NONE
ACCOUNTING POSTINGS: NONE
PHASE 3 IMPLEMENTATION: NONE
```

This document is architecture / analysis only.

---

READY FOR PHASE 3 IMPLEMENTATION
