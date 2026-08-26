# SARVEDA NATIVE ACCOUNTING — PHASE 6B
# REPORT ENGINE + TRIAL BALANCE + GENERAL LEDGER

**Date:** 2026-08-25  
**Scope:** FinancialStatementMapping · FY helpers · TB · GL · admin APIs · reports UI foundation · tests · Lightsail validation  
**Not in scope:** P&L, Balance Sheet, dashboard (6C); integrity suite, exports, hardening (6D); Phase 7 cleanup  

---

## 1. Executive Summary

Phase 6B delivers the **GL-only financial reporting foundation**. Trial Balance and General Ledger aggregate **POSTED** `AccountingJournalLine` rows via database SQL / Prisma aggregation. A centralized **FinancialStatementMapping** layer classifies accounts for statements without changing CoA. Financial year math is configurable via `ACCOUNTING_FY_START_MONTH` (default **4**).

**Results:**

| Check | Result |
|-------|--------|
| Focused 6B tests | **15 + 3 security** passed |
| Full backend suite | **30 files / 396 tests** passed |
| Backend `tsc --noEmit` | PASS |
| Frontend build | PASS (`/admin/accounting/reports`) |
| Lightsail TB balanced | PASS (closing Dr = Cr = 50,357,900 paise) |
| Lightsail GL / orphan / bank GLs | PASS |
| Persistent Lightsail flags | **ABSENT** after validation |

PHASE 6B REPORT ENGINE / TB / GL VALIDATED

---

## 2. Files Changed

### Backend (new)

- `backend/src/modules/accounting/financial-statement.mapping.ts`
- `backend/src/modules/accounting/financial-year.ts`
- `backend/src/modules/accounting/trial-balance.service.ts`
- `backend/src/modules/accounting/general-ledger.service.ts`
- `backend/src/modules/accounting/financial-reports.handlers.ts`
- `backend/scripts/phase6b-lightsail-reports-validation.ts`
- `backend/test/accounting/financial-reports-tb-gl.test.ts`

### Backend (edited)

- `backend/src/modules/accounting/accounting.routes.ts` — report routes
- `backend/test/accounting/api-security.test.ts` — route presence asserts
- `backend/.env.example` — `ACCOUNTING_FY_START_MONTH` comment  
  (`ACCOUNTING_REPORTS_ENABLED` already existed; flag helper already in `accounting-flag.ts`)

### Frontend

- `frontend/app/admin/accounting/reports/page.tsx` — new
- `frontend/components/admin/accounting/AdminAccountingNav.tsx` — Reports link
- `frontend/lib/accounting-api.ts` — TB/GL/FY fetch helpers

### Schema / migrations

- **None** — mapping is code-level; existing indexes on `entryDate`, `status`, `accountId` sufficient

---

## 3. Financial Statement Mapping

Central module: `financial-statement.mapping.ts`.

| Code / rule | Report class |
|-------------|--------------|
| 4200 | `CONTRA_REVENUE` |
| 4500 | `OTHER_INCOME` |
| 5000 | `COGS` |
| 1000 | `CASH` |
| 1010 | `BANK` |
| 2100–2102 | `TAX_LIABILITY` |
| 2200–2202 | Debit net → `TAX_ASSET`; credit net → `TAX_LIABILITY` |
| 1210 | Debit net → `PURCHASE_CLEARING_ASSET`; credit → `PURCHASE_CLEARING_LIABILITY` |
| `AccountingBankAccount` GL | `BANK` / `CASH` by registry type |

Frontend does **not** hardcode classification — it displays `reportClass` from the API.

CoA seed unchanged.

---

## 4. FY Configuration

`financial-year.ts` + env `ACCOUNTING_FY_START_MONTH` (default **4**).

Helpers: `getAccountingFyStartMonth`, `financialYearContainingDate`, `currentFinancialYear`, `yearToDateStart`, `previousFinancialYear`, `listFinancialYearOptions`, `financialYearConfigSummary`.

Invalid month (not 1–12) throws — surfaced as `INVALID_FY_CONFIG`.

---

## 5. Feature Flags

| Flag | Default | Gate |
|------|---------|------|
| `NATIVE_ACCOUNTING_ENABLED` | OFF | Module |
| `ACCOUNTING_REPORTS_ENABLED` | OFF | Requires native; gates report APIs |
| `ACCOUNTING_FY_START_MONTH` | 4 | Optional config |

Report handlers return **503** `ACCOUNTING_REPORTS_DISABLED` when off.

---

## 6. Trial Balance Design

**Authority:** POSTED journal lines only (SQL aggregation).

| Mode | Opening | Period | Closing |
|------|---------|--------|---------|
| `asOf` | 0 | all `entryDate ≤ asOf` | net of period |
| `from`/`to` | `entryDate < from` | inclusive range | opening + period |

**Presentation:** Opening/closing nets shown on **actual** debit OR credit side (`presentNetAsDebitCredit`). Period columns = raw Σ debit / Σ credit.

**Invariant:** `SUM(closingDebit) == SUM(closingCredit)`; exact `varianceInPaise` returned; never auto-balanced.

`includeZeroBalanceAccounts` default **false**.

---

## 7. General Ledger Design

**Inputs:** account code/id + from/to + pagination (limit ≤ 200).

**Running balance:** signed net **debit − credit**, starting from opening.  
**Sort (documented):** `entryDate ASC`, `entryNumber ASC`, `sortOrder ASC`, `lineId ASC`.

**Linkage:** left-join `AccountingPostingEvent`; missing event → `orphanJournal: true` (still listed).

