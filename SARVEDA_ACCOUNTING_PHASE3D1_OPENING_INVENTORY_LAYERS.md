# SARVEDA NATIVE ACCOUNTING — PHASE 3D1 OPENING INVENTORY + FIFO LAYERS

**Date:** 2026-08-24  
**Scope:** Accounting-owned cost-layer foundation, opening inventory import/posting, reconciliation V1  
**Not in scope:** COGS consumption, purchase receipt capitalization, 1210→1200, returns/restock reversal

---

## 1. Executive Summary

Phase 3D1 implements the **accounting-owned inventory cost-layer foundation** approved in Phase 3D-A:

- `AccountingInventoryCostLayer` — opening / future receipt / restock layers
- `AccountingInventoryCostConsumption` — structure for Phase 3D3 FIFO COGS (no consumption in 3D1)
- `AccountingInventoryOpeningBatch` + items — auditable opening import/post workflow
- XLSX import with preview, validation, draft save, idempotent post
- Opening journal: **Dr 1200 / Cr 3900** (not 1210)
- Inventory reconciliation V1 + admin UI at `/admin/accounting/inventory`

**No operational stock mutation.** `Inventory.onHand` and `ProductVariant.costInPaise` are untouched.

**Lightsail validation:** classification + recon + template generation succeeded. **No opening batch posted** — trusted cost source not supplied.

---

## 2. Lightsail Environment Proof

| Check | Result |
|-------|--------|
| Path | Dev machine → SSH `13.204.112.165` → private Postgres |
| Database host (redacted) | `ls-***.c9oiska8wm8k.ap-south-1.rds.amazonaws.com` |
| Database name | `sarveda_db` |
| Intended pre-launch Lightsail DB | **YES** |
| `isProductionLikeEnvironment()` | **true** |
| Migration `20260824010000_accounting_phase3d1_inventory_layers` | **Applied on Lightsail** |

---

## 3. Models / Migration

**Migration:** `backend/prisma/migrations/20260824010000_accounting_phase3d1_inventory_layers/migration.sql`

| Model | Purpose |
|-------|---------|
| `AccountingInventoryCostLayer` | FIFO layer (qty original/remaining, unit cost paise, source fingerprint) |
| `AccountingInventoryCostConsumption` | Future COGS consumption rows (schema only in 3D1) |
| `AccountingInventoryOpeningBatch` | Batch header (DRAFT/VALIDATED/POSTED, hash, journal link) |
| `AccountingInventoryOpeningBatchItem` | Per-SKU opening line with classification snapshot |

**CoA addition:** account **3900 Opening Balance Equity** (system, EQUITY)

---

## 4. Inventory Classification

**File:** `inventory-classification.ts`

| Classification | Rule (deterministic) |
|----------------|----------------------|
| `PHYSICAL_INVENTORY` | SIMPLE/VARIABLE, not catalogHidden, not COURSE-/EVENT- |
| `COURSE_DIGITAL_PLACEHOLDER` | DIGITAL productType or COURSE-/EVENT- SKU |
| `NON_INVENTORY` | catalogHidden |
| `UNKNOWN` | fallback |

**Lightsail classification counts:**

| Classification | Count |
|----------------|-------|
| PHYSICAL_INVENTORY | 813 |
| COURSE_DIGITAL_PLACEHOLDER | 22 |
| **Total variants** | **835** |

Course placeholders excluded from opening layers and 1200.

---

## 5. Opening Batch

- Status flow: `DRAFT` → `VALIDATED` (on save) → `POSTED` (on commit)
- Batch number: `INV-OPEN-YYYYMM-#####` via `AccountingSequence`
- Posted batch creates one `INVENTORY_OPENING_POSTED` event + one journal + one layer per eligible item
- Idempotent unique key: `inventory_opening:{batchId}`

---

## 6. XLSX Import

**File:** `opening-inventory-import.service.ts`

**Columns (flexible headers):**

