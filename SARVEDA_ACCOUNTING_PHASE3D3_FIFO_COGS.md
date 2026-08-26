# SARVEDA Native Accounting — Phase 3D3 FIFO COGS

**Date:** 2026-08-24  
**Calc version:** `INVENTORY_COGS_RECOGNIZED_V1`

---

## 1. Executive Summary

Phase 3D3 adds native sales COGS posting for post-cutover inventory sales:

```text
Dr 5000 Cost of Goods Sold
    Cr 1200 Inventory Asset
```

COGS is derived **only** from native FIFO layer consumption in `AccountingInventoryCostLayer`. No sale prices, `ProductVariant.costInPaise`, MRP, or latest-cost shortcuts are used.

Implemented locally and verified with:

- full backend suite: **280/280 tests passed** across **55/55 suites**
- Phase 3D3 FIFO COGS suite: **15/15 passed**
- focused accounting + commerce regression subset: **72/72 passed**
- backend build: **passed**
- frontend build: **passed**

Lightsail validation was executed against the verified pre-launch Lightsail path:

- app host: `13.204.112.165`
- DB host redacted: `ls-***.c9oiska8wm8k.ap-south-1.rds.amazonaws.com`
- DB name: `sarveda_db`
- intended pre-launch Sarveda DB: `YES`
- localhost: `NO`

---

## 2. COGS Accounting Boundary

- Revenue recognition remains `ORDER_PAID_V1`.
- COGS is a **separate** posting event: `INVENTORY_COGS_RECOGNIZED`.
- Revenue posting does not depend on COGS success.
- COGS posting touches only:
  - `AccountingPostingEvent`
  - `AccountingJournalEntry` / `AccountingJournalLine`
  - `AccountingInventoryCostLayer.quantityRemaining`
  - `AccountingInventoryCostConsumption`
  - `AccountingDocumentLink`

Operational commerce stock remains unchanged by accounting.

---

## 3. Eligibility

Auto-postable only when all are true:

1. native `ORDER_PAID` event already posted
2. order is not pre-cutover
3. `OrderItem` rows exist
4. at least one line classifies as `PHYSICAL_INVENTORY`
5. committed `qtyOrdered > 0`
6. sufficient active FIFO layers exist
7. no prior posted COGS event for unchanged source

Fail-closed outcomes implemented:

- `PRE_CUTOVER`
- `ORDER_ITEMS_MISSING`
- `NO_NATIVE_ORDER_PAID`
- `NON_INVENTORY_ONLY`
- `INSUFFICIENT_COST_LAYERS`
- `COST_LAYER_DATA_GAP`
- `LAYER_INVARIANT_VIOLATION`
- `SOURCE_CHANGED_AFTER_POST`

---

## 4. FIFO Algorithm

FIFO consumption is resolved in deterministic order:

1. `effectiveAt ASC`
2. `createdAt ASC`
3. `id ASC`

Posting path locks active layers with PostgreSQL `FOR UPDATE` per variant before mutation. The proposal stage then walks locked layers and consumes oldest quantity first. If quantity is insufficient, posting aborts before any journal or layer mutation.

This works transparently across:

- `OPENING`
- `PURCHASE_RECEIPT`

---

## 5. Cost Consumption Model

Per consumed layer and order item, Phase 3D3 persists `AccountingInventoryCostConsumption` with:

- `costLayerId`
- `variantId`
- `orderId`
- `orderItemId`
- `quantityConsumed`
- `unitCostInPaise`
- `totalCostInPaise`
- `consumedAt`
- `postingEventId`
- `journalEntryId`
- `sourceFingerprint`

This preserves permanent historical unit cost even after layer depletion.

---

## 6. Journal Builder

Pure builder: `buildInventoryCogsJournal()`

Inputs:

- immutable order snapshot
- resolved FIFO proposal

Outputs:

- one journal per order
- per-item totals
- per-layer consumption details
- debit/credit lines
- diagnostics
- source fingerprint metadata

Accounts used:

- Dr `5000` Cost of Goods Sold
- Cr `1200` Inventory Asset

---

## 7. Multi-item Orders

Supported cases:

- single physical line
- quantity > 1
- multiple physical variants
- physical + digital/service mixed orders

Only physical inventory lines contribute to FIFO consumption and COGS totals. Mixed orders post one COGS journal for the physical subset only.

---

## 8. Insufficient Layer Handling

If native FIFO quantity is less than required sale quantity:

