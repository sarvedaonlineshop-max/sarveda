# SARVEDA NATIVE ACCOUNTING — PHASE 7B
# ACCOUNTING RESET + PRODUCTION OPENING INFRASTRUCTURE

**Date:** 2026-08-25  
**Authority:** `SARVEDA_ACCOUNTING_PHASE7A_PRODUCTION_CUTOVER_ARCHITECTURE.md`  
**Scope:** 7B only — reset tooling + opening infrastructure + safe validation  
**Explicitly NOT done:** 7C real owner openings · 7D cutover activation · destructive Lightsail reset · permanent production flags  

---

## 1. Executive Summary

Phase 7B delivers the **safe infrastructure** required to rebuild Lightsail’s TEST-contaminated shadow ledger into clean production opening books — without performing that rebuild yet.

| Capability | Status |
|------------|--------|
| Ops-only accounting-domain reset (dry-run default) | Implemented |
| Backup / typed confirmation / flag gates | Implemented |
| `AccountingOpeningBatch` + staging models | Migrated |
| SKU / inventory / bank / gateway / AP / AR / GST / equity staging | Implemented |
| Validate → preview → atomic post | Implemented |
| Cutover forward-only on sales/settlements/banks + refund/return edges | Hardened |
| Admin UI `/admin/accounting/opening` | Implemented (no reset UI) |
| Synthetic `TEST-ACC-CUTOVER-*` proof | Local Vitest **18/18 PASS** |
| Full backend Vitest (one clean run) | **35 files / 424 tests PASS** |
| Lightsail: migrate + reset dry-run + disposable opening | **Done** (§29–30) |
| Real openings / Zoho / permanent flags / commerce cleanup | **Not started (7C/7D)** |

---

## 2. Files Changed

### New (core)

- `backend/prisma/migrations/20260825190000_accounting_phase7b_opening_batch/migration.sql`
- `backend/src/modules/accounting/opening.constants.ts`
- `backend/src/modules/accounting/opening-validation.service.ts`
- `backend/src/modules/accounting/opening-batch.service.ts`
- `backend/src/modules/accounting/opening-import.service.ts`
- `backend/src/modules/accounting/opening.handlers.ts`
- `backend/src/modules/accounting/accounting-reset.service.ts`
- `backend/scripts/accounting-production-reset.ts`
- `backend/scripts/phase7b-lightsail-opening-validation.ts`
- `backend/test/accounting/phase7b-reset.test.ts`
- `backend/test/accounting/phase7b-opening.test.ts`
- `backend/test/accounting/phase7b-cutover-boundary.test.ts`
- `frontend/app/admin/accounting/opening/page.tsx`

### Edited

- `backend/prisma/schema.prisma` — opening batch + staging models
- `backend/src/modules/accounting/accounting-flag.ts` — `ACCOUNTING_OPENING_BALANCE_ENABLED`
- `backend/src/modules/accounting/production-guard.ts` — `assertProductionOpeningPersistenceAllowed`
- `backend/src/modules/accounting/accounting-errors.ts` — opening/reset errors
- `backend/src/modules/accounting/accounting.routes.ts` — `/opening/*`
- `backend/src/modules/accounting/order-paid-posting.service.ts` — cutover assert + `allowPreCutover`
- `backend/src/modules/accounting/settlement-posting.service.ts` — cutover assert
- `backend/src/modules/accounting/bank-opening-posting.service.ts` — cutover assert
- `backend/src/modules/accounting/order-refunded-full-eligibility.ts` / types / snapshot — pre-cutover history code
- `backend/src/modules/accounting/inventory-cogs-reversal.*` — restock vs order cutover + history codes
- `backend/.env.example` — opening flag (default OFF)
- `frontend/lib/accounting-api.ts` — opening helpers
- `frontend/components/admin/accounting/AdminAccountingNav.tsx` — Opening / Cutover link

---

## 3. Schema

**Enums:** `AccountingOpeningBatchStatus` (DRAFT|VALIDATED|POSTED|CANCELLED), `AccountingOpeningMatchStatus`, `AccountingOpeningReviewStatus`

**Models:** `AccountingOpeningBatch` + staging children (SKU mapping, inventory, bank, gateway, AP, AR, GST, equity). Cascade delete from batch. At most one POSTED batch enforced in service layer. Optional `journalEntryId` / `postingEventId` links.

**Migration:** `20260825190000_accounting_phase7b_opening_batch`

Canonical CoA (`AccountingAccount`) and commerce tables are **not** truncated by opening schema.

---

## 4. Accounting Reset Architecture

Ops CLI: `backend/scripts/accounting-production-reset.ts`  
Service: `accounting-reset.service.ts`

- Default **dry-run** → JSON manifest under `backend/tmp/`
- `--execute` requires `--backup-ref`, `--operator`, `--confirm-accounting-reset=<token>`
- Token = `SHA256("ACCOUNTING-RESET|<dbName>|<backupRef>")` (non-trivial; not a YES flag)
- Production-like execute requires `--acknowledge-production-like=yes`
- Localhost execute requires `--allow-localhost`
- Refuses execute when `NATIVE_ACCOUNTING_ENABLED` or `ACCOUNTING_OPENING_BALANCE_ENABLED` is ON
- **Never** exposed as HTTP/admin API

