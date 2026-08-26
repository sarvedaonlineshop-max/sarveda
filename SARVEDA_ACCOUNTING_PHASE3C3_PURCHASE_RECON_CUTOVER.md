# SARVEDA Native Accounting — Phase 3C3 Purchase Reconciliation + Cutover Close-Out

**Date:** 2026-08-23  
**Verdict:** PHASE 3C COMPLETE — READY FOR PHASE 3D INVENTORY/COGS ARCHITECTURE

---

## 1. Executive Summary

Phase 3C3 closes the purchase-side accounting shadow module (3B vendor bills, 3C1 vendor payments, 3C2 standalone expenses) with a **unified reconciliation V5**, **native AP aging**, **purchase accounting dashboard**, **cutover date configuration**, and **legacy ops-paid classification** — without fabricating historical payments or touching inventory/COGS.

Zoho Books remains authoritative in shadow mode. Operational `Mark paid` / `paidInPaise` are displayed as reconciliation evidence only.

**Deliverables:**
- Extended Recon V5 bill + expense rows (aging, cutover, bill↔expense duplicate, ops/native mismatch)
- `purchase-reconciliation.service.ts` — dashboard, unified report, payment recon rows
- `accounting-cutover.ts` + `ap-aging.ts`
- API: `GET /api/admin/accounting/dashboard/purchases`, `GET /api/admin/accounting/reconciliation/purchases`
- Admin UI: `/admin/accounting/purchases`
- Tests: `purchase-recon-cutover.test.ts` (12 cases)
- Validation script: `scripts/phase3c3-lightsail-purchase-recon-validation.ts`

---

## 2. Native AP Truth

For every `VendorBill`:

| Measure | Source |
|---------|--------|
| **Native AP recognized** | `VENDOR_BILL_POSTED_V1` credit to account **2000** |
| **Native AP settled** | Sum of **POSTED** `AccountingVendorPaymentAllocation` amounts |
| **Native outstanding** | recognized − settled |

`VendorBill.paidInPaise` and `VendorBill.status` are **not** financial authority. They appear on recon rows as `opsPaidInPaise` / `opsStatus` with `opsPaidExplanation`.

Implementation: `vendor-payment-outstanding.ts` (`getNativeBillOutstanding`), surfaced in `buildReconciliationV4BillRow`.

---

## 3. Legacy Ops Paid Classification

| Recon status | Meaning |
|--------------|---------|
| `OPS_PAID_NATIVE_UNPAID` | Ops fully paid (`status=PAID` or `paidInPaise ≥ total`) but zero native `VendorPayment` |
| `OPS_PARTIAL_NATIVE_UNPAID` | Ops partial `paidInPaise` but no native payment |
| `OPS_NATIVE_PAYMENT_MISMATCH` | Native payments exist but ops `paidInPaise` differs |
| `PAID` | Native AP fully settled |
| `PARTIALLY_PAID` | Native partial allocation |
| `OVERPAID` | Allocations exceed AP credit |

**No fabrication:** historical ops-paid bills do not auto-create `VendorPayment`, bank journals, UTR, or payment dates.

Ops mirror (`paidInPaise` → native payment) remains **disabled** — still unsafe without explicit cutover opening balances.

---

## 4. Expense Historical Classification

Each expense recon row includes `historicalClassification`:

| Class | Meaning |
|-------|---------|
| `POSTED_NATIVE` | `EXPENSE_RECORDED_V1` journal posted |
| `POSTABLE` | Eligible, not yet posted |
| `NEEDS_ACCOUNT_MAPPING` | No CoA mapping for `expenseAccount` |
| `NEEDS_PAYMENT_MAPPING` | No mapping for `paidThrough` |
| `GST_DATA_GAP` | Insufficient GST evidence |
| `RCM_DATA_GAP` | Reverse charge deferred |
| `DUPLICATE_RISK` | Bill+Expense duplicate (high or possible) |
| `PRE_CUTOVER` | Expense date before `ACCOUNTING_CUTOVER_DATE`, not posted |
| `SOURCE_CHANGED_AFTER_POST` | Fingerprint drift after post |

Pre-cutover expenses default to legacy/opening-balance treatment — **not** auto-posted.

---

## 5. Bill/Expense Duplicate Review

Reuses Phase 3C2 `classifyExpenseBillDuplicate` and new reverse lookup `findExpenseDuplicatesForBill`.

Bill rows expose:
- `billExpenseDuplicateClass`: `NO_DUPLICATE` | `POSSIBLE_DUPLICATE_BILL_EXPENSE` | `DUPLICATE_SUPPLIER_DOCUMENT`
- `possibleDuplicateExpenseIds`

Warnings: `POSSIBLE_DUPLICATE_BILL_EXPENSE`, `DUPLICATE_SUPPLIER_DOCUMENT`.

No second duplicate algorithm.

---

## 6. Payment Reconciliation

`buildVendorPaymentReconciliationRow` per `AccountingVendorPayment`:

- Payment number, vendor, date, method, UTR, bank/cash account (`paidAccountCode`)
- Amount, allocations (with bill numbers), journal, posting state
- Statuses: `MATCHED`, `UNDER_ALLOCATED`, `OVER_ALLOCATED`, `WRONG_VENDOR`, `MISSING_AP_JOURNAL`, `DRAFT`, `VOID`

Unified report includes payments alongside bills and expenses.

---

## 7. AP Aging

Buckets (native outstanding > 0 only):

| Bucket | Rule |
|--------|------|
| `CURRENT` | Not past due |
| `1_30` | 1–30 days past anchor |
| `31_60` | 31–60 days |
| `61_90` | 61–90 days |
| `OVER_90` | >90 days |
| `PAID` | Native outstanding = 0 |

**Anchor date:** `dueDate` if present, else `billDate` (documented policy in `ap-aging.ts`).

Paid native bills → `PAID` bucket, excluded from overdue totals.  
Ops-PAID with native outstanding remains in aging until settled or cutover opening treatment.

---

## 8. Dashboard

`GET /api/admin/accounting/dashboard/purchases` → `buildPurchaseAccountingDashboard`:

**Vendor bills:** total native AP recognized / paid / outstanding, overdue AP, bill counts  

**Expenses:** posted standalone total, unmapped, GST gaps, duplicate risks, pre-cutover count  

**Data quality:** ops-paid/native-unpaid, ops-partial, ops/native mismatch, source-changed, unmapped mappings, bill↔expense duplicate risks  

**Payments:** posted/draft counts, overallocated, missing journal  

**Aging:** per-bucket count + outstanding paise  

Admin UI: `/admin/accounting/purchases`

---

## 9. Cutover Strategy

Environment (documented in `backend/.env.example`):

```env
# ACCOUNTING_CUTOVER_DATE=2026-09-01
# ACCOUNTING_CUTOVER_FORWARD_ONLY=1
```

- `ACCOUNTING_CUTOVER_DATE` — ISO date/datetime; documents **strictly before** are `PRE_CUTOVER`
- `ACCOUNTING_CUTOVER_FORWARD_ONLY=1` — blocks posting pre-cutover documents unless `allowPreCutover: true` on post call
- Preview/reconciliation always shows `cutoverClassification`
- Commerce/purchases ops unchanged — cutover affects accounting posting only

Module: `accounting-cutover.ts`  
Error: `PreCutoverPostingBlockedError` (409)

---

## 10. Opening Balance Strategy

**Not imported in Phase 3C3** — by design (pre-launch DB is migratory).

At final production cutover, enter via Zoho/legacy trial balance:

| Balance | Phase 3C3 | Phase 3D+ |
|---------|-----------|-----------|
| Accounts Payable (2000) | Document + reconcile | Opening journal |
| Vendor subledger | Optional future model | If needed |
| Bank (1010) / Cash (1000) | Document | Opening journal |
| Input GST (1400 provisional) | Reconcile vs docs | Opening journal |
| Inventory (1200) | **DEFER** | Phase 3D |

Generic journal infrastructure (`postJournalFromEvent`) can post opening entries later. **No fake VendorPayments** for opening AP.

---

## 11. Zoho/Legacy Comparison Boundary

- Zoho AP/expense totals: **authoritative** in shadow mode
- Local dashboard: native figures only
- Zoho comparison fields: **DATA_GAP** unless explicitly imported later
- Input GST provisional vs verified ITC: flagged on rows (`itcStatus`); full tax doc reconciliation deferred

---

## 12. Pre/Post Cutover Rules

| Document | Pre-cutover | Post-cutover |
|----------|-------------|--------------|
| VendorBill | Legacy / opening AP; preview shows `PRE_CUTOVER` | Native `VENDOR_BILL_POSTED` authoritative evidence |
| VendorPayment | Manual review; forward-only blocks auto-post | Native `VENDOR_PAYMENT_MADE` |
| Expense | Opening / legacy; `PRE_CUTOVER` class | Native `EXPENSE_RECORDED` when mapped + paid-through |

Closed accounting periods: existing `assertEntryDateInOpenPeriod` unchanged.

---

## 13. Final Reconciliation V5

**Unified endpoint:** `GET /api/admin/accounting/reconciliation/purchases`  
**Legacy aliases preserved:** `/reconciliation/v5` (bills), `/reconciliation/v5-expenses`

### Vendor bill row (extended)
Vendor, bill/ref, dates, AP journal, AP recognized, native payments, native outstanding, ops paid/status, payment refs, aging bucket, GST/ITC, duplicate warnings, cutover class, recon status, `opsPaidExplanation`

### Expense row (extended)
Date, vendor, invoice/ref, source/mapped CoA, payment mapping, gross/net/tax, GST/ITC, journal, duplicate risk, cutover + historical classification, status

### Payment row
Full payment recon (see §6)

Report version: `purchase-recon-v5`

---

## 14. Tests

**New file:** `backend/test/accounting/purchase-recon-cutover.test.ts` — **12 tests**

Covers: aging, partial/full pay, multi-payment, ops/native mismatch, pre/post cutover, bill↔expense duplicate, unmapped/GST gap, closed period, forward-only guard, dashboard totals, no fabrication, mark paid unchanged, no inventory mutation.

