# SARVEDA ACCOUNTING UI REVAMP — STAGE 2E GST & TAX

**Mode:** Frontend presentation / IA only  
**Date:** 2026-08-28  
**Prior locked:** 2A Purchases · 2B Banking · 2C Sales · 2D Inventory  
**Audit:** `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2E_GST_AUDIT.md` (approved)

---

## Files changed

### New
- `frontend/components/admin/accounting/gst/gst-ui.tsx`
- `frontend/components/admin/accounting/gst/AdminGstNav.tsx`
- `frontend/app/admin/accounting/gst/sales/page.tsx`
- `frontend/app/admin/accounting/gst/itc/page.tsx`
- `frontend/app/admin/accounting/gst/ledger/page.tsx`
- `frontend/app/admin/accounting/gst/reconciliation/page.tsx`
- `frontend/app/admin/accounting/gst/reports/page.tsx`
- `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2E_GST.md` (this report)

### Rewritten
- `frontend/app/admin/accounting/gst/page.tsx` — Overview (replaces mega-page)

### Updated
- `frontend/components/admin/accounting/AdminAccountingNav.tsx` — GST & Tax secondary items
- `frontend/lib/accounting-api.ts` — `fetchGstReportPos` client wrapper (existing API only)

---

## Routes

| Route | Screen |
|-------|--------|
| `/admin/accounting/gst` | Overview |
| `/admin/accounting/gst/sales` | Sales GST |
| `/admin/accounting/gst/itc` | Purchase GST / ITC |
| `/admin/accounting/gst/ledger` | GST Ledger |
| `/admin/accounting/gst/reconciliation` | Reconciliation |
| `/admin/accounting/gst/reports` | Reports & Export |

**Not added:** Filing · GST Portal · GST Settings

**Preserved Advanced:** Opening GST remains under Advanced / Opening Balances.

---

## Delivered behaviour

### Overview
KPIs: Output GST, Input GST recognised, ITC position, Estimated net GST (management estimate). Needs Attention + Quick Actions. No filing language.

### Sales GST
Views: Outward · B2B · B2C · Credit notes · Rate summary. Honest gaps for buyer GSTIN, shipping GST, partial-refund GST.

### Purchase GST / ITC
Summary cards, filtered worklist, structured evidence detail (no JSON). Discover / Verify / Block with confirmation UX; explicit ledger-unchanged messaging. CLAIMED not exposed.

### GST Ledger
Posted journal balances; business names primary, codes secondary. Month filter. No fake GST payable account.

### Reconciliation
Diagnostic worklist + known data gaps; humanized statuses; business references preferred. No Resolve/Fix/Adjust.

### Reports & Export
Overview · HSN · Rate summary · Place of supply · **3B-style summary** (labelled *GST management summary — not a filed GSTR-3B return*) · Integrity · Data gaps. Export CTA: **Download GST management workbook**.

---

## Constraints honored

| Constraint | Status |
|------------|--------|
| No backend / schema / GST calc / posting / ITC logic / flags | Yes |
| No fake filing | Yes |
| Existing API contracts | Yes |
| Opening GST not in daily GST nav | Yes |

---

## Validation

- TypeScript: **PASS**
- Production build: **PASS**

---

## Final checklist

| | Result |
|---|--------|
| **A.** GST Overview | **DONE** |
| **B.** Sales GST | **DONE** |
| **C.** Purchase GST / ITC | **DONE** |
| **D.** GST Ledger | **DONE** |
| **E.** GST Reconciliation | **DONE** |
| **F.** Reports & Export | **DONE** |
| **G.** Raw JSON removed | **YES** |
| **H.** Engineering terminology removed | **YES** |
| **I.** ITC mutations guarded | **YES** |
| **J.** Filing implication removed | **YES** |
| **K.** Data gaps represented honestly | **YES** |
| **L.** Backend changed | **NO** |
| **M.** Accounting logic changed | **NO** |
| **N.** TypeScript | **PASS** |
| **O.** Build | **PASS** |
| **P.** Ready for visual review | **YES** |

---

## SARVEDA ACCOUNTING UI REVAMP STAGE 2E READY FOR VISUAL REVIEW