- no partial journal
- no partial layer decrement
- no consumption rows
- preview returns `INSUFFICIENT_COST_LAYERS`
- reconciliation surfaces COGS missing state

This is explicitly fail-closed.

---

## 9. Historical / Pre-cutover Policy

Phase 3D3 does **not** invent historical WooCommerce COGS. Orders before `ACCOUNTING_CUTOVER_DATE` classify `PRE_CUTOVER` and are not posted by this flow.

Authority starts from:

- real opening layers
- native purchase capitalization layers
- native `ORDER_PAID` events after cutover

---

## 10. Concurrency

Concurrency protection implemented with:

- deterministic variant ordering
- `SELECT ... FOR UPDATE` on eligible active layers
- posting-event row lock via unique `(eventType, uniqueKey)`
- single transaction for event + journal + layer decrements + consumption rows

Verified:

- 20 concurrent same-order posts -> one posted event / one journal
- two concurrent orders competing for same layer -> no over-consumption

---

## 11. Idempotency

Unique key:

```text
inventory_cogs:{orderId}
```

Replays return duplicate when source is unchanged. If order items or quantities mutate after posting, preview/post returns `SOURCE_CHANGED_AFTER_POST` and requires reversal rather than silently rewriting history.

---

## 12. Source Fingerprint

Stored fingerprint covers:

- order id
- order item ids
- variant ids
- consumed layer ids
- consumed quantities
- consumed unit costs
- calc version

Order-shape fingerprint is also stored separately to detect post-facto line or quantity changes.

---

## 13. Document Linkage

`AccountingDocumentLink` is written for:

- `ORDER` -> COGS journal

Traceability chain is preserved through:

- order
- order items
- posting event
- journal
- consumption rows
- source layers

---

## 14. Discovery

Implemented bounded discovery:

- default `dryRun=true`
- filters: `orderId`, `since`, `until`, `variantId`, `limit`
- max limit: `500`

Discovery skips:

- already posted
- pre-cutover
- no native `ORDER_PAID`
- no `OrderItem`
- non-inventory-only
- insufficient layers
- data-gap conditions

---

## 15. Admin UI / API

Added backend routes:

- `GET /api/admin/accounting/inventory/reconciliation/v3`
- `POST /api/admin/accounting/inventory/cogs/preview`
- `POST /api/admin/accounting/inventory/cogs/post`
- `POST /api/admin/accounting/inventory/cogs/discover`

Extended `/admin/accounting/inventory` with a Phase 3D3 COGS section:

- order-id preview
- single-order post
- dry-run discovery
- reconciliation sample includes consumed quantity

---

## 16. Inventory Reconciliation V3

`buildInventoryReconciliationV3()` adds:

- `consumedQty`
- `cogsPostedInPaise`
- `cogsMissingQty`
- `cogsGl5000InPaise`
- `totalConsumptionValueInPaise`
- `cogsGlVsConsumptionVarianceInPaise`

Variant statuses now surface `COGS_UNPOSTED` and `INSUFFICIENT_COST_LAYERS` where applicable.

---

## 17. GL Controls

Implemented controls:

- `5000` GL vs summed native cost consumptions
- `1200` GL vs remaining active layer value

Tests verify the control path when backing 1200 inventory journals exist for the created opening / purchase layers.

---

## 18. Feature / Production Guards

New flag:

- `ACCOUNTING_COGS_POSTING_ENABLED=0` by default

Persistence requires:

- `NATIVE_ACCOUNTING_ENABLED=1`
- `ACCOUNTING_INVENTORY_VALUATION_ENABLED=1`
- `ACCOUNTING_COGS_POSTING_ENABLED=1`

Production-like persistence additionally requires:

- `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`

Discovery defaults to dry-run unless flags permit persistence.

---

## 19. Tests

New file:

- `backend/test/accounting/inventory-cogs.test.ts`

Covered cases:

- one-layer exact and partial consumption
- multiple FIFO layers
- opening + purchase layer mix
- quantity > 1
- multi-item physical orders
- mixed physical + digital
- digital-only exclusion
- insufficient layers
- zero/invalid layer data
- duplicate posts
- 20 concurrent same-order posts
- competing concurrent orders
- source mutation after post
- pre-cutover / missing items / missing native sale journal
- closed period
- feature flag
- document link
- stock integrity
- reconciliation and GL controls
- discovery dry-run

Verification results:

- full backend suite: **280/280**
- focused accounting + commerce regression subset: **72/72**
- COGS suite: **15/15**

---

## 20. Lightsail Dummy Validation

Created script:

