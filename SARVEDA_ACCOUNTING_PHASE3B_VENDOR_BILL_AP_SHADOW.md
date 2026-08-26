# SARVEDA NATIVE ACCOUNTING — PHASE 3B
# VENDOR BILL + ACCOUNTS PAYABLE SHADOW POSTING

**Date:** 2026-08-23  
**Phase:** `VENDOR_BILL_POSTED_V1` shadow AP recognition  
**Zoho Books:** remains authoritative  
**Depends on:** Phase 3A architecture (approved) + Phase 2 sales shadow  

---

## 1. Executive Summary

Phase 3B implements discovery-driven, idempotent shadow accounting for **OPEN** (and historically **PAID**) `VendorBill` rows.

| Capability | Status |
|------------|--------|
| Account **1210 Inventory Purchases Clearing** | Done (seed + migration) |
| Pure `buildVendorBillPostedJournal` | Done |
| Stock lines → Dr 1210 (never 1200 / 5000) | Done |
| Non-stock → Dr 5300 | Done |
| Provisional Input GST + ITC unverified | Done |
| Fail-closed `GST_DATA_GAP` | Done |
| Idempotent `vendor_bill:{billId}` | Done (20 concurrent) |
| Discovery worker (default dry-run, max 500) | Done |
| Admin preview/post + Recon V4 | Done |
| Lightsail shadow validation | Done |

**Not implemented (deferred):** vendor payments, Expense posting, inventory capitalization / COGS, receipt journals, purchase returns, Zoho AP, GSTR matching.

---

## 2. Accounting Boundary

| Source | Phase 3B GL? |
|--------|----------------|
| VendorBill `OPEN` / historical `PAID` | **Yes** — `VENDOR_BILL_POSTED` |
| DRAFT / VOID | No |
| PurchaseOrder / Receipt / stock ↑ | No |
| Mark paid / `paidInPaise` | No bank journal |
| Expense | No |

Hard rule: PO + Receipt + Bill = one economic purchase → **one** AP recognition from the bill.

---

## 3. Account 1210

| Code | Name | Type | Purpose |
|------|------|------|---------|
| 1210 | Inventory Purchases Clearing | ASSET (system) | Supplier-billed inventory cost pending Phase 3D capitalization |

Phase 3D (future): `Dr 1200 / Cr 1210` from receipt/cost layers — **not** in 3B.

---

## 4. Files Changed

### Backend (new)

- `vendor-bill.constants.ts`
- `vendor-bill.types.ts`
- `vendor-bill-eligibility.ts`
- `vendor-bill-snapshot.service.ts`
- `vendor-bill-journal.builder.ts`
- `vendor-bill-posting.service.ts`
- `vendor-bill-discovery-worker.ts`
- `scripts/phase3b-lightsail-vendor-bill-validation.ts`
- `test/accounting/vendor-bill-posted.test.ts`
- `test/helpers/accounting-purchases.ts`
- Migration `20260823020000_accounting_phase3b_inventory_purchases_clearing`

### Backend (updated)

- `seed-coa.ts` — 1210
- `accounting-errors.ts` — purchases/vendor-bill errors
- `production-guard.ts` — purchases persist + billId bulk scope
- `reconciliation.service.ts` — V4
- `accounting.handlers.ts` / `accounting.routes.ts`
- `test/accounting/production-guard.test.ts`, `api-security.test.ts`

### Frontend

- `app/admin/accounting/vendor-bills/page.tsx`
- `lib/accounting-api.ts` — vendor bill + recon V4 clients
- `components/admin/accounting/AdminAccountingNav.tsx`

---

## 5. Migration / CoA

**Migration:** `20260823020000_accounting_phase3b_inventory_purchases_clearing`  
INSERT `AccountingAccount` code `1210` if missing (accounting-only).

**Commerce / purchase tables:** not altered by this migration.

Lightsail also required applying pending `20260822143856_purchases_module_phase1` (Vendor/PO/Bill/Expense tables were absent) — additive purchases Phase 1 schema, not a Phase 3B design change.

---