| Column | Required |
|--------|----------|
| SKU | Yes |
| VARIANT_ID | Optional |
| OPENING_QTY | Yes |
| UNIT_COST_IN_PAISE or UNIT_COST (INR) | Yes |
| TOTAL_VALUE | Optional cross-check |
| EFFECTIVE_DATE | Batch metadata |
| NOTES | Optional |

**Validations:** unknown SKU, duplicate SKU, negative qty/cost, zero cost, classification exclusion, quantity mismatch (override flag), total value arithmetic.

**Template download:** `GET /api/admin/accounting/inventory/opening/template` — generated from Lightsail physical stock (**48,275 bytes** on validation run).

---

## 7. Cost Source Rules

Opening costs must come from **external trusted sources** (Zoho valuation, reviewed spreadsheet, approved manual valuation).

**Prohibited:** selling price, MRP, storefront price, arbitrary %, `ProductVariant.costInPaise`, Woo revenue reconstruction.

Metadata captured: `valuationSource`, `sourceDocumentRef`, `preparedBy`, `reviewedBy`, `sourcePayloadHash`.

---

## 8. Quantity Validation

Operational `Inventory.onHand` remains quantity authority.

Default: `OPENING_QTY` must equal operational `onHand`. Mismatch → `QUANTITY_MISMATCH` unless `allowQuantityMismatch=true` on batch.

Opening layers **never** modify `onHand`.

---

## 9. Opening Journal

**Builder:** `opening-inventory-journal.builder.ts`

```
Dr 1200 Inventory Asset          {totalValueInPaise}
    Cr 3900 Opening Balance Equity
```

- **Never** uses 1210 Inventory Purchases Clearing
- **Never** uses 5000 COGS
- Variant breakdown stored in posting event `payloadJson`

---

## 10. FIFO Foundation

Deterministic layer order (Phase 3D3):

1. `effectiveAt` ASC  
2. `createdAt` ASC  
3. `id` ASC  

Indexes on `(variantId, status, effectiveAt, …)` and `(variantId, quantityRemaining)`.

No JS mutexes; posting idempotency via DB unique constraints + `postJournalFromEvent`.

---

## 11. Idempotency / Concurrency

- Duplicate post → same event, same journal, same layers (`duplicate: true`)
- Test: 20 concurrent post attempts → **1 journal**, **1 layer set**

---

## 12. Inventory Reconciliation V1

**File:** `inventory-reconciliation.service.ts`  
**API:** `GET /api/admin/accounting/inventory/reconciliation`

Per variant: SKU, classification, operational onHand, native layer qty, variance, value, layer count, uncosted qty, status, warnings.

**Lightsail recon (physicalOnly, before any opening post):**

| Status | Count |
|--------|-------|
| OPENING_REQUIRED | 710 |
| MATCHED | 103 |

**Financial control (pre-opening):**

| Metric | Value |
|--------|-------|
| 1200 GL balance | ₹0 |
| Native layers total | ₹0 |
| GL vs layers variance | ₹0 |

103 `MATCHED` = physical SKUs with zero onHand (no opening needed).

---

## 13. Admin UI / API

| Route | Function |
|-------|----------|
| `/admin/accounting/inventory` | Recon, classification, XLSX preview/draft/post |
| `GET .../inventory/reconciliation` | Recon V1 |
| `GET .../inventory/classification-summary` | Classification counts |
| `GET .../inventory/opening/template` | Download XLSX template |
| `POST .../inventory/opening/preview` | Upload + validate (multipart) |
| `POST .../inventory/opening/draft` | Save VALIDATED batch |
| `POST .../inventory/opening/preview-post` | Journal proposal |
| `POST .../inventory/opening/post` | Commit batch + layers + journal |

---

## 14. Feature / Production Guards

| Flag | Default |
|------|---------|
| `NATIVE_ACCOUNTING_ENABLED` | OFF |
| `ACCOUNTING_INVENTORY_VALUATION_ENABLED` | OFF |

Posting requires both above. Production-like also requires `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`.

Guard: `assertInventoryOpeningPostingPersistenceAllowed()` in `production-guard.ts`.

---

## 15. Tests

**File:** `backend/test/accounting/opening-inventory.test.ts` — **26 tests**

