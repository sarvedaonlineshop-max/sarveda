# SARVEDA NATIVE ACCOUNTING — PHASE 6C
# PROFIT & LOSS + BALANCE SHEET + MANAGEMENT DASHBOARD

**Date:** 2026-08-25  
**Prerequisites:** Phase 6A architecture · Phase 6B TB/GL VALIDATED  
**Not in scope:** Cash Flow · year-end close · Phase 6D integrity/exports · Phase 7 cleanup  

---

## 1. Executive Summary

Phase 6C builds **Profit & Loss**, **Balance Sheet** (with dynamic current FY earnings + prior unclosed earnings), and a **management dashboard** on the Phase 6B Trial Balance / mapping / FY engine. All statement amounts come from **POSTED** journal lines — no operational-table substitutes.

| Check | Result |
|-------|--------|
| P&L integrity (`PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS`) | PASS on synthetic + Lightsail |
| BS integrity (`BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY`) | PASS (diff 0) with Option A earnings |
| 1210 credit → liabilities | PASS (Lightsail ₹36,000) |
| 3100 unchanged / no closing journals | PASS |
| Dashboard = P&L/BS services | PASS |
| Lightsail flags absent after validation | PASS |
| Frontend `/admin/accounting/reports` | Overview / P&L / BS active |

PHASE 6C P&L / BALANCE SHEET VALIDATED

---

## 2. Files Changed

### New

- `backend/src/modules/accounting/profit-loss.service.ts`
- `backend/src/modules/accounting/balance-sheet.service.ts`
- `backend/src/modules/accounting/financial-dashboard.service.ts`
- `backend/scripts/phase6c-lightsail-pl-bs-validation.ts`
- `backend/test/accounting/financial-reports-pl-bs.test.ts`

### Edited

- `backend/src/modules/accounting/financial-reports.handlers.ts`
- `backend/src/modules/accounting/accounting.routes.ts`
- `backend/test/accounting/api-security.test.ts`
- `frontend/lib/accounting-api.ts`
- `frontend/app/admin/accounting/reports/page.tsx`

### Unchanged (reused)

- `financial-statement.mapping.ts`, `financial-year.ts`, `trial-balance.service.ts`, `general-ledger.service.ts`  
- No schema / migrations

---

## 3. P&L Authority

Period movements from `buildTrialBalance({ from, to })` period debit/credit columns (POSTED only). Normalized management amounts; `signedNetInPaise` retained for audit/drill-down.

---

## 4. Revenue / Contra Revenue

| Line | Code | Normalization |
|------|------|----------------|
| Gross Product Sales | 4000 | −signed (credit → +) |
| Discounts | 4200 | +signed (debit → + discount) |
| Net Product Sales | | Gross − Discounts |
| Shipping | 4100 | −signed |
| Total Operating Revenue | | Net Product + Shipping |

GST never in revenue.

---

## 5. COGS / Gross Profit

| | |
|--|--|
| COGS | 5000 debit → positive |
| Gross Profit | Operating Revenue − COGS |
| Gross Margin % | GP / OpRev × 100; **null** if OpRev = 0 |

---

## 6. Operating Expenses

All period rows with report class `EXPENSE` (5100, 5200, 5300–5390, etc.) grouped with per-account children and drill-down codes.

---

## 7. Other Income

`4500` Interest Income (and any `OTHER_INCOME` class) as credit → positive other income.

---

## 8. Net Profit

`Operating Profit + Other Income − Other Expenses`

---

## 9. P&L Integrity

`temporaryAccountsNet` = Σ (credit − debit) over CoA types `REVENUE` + `EXPENSE` for the period.

`variance = netProfit − temporaryAccountsNet` — never force-balanced.

---

## 10. Balance Sheet Authority

As-of closing nets via `buildTrialBalance({ asOf })` + dynamic earnings lines (not posted).

---

## 11. Assets

Cash (1000 + CASH registry) · Bank (1010 + BANK registry) · Gateway 1020–1022 when debit · AR 1100 · Inventory 1200 · 1210 when debit · Input GST 220x when debit · other ASSET.

---

## 12. Liabilities

AP 2000 · Output GST 2100–2102 · 1210 when credit · Input GST when credit · gateway credit balances · other LIABILITY.

---

## 13. Equity

3000 / 3100 / 3900 (credit balances) + **Prior Unclosed Earnings** + **Current Period Profit/(Loss)**.

---

## 14. Current Earnings

**Option A (Phase 6A):** no closing journal.

