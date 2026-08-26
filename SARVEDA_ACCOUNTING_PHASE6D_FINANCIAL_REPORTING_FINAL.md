# SARVEDA NATIVE ACCOUNTING — PHASE 6D
# FINANCIAL REPORTING INTEGRITY + EXPORTS + HARDENING
# FINAL PHASE 6 SLICE

**Date:** 2026-08-25  
**Prerequisites:** Phase 6A architecture · Phase 6B TB/GL VALIDATED · Phase 6C P&L/BS/Dashboard VALIDATED  
**Not in scope:** Phase 7 · TEST fixture cleanup · orphan GST repair · AP/FIFO repair · opening balances · Cash Flow · year-end close · permanent production flags  

---

## 1. Executive Summary

Phase 6D closes financial **statements & reporting** with a global integrity dashboard, XLSX/PDF exports (same services as UI), security/performance hardening, synthetic cross-report proof, and Lightsail final validation.

| Check | Result |
|-------|--------|
| Integrity service (PASS/WARNING/FAIL/DATA_GAP) | Implemented — DATA_GAP never collapsed to PASS |
| TB / P&L / BS integrity on Lightsail | PASS / PASS / diff 0 |
| AR subledger | DATA_GAP (`AR_SUBLEDGER_DATA_GAP`) |
| AP GL vs native outstanding (Lightsail) | variance 0 (surfaced honestly) |
| Inventory GL vs FIFO (Lightsail) | variance **630,000** paise WARNING |
| Orphan Output GST | **259,322** paise WARNING → Phase 7 |
| TEST contamination | WARNING (99 journals / 22 banks) |
| XLSX + PDF totals = services | PASS |
| productionCutoverReady | always `false` |
| Banner | FINANCIAL REPORTING ENGINE HEALTHY (engine) — not “READY FOR PRODUCTION” |
| Persistent flags on Lightsail `.env` | ABSENT |

**PHASE 6 FINANCIAL STATEMENTS & REPORTING COMPLETE**

---

## 2. Files Changed

### New

- `backend/src/modules/accounting/financial-integrity.service.ts`
- `backend/src/modules/accounting/financial-export.service.ts`
- `backend/scripts/phase6d-lightsail-financial-reporting-validation.ts`
- `backend/test/accounting/financial-reports-integrity-export.test.ts`
- `SARVEDA_ACCOUNTING_PHASE6D_FINANCIAL_REPORTING_FINAL.md`

### Edited

- `backend/src/modules/accounting/financial-reports.handlers.ts` — integrity + export handlers
- `backend/src/modules/accounting/accounting.routes.ts` — integrity / test-fixtures / export routes
- `frontend/lib/accounting-api.ts` — integrity types + blob downloads
- `frontend/app/admin/accounting/reports/page.tsx` — Integrity tab + export buttons

### Unchanged (reused)

- Trial Balance, GL, P&L, BS, Dashboard services  
- GST export `sanitizeSpreadsheetCell`  
- Gateway clearing controls, GST integrity, bank book balances  
- No schema / migrations  

---

## 3. Integrity Architecture

`buildFinancialIntegrityReport({ asOf, from, to })` returns structured checks:

- `code`, `status` (`PASS` | `WARNING` | `FAIL` | `DATA_GAP`), `severity`, `expectedInPaise`, `actualInPaise`, `varianceInPaise`, `message`, `drillDown`
- Summary counts + `overallStatus`:
  - `FINANCIAL_REPORTING_ENGINE_HEALTHY` if `fail === 0`
  - `REVIEW_REQUIRED` if any FAIL
- `productionCutoverReady: false` always
- Single TB aggregation reused for control-account nets (avoids N× TB rebuild)
- Known Phase 7 items listed in `phase7CarryForward`

---

## 4. Integrity Checks

