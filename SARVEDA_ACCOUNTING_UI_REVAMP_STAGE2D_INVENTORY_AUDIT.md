# SARVEDA ACCOUNTING UI REVAMP — STAGE 2D INVENTORY AUDIT

**Mode:** READ-ONLY discovery (no application code modified)  
**Date:** 2026-08-28  
**Locked prior stages:** Stage 2A Purchases · Stage 2B Banking · Stage 2C Sales  

---

## 1. Executive summary

Inventory **accounting backend is mature and real**: FIFO cost layers, purchase capitalization (Dr 1200 / Cr 1210), COGS recognition (Dr 5000 / Cr 1200), COGS reversal via SELLABLE restock (new `RETURN_RESTOCK` layers + reverse journal), opening inventory XLSX batches, and diagnostic reconciliation **v1→v4** (UI currently uses **v4**).

Inventory **UI is a single engineering mega-page** (`/admin/accounting/inventory`) with UUID inputs, dry-run discovery, account codes (1200/1210/5000), raw `JSON.stringify` previews, and posting without confirmation modals. Opening XLSX cutover tooling is embedded on the same page as day-to-day valuation/COGS.

| Area | Maturity |
|------|----------|
| Backend posting / layers | **IMPLEMENTED** |
| Accounting math (FIFO) | **IMPLEMENTED** |
| Reconciliation (diagnostic) | **IMPLEMENTED** (v4 authoritative for UI) |
| Frontend operator UX | **UI_GAP** (console / shadow style) |
| Warehouse-scoped costing | **NOT IMPLEMENTED** |
| Weighted average / standard cost | **NOT IMPLEMENTED** (FIFO only) |
| UI “resolve mismatch” posting | **NOT IMPLEMENTED** (recon is diagnostic only) |

**Stage 2D recommendation:** Frontend-only workspace redesign reusing existing APIs. **No backend or accounting-logic changes required** for a Stage 2D presentation revamp.

**Stage 2C closure:** `STAGE 2C CLOSED — NO MATERIAL UI GAPS FOUND`

---

## 2. Current frontend

### Route
| Route | File | Nav |
|-------|------|-----|
| `/admin/accounting/inventory` | `frontend/app/admin/accounting/inventory/page.tsx` | Accounting → Inventory → “Inventory Valuation” |

Operational stock (not Accounting): `/admin/inventory` → `AdminInventoryWorkspace` (on-hand / reserve ops). Accounting page subtitle correctly states it **does not change operational stock**.

### Single mega-page sections (verified)
1. KPI strip: 1200 GL balance, native layer value, GL vs layers variance  
2. Classification summary — **raw JSON `<pre>`**  
3. FIFO Cost of Goods Sold — Order UUID → Preview / Post one / Dry-run discovery — **JSON preview**  
4. Return / Restock COGS reversal — Restock event UUID → Preview / Post / Dry-run — **JSON**  
5. Purchase Capitalization — Receipt line UUID → Preview / Post / Dry-run + clearing table (bill/SKU/qty/1210 status)  
6. Opening inventory XLSX — upload, allow qty mismatch, Preview / Save draft / **Post opening batch** (dangerous)  
7. Physical inventory reconciliation (sample) — table from **recon v4**  
8. Opening batches list  

### Terminology / risks (current UI)
- Engineering: “FIFO”, “1200”, “1210”, “5000”, “Dry-run discovery”, “Post one”, “Native layer”, UUID placeholders  
- Raw JSON for COGS / reversal / capitalization / classification  
- Dangerous posts **without** confirmation modal  
- Opening (cutover) co-located with daily inventory accounting  

### Empty / error
- Generic red banner for errors; limited empty-state copy; busy flag shared across all sections  

**Status labels:** IMPLEMENTED backend · **UI_GAP** presentation · DISPLAY ONLY for classification JSON dump  

---

## 3. Backend APIs

All under `/api/admin/accounting/inventory/…` (from `accounting.routes.ts`). Handlers in `accounting.handlers.ts` (+ opening inventory handlers).

