# SARVEDA ACCOUNTING UI REVAMP — STAGE 1.1

**Status:** Ready for visual review  
**Scope:** Frontend polish only (sidebar IA, dashboard polish, Financial Reports cleanup, presentation terminology)  
**Date:** 2026-08-28

---

## 1. Files changed

| Path | Change |
|------|--------|
| `frontend/components/admin/accounting/AdminAccountingNav.tsx` | Flatten Dashboard; single-open accordion; muted Advanced; clearer active page vs section |
| `frontend/components/admin/accounting/accounting-ui.tsx` | KPI icons/emphasis, Quick Action icons/hover, tab/input/button helpers |
| `frontend/components/admin/accounting/AccountingUatBanner.tsx` | Stronger OFF status emphasis (compact strip retained) |
| `frontend/app/admin/accounting/page.tsx` | Dashboard visual/KPI/Needs Attention/Quick Actions/Health polish |
| `frontend/app/admin/accounting/reports/page.tsx` | Reports header, tabs, toolbar, empty states, no phase language |
| `frontend/app/admin/accounting/order-paid/page.tsx` | Title/action wording only |
| `frontend/app/admin/accounting/order-refunded-full/page.tsx` | Title/subtitle only |
| `frontend/app/admin/accounting/settlements/page.tsx` | Title/subtitle only |
| `frontend/app/admin/accounting/expenses/page.tsx` | Title/subtitle only |
| `frontend/app/admin/accounting/vendor-bills/page.tsx` | Title/subtitle/button label only |
| `frontend/app/admin/accounting/purchases/page.tsx` | Title/subtitle + presentation labels only |
| `frontend/app/admin/accounting/opening/page.tsx` | Title/subtitle only |
| `frontend/app/admin/accounting/inventory/page.tsx` | Title/subtitle + section headings only |
| `frontend/app/admin/accounting/banking/page.tsx` | Subtitle + section headings only |
| `frontend/app/admin/accounting/journals/page.tsx` | Subtitle only |
| `frontend/app/admin/accounting/accounts/page.tsx` | Subtitle only |
| `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE1_1.md` | This report |

**Not changed:** backend, APIs, Prisma, posting/GST/banking/inventory logic, auth, feature flags.

---

## 2. Sidebar hierarchy before / after

**Before**

```
Accounting
  Overview
    Dashboard
  Sales >
  …
```

**After**

```
Accounting
  Dashboard          ← direct link, always visible when Accounting is open
  Sales >
  Purchases >
  Banking >
  Inventory >
  GST & Tax >
  Accountant >
  Reports >
  Advanced >         ← visually muted / lower priority
```

URL for Dashboard remains `/admin/accounting`.

---

## 3. Accordion behavior

- Accounting root stays expanded while in accounting/purchases workspace.
- Dashboard is not nested in an accordion.
- Only **one** major subsection (`openId`) is expanded at a time.
- Opening another section closes the previous.
- The section containing the current route auto-opens and cannot be collapsed while still active.
- Active **page** link uses gold-tinted background + gold left border + brighter text.
- Section headings no longer look “active” merely because they are expanded.

---

## 4. Terminology removed (presentation only)

Removed/rephrased user-facing:

- Phase 6D / 6B / 6C / 3D* / 4C / 4D / 7B
- POSTED GL authority
- GL-backed KPIs
- Shadow posting titles / “Post (shadow)”
- DATA_GAP label → Needs attention (display)
- Refresh Dashboard (on reports) → Refresh Report
- As of (BS) → Balance Sheet Date (BS Date on narrow)
- Engineering integrity banner / productionCutoverReady dump
- Native AP label prefixes on purchase recon cards

Component/function names like `AdminOrderPaidShadowPage` left as code identifiers (not UI).

---

## 5. Dashboard visual changes

- Tighter vertical rhythm (`space-y-5`)
- Primary KPI row slightly stronger than secondary (`opacity-95` on secondary)
- Net Profit: forest inset accent + subtle emphasis background + tooltip
- Small muted icons on each KPI
- Accounting Health renamed (was System / Accounting Health)
- Recent Journals columns: Date · Journal # · Description · Amount · Status

---

## 6. KPI wording changes

| KPI | Supporting text |
|-----|-----------------|
| Sales | Net sales this FY |
| Purchases | Supplier bills recognized in books |
| Expenses | Posted standalone expenses / Operating expenses this FY |
| Net Profit | Current FY (+ tooltip on posted period) |
| Bank & Cash | Current book balance |
| Inventory Value | Current inventory value |
| Accounts Payable | Outstanding supplier bills |
| GST Position | Estimated net GST payable/credit |

---

## 7. Needs Attention changes

- Compact rows (no large empty panel)
- Severity label: Critical / Warning / Review / Info from available tones
- “View →” affordance; full row clickable

---

## 8. Quick Actions changes

- Icon + title + one-line description
- Cream/white hover, slight lift, 150ms, press scale 0.98
- Copy aligned to accountant workflows

---

## 9. Financial Reports changes

- Subtitle: “Review financial statements, ledgers and reconciliation reports.”
- Tab: **Reconciliation & Checks** (no 6D)
- Shared report toolbar: Period (From/To), Balance Sheet Date, Financial Year, Refresh Report, Export XLSX
- Shared tab/input/button classes
- Empty states via `AccountingEmptyState`
- Integrity summary humanized; DATA_GAP display → Needs attention
- Carry-forward list retitled without Phase language

---

## 10. Shared component changes

- `AccountingMetricCard`: `icon`, `emphasis`, `titleAttr`
- `AccountingQuickAction`: `icon` + hover polish
- `accountingInputClass`, `accountingTabClass`
- Button heights standardized via `accountingButtonClass`

---

## 11. Responsive behavior

- KPI grids: 4 / 2 / 1
- Report filter “Balance Sheet Date” → “BS Date” under `sm`
- Sidebar Advanced labels wrap (2-line clamp) + `title` tooltip

---

## 12. Accessibility

- Focus rings retained on shared buttons/inputs/tabs
- Active nav not color-only (border + weight + icon color)
- Needs Attention severity text + icon
- Net Profit help via native `title` tooltip

---

## 13. TypeScript result

**PASS** — `npx tsc --noEmit` (exit 0)

---

## 14. Build result

**PASS** — `npm run build` (exit 0)

---

## 15. Backend changes

**None**

---

## 16. Accounting logic changes

**None**

---

## Screenshots

**NO** — staging admin requires re-auth; credentials not used.

---

## Stop

Stage 2 detail-page redesigns **not started**. Awaiting Stage 1.1 visual approval.