## 6. Vendor Bill Snapshot

Loads committed `VendorBill` + vendor + optional PO + lines; classifies STOCK vs NON_STOCK; computes `sourceFingerprint` (SHA-256 of financial fields) for post-change detection.

---

## 7. Eligibility

Auto-postable when:

- status `OPEN` or `PAID` (historical AP reconstruction)
- `totalInPaise > 0`, vendor present, lines present, `billDate` present
- amounts reconcile (`subtotal − discount + tax + adjustment ≈ total`)
- currency INR
- GST evidence sufficient when `taxInPaise > 0` (else `GST_DATA_GAP`)

DRAFT / VOID: no post.  
`ALREADY_POSTED`: preview reports it; post path uses posting-event idempotency (duplicate).

---

## 8. Journal Builder

`VENDOR_BILL_POSTED_V1` pure function — no DB writes.

Net base = `subtotal − discount + adjustment` (= `total − tax`), allocated pro-rata to lines by exclusive base (`qty × rate`).

---

## 9. Stock vs Non-stock Classification

| Line | Debit |
|------|-------|
| `variantId` present | **1210** Inventory Purchases Clearing |
| no `variantId` | **5300** Purchase / Operating Expense |

Never **1200** Inventory Asset or **5000** COGS in 3B.

---

## 10. Discounts / Adjustments

Purchases arithmetic (existing module):  
`total = subtotal − discount + tax + adjustment`.

- Discount: pro-rata across lines  
- Adjustment: pro-rata + warning **`ADJUSTMENT_UNCLASSIFIED`** (not treated as freight; not capitalized)

No Round Off filler.

---

## 11. Input GST

Provisional recognition only when:

- plausible GSTIN, supplier `referenceNumber`, vendor state, seller state (`SELLER_STATE`), IN/INR, `taxInPaise > 0`

Jurisdiction: same state → CGST+SGST; else IGST.  
Insufficient evidence → **`GST_DATA_GAP`** fail-closed (no jurisdiction guess).

---

## 12. ITC Boundary

`itcStatus = UNVERIFIED_PENDING_TAX_INVOICE` always for provisional Input GST.  
Recognition ≠ claimable ITC. No GSTR matching in 3B.

---

## 13. AP Recognition

Always `Cr 2000 Accounts Payable` = full `totalInPaise`.  
Native AP is **not** reduced by ops `paidInPaise` / PAID status.

---

## 14. Historical Paid Bills

PAID bills may reconstruct AP journal.  
Recon status: **`OPS_MARKED_PAID_NO_ACCOUNTING_PAYMENT`**.  
No `Dr AP / Cr Bank`.

---

## 15. Duplicate Supplier Invoice Detection

Same vendor + normalized `referenceNumber` → warn `DUPLICATE_SUPPLIER_REFERENCE`.  
Ambiguous same totals → block auto-post in discovery.  
Different vendors may share invoice numbers.  
Idempotency remains `billId`.

---

## 16. Document Linkage

`AccountingDocumentLink`:

- `VENDOR_BILL` → journal  
- `PURCHASE_ORDER` → journal (when `purchaseOrderId` set)

---

## 17. Discovery Worker

`runVendorBillDiscovery` — filters billId/billNumber/vendorId/since/until, limit ≤500, default dryRun, order billDate/createdAt/id.

---

## 18. Feature / Production Guards