| METHOD | ROUTE | PURPOSE | R/W | Flags (persistence) | Accounting effect |
|--------|-------|---------|-----|---------------------|-------------------|
| GET | `/inventory/reconciliation` | Recon v1 | READ | n/a | None (diagnostic) |
| GET | `/inventory/reconciliation/v2` | + opening vs purchase layers, 1210 GL | READ | n/a | None |
| GET | `/inventory/reconciliation/v3` | + consumptions / COGS missing | READ | n/a | None |
| GET | `/inventory/reconciliation/v4` | + return restock / reversal gaps | READ | n/a | None |
| GET | `/inventory/classification-summary` | Variant classification counts | READ | n/a | None |
| GET | `/inventory/purchase-capitalization/clearing` | Bill vs receipt vs capitalized qty | READ | n/a | None |
| POST | `/inventory/purchase-capitalization/preview` | Preview one receipt line | READ* | n/a | Proposal only |
| POST | `/inventory/purchase-capitalization/post` | Capitalize one receipt line | WRITE | valuation + capitalization | Journal + PURCHASE_RECEIPT layer |
| POST | `/inventory/purchase-capitalization/discover` | Batch discover (dryRun supported) | WRITE if not dry | same | Same as post per eligible |
| POST | `/inventory/cogs/preview` | Preview COGS for order | READ* | n/a | Proposal only |
| POST | `/inventory/cogs/post` | Post COGS for order | WRITE | valuation + cogs | Journal + consume layers |
| POST | `/inventory/cogs/discover` | Discover/post COGS worklist | WRITE if not dry | same | Same |
| POST | `/inventory/cogs-reversal/preview` | Preview by restockEventId | READ* | n/a | Proposal only |
| POST | `/inventory/cogs-reversal/post` | Post reversal | WRITE | valuation + cogs + reversal | Journal + RETURN_RESTOCK layer |
| POST | `/inventory/cogs-reversal/discover` | Discover reversals | WRITE if not dry | same | Same |
| GET | `/inventory/opening/template` | XLSX template | READ | n/a | None |
| POST | `/inventory/opening/preview` | Multipart XLSX preview | READ* | n/a | None |
| POST | `/inventory/opening/draft` | Save draft batch | WRITE | valuation | Draft only |
| POST | `/inventory/opening/preview-post` | Preview post impact | READ* | n/a | None |
| POST | `/inventory/opening/post` | Post opening batch | WRITE | valuation + production guards | Journal + OPENING layers |
| GET | `/inventory/opening/batches` | List batches | READ | n/a | None |
| GET | `/inventory/opening/batches/:batchId` | Batch detail | READ | n/a | None |

\*Preview may persist evidence in some modules; inventory previews are proposal-oriented — posting gated by `production-guard` / flags.

**Feature flags (env):**  
`NATIVE_ACCOUNTING_ENABLED`, `ACCOUNTING_INVENTORY_VALUATION_ENABLED`, `ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED` (via flag helpers), `ACCOUNTING_COGS_POSTING_ENABLED`, `ACCOUNTING_COGS_REVERSAL_ENABLED`, plus production posting guards.

**Separate Phase 7 opening balances** (`/opening/*`) exist for full cutover packs — **Advanced**, not the inventory mega-page’s XLSX opening (which is inventory-specific `AccountingInventoryOpeningBatch`).

---

## 4. Data models (user-facing meaning)

| Model | Represents | Key links |
|-------|------------|-----------|
| `Inventory` | **Operational** on-hand / reserved per variant | ProductVariant — **not** accounting layers |
| `AccountingInventoryCostLayer` | FIFO cost pool qty remaining + unit cost | variantId; source OPENING / PURCHASE_RECEIPT / RETURN_RESTOCK; status ACTIVE/DEPLETED/VOID |
| `AccountingInventoryCostConsumption` | FIFO qty consumed for COGS | costLayerId, orderId/orderItemId, postingEventId, journalEntryId |
| `AccountingInventoryOpeningBatch` (+ Item) | Cutover opening import | → journal + opening layers |
| `AccountingPostingEvent` | Idempotent posting gate | event types: `INVENTORY_OPENING_POSTED`, `INVENTORY_PURCHASE_CAPITALIZED`, `INVENTORY_COGS_RECOGNIZED`, `INVENTORY_COGS_REVERSED` |
| `AccountingJournalEntry` / Line | Books | 1200 Inventory Asset, 1210 Purchases Clearing, 5000 COGS, 3900 Opening Equity |
| `OrderInventoryRestockEvent` | Ops return/restock evidence | disposition SELLABLE/DAMAGED/…; may set `inventoryIncremented` for onHand — **accounting reversal does not itself change onHand** |
| Vendor bill / PO / PurchaseReceiptLine | Purchase path into capitalization | Bill posts clearing; receipt line capitalizes |

**Immurability / idempotency:** Unique keys per event type (e.g. `inventory_cogs:{orderId}`, `inventory_capitalization:{receiptId}:{receiptLineId}`); duplicate post → already posted; source fingerprint detects change-after-post.

**Warehouse/location:** Shipping pickup facilities exist for logistics; **no** multi-warehouse cost layers. Costing is **SKU/variant-scoped only**.