---

## 5. Reset Manifest

Each entry: `table`, `rows_to_remove`, `rows_to_preserve`, `reason`, `dependency_order`, `commerce_impact`, `reversible_via_backup`.

Also: commerce fingerprint before/(after on execute), blocking reasons, TEST bank GL deactivation candidates, `execute_allowed`.

---

## 6. Reset Safety Guards

| Guard | Behavior |
|-------|----------|
| Dry-run default | Yes |
| Backup ref required | Execute only |
| Typed confirm token | SHA256 binding dbName + backupRef |
| Flags must be OFF | Native + opening |
| No silent cloud snapshot | Documented RDS/backup only |
| Application journal immutability | Unchanged for runtime paths |

---

## 7. Commerce Preservation

Reset deletes **accounting-owned** shadow rows only. Preserves at minimum: Order, OrderItem, Payment, Refund, Product, ProductVariant, Inventory.onHand, User, Vendor, VendorBill/PO/Receipt ops where applicable.

Fingerprints compare counts before/after execute.

**TEST commerce classification (7B — no auto-delete):** RETAIN_BUT_EXCLUDE / SAFE_TO_DELETE_LATER / MANUAL_REVIEW (documented for 7C/7D; not acted on here).

---

## 8. Opening Batch Architecture

Flow: UPLOAD/PARSE → STAGE → VALIDATE → REVIEW → OPENING BATCH → POST.

Statuses: DRAFT → VALIDATED → POSTED (immutable) | CANCELLED.

Event: `PRODUCTION_OPENING_BALANCE` · unique key `production_opening:{batchId}`.

---

## 9. SKU Mapping

Fields align with Phase 7A: NEW_SARVEDA_SKU, LEGACY_SKU, PRODUCT_NAME, VARIANT, MATCH_STATUS, OPENING_QTY, UNIT_COST (paise), SOURCE, REVIEW_STATUS.

`UNKNOWN` / `LEGACY_ONLY` with nonzero qty → **FAIL** (no fuzzy auto-post).

---

## 10. Inventory Opening

Dr **1200** from staged totals. FIFO layers `sourceType=OPENING`. **Inventory.onHand never mutated** by opening post. Qty mismatch vs ops onHand → WARNING.

---

## 11. Bank/Cash Opening

Staged name, bank, masked account, IFSC, type, GL, book balance, statement (evidence only), review. Reserved clearing GLs blocked for bank rows. Creates registry bank row if missing GL mapping unused.

---

## 12. Gateway Opening

Providers → 1020/1021/1022 (COD approved separately). Staged unsettled amounts — not derived from contaminated GL.

---

## 13. AP Opening

Staged vendor/bill/outstanding; GL **2000** = sum outstanding. Supports future VendorPayment settlement fields (`remainingOutstandingInPaise`).

---

## 14. AR Opening

Conditional. Total = **1100** proposal, or explicit `arApprovedZero`.

---

## 15. GST Opening

Explicit staged balances for 2100–2102 / 2200–2202. No CLAIMED ITC inference.

---

## 16. Equity

3000 / 3100 / 3900. Nonzero **3900** requires reason + reviewer + approval (WARNING when approved). Silent plug forbidden.

---

## 17. Opening Journal

Single atomic journal tied to batch via posting event + document link. Memo identifies `PRODUCTION_OPENING_BALANCE`.

---

## 18. Atomicity

`postOpeningBatch` posts journal + FIFO layers + bank registry + batch POSTED in **one** Prisma transaction (same pattern as COGS). Failure rolls back entire posting. Replay is idempotent via unique key + layer fingerprint.

---

## 19. Validation Engine

`validateOpeningBatch()` → PASS | WARNING | FAIL | DATA_GAP checks: Dr=Cr, 1200=FIFO, AP, AR/zero, banks, gateway, GST, SKU resolution, TEST identifiers (fixture carve-out when description contains `TEST-ACC-CUTOVER`), equity 3900 approval.

---

## 20. Cutover Boundary

Config already present: `ACCOUNTING_CUTOVER_DATE`, `ACCOUNTING_CUTOVER_FORWARD_ONLY` (default OFF / not persisted on Lightsail).

`assertDocumentDateAllowedForPosting` now applied on: ORDER_PAID, settlements, bank opening (plus prior purchases/COGS/expense/transfer/etc.). Explicit `allowPreCutover` remains for controlled historical posts.

---

## 21. Refund/Return Boundary

- Full refund without native ORDER_PAID and order **PRE_CUTOVER** → `PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED` (no invented reversal).
- COGS reversal: restock cutover vs **order** cutover separated; missing native COGS on pre-cutover order → `PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED`; otherwise `MANUAL_ACCOUNTING_REVIEW_REQUIRED`. Ops restock continues independently.

---

## 22. Admin UI