- `backend/scripts/phase3d3-lightsail-cogs-validation.ts`

It creates a tagged lifecycle:

- 10 units @ ₹500 opening
- 10 units @ ₹600 purchase receipt
- native paid order of 12 units

Expected script assertions:

- consumptions: `10 @ 500`, `2 @ 600`
- COGS: `₹6,200`
- journal: `Dr 5000 / Cr 1200`
- duplicate replay returns duplicate
- operational `Inventory.onHand` / `reserved` unchanged by accounting post

Executed on verified Lightsail with process-scoped flags only.

### Environment proof

```json
{
  "hostname": "ip-172-26-7-99",
  "appCwd": "/home/ubuntu/sarveda/backend",
  "dbHostRedacted": "ls-***.c9oiska8wm8k.ap-south-1.rds.amazonaws.com",
  "dbName": "sarveda_db",
  "intendedPrelaunchSarvedaDb": "YES",
  "localhost": "NO",
  "productionLikeEnvironment": "true"
}
```

### Primary tagged fixture

- Product slug: `test-acc-fifo-418ebef1-product`
- SKU: `TEST-ACC-FIFO-418ebef1`
- Order: `SRV-TEST-ACC-418ebef1`
- ORDER_PAID journal: `JE-202608-00027`
- COGS journal: `JE-202608-00028`

### Main assertions

- Exactly one `INVENTORY_COGS_RECOGNIZED` event: `1`
- Exactly one COGS journal: `1`
- `Dr 5000 = ₹6,200`
- `Cr 1200 = ₹6,200`
- Consumption rows:
  - `10 @ ₹500 = ₹5,000`
  - `2 @ ₹600 = ₹1,200`
- Remaining layers:
  - opening layer `0`, status `DEPLETED`
  - purchase layer `8`, status `ACTIVE`
- Replay returned `duplicate=true`
- `Inventory.onHand` remained `20`
- `Inventory.reserved` remained `0`
- `ProductVariant.costInPaise` remained `null`
- Payment rows remained `1`
- Refund rows remained `0`
- ORDER_PAID journal remained unchanged at `JE-202608-00027`

### Read-only proof snapshot

```json
{
  "orderNumber": "SRV-TEST-ACC-418ebef1",
  "sku": "TEST-ACC-FIFO-418ebef1",
  "orderStatus": "PAID",
  "paymentStatus": "CAPTURED",
  "cogsEventCount": 1,
  "cogsJournalCount": 1,
  "orderPaidEventCount": 1,
  "orderPaidJournalEntry": "JE-202608-00027",
  "cogsJournalEntry": "JE-202608-00028",
  "cogsLines": [
    { "accountCode": "5000", "debitInPaise": 620000, "creditInPaise": 0 },
    { "accountCode": "1200", "debitInPaise": 0, "creditInPaise": 620000 }
  ],
  "consumptions": [
    { "quantityConsumed": 10, "unitCostInPaise": 50000, "totalCostInPaise": 500000 },
    { "quantityConsumed": 2, "unitCostInPaise": 60000, "totalCostInPaise": 120000 }
  ],
  "layers": [
    { "sourceType": "OPENING", "unitCostInPaise": 50000, "quantityRemaining": 0, "status": "DEPLETED" },
    { "sourceType": "PURCHASE_RECEIPT", "unitCostInPaise": 60000, "quantityRemaining": 8, "status": "ACTIVE" }
  ],
  "inventory": { "onHand": 20, "reserved": 0 },
  "productVariantCostInPaise": null,
  "paymentRows": 1,
  "refundRows": 0
}
```

### Insufficient-layer negative case

- Order: `SRV-TEST-ACC-1eb50942`
- SKU: `TEST-ACC-FIFO-1eb50942`
- Result: `INSUFFICIENT_COST_LAYERS`
- COGS event count: `0`
- Consumption count: `0`
- Layer remained unchanged: `3 @ ₹500`, status `ACTIVE`
- No COGS journal was created

### Flags restored OFF / absent

```text
NATIVE_ACCOUNTING_ENABLED=ABSENT
ACCOUNTING_INVENTORY_VALUATION_ENABLED=ABSENT
ACCOUNTING_COGS_POSTING_ENABLED=ABSENT
ACCOUNTING_PRODUCTION_POSTING_ALLOWED=ABSENT
```

---

## 21. Commerce / Stock Integrity

Verified:

- no changes to checkout/payment hooks were required
- accounting COGS does **not** decrement `Inventory.onHand`
- accounting COGS does **not** change `Inventory.reserved`
- accounting COGS does **not** mutate `ProductVariant.costInPaise`

