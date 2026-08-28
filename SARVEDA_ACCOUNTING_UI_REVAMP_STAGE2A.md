# SARVEDA ACCOUNTING UI REVAMP — STAGE 2A

**Status:** Ready for visual review  
**Scope:** Frontend Purchases / Payables workflow only  
**Date:** 2026-08-28

## Summary

Stage 2A applies the Stage 1 accounting design system to operational Purchases screens (Vendors, POs, Bills, Expenses), adds a lightweight Purchases Overview, and polishes Vendor Payments presentation. No backend, schema, posting, GST, inventory, or API contract changes.

## Architecture

| Layer | Routes | Role |
|-------|--------|------|
| Ops | `/admin/purchases/*` | Vendors, POs, bills, expenses |
| Books | `/admin/accounting/vendor-payments` (+ Advanced recognition) | AP settlement & journals |

Flow communicated in Overview: Vendor → PO → Bill → Payment. Expenses may skip PO.

When Accounting is enabled, Purchases links remain in the Accounting sidebar (no duplicate purchases rail).

## Files changed

- `frontend/components/admin/purchases/purchases-ui.tsx` *(new)*
- `frontend/components/admin/purchases/AdminPurchasesNav.tsx`
- `frontend/app/admin/purchases/layout.tsx`
- `frontend/app/admin/purchases/page.tsx` *(Overview; was redirect)*
- `frontend/app/admin/purchases/vendors/page.tsx`
- `frontend/app/admin/purchases/purchase-orders/page.tsx`
- `frontend/app/admin/purchases/purchase-orders/new/page.tsx`
- `frontend/app/admin/purchases/purchase-orders/[id]/page.tsx`
- `frontend/app/admin/purchases/bills/page.tsx`
- `frontend/app/admin/purchases/bills/new/page.tsx`
- `frontend/app/admin/purchases/expenses/page.tsx`
- `frontend/app/admin/accounting/vendor-payments/page.tsx`
- `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2A.md`

## Screen changes

### Vendors
Page header, summary cards (counts + AP outstanding/overdue from bills summary when available), search filter, status badges, structured form, empty state. No invented per-vendor balances.

### Purchase Orders list
Header, status filters (Draft / Issued / Partially Received / Received / Cancelled), table with PO#, dates, amount, status badges, View links.

### PO create
Sections: Vendor & PO Details, Delivery, Items (+ Add Item), Notes/Terms, Order Summary. Save Draft / Create / Cancel. Tax remains server-side.

### PO detail
Document-style header, totals, context actions (Mark as Issued, receive quantities, link to New Bill). Related note that PO→Bill API wiring is not available.

### Bills
Outstanding/overdue metrics, filters All/Open/Overdue/Partially Paid/Paid/Draft, balance due column, overdue highlight, ops Mark paid clarified vs books.

### Bill create
Sectioned form; PO relationship via reference field (no fake PO picker).

### Expenses
Sectioned record form; list with category, payment account, status badges; phase/engineering footer removed.

### Vendor Payments
Accountant title/subtitle; ₹ allocation inputs (still posts paise); softer posting flag messaging; shared button styles.

### Purchases Overview
Outstanding / overdue / open PO counts + shortcuts; FY purchases card unavailable without API.

## Shared components

`purchases-ui.tsx` reuses Stage 1 accounting primitives and adds PurchasesPageShell, FilterBar, table helpers, status label/tone maps, FormSection.

## Validation

- `npx tsc --noEmit` — PASS  
- `npm run build` — PASS  

## Safety

- Existing functionality preserved: **YES** (APIs/actions unchanged)  
- Backend/API changes: **NO**  
- Accounting logic changes: **NO**  

## Screenshots

**NO** (admin login required)

## Out of scope (not started)

Banking, Inventory, GST detail redesigns; bill-from-PO backend wiring; Cancel PO UI.