**Full backend suite:** **18 files / 222 tests PASS**

Includes: accounting (all phases), commerce regression (4 files), purchases-related accounting, security, production guard.

---

## 15. Lightsail Validation

Script: `backend/scripts/phase3c3-lightsail-purchase-recon-validation.ts`

```bash
PHASE3C3_LIGHTSAIL_PURCHASE_RECON_OK=1 \
NATIVE_ACCOUNTING_ENABLED=1 \
npx tsx scripts/phase3c3-lightsail-purchase-recon-validation.ts
```

**Local run result:** `PHASE 3C3 LIGHTSAIL PURCHASE RECON VALIDATED`  
Reuses existing fixtures where present; flags remain OFF by default.

On Lightsail with 3B/3C1/3C2 fixtures: validates AP recognized, payment settlement, expense posting, ops/native mismatch, aging, dashboard, cutover classification.

**No final production opening balance import performed.**

---

## 16. Migration-Day Procedure

Repeatable sequence for go-live after final Woo → Sarveda data import:

1. **Freeze** old WordPress platform (no new supplier transactions)
2. **Import** latest commerce + purchases data (vendors, bills, expenses, POs)
3. **Run integrity checks** (purchases arithmetic, bill totals, duplicate refs)
4. **Set** `ACCOUNTING_CUTOVER_DATE` to launch datetime (e.g. `2026-09-01T00:00:00+05:30`)
5. **Load opening balances** from Zoho trial balance via manual opening journals (AP, bank, cash, input GST) — **not** fabricated VendorPayments
6. **Classify** pre-cutover bills/expenses as `PRE_CUTOVER` in recon report
7. **Enable** shadow posting flags on cutover forward:
   - `NATIVE_ACCOUNTING_ENABLED=1`
   - `ACCOUNTING_PURCHASES_POSTING_ENABLED=1`
   - `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=1`
   - `ACCOUNTING_EXPENSE_POSTING_ENABLED=1`
   - `ACCOUNTING_CUTOVER_FORWARD_ONLY=1`
8. **Reconcile** via `/admin/accounting/purchases` + `/reconciliation/purchases`
9. **Later:** consider native accounting authoritative (post-shadow mode) — not in 3C3

---

## 17. Known Limitations

- Ops `paidInPaise` mirror to native payments: **not implemented**
- Vendor-level opening subledger model: **deferred** (aggregate AP opening journal sufficient for now)
- Zoho AP live comparison: **DATA_GAP** (no aggressive API polling)
- Inventory capitalization / COGS: **Phase 3D**
- RCM expense journals: **deferred**
- Unpaid expense → AP path: **deferred** (use VendorBill)
- Bank statement reconciliation: **out of scope**

---

## 18. Safety Audit

| Check | Result |
|-------|--------|
| **COMMERCE FILES MODIFIED** | NONE |
| **PURCHASES OPERATIONAL FILES MODIFIED** | NONE |
| **INVENTORY/STOCK LOGIC MODIFIED** | NONE |
| **MARK-PAID BEHAVIOR CHANGED** | NO |
| **VENDOR PAYMENT FINANCIAL LOGIC CHANGED** | NO — recon/dashboard only; posting unchanged except optional cutover guard |
| **EXPENSE POSTING LOGIC CHANGED** | NO — same except optional cutover guard (`allowPreCutover` opt-in) |
| **ZOHO FILES MODIFIED** | NONE |
| **ACCOUNTING SCHEMA/MIGRATIONS** | NONE (Phase 3C3 is code-only close-out) |
| **UNEXPECTED FILES** | NONE |
| **COMMERCE REGRESSION** | PASS (4 files) |
| **PURCHASES REGRESSION** | PASS (via accounting purchase tests + unchanged purchases.service) |

### New/modified accounting files (Phase 3C3)
- `accounting-cutover.ts`, `ap-aging.ts`, `purchase-reconciliation.service.ts`
- `reconciliation.service.ts` (V5 extensions)
- `expense-duplicate.ts` (`findExpenseDuplicatesForBill`)
- `accounting-errors.ts` (`PreCutoverPostingBlockedError`)
- Posting services: cutover guard on bill/payment/expense post
- `accounting.handlers.ts`, `accounting.routes.ts`
- `frontend/app/admin/accounting/purchases/page.tsx`
- `frontend/lib/accounting-api.ts`, `AdminAccountingNav.tsx`
- `backend/.env.example`
- `test/accounting/purchase-recon-cutover.test.ts`
- `scripts/phase3c3-lightsail-purchase-recon-validation.ts`

---

## 19. Recommendation

Phase 3C purchase-side shadow accounting is **operationally coherent** for cutover planning:

- Native AP truth is explicit and separated from ops paid
- Reconciliation V5 consolidates bills, payments, and expenses
- Aging and dashboard support go-live checklist
- Cutover date + forward-only guard prevent silent historical fabrication
- Opening balances path documented without fake payment history

**Proceed to Phase 3D** — inventory valuation, 1200 capitalization, COGS, cost layers architecture.

---

PHASE 3C COMPLETE — READY FOR PHASE 3D INVENTORY/COGS ARCHITECTURE