Commerce regression subset covering checkout, payment flow, refund flow, and stock flow passed.

---

## 22. Data To Replace / Load Before Production

### A. OPERATIONAL DATA

- `Product`
- `ProductVariant`
- `Inventory`
- `Order`
- `OrderItem`
- `Payment`
- `Refund`
- `Vendor`
- `PurchaseOrder`
- `PurchaseReceipt`
- `VendorBill`
- `Expense`

### B. ACCOUNTING OPENING DATA

- `AccountingInventoryOpeningBatch`
- `AccountingInventoryOpeningBatchItem`
- opening `AccountingInventoryCostLayer` rows
- opening journal(s) to `1200 / 3900`
- any future opening balances outside inventory

### C. TEST / DUMMY DATA

- any `TEST-ACC-*`
- any `SRV-TEST-*`
- any validation-only opening / receipt / order rows

### D. POST-CUTOVER NATIVE DATA

- native `ORDER_PAID`
- native `INVENTORY_PURCHASE_CAPITALIZED`
- native `INVENTORY_COGS_RECOGNIZED`
- future native settlements / refunds / AP / expenses from cutover forward

Do **not** attempt unsupported historical WooCommerce COGS backfill.

---

## 23. Known Limitations

- no customer-return COGS reversal
- no restock layer restoration
- no purchase returns
- no landed cost allocation
- no bank reconciliation
- no Phase 3D4+ features
- Lightsail tagged validation **was run** and Phase 3D3 is validated (`SRV-TEST-ACC-418ebef1`, `SRV-TEST-ACC-1eb50942`; journals retained for pre-production cleanup)

---

## 24. Safety Audit

**COMMERCE FILES MODIFIED:** `NONE`  
**ORDER/PAYMENT FLOW MODIFIED:** `NONE`  
**INVENTORY QUANTITY LOGIC MODIFIED:** `NONE` in commerce ops; accounting value-layer decrement only in `inventory-cogs-posting.service.ts`  
**PURCHASES LOGIC MODIFIED:** `NONE`  
**ZOHO FILES MODIFIED:** `NONE`  
**ACCOUNTING TABLES/MIGRATIONS ADDED:** `NONE`  
**TEST/DUMMY DATA CREATED:** local tagged `TEST-ACC-*` fixtures during test runs were cleaned; Lightsail validation created retained tagged rows `SRV-TEST-ACC-418ebef1`, `SRV-TEST-ACC-1eb50942`, plus prior tagged validation rows, because posted journal immutability blocked safe in-place purge on the production-like DB without using destructive overrides  
**UNEXPECTED FILES:** `NONE`  
**COMMERCE REGRESSION:** `PASS`  
**PURCHASES REGRESSION:** `PASS`

Changed implementation files:

- `backend/src/modules/accounting/inventory-cogs.constants.ts`
- `backend/src/modules/accounting/inventory-cogs.types.ts`
- `backend/src/modules/accounting/inventory-cogs.snapshot.service.ts`
- `backend/src/modules/accounting/inventory-cogs.eligibility.ts`
- `backend/src/modules/accounting/inventory-cogs.journal.builder.ts`
- `backend/src/modules/accounting/inventory-cogs-posting.service.ts`
- `backend/src/modules/accounting/inventory-cogs-discovery-worker.ts`
- `backend/src/modules/accounting/inventory-reconciliation.service.ts`
- `backend/src/modules/accounting/inventory.types.ts`
- `backend/src/modules/accounting/accounting-flag.ts`
- `backend/src/modules/accounting/production-guard.ts`
- `backend/src/modules/accounting/accounting-errors.ts`
- `backend/src/modules/accounting/accounting.handlers.ts`
- `backend/src/modules/accounting/accounting.routes.ts`
- `backend/src/modules/accounting/index.ts`
- `backend/.env.example`
- `backend/test/accounting/inventory-cogs.test.ts`
- `backend/test/helpers/accounting-orders.ts`
- `backend/scripts/phase3d3-lightsail-cogs-validation.ts`
- `frontend/lib/accounting-api.ts`
- `frontend/app/admin/accounting/inventory/page.tsx`

---

## 25. Recommendation

Phase 3D3 passed on the verified pre-launch Lightsail path. The only remaining operational follow-up is to remove the retained tagged validation rows before production cutover using an explicitly approved cleanup procedure that respects posted-journal immutability.

PHASE 3D3 FIFO COGS VALIDATED