| Flag | Role |
|------|------|
| `NATIVE_ACCOUNTING_ENABLED` | Module |
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | Persist vendor bill journals |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | Dual gate on production-like |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` | Bulk discover on production-like |

Defaults OFF. Lightsail `.env` left without permanent enablement.

---

## 19. Admin Preview / Post

Authenticated `/api/admin/accounting/`:

- `POST /vendor-bills/preview`
- `POST /vendor-bills/post`
- `POST /vendor-bills/discover`
- `GET /reconciliation/v4`

UI: `/admin/accounting/vendor-bills`

---

## 20. Reconciliation V4

Per bill: vendor, GSTIN, refs, dates, PO, amounts, 1210/5300/GST splits, journal, AP credit, ops paid (info), native payment = 0, ITC, duplicate/source-change warnings.

Statuses include: `MATCHED`, `UNPAID`, `OPS_MARKED_PAID_NO_ACCOUNTING_PAYMENT`, `GST_DATA_GAP`, `DUPLICATE_SUPPLIER_REFERENCE`, `ADJUSTMENT_UNCLASSIFIED`, `SOURCE_CHANGED_AFTER_POST`, `REVERSAL_REQUIRED`, `DATA_GAP`, `ERROR`.

---

## 21. Tests

`vendor-bill-posted.test.ts` covers stock/non-stock/mixed, GST intra/inter, gaps, discount/adjustment, DRAFT/VOID, historical PAID, concurrency, duplicates, PO/receipt stock integrity, source change, flags, recon V4, closed period.

Extended production-guard + api-security.

---

## 22. Concurrency

20 concurrent posts → 1 event / 1 journal (`postJournalFromEvent` unique key).

---

## 23. Lightsail Validation

| Step | Result |
|------|--------|
| Environment | Pre-launch Lightsail (production-like DB) |
| Fixture | `TEST-ACC-BILL-LS-*` non-stock service bill |
| Preview | Balanced; intra-state GST |
| Post | `JE-202608-00005` Dr=Cr=11800 |
| Replay | `duplicate: true` |
| Recon V4 | `UNPAID`, AP outstanding 11800, native payment 0 |
| Fingerprint | Purchase/stock unchanged |
| `.env` flags | Not permanently enabled |

Journal: Dr 5300 10000 + Dr 2200/2201 900/900 / Cr 2000 11800.

---

## 24. Purchase / Stock Integrity

Accounting posting does not modify `Inventory.onHand` or `ProductVariant.costInPaise`.  
Receive path unchanged. Tests assert stock fingerprint stable across post.

---

## 25. Known Limitations

1. No vendor payment journals (3C).  
2. No Expense posting (3C).  
3. No 1200 capitalization / COGS (3D).  
4. Adjustment unclassified (allocated only).  
5. No bill attachments / GSTR.  
6. GSTIN shape check only (not full checksum/legal validation).  
7. VOID/edit after post → detect only (`SOURCE_CHANGED_AFTER_POST` / `REVERSAL_REQUIRED`); reversal journal deferred.

---

## 26. Safety Audit

```
COMMERCE PRODUCTION FILES MODIFIED:
NONE

PURCHASES OPERATIONAL FILES MODIFIED:
NONE (purchases.service/handlers/routes untouched for accounting hooks)

INVENTORY/STOCK LOGIC MODIFIED:
NONE

ZOHO FILES MODIFIED:
NONE

EXISTING COMMERCE/PURCHASE TABLES ALTERED:
NONE by Phase 3B migration
(Lightsail applied existing additive purchases Phase 1 migration if missing)

ACCOUNTING SCHEMA/MIGRATION ADDED:
- 20260823020000_accounting_phase3b_inventory_purchases_clearing

COA CHANGES:
- 1210 Inventory Purchases Clearing (ASSET, system)

UNEXPECTED FILES MODIFIED:
NONE attributable outside accounting/admin UI/test/report scope

COMMERCE REGRESSION:
PASS (full suite)

PURCHASES REGRESSION:
PASS (receive/stock assertions in vendor-bill suite; no ops code changes)
```

### Verification totals

| Check | Result |
|-------|--------|
| Prisma validate | PASS |
| Full `vitest run` | **15 files / 164 tests PASS** |
| Backend build | PASS |
| Frontend build | PASS (prior run in session) |
| Lightsail shadow | PASS |

---

## 27. Recommendation

1. Keep purchases posting flags **off** except controlled runs.  
2. Prefer bills with GSTIN + supplier reference + vendor state for GST-bearing posts.  
3. Phase **3C**: payment documents + Expense posting (avoid Mark-paid as GL).  
4. Phase **3D**: reclassify 1210 → 1200 with cost layers; then COGS.

---

PHASE 3B VENDOR BILL/AP SHADOW VALIDATED
