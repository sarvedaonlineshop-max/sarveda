# SARVEDA Native Accounting — Phase 3D2 Purchase Receipt Capitalization

**Date:** 2026-08-24  
**Calc version:** `INVENTORY_PURCHASE_CAPITALIZED_V1`  
**Verdict:** **PHASE 3D2 PURCHASE CAPITALIZATION VALIDATED**

---

## 1. Executive Summary

Phase 3D2 implements purchase-receipt capitalization: when a **posted vendor bill** (Dr 1210 / Cr AP from Phase 3B) is matched to a **committed purchase receipt line**, native accounting posts:

```
Dr 1200 Inventory Asset
    Cr 1210 Inventory Purchases Clearing
```

and creates `AccountingInventoryCostLayer` rows with `sourceType = PURCHASE_RECEIPT`.

**Operational `Inventory.onHand` is not modified** by accounting — only by existing `receivePurchaseOrder()`.

Verified locally: **265/265** backend tests pass. Lightsail tagged dummy run: **PHASE 3D2 PURCHASE CAPITALIZATION VALIDATED** (4+6 units @ ₹500, 1210 cleared to 0).

---

## 2. Accounting Boundary

| Layer | Responsibility |
|-------|----------------|
| **Purchases ops** | PO, receipt, `Inventory.onHand`, optional `ProductVariant.costInPaise` on receipt |
| **Phase 3B** | `VENDOR_BILL_POSTED` → Dr 1210 (stock net base) + Input GST + Cr AP |
| **Phase 3D2** | `INVENTORY_PURCHASE_CAPITALIZED` → Dr 1200 / Cr 1210 + FIFO cost layer |
| **Phase 3D1** | Opening layers → Dr 1200 / Cr 3900 (unchanged) |

Accounting never touches AP, GST, COGS, or operational stock in this phase.

---

## 3. Receipt / Bill Matching

Deterministic allocation (fail-closed on ambiguity):

1. `PurchaseReceiptLine` → `PurchaseOrderLine` → `variantId`
2. `VendorBill` where `purchaseOrderId` matches receipt's PO
3. `VendorBillLine` where `variantId` matches (STOCK classification)
4. **One bill per variant per PO** — multiple bills → `AMBIGUOUS_BILL_MATCH` / `CAPITALIZATION_DATA_GAP`
5. Posted `VENDOR_BILL_POSTED` event required — else `RECEIPT_WAITING_FOR_BILL`

Unit cost from **VendorBillLine net allocated base** (excludes recoverable GST), same pro-rata discount/adjustment as Phase 3B via `computeBillLineNetAllocations()`.

**Never** uses `ProductVariant.costInPaise`, selling prices, or MRP as accounting authority.

---

## 4. Cost Basis

Hierarchy:

1. `VendorBillLine.rateInPaise` + document-level discount/adjustment allocation → net unit cost
2. PO rate must **match** bill rate — else `COST_MISMATCH`
3. Bill qty must not **exceed** PO qty — else `QUANTITY_MISMATCH`

Capitalization value per receipt line:

```
round(allocatedBaseInPaise × receiptQty / billLineQty)
```

---

## 5. Partial Receipt Handling

Each `PurchaseReceiptLine` capitalizes independently:

- Receipt 1 (40 @ ₹500) → Dr 1200 ₹20,000 / Cr 1210 ₹20,000 + layer 40 @ ₹500
- Receipt 2 (60 @ ₹500) → Dr 1200 ₹30,000 / Cr 1210 ₹30,000 + layer 60 @ ₹500

Cumulative capitalized qty tracked via posted event payloads (`vendorBillLineId`, `quantityReceived`).

---

## 6. Receipt Before Bill

V1: **no 1210→1200 capitalization** until `VENDOR_BILL_POSTED` exists.

Status: `RECEIPT_WAITING_FOR_BILL`. After bill posts, discovery/preview can capitalize prior receipts.

No synthetic accrual or fake AP.

---

## 7. Bill Before Receipt

Normal clearing lifecycle:

1. Bill posts → Dr 1210 (stock clearing balance sits on GL)
2. Receipt arrives (ops onHand++)
3. Capitalization → Dr 1200 / Cr 1210

Clearing status `WAITING_FOR_RECEIPT` until receipt + capitalization.

---

## 8. Cost Layer Creation

Per successful capitalization:

| Field | Value |
|-------|-------|
| `sourceType` | `PURCHASE_RECEIPT` |
| `sourceId` | `PurchaseReceipt.id` |
| `sourceLineId` | `PurchaseReceiptLine.id` |
| `sourceFingerprint` | `receipt_cap:{receiptLineId}:{billLineId}:{billSourceFingerprint}` |
| `effectiveAt` | receipt `receivedAt` |
| `unitCostInPaise` | net unit from bill allocation |

Unique constraints: posting event `(eventType, uniqueKey)` + layer `(sourceType, sourceId, sourceLineId, sourceFingerprint)`.

---

## 9. Journal Builder

Pure function: `buildInventoryPurchaseCapitalizationJournal()`  
File: `backend/src/modules/accounting/purchase-capitalization-journal.builder.ts`

Only accounts **1200** and **1210**. No AP, GST, COGS, bank.

---

## 10. 1210 Clearing Control

`buildPurchaseCapitalizationClearingReport()` — per stock bill line:

| Status | Meaning |
|--------|---------|
| `CLEARED` | All billed stock value capitalized |
| `PARTIALLY_CAPITALIZED` | Some 1210 remaining |
| `WAITING_FOR_RECEIPT` | Bill posted, no receipts |
| `WAITING_FOR_BILL` | Receipts exist, bill not posted |
| `COST_MISMATCH` / `QUANTITY_MISMATCH` / `DATA_GAP` | Fail-closed |

---

## 11. GST Boundary

Capitalization uses **net stock base excluding tax** (same as 1210 debit from Phase 3B). Input GST remains on 2200/2201/2202 from bill posting only. No double capitalization of GST.

---

## 12. Over-Receipt

If cumulative capitalization qty would exceed **billed** qty → `OVER_RECEIPT_REVIEW_REQUIRED`. Operational receipt may succeed; financial capitalization fails closed.

---

## 13. Idempotency / Concurrency

- Unique key: `inventory_capitalization:{receiptId}:{receiptLineId}`
- PostgreSQL `ON CONFLICT` on posting events + layer unique index
- Tested: 20 concurrent posts → 1 journal + 1 layer

Source change after post → `SOURCE_CHANGED_AFTER_POST` / `REVERSAL_REQUIRED` (no silent mutation).

---

## 14. Discovery

`runPurchaseCapitalizationDiscovery()` — default `dryRun=true`, max 500, filters: `receiptId`, `purchaseOrderId`, `vendorBillId`, `variantId`, `since`, `until`, `limit`.

Requires `ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED=1` for persist.

---

## 15. Admin UI / API

Extended `/admin/accounting/inventory`:

| Method | Route |
|--------|-------|
| GET | `/inventory/reconciliation/v2` |
| GET | `/inventory/purchase-capitalization/clearing` |
| POST | `/inventory/purchase-capitalization/preview` |
| POST | `/inventory/purchase-capitalization/post` |
| POST | `/inventory/purchase-capitalization/discover` |

UI section: **Purchase Capitalization** — preview, post one, dry-run discovery, 1210 clearing table.

---

## 16. Inventory Reconciliation V2

`buildInventoryReconciliationV2()` adds per variant:

- `openingLayerQty` / `purchaseReceiptLayerQty`
- Aggregate `clearing1210GlInPaise` + `purchaseReceiptLayerValueInPaise`

Control: **1200 GL ≈ sum of active layer values** for supported native events.

---

## 17. Feature / Production Guards

| Flag | Default |
|------|---------|
| `ACCOUNTING_INVENTORY_VALUATION_ENABLED` | OFF |
| `ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED` | OFF (requires valuation) |

Production-like posting requires additionally `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`.

---