| Code | Notes |
|------|--------|
| `UNBALANCED_POSTED_JOURNALS` | FAIL/BLOCKER if any |
| `ZERO_LINE_POSTED_JOURNALS` | FAIL/BLOCKER if any |
| `TB_DEBITS_EQUAL_CREDITS` | Same 6B service |
| `PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS` | Same 6C P&L integrity |
| `BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY` | Incl. prior unclosed + current FY earnings |
| `RETAINED_EARNINGS_3100_UNTOUCHED` | Option A — no close |
| `AR_GL_VS_SUBLEDGER` | **DATA_GAP** — GL 1100 only |
| `AP_GL_VS_SUBLEDGER` | GL 2000 vs native bill outstanding |
| `INVENTORY_GL_VS_FIFO` | 1200 vs FIFO remaining layers |
| `BANK_GL_VS_BOOK_BALANCE` | Registry book = GL; statement recon contextual only |
| `GATEWAY_CLEARING_CONTROL` | Phase 4 controls |
| `GST_GL_VS_GST_REPORT` | Phase 5 integrity + orphan warning |
| `PURCHASE_CLEARING_1210_CONTROL` | Credit remains visible as liability presentation |
| `ORPHAN_JOURNALS` / `ORPHAN_POSTING_EVENTS` | Counts + TEST tagging |
| `TEST_FIXTURE_CONTAMINATION` | WARNING |
| `HISTORICAL_NATIVE_GL_GAP` | DATA_GAP (orders ≫ ORDER_PAID posts) |

---

## 5. Trial Balance Integrity

Reuses `buildTrialBalance`. Lightsail as-of validation: closing Dr = Cr = **50,357,900** paise. No balancing entries created.

---

## 6. P&L Integrity

Reuses `buildProfitLoss`. Temporary-account movement = reported net. Lightsail: **PASS**, net **3,727,235** paise.

---

## 7. Balance Sheet Integrity

Reuses `buildBalanceSheet` (Option A). Lightsail: assets = liabilities + equity; difference **0**; current FY earnings = P&L(FY start → asOf); **3100** line count **0**.

---

## 8. AR Control

Financial authority: **GL 1100**. Status: **DATA_GAP** / `AR_SUBLEDGER_DATA_GAP`. No invented aging.

---

## 9. AP Control

Authority: **GL 2000** liability. Compared to native `getNativeBillOutstanding` for posted vendor bills. Lightsail variance **0** (still registered for Phase 7 monitoring). No repair in 6D.

---

## 10. Inventory Control

Statement authority: **1200 GL**. Reconciliation: FIFO remaining layer value. Lightsail variance **630,000** paise (WARNING). `Inventory.onHand` is quantity context only — not valuation.

---

## 11. Bank Control

Per `AccountingBankAccount`: book balance service vs GL (should match). Latest bank reconciliation (statement close / difference) exposed in drill-down — **not** substituted into BS.

Lightsail: **21** dynamic bank GL children under BS bank header.

---

## 12. Gateway Control

Reuses `getGatewayClearingControls` (Razorpay / Stripe / PayPal / COD). Large Razorpay clearing remains visible; Stripe/PayPal DATA_GAP / not-configured statuses surface as WARNING. No auto-clear.

---

## 13. GST Control

Reuses Phase 5 `buildGstReportIntegrity`. Lightsail: `PASS_WITH_ORPHAN_GL_WARNING`; orphan Output GST **259,322** paise (₹2,593.22). Journals not altered.

---

## 14. Purchase Clearing Control

**1210** GL net. Lightsail credit **3,600,000** paise presented under liabilities. Not netted into inventory.

---

## 15. Orphan Journals / Events

Lightsail: **17** orphan POSTED journals (TEST-tagged where memo matches). Included in financial reports. IDs/samples in drill-down.

---

## 16. TEST Fixture Register

`buildTestFixtureRegister()` / `GET .../reports/test-fixtures` — read-only. Prefixes: `TEST-ACC-*`, `SRV-TEST-ACC-*`, etc. Lightsail: **99** TEST-tagged journals, **22** TEST banks. Classification `TEST_FIXTURE_RETAINED`. **Not deleted.**

---