---

## 5. Costing method

**Actual method: FIFO** (explicit in `FIFO_LAYER_ORDER`, COGS builders, UI copy).

| Question | Answer |
|----------|--------|
| How layers created | Opening post; purchase capitalization; COGS reversal (`RETURN_RESTOCK`) |
| When consumed | COGS post for eligible paid order — oldest `effectiveAt` → `createdAt` → `id` |
| Unit cost | Layer’s `unitCostInPaise` at consumption |
| Insufficient layers | Fail-closed `INSUFFICIENT_COST_LAYERS` / `COST_LAYER_DATA_GAP` — no inventing cost |
| Returns | Reversal allocates against historical consumptions (**LIFO of consumptions**), creates new RETURN_RESTOCK layers at **original unit costs**; journal Dr 1200 / Cr 5000 |
| Negative ops stock | Recon status `NEGATIVE_STOCK`; not a costing method |
| SKU-specific | Yes (variantId) |
| Warehouse | No effect on layers |

**Not implemented:** weighted average, standard cost, specific identification (except FIFO layers), landed cost, serial/batch.

---

## 6. Valuation

| Concept | Source |
|---------|--------|
| Physical qty | `Inventory.onHand` (ops) |
| Accounting qty | Sum `quantityRemaining` on ACTIVE layers |
| Unit / inventory value | Layer remaining × `unitCostInPaise` |
| Book / GL inventory | Posted journal net on account **1200** |
| Control | `glVsLayersVarianceInPaise` = GL − layer total |

**UI currently shows (recon table):** SKU, onHand, layer qty, layer value, consumed qty (v4), status.  
**Does not clearly show:** separate “unit cost” column (opening unit cost exists on v1 rows as `openingUnitCostInPaise` when opening layer present), product name (available in API as `productName`), GL per-SKU.

**Unit cost meaning if shown:** FIFO **layer-derived remaining** value ÷ qty (blended remaining layers), or opening layer unit cost — **not** “latest purchase” or “weighted average” unless labeled carefully. Prefer showing **Inventory Value** + optional **avg remaining cost** only if computed as value÷qty from layers.

---

## 7. Physical vs accounting stock

| Item | Behavior |
|------|----------|
| Compare | onHand vs sum(layer quantityRemaining) |
| Statuses | MATCHED, QUANTITY_MISMATCH, OPENING_REQUIRED, VALUE_DATA_GAP, COGS_UNPOSTED, INSUFFICIENT_COST_LAYERS, NON_INVENTORY_EXCLUDED, etc. |
| Posts journals? | **No** — reconciliation is **diagnostic only** |
| UI resolve? | **No** correction workflow |

Do **not** describe Refresh as “reconciling books.”

---

## 8. Purchase capitalization

| Item | Detail |
|------|--------|
| Trigger | `PurchaseReceiptLine` matched to posted vendor bill line |
| Journal | Dr **1200** Inventory Asset / Cr **1210** Inventory Purchases Clearing (stock cost only; **no GST** in this journal) |
| Layer | `PURCHASE_RECEIPT` with net unit cost from bill |
| Eligibility | Bill posted; physical inventory; PO vs bill rate/qty checks; no over-receipt; not already posted |
| Mode | **Mixed:** preview/post one + discover (dryRun or post) |
| Idempotency | Unique key per receipt line |

Vendor bill recognition (Purchases) creates AP/tax/clearing; capitalization **moves** clearing into inventory asset.

---

## 9. COGS recognition

| Item | Detail |
|------|--------|
| Eligibility | Native **ORDER_PAID** posted; physical inventory lines; not pre-cutover; open period; enough FIFO layers |
| Trigger | **Not** fulfillment/delivery in eligibility — tied to **paid order** + placedAt |
| Separate from sales entry | **Yes** — sales ORDER_PAID ≠ COGS; both can be posted independently |
| Journal | Dr **5000** COGS / Cr **1200** Inventory |
| Side effects | Consume layers; write `AccountingInventoryCostConsumption` |
| Mode | Manual preview/post + discover; **not** automatic on payment in default path |
| Failures | NO_NATIVE_ORDER_PAID, PRE_CUTOVER, INSUFFICIENT_COST_LAYERS, ALREADY_POSTED, SOURCE_CHANGED_AFTER_POST, … |

Does **not** change customer payment or sales revenue journals.

---

## 10. COGS reversal