Covers: physical/course classification, unknown/duplicate SKU, zero/negative cost, qty mismatch/match, rupee→paise, idempotent post, 20-way concurrency, layer invariants, FIFO order, fingerprint, flags, production guard, malformed XLSX, operational inventory unchanged, costInPaise unchanged, 1200/3900 journal, no 1210, recon OPENING_POSTED.

---

## 16. Lightsail Validation

Script: `backend/scripts/phase3d1-lightsail-inventory-validation.ts`

```bash
PHASE3D1_LIGHTSAIL_INVENTORY_OK=1 \
npx tsx scripts/phase3d1-lightsail-inventory-validation.ts
```

**Executed successfully on Lightsail 2026-08-24.**

- Classification verified (813 physical / 22 course)
- Course exclusion confirmed (0 course rows in physicalOnly recon)
- Opening template generated from real stock
- **No batch posted** — no trusted cost file

---

## 17. Real Opening Cost Data Gap

We do **not** possess trusted opening unit costs for ~710 physical SKUs with stock (~78,826 units).

**Do not fabricate** opening valuation against migrated inventory.

Next step: obtain reviewed cost file (Zoho inventory valuation / team spreadsheet) → preview → explicit approval → post opening batch.

---

## 18. Commerce / Stock Integrity

Verified by tests and design:

- No changes to `Inventory` quantity writers
- No changes to checkout/reservation/confirmation
- No PurchaseReceipt stock behavior changes
- No Order/OrderItem/Refund/shipment changes
- No Zoho integration changes
- No COGS journals created

---

## 19. Files Changed

**Schema / migration**

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260824010000_accounting_phase3d1_inventory_layers/migration.sql`

**Accounting module (new)**

- `inventory.constants.ts`, `inventory.types.ts`, `inventory-classification.ts`, `inventory-layer-invariants.ts`
- `opening-inventory-import.service.ts`, `opening-inventory-journal.builder.ts`
- `opening-inventory-batch.service.ts`, `opening-inventory-posting.service.ts`
- `inventory-reconciliation.service.ts`

**Accounting module (updated)**

- `seed-coa.ts`, `accounting-flag.ts`, `production-guard.ts`, `accounting-errors.ts`
- `accounting.handlers.ts`, `accounting.routes.ts`

**Scripts**

- `phase3d1-lightsail-inventory-preflight.ts` (from preflight)
- `phase3d1-lightsail-inventory-validation.ts`

**Tests / config**

- `test/accounting/opening-inventory.test.ts`
- `test/helpers/commerce.ts`, `test/setup.ts`
- `backend/.env.example`

**Frontend**

- `frontend/app/admin/accounting/inventory/page.tsx`
- `frontend/lib/accounting-api.ts`
- `frontend/components/admin/accounting/AdminAccountingNav.tsx`

---

## 20. Safety Audit

| Risk | Mitigation |
|------|------------|
| Accidental prod posting | Dual flag + production guard |
| Duplicate opening journals | Posting event unique key + concurrency test |
| Course stock → 1200 | Classification blocks import |
| Ops stock mutation | No commerce code touched; tests assert onHand unchanged |
| 1210 misuse for opening | Journal builder hardcodes 1200/3900 only |
| Localhost as Lightsail | Validation script refuses wrong DB host |

---

## 21. Recommendation

Proceed to **Phase 3D2** (purchase receipt capitalization 1210→1200) only after:

1. Trusted opening cost file received and reviewed  
2. Opening batch preview approved by accounting  
3. Explicit post with flags enabled on staging/Lightsail  
4. Recon shows `OPENING_POSTED` / GL 1200 = layers total

---

## Verification Totals

| Suite | Result |
|-------|--------|
| Backend test files | **19 passed** |
| Backend tests | **248 passed** |
| Accounting tests (incl. 26 new) | **248** total run in full suite |
| Backend build | **PASS** |
| Frontend build | **PASS** |
| Prisma validate / migrate (local) | **PASS** |
| Lightsail migration + validation | **PASS** |

---

**PHASE 3D1 FOUNDATION VALIDATED — OPENING COST SOURCE REQUIRED**
