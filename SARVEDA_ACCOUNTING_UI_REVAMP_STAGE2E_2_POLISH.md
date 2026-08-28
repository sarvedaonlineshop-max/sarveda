# SARVEDA ACCOUNTING UI REVAMP — STAGE 2E.1 GST POLISH

**Mode:** Frontend presentation / UX polish only  
**Date:** 2026-08-28  
**Prior:** Stage 2E GST workspace (functionally accepted)

---

## Scope

Polish only. No architecture redesign, backend, APIs, GST calculations, journals, or mutation behaviour changes.

---

## Files touched

- `frontend/components/admin/accounting/gst/gst-ui.tsx` — attention kind + sales document display helpers
- `frontend/app/admin/accounting/gst/page.tsx` — copy + Needs Attention hierarchy
- `frontend/app/admin/accounting/gst/sales/page.tsx` — document refs, calmer gap copy, details panel
- `frontend/app/admin/accounting/gst/itc/page.tsx` — View + More menu; quieter helper copy
- `frontend/app/admin/accounting/gst/ledger/page.tsx` — quieter limitation copy
- `frontend/app/admin/accounting/gst/reconciliation/page.tsx` — quieter diagnostic copy
- `frontend/app/admin/accounting/gst/reports/page.tsx` — Overview sections; GST Summary label; quieter copy
- `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2E_2_POLISH.md` (this report)

---

## Polish delivered

### Defensive copy
One calm limitation line per screen where needed. Removed stacked “not a return / not filing / ledger unchanged” banners that repeated the same idea under KPIs.

### Overview Needs Attention
Split into **Review** (actionable) vs **Known limitations** (informational), with subtle badges and counts. Presentation classification only from known gap/issue types.

### Sales GST references
When a technical/test-style order id is present and a journal entry number exists, the journal reference is shown primarily; the technical id is muted secondary and fully visible in Details. No invented document numbers.

### ITC actions
Primary **View**; **More** menu for Verify / Block. Existing confirmation modals and handlers unchanged.

### Reports Overview
Compact sections from existing loaded data: output components, input/ITC buckets, top rate summary, key data gaps — no new calculations.

### Terminology
Tab label **GST Summary** (was “3B-style summary”), with a single short note that it is not a filed GSTR-3B.

---

## Checklist

| | Result |
|---|--------|
| **A.** Defensive copy reduced | **YES** |
| **B.** Overview Needs Attention hierarchy improved | **YES** |
| **C.** Sales GST references polished | **YES** |
| **D.** ITC actions polished | **YES** |
| **E.** Reports Overview improved | **YES** |
| **F.** 3B-style terminology removed/polished | **YES** |
| **G.** Existing GST functionality preserved | **YES** |
| **H.** Backend changed | **NO** |
| **I.** Accounting logic changed | **NO** |
| **J.** GST calculation logic changed | **NO** |
| **K.** API contracts changed | **NO** |
| **L.** TypeScript | **PASS** |
| **M.** Build | **PASS** |
| **N.** Stage 2E ready to close | **YES** |

---

## SARVEDA ACCOUNTING UI REVAMP STAGE 2E.1 COMPLETE — READY FOR FINAL REVIEW