| Item | Detail |
|------|--------|
| Trigger | `OrderInventoryRestockEvent` with disposition **SELLABLE** |
| Not triggered by | Full refund alone without restock event; DAMAGED / NON_RESTOCKABLE |
| Journal | Dr 1200 / Cr 5000 at historical consumption costs |
| Layers | Creates **new** `RETURN_RESTOCK` layers (does not “undeplete” old layers arbitrarily) |
| Ops stock | Accounting post **does not** change `onHand`; ops restock may have already incremented when `inventoryIncremented` |
| Pre-cutover sale | Fail-closed manual review if no native COGS |

---

## 11. Opening inventory

| Item | Detail |
|------|--------|
| Format | XLSX template download + upload preview |
| Fields | SKU, qty, unit cost → validate vs ops onHand (optional mismatch override) |
| Flow | Preview → Save draft → Post batch |
| Effect | Dr 1200 / Cr 3900 (opening equity) + OPENING cost layers |
| Placement | **Should remain Advanced / Opening** — not primary Inventory IA |
| Atomicity | Batch post with posting event + journal |

Do **not** treat as daily inventory ops in Stage 2D main nav.

---

## 12. Reconciliation

| Version | Adds | UI use |
|---------|------|--------|
| v1 | onHand vs layers, 1200 GL control | API only |
| v2 | Opening vs purchase layer qty; 1210 GL | API only |
| v3 | Consumptions; sold vs COGS missing | API only |
| **v4** | Return restock / reversal gaps | **Current frontend** |

**Accountant-facing concept (no version in UI):** “Inventory reconciliation” = physical vs accounting qty/value + attention statuses. Authoritative dataset for Stage 2D: **v4 API**.

---

## 13. Journal / accounting effects matrix

| Workflow | Journal | Cost layers | Ops stock |
|----------|---------|-------------|-----------|
| Valuation / recon | REPORT ONLY | REPORT | REPORT |
| Purchase capitalization | CREATES | CREATES PURCHASE_RECEIPT | No change |
| COGS | CREATES | CONSUMES | No change |
| COGS reversal | CREATES | CREATES RETURN_RESTOCK | No change (acct) |
| Opening inventory | CREATES | CREATES OPENING | No change |

---

## 14. Cross-module relationships

- **Purchases / bills** → 1210 → capitalization → 1200  
- **Sales ORDER_PAID** → prerequisite for COGS (separate event)  
- **Orders / restock events** → COGS reversal evidence  
- **Refunds** → may create restock ops; accounting follows restock disposition, not refund UI alone  
- **Banking** — no direct inventory journals  
- **GST** — capitalization journal is stock-cost only (GST stays on bill path)  
- **P&L** — COGS 5000; **BS** — Inventory 1200  

---

## 15. Status / error terminology

| Code (keep internal) | Proposed UI language |
|----------------------|----------------------|
| MATCHED / OPENING_POSTED | Balanced |
| QUANTITY_MISMATCH | Quantity mismatch |
| VALUE_DATA_GAP | Value needs review |
| OPENING_REQUIRED | Opening valuation needed |
| COGS_UNPOSTED | Cost of goods not recorded |
| INSUFFICIENT_COST_LAYERS | Not enough cost layers |
| ALREADY_POSTED | Already recorded |
| PRE_CUTOVER | Outside accounting cutover |
| NO_NATIVE_ORDER_PAID | Sales entry not recorded yet |
| RECEIPT_WAITING_FOR_BILL | Waiting for vendor bill |
| SOURCE_CHANGED_AFTER_POST | Source changed — needs review |
| NO_ACCOUNTING_RESTOCK_REQUIRED | No inventory cost restore for this return |
| NON_INVENTORY_* | Not inventory |

---

## 16. Current UX problems

- Mega-page overload (recon + opening + cap + COGS + reversal)  
- Engineering terminology and GL codes as primary labels  
- Raw JSON payloads  
- UUID-first workflows  
- Dangerous Post without confirmation  
- Dry-run discovery as primary-looking amber buttons  
- Opening cutover on same screen as daily work  
- No work queues beyond discover dumps  
- Weak empty/loading differentiation  

---

## 17. Proposed Stage 2D information architecture

**Inventory Accounting** (sub-nav, mirror Sales/Banking):

| Screen | Purpose | Opening? |
|--------|---------|----------|
| Overview | KPIs + Needs Attention + Quick Actions | No |
| Valuation | SKU value / qty table from recon v4 | No |
| Reconciliation | Physical vs accounting focus | No |
| Purchase Capitalization | Clearing worklist + preview/post | No |
| Cost of Goods Sold | Eligible orders + preview/post | No |
| Reversals | Restock events + preview/post | No |