`Current FY Earnings = P&L(FY start → asOf)` using `ACCOUNTING_FY_START_MONTH` (default 4).

---

## 15. Prior Unclosed Earnings

Because **3100 is unused** and no year-end close exists:

`Prior Unclosed = P&L(1970-01-01 → day before FY start)`

Presented distinctly on equity. Ensures BS balances without posting close entries.

**Formula:**  
`Assets = Liabilities + PostedEquity(3000/3100/3900) + PriorUnclosed + CurrentFyP&L`

---

## 16. 1210 Presentation

| Balance | Section |
|---------|---------|
| Debit | Current asset — Inventory Purchases Clearing |
| Credit | Current liability — Clearing Credit Balance (never netted into 1200) |

Lightsail: credit **3,600,000** paise under liabilities.

---

## 17. Input / Output GST Presentation

| | |
|--|--|
| 220x debit | Asset — recoverable recognized (not ELIGIBLE ITC) |
| 220x credit | Liability |
| 210x | Liability components CGST/SGST/IGST — not netted vs input |

---

## 18. Dynamic Bank Accounts

`AccountingBankAccount` GLs appear under Cash/Bank headers via mapping hints (Lightsail: 21 bank children).

---

## 19. BS Integrity

`BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY` with exact `differenceInPaise`. Lightsail as-of 2026-08-25: **diff = 0**.

---

## 20. Dashboard

Overview tab KPIs from `buildFinancialDashboard` → same P&L/BS services. Tiles navigate to P&L or BS. Disclosures include `AR_SUBLEDGER_DATA_GAP` and TEST contamination warning.

---

## 21. Period Comparison

P&L: previous equal-length period + FY-to-date.  
BS: optional prior as-of closing totals (not movements).

---

## 22. Drill-Down

Statement lines carry `accountCodes` → GL tab with period filter. Current earnings links to P&L for FY start → asOf.

---

## 23. API

| Method | Path |
|--------|------|
| GET | `/api/admin/accounting/reports/profit-loss?from&to&comparison` |
| GET | `/api/admin/accounting/reports/balance-sheet?asOf&comparison` |
| GET | `/api/admin/accounting/reports/dashboard?from&to&asOf` |

Zod + `ACCOUNTING_REPORTS_ENABLED` + admin auth.

---

## 24. Admin UI

`/admin/accounting/reports`: Overview · TB · GL · **P&L** · **BS** · Integrity (6D placeholder). FY selector uses backend options (no hardcoded Apr–Mar in React).

---

## 25. Tests

`financial-reports-pl-bs.test.ts` — exact P&L paise, integrity, zero-revenue margin, BS balance, 1210 debit/credit, FY month 1, dashboard reconcile, as-of edge, 3100 unused.

Combined with 6B TB/GL + api-security: **25 tests** passed in focused run.

---

## 26. Full Regression

| Suite | Result |
|-------|--------|
| Focused 6B+6C+security | **25 passed** |
| Accounting suite (`test/accounting`) | **25 files / 375 tests** passed |
| Full backend vitest | **31 files / 403 tests** passed |
| Backend `tsc --noEmit` | PASS |
| Frontend `npm run build` | PASS (`/admin/accounting/reports` 4.7 kB) |

---

## 27. Lightsail Validation

| Proof | Result |
|-------|--------|
| Not localhost / production-like | YES |
| P&L from POSTED GL + integrity PASS | net **3,727,235** paise; variance 0 |
| BS balanced + dynamic earnings | assets 36,156,496 = L 5,629,261 + E 30,527,235 |
| 1210 credit under liabilities | **3,600,000** |
| 220x debit as tax asset | 2 lines (51,975 each) |
| 210x output liabilities | 3 lines |
| Dynamic bank GLs | 21 children |
| Current earnings = P&L FY | 3,727,235; FY2026-27 |
| Dashboard equals P&L/BS | PASS |
| 3100 lines | **0** |
| Orders | 4396 unchanged |
| Persistent flags | **ABSENT** |

**Label:** TEST-ACC contaminated — not production financial statements.

---

## 28. Known Data Warnings

Surfaced, not fixed: TEST-ACC fixtures · orphan GST · orphan journals · AP GL vs VendorBill · Inventory vs FIFO · large Razorpay clearing · AR subledger DATA_GAP · historical native gap.

---

## 29. Phase 6D Readiness

Next (final Phase 6 slice only): global integrity dashboard · XLSX/PDF exports · hardening · Lightsail close-out. **Do not** start Phase 7 cutover here.

---

PHASE 6C P&L / BALANCE SHEET VALIDATED