`/admin/accounting/opening` — Cutover Status, Batch, SKU, Inventory, Banks, Gateway, AP, AR, GST, Equity, Validation; Preview / Validate / Export Review / Post. Notice: *Accounting reset must be performed by authorized operations.* No reset execute control.

---

## 23. Import Templates

`opening-import.service.ts` — CSV/XLSX strict headers, formula-injection sanitization, templates per kind (sku_mapping, inventory, bank, gateway, ap, ar, gst, equity).

---

## 24. Review Export

`buildOpeningReviewWorkbook(batchId)` — Summary, Inventory, Banks, Gateway, AP, AR, GST, Equity, Validation (7C accountant pack).

---

## 25. Authorization / Flags

| Flag | Default | Role |
|------|---------|------|
| `NATIVE_ACCOUNTING_ENABLED` | OFF | Module gate |
| `ACCOUNTING_OPENING_BALANCE_ENABLED` | OFF | Opening prepare/post |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | OFF | Prod-like post override |
| Cutover envs | unset | Boundary only |

Opening APIs: admin + feature-gated. Post requires opening flag (+ production dual guard when production-like).

---

## 26. Synthetic Proof

Fixture `TEST-ACC-CUTOVER-*` (local Vitest):

- Balanced opening **248,000** paise Dr = Cr
- 1200 = FIFO; 2000 = AP; 1100 = approved zero; 1020 = Razorpay staged; banks match staged
- `Inventory.onHand` unchanged; commerce unchanged; POST replay duplicate-safe

---

## 27. Test Results

| Suite | Result |
|-------|--------|
| `phase7b-reset` / `phase7b-opening` / `phase7b-cutover-boundary` | **18/18 PASS** |
| Cutover-affected accounting regression (cogs / refund / reverse) | PASS |

---

## 28. Full Regression

| Check | Result |
|-------|--------|
| `prisma validate` / `generate` | PASS |
| `tsc --noEmit` | PASS |
| Backend `npm run build` | PASS |
| Frontend `npm run build` | PASS |
| Full backend Vitest (one clean run) | **35 files / 424 tests PASS / EXIT 0** |

---

## 29. Lightsail Validation

| Field | Evidence |
|-------|----------|
| Host | `ip-172-26-7-99` / `13.204.112.165` |
| App path | `/home/ubuntu/sarveda/backend` |
| DB | Remote Lightsail Postgres `sarveda_db` (not localhost) |
| Persistent accounting flags in `.env` | **0 / ABSENT** |
| Migration | `20260825190000_accounting_phase7b_opening_batch` **applied** |
| Opening validation | Disposable `TEST-ACC-CUTOVER` DRAFT: balanced **10,000** Dr=Cr; validate/preview only; **deleted** |
| Opening batches remaining | **0** |
| Permanent opening POST | **Not run** |
| Real openings / Zoho | **Not loaded / not modified** |
| 7C | **Not started** |

---

## 30. Reset Dry-Run Results

- Mode: **dry-run only** — `executeAccountingReset` **NOT** called; valid confirm token **NOT** used
- Dependency order: 24 accounting-owned tables (Order **outside** delete list)
- Commerce fingerprint collected (preserved scope): orders **4396**, payments **3520**, refunds **2**, products **201**, variants **859**, inventory onHand sum **93758**
- Accounting rows identified for future reset (examples): journals **113**, posting events **96**, bank accounts **22**, cost layers **17**
- Execute refusals proven (missing ack / invalid path); **no destructive reset**

---

## 31. Safety Audit

| Question | Answer |
|----------|--------|
| Commerce rows changed? | **No** |
| Payments / Refunds changed? | **No** |
| Operational inventory qty changed? | **No** |
| Historical accounting journals changed? | **No** |
| Reset executed? | **No** |
| Real openings loaded? | **No** |
| Persistent production flags enabled? | **No** (0 lines) |
| Zoho modified? | **No** |
| Schema/migration added? | **Yes** — opening batch migration |
| 7C started? | **No** |

---

## 32. What Owner Must Provide for 7C

1. Cutover effective date  
2. Approved SKU mapping workbook  
3. Inventory qty + unit cost (paise-exact)  
4. Bank/cash book openings (masked identity)  
5. Gateway unsettled openings  
6. AP opening schedule  
7. AR schedule or signed zero-AR  
8. GST GL openings (210x/220x)  
9. Equity allocation (prefer 3900 = 0)  
10. Authorized backup + reset **execute** decision (separate from 7B)

---

## 33. Known Limitations

- Reset execute still requires explicit owner/ops authorization (not done in 7B)
- TEST commerce not cleaned (by design; disposable pre-cutover data)
- Forward-only cutover + 7D activation still required before production posting
- Phase 3D1 inventory opening batch remains separate from production opening batch

---

## 34. Recommendation

7B infrastructure is complete and validated. Proceed to **Phase 7C** only when owner opening pack is ready and reset execute (after backup) is explicitly authorized. Do not enable permanent production flags until 7C/7D.

---

PHASE 7B CUTOVER INFRASTRUCTURE VALIDATED