## 17. Integrity UI

`/admin/accounting/reports` → **Reconciliation / Integrity**:

- Banner: FINANCIAL REPORTING ENGINE HEALTHY | REVIEW REQUIRED  
- Summary cards: PASS / WARNING / FAIL / DATA GAP  
- Check table with variance + drill links (1200 / 2000 / 1210 / journals / GST)  
- Phase 7 carry-forward list  

---

## 18. XLSX Export

`GET /api/admin/accounting/reports/export/xlsx?asOf&from&to`  
Workbook sheets: Trial Balance · Profit & Loss · Balance Sheet · Integrity Summary · Meta  

`GET .../export/gl-xlsx?accountCode&from&to` — separate GL workbook (paginated service, limit 200 for export snapshot).

Same services as UI — no duplicate calculators.

---

## 19. PDF Export / Deferral

Implemented via existing **pdfkit** (same stack as invoices):

- Profit & Loss  
- Balance Sheet  
- Trial Balance  

`GET .../export/pdf?kind=profit-loss|balance-sheet|trial-balance` + period params.  
General Ledger PDF **not** implemented (paginated / low value).

---

## 20. Export Security

- Admin-only (`requireAdmin` on `/api/admin/*`)  
- `ACCOUNTING_REPORTS_ENABLED` + `NATIVE_ACCOUNTING_ENABLED` gated  
- Zod date / account / kind validation; from ≤ to  
- Formula injection neutralized (`sanitizeSpreadsheetCell` for `= + - @`)  
- No public unauthenticated statement URLs  
- Summary exports avoid customer/vendor PII dumps  

---

## 21. Period / FY Hardening

Covered in tests + services:

- Default FY start April; `ACCOUNTING_FY_START_MONTH` override  
- Leap year (2024-02-29)  
- FY boundary / as-of before FY activity  
- Invalid `from > to` rejected  
- Reports remain read-only  

---

## 22. Performance

| Report | Strategy |
|--------|----------|
| TB | DB aggregation (Phase 6B) |
| GL | Paginated |
| P&L / BS / Dashboard | Reuse TB / statement services |
| Integrity | One TB; FIFO one aggregate SUM; banks bounded |
| Exports | Bounded period params; GL export capped |

No new indexes added (not measured as necessary).

---

## 23. Security

| Control | Status |
|---------|--------|
| Admin auth | ✓ |
| Feature flags | ✓ |
| Zod bounds | ✓ |
| Formula injection | ✓ tested |
| Raw DB errors | mapped client errors for report queries |
| PII in summaries | minimized |
| Caching of financial data | none |

---

## 24. Synthetic Company Proof

`TEST-ACC-FS-*` lifecycle in `financial-reports-integrity-export.test.ts` (extended with vendor payment, settlement, refund, COGS reversal). Asserts exact paise for TB balance, P&L integrity, BS balance, exports = services, PDF header `%PDF`, formula injection prefix.

---

## 25. Cross-Report Reconciliation

Proven in unit tests + Lightsail:

- TB balances  
- P&L net = temporary accounts  
- BS balances; current earnings = FY P&L window  
- Dashboard = P&L/BS  
- XLSX/PDF totals = service totals  
- 1210 credit liability presentation  
- 3100 untouched  

---

## 26. Full Regression

| Gate | Result |
|------|--------|
| `prisma validate` | OK |
| `prisma generate` | OK |
| `tsc --noEmit` / `npm run build` (backend) | OK |
| Phase 6B+6C+6D focused | **25/25** then with COGS/vendor re-run **60/60** |
| Commerce `test/commerce` | **5 files / 23 tests** PASS |
| Frontend `npm run build` | OK |
| Full `vitest run` | **32 files / 406 tests** — **393 PASS**, **13 FAIL** on first long run due to **Postgres deadlocks / pollution** in `inventory-cogs-reversal` + `vendor-payment` (unrelated to 6D reporting). Isolated re-run of those files: **PASS**. |