## 18. Tests

New file: `backend/test/accounting/purchase-capitalization.test.ts` — **17 tests** covering:

Full/partial/multiple receipts, bill-before-receipt, receipt-before-bill, idempotency, 20× concurrency, over-receipt, cost/qty mismatch, non-inventory blocked, onHand/costInPaise unchanged, feature flags, recon V2, discovery dry-run.

**Full suite: 265 tests passed** (20 files).

---

## 19. Lightsail Dummy Validation

Script: `backend/scripts/phase3d2-lightsail-capitalization-validation.ts`

Tagged fixture on Lightsail RDS (`TEST-ACC-FIFO-*`):

- PO/Bill: 10 @ ₹500
- Receipt 1: 4 → ₹2,00,000 capitalized
- Receipt 2: 6 → ₹3,00,000 capitalized
- Layers: `4@50000 + 6@50000`
- 1210 status: **CLEARED**, outstanding **0**
- onHand +10 from ops receipt only

**VERDICT: PHASE 3D2 PURCHASE CAPITALIZATION VALIDATED**

---

## 20. Commerce / Purchase Integrity

- **No changes** to `purchases.service.ts` receive logic
- **No changes** to vendor bill posting logic (only exported `computeBillLineNetAllocations` refactor)
- Commerce regression: **pass** (checkout, payment, refund, stock tests)

---

## 21. Data To Replace / Load Before Production

### A. OPERATIONAL DATA — refresh from live / final migration

- `Product`, `ProductVariant`, `Inventory` (onHand)
- `Vendor`, `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseReceipt`, `VendorBill`
- `Order`, `OrderItem`, `Payment`, etc.

### B. ACCOUNTING OPENING DATA — load after final cutover

- `AccountingInventoryOpeningBatch` + items (real opening costs — **not** sale prices)
- `AccountingInventoryCostLayer` where `sourceType = OPENING`
- Opening journal / account **3900**
- Other opening balance sheets (later phases)

### C. TEST / DUMMY DATA — **remove before production**

- All `TEST-ACC-*` vendors, POs, bills, receipts, products (including Lightsail `TEST-ACC-FIFO-*` rows)
- Shadow/dummy `AccountingPostingEvent`, journals, and `PURCHASE_RECEIPT` layers tied to test fixtures
- Re-run reconciliation after cleanup

**Do not** use INR/USD/Dinar **sale prices** from `ProductVariant` as opening inventory cost (confirmed in pre-3D2 investigation).

---

## 22. Known Limitations

- One stock bill line per variant per PO (ambiguous multi-bill → manual review)
- No purchase returns / COGS consumption (Phase 3D3+)
- No landed cost allocation
- PO/bill partial qty mismatch on bill < PO allowed; bill > PO blocked
- Receipt-capitalization requires exact PO/bill **rate** match

---

## 23. Safety Audit

| Check | Result |
|-------|--------|
| COMMERCE FILES MODIFIED | **No** |
| PURCHASES OPERATIONAL FILES MODIFIED | **No** |
| INVENTORY QUANTITY LOGIC MODIFIED | **No** |
| VENDOR BILL LOGIC MODIFIED | **Refactor only** — exported `computeBillLineNetAllocations()` |
| ZOHO FILES MODIFIED | **No** |
| ACCOUNTING TABLES/MIGRATIONS ADDED | **No new migration** — uses Phase 3D1 `PURCHASE_RECEIPT` enum |
| TEST/DUMMY DATA CREATED | **Yes** — tagged `TEST-ACC-*` in tests + Lightsail validation |
| UNEXPECTED FILES | None |
| COMMERCE REGRESSION | **265/265 pass** |
| PURCHASES REGRESSION | **Included in suite — pass** |

---

## 24. Recommendation

Deploy accounting module to staging EC2, keep flags **OFF** until opening cost file is ready. Use Purchase Capitalization admin UI to preview/post after vendor bills and receipts are linked on real POs.

**PHASE 3D2 PURCHASE CAPITALIZATION VALIDATED**