**Safe source hrefs only** (`ORDER`, vendor-bills list, expenses, banking); otherwise type/id text only.

---

## 8. API

All under `/api/admin/accounting` (requireAdmin + native module middleware):

| Method | Path |
|--------|------|
| GET | `/reports/trial-balance` |
| GET | `/reports/general-ledger` |
| GET | `/reports/accounts` |
| GET | `/reports/financial-year` |

Zod validates dates (`YYYY-MM-DD`), mutually exclusive asOf vs from/to, pagination bounds. Client errors → 400/404 without raw DB errors.

---

## 9. Admin UI

`/admin/accounting/reports` with tabs:

| Tab | Status |
|-----|--------|
| Overview | Info + FY summary |
| Trial Balance | **Implemented** |
| General Ledger | **Implemented** |
| Profit & Loss | “Available in Phase 6C” |
| Balance Sheet | “Available in Phase 6C” |
| Reconciliation / Integrity | “Available in Phase 6D” |

TB: BALANCED / OUT OF BALANCE + variance; row → GL drill-down.  
GL: summary cards, orphan badge, pagination.

---

## 10. Performance

- TB: single grouped SQL over accounts × POSTED lines  
- GL: aggregates + one ordered `findMany` with `postingEvent` include (no N+1)  
- No new indexes (existing `entryDate` / `status` / `accountId` adequate at current scale)

---

## 11. Security

- Admin-only routes  
- Reports flag gated  
- Zod query validation  
- No public financial endpoints  
- Minimal PII (no customer fields on GL lines)

---

## 12. Synthetic Test Results

`TEST-ACC-FS-*` fixture: opening bank ₹10,00,000 + inventory ₹5,00,000; purchase/clearing credit residual; sale; COGS; expense; orphan journal; dynamic bank GL 9088.

| Assertion | Result |
|-----------|--------|
| Mapping specials / 1210 flip | PASS |
| FY default 4 / Apr–Mar / calendar FY | PASS |
| TB balanced as-of | PASS |
| 1210 closing CREDIT | PASS |
| Period opening/period/closing | PASS |
| Zero-account include/exclude | PASS |
| GL opening+movement=closing | PASS |
| Running balance + pagination | PASS |
| Orphan journal flag | PASS |
| Reports flag needs native | PASS |

---

## 13. Full Regression Results

| Suite | Result |
|-------|--------|
| Focused 6B + api-security | 18 passed |
| Full backend vitest | **30 files / 396 tests** passed (~932s with query logging) |
| `npx tsc --noEmit` (backend) | PASS |
| `npm run build` (frontend) | PASS — `/admin/accounting/reports` emitted |

---

## 14. Lightsail Environment Proof

| Check | Result |
|-------|--------|
| Host | `ubuntu@13.204.112.165` |
| DB | Lightsail RDS `ls-…c9oiska8wm8k.ap-south-1.rds.amazonaws.com` / `sarveda_db` |
| Not localhost | Confirmed |
| `isProductionLikeEnvironment()` | **true** |
| Persistent `.env` accounting flags | **ABSENT** after validation |
| Migration | None required / none applied |

Validation: process-env only  
`NATIVE_ACCOUNTING_ENABLED=1 ACCOUNTING_REPORTS_ENABLED=1 ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 npx tsx scripts/phase6b-lightsail-reports-validation.ts`

---

## 15. Lightsail TB Proof

| Metric | Value |
|--------|-------|
| POSTED journals / lines | 113 / 300 |
| As-of | 2026-08-25 |
| Rows (non-zero) | 41 |
| Closing Dr | 50,357,900 paise |
| Closing Cr | 50,357,900 paise |
| Variance | **0** |
| Balanced | **true** |
| SQL reconcile 1020 | net ₹75,457.00 matches TB |
| 1210 | Closing **CREDIT** ₹36,000.00 · `PURCHASE_CLEARING_LIABILITY` |
| Bank registry GLs | **22** appear in report accounts |

---

## 16. Lightsail GL Proof

| Check | Result |
|-------|--------|
| Account 1200 opening + movement = closing | PASS (closing 4,100,000) |
| Running balance deterministic | PASS |
| Orphan journal | `JE-202608-00015` on 3900 · `orphanJournal: true` |
| AccountingPeriod rows | 0 (unchanged; reports read-only) |
| Order count | 4396 (commerce untouched) |

---

## 17. Known Data Warnings

Surfaced by reports; **not fixed** in 6B:

- Orphan Output GST ≈ ₹2,593.22 (Phase 5D)  
- TEST-ACC bank / FIFO / GST fixtures distort balances  
- 17 orphan TEST journals (visible with badge)  
- AP GL vs VendorBill outstanding drift  
- Inventory GL vs FIFO variance  
- 1210 credit balance from test receipts  

---

## 18. Phase 7 Carry-Forward

Add to cleanup register:

- All prior TEST-ACC-* / SRV-TEST-ACC-* fixtures  
- Orphan GST journals  
- Orphan TEST journals without posting events  
- AP / FIFO recon variances  
- Dynamic test bank GLs  

Do **not** bypass posted-journal immutability without approved procedure.

---

## 19. Remaining Phase 6 Work

| Slice | Work |
|-------|------|
| **6C** | P&L · Balance Sheet · current earnings · management dashboard · period comparison |
| **6D** | Global integrity checks · XLSX/PDF exports · final hardening · Lightsail close-out |

Do not expand slice count unless a genuine blocker appears.

---

PHASE 6B REPORT ENGINE / TB / GL VALIDATED