Exact Phase 6D new test file: `financial-reports-integrity-export.test.ts` — **3 tests** PASS.

---

## 27. Lightsail Final Validation

| | |
|--|--|
| Host | `ip-172-26-7-99` / `13.204.112.165` |
| App path | `/home/ubuntu/sarveda/backend` |
| DB | Lightsail Postgres (`ls-38d7…ap-south-1.rds.amazonaws.com`) — **not localhost** |
| Script | `phase6d-lightsail-financial-reporting-validation.ts` |

| ID | Check | Result |
|----|-------|--------|
| A | POSTED journals balanced | OK |
| B | TB balanced | Dr=Cr=50,357,900 |
| C | P&L integrity | PASS |
| D | BS diff | 0 |
| E | Current earnings | = P&L FY window |
| F | 3100 untouched | OK |
| G | 1210 credit liability | 3,600,000 paise |
| H | Dynamic bank GLs | 21 children |
| I | GST orphan warning | 259,322 paise |
| J | Inventory vs FIFO | variance 630,000 |
| K | AP vs subledger | 0 |
| L | Orphan TEST journals | 17 |
| M | TEST contamination | 99 journals / 22 banks |
| N | XLSX match | OK |
| O | PDF match | OK |
| P | Dashboard = P&L/BS | OK |
| Q | Commerce counts | orders 4396 · products 201 · payments 3520 |
| R | Persistent flags | **ABSENT** from `.env` |

Integrity overall: **FINANCIAL_REPORTING_ENGINE_HEALTHY** `{ pass: 9, warning: 6, fail: 0, dataGap: 2 }`  
**Not production financial truth** while TEST fixtures remain.

---

## 28. Commerce Safety

| Question | Answer |
|----------|--------|
| Commerce files modified? | **No** |
| Payment files modified? | **No** |
| Refund files modified? | **No** |
| Inventory operational files modified? | **No** |
| Purchase operational files modified? | **No** |
| GST operational files modified? | **No** |
| Zoho files modified? | **No** |
| Accounting posting logic modified? | **No** |
| Historical journals modified? | **No** |
| Schema/migration added? | **No** |
| Test fixtures retained? | **Yes** |
| Persistent flags enabled? | **No** (process-only for validation) |

Phase 6D is reporting / integrity / export focused.

---

## 29. Phase 7 Carry-Forward Register

1. TEST-ACC fixture cleanup  
2. SRV-TEST-ACC fixture cleanup  
3. Orphan Output GST ≈ **₹2,593.22** (259,322 paise)  
4. AP GL vs VendorBill/subledger drift (monitor; Lightsail now 0 but register remains)  
5. Inventory GL vs FIFO variance (**630,000** paise on Lightsail)  
6. Orphan TEST journals (~17)  
7. Real opening inventory valuation  
8. Real bank/cash opening balances  
9. Opening AP  
10. Opening AR  
11. Gateway clearing verification (esp. Stripe/PayPal DATA_GAP; Razorpay outstanding)  
12. Historical Zoho/Woo/native GL gap  
13. Opening equity/capital  
14. Final cutover date  
15. Production feature-flag activation  
16. Final post-cutover TB/P&L/BS validation  

**Do not solve these in 6D.**

---

## 30. Known Limitations

- No Cash Flow statement  
- No year-end close / 3100 postings (by design, Option A)  
- AR customer subledger unavailable  
- GL XLSX exports first 200 lines only (pagination authority remains API)  
- Full vitest suite can hit rare Postgres deadlocks under long sequential load — not a 6D reporting defect  
- Lightsail GL includes TEST fixtures — not production truth  

---

## 31. Final Recommendation

Financial reporting **engine** is complete and validated (TB / GL / P&L / BS / Dashboard / Integrity / Exports). Proceed to **Phase 7 cutover & data cleanup** when ready. Do **not** enable permanent production accounting flags or treat current Lightsail numbers as production financials until Phase 7 items above are cleared.

---

PHASE 6 FINANCIAL STATEMENTS & REPORTING COMPLETE