**Opening inventory XLSX** → keep under **Advanced / Opening Balances** (link only from Overview if needed).

---

## 18. Screen-by-screen proposed UX (reuse APIs only)

### Overview
- KPIs if available: Inventory GL value, Layer value, Variance, Mismatch count, Clearing outstanding (1210), COGS needing attention (from statusCounts / clearing / discover dry-run counts — omit if null)  
- Attention → deep-link to Cap / COGS / Reversal / Recon  
- APIs: recon v4, classification summary (optional, humanized), capitalization clearing, discover dry-runs  

### Valuation
- Table: SKU, Product, On-hand, Accounting qty, Inventory value, (optional avg remaining cost), Status  
- Filter: sku (API supports); **no warehouse filter** (unsupported)  
- Actions: Refresh; open detail; **no Resolve**  

### Reconciliation
- Same data, statuses: Balanced / Quantity mismatch / Needs review  
- Actions: Refresh, View details — **not** “Resolve”  

### Purchase capitalization
- Clearing table → select receipt line → Preview → confirm → **Record Inventory Purchase** (or Record Capitalization)  
- APIs: clearing, preview, post, discover as secondary “Find unrecorded purchases”  

### COGS
- Order number preferred in UI (API accepts orderId **or** orderNumber)  
- Preview lines → confirm → **Record Cost of Goods Sold**  
- Copy: records cost of inventory sold; reduces inventory value; does not charge customer  

### Reversals
- Restock event worklist via discover → Preview → **Record Inventory Cost Reversal**  
- Copy: reverses inventory cost for eligible return; does not claim ops stock change unless shown from ops fields  

---

## 19. Available KPIs

| Metric | AVAILABLE NOW | Source |
|--------|---------------|--------|
| Inventory GL (1200) | YES | recon `financialControl.inventoryGl1200InPaise` |
| Layer inventory value | YES | `nativeLayersTotalValueInPaise` |
| GL vs layers variance | YES | `glVsLayersVarianceInPaise` |
| SKUs with stock / mismatch counts | YES | `statusCounts` + rows |
| 1210 clearing outstanding | YES | v2+ `clearing1210GlInPaise` / clearing rows |
| Capitalization needing review | YES | capitalization clearing statuses |
| COGS needing review | PARTIAL | v3/v4 statuses + discover dry-run |
| Recent inventory journals | PARTIAL | Journals module / posting events — not a dedicated inventory list API |
| Reversals needing attention | PARTIAL | v4 warnings + discover dry-run |

Do not fabricate zeroes.

---

## 20. Dangerous-action safeguards (recommend for Stage 2D UI)

| Action | Safeguard |
|--------|-----------|
| Record capitalization | Preview + modal + disable double-click + already recorded |
| Record COGS | Same |
| Record reversal | Same |
| Post opening batch | Advanced only + strong confirm + impact totals |

---

## 21. Future / out of scope for Stage 2D launch

- Multi-warehouse costing  
- Landed cost  
- Stock count / write-off / damage posting  
- Weighted average  
- Automatic COGS on payment  
- UI “resolve” that invents adjustments  
- Serial/batch costing  

---

## 22. UAT / test-data observations

Local/dev DB queried (read-only):

| Entity | Count |
|--------|------:|
| Product variants | 3455 |
| Inventory (ops) rows | 2119 |
| Accounting cost layers | **0** |
| Cost consumptions | **0** |
| Opening inventory batches | **0** |
| Inventory-related posting events | **none** |

Interpretation: ops stock exists; **accounting inventory layers not yet populated** in this environment. Staging may differ — re-query staging before UAT demos. No data was modified.

---

## 23. Stage 2C closure check

Read-only check of Sales Entries / Refunds / Settlements / Sales Overview:

- No material loss of posting capability vs pre-2C  
- No raw JSON / Post-to-books regressions remaining on those pages  
- No functionally inaccessible sales posting surface from the redesign  

**STAGE 2C CLOSED — NO MATERIAL UI GAPS FOUND**

---

## 24. Stage 2D implementation recommendation

1. **Proceed with frontend-only Stage 2D** using existing inventory APIs.  
2. Split mega-page into Overview / Valuation / Reconciliation / Capitalization / COGS / Reversals.  
3. Move opening XLSX UX emphasis to Advanced.  
4. Humanize statuses; remove JSON; confirm all posts.  
5. Prefer order **number** and bill/receipt **business refs** over raw UUIDs where API allows.  
6. **Do not** change FIFO, journal builders, schema, or flags.

**Backend changes for UI revamp:** NO  
**Accounting logic changes:** NO  
**Ready for Stage 2D design:** YES
