# SARVEDA ACCOUNTING UI REVAMP — STAGE 2A.1

**Purchases / Payables visual & terminology polish**  
**Date:** 2026-08-28  
**Scope:** Frontend presentation only

---

## 1. Files changed

| File | Change |
|------|--------|
| `frontend/app/admin/accounting/vendor-payments/page.tsx` | Record Vendor Payment hierarchy, Bills to Pay, labels, soft books copy |
| `frontend/app/admin/purchases/bills/page.tsx` | Softened ops/books note; “Update Status” display label |
| `frontend/app/admin/purchases/bills/new/page.tsx` | PO reference helper text; denser form; items helper |
| `frontend/app/admin/purchases/purchase-orders/[id]/page.tsx` | Related Bill business copy |
| `frontend/app/admin/purchases/purchase-orders/new/page.tsx` | Items/summary wording; denser layout |
| `frontend/app/admin/purchases/vendors/page.tsx` | Removed API limitation footnote |
| `frontend/app/admin/purchases/page.tsx` | Overview hints / workflow copy |
| `frontend/app/admin/accounting/purchases/page.tsx` | Softened operational-status note |
| `frontend/components/admin/purchases/purchases-ui.tsx` | `compact` on shell / FormSection |

**Not changed:** backend APIs, Prisma schema, journals, GST, posting handlers, payment payloads.

---

## 2. Terminology removed / rewritten

| Was (engineering) | Now (business) |
|-------------------|----------------|
| “not wired in the current API UI” / book recognition under Advanced | Related Bill: create bill; use PO number as reference |
| “Native PO linking is not available…” | “Enter the related purchase order number, if applicable.” |
| “Tax is calculated by the server…” | “Select items and enter quantities and rates.” |
| “Final tax… calculated by the server…” | “Tax and grand total are finalized when the purchase order is saved.” |
| “legacy 1010/1000”, “Legacy default”, “→ 1010/1000” | Bank transfer / UPI / Cheque / Cash; “Default payment account”; account **names** in Paid From |
| Large “Books posting” / “Ops vs books” banners | Concise helper lines only |
| “Mark paid (ops)” | “Update Status” (same `patchBill` → PAID) |
| “Post to books” | “Record Payment” (same `postAccountingVendorPayment`) |
| “Preview journal” | “Preview Entry” |
| “Not available from current APIs” (FY KPI) | “Coming soon” |
| Vendors footer “not available from the current API” | Outstanding balances on Bills / Payments |

---

## 3. Vendor Payments changes

- Title block: **Record Vendor Payment** with short note that recording updates supplier balance and accounting records.
- Primary fields: Vendor, Payment Date, Payment Method, Paid From.
- Secondary: Reference / UTR, Notes.
- After vendor: **Bills to Pay** (Bill #, Status, Bill Amount, Amount Due, Payment Amount).
- Footer: **Total Payment ₹…** + **Save Draft** / **Preview Entry** / **Record Payment**.
- Posting flag off → quiet line about drafts; no large technical banner.
- Handlers, APIs, allocation math, and draft/post flow unchanged.

---

## 4. Vendor Bills changes

- Removed large “Ops vs books” alert.
- Subtle helper: Update Status is operational; use Vendor Payments for accounting payment.
- Button label **Update Status** (still patches bill status to PAID).
- Real ledger settlement remains Vendor Payments → Record Payment.

---

## 5. PO / New Bill wording changes

- **PO Detail → Related Bill:** business copy + New Bill link; no claim of automatic PO→Bill linking.
- **New Bill → Purchase Order / Reference:** “Enter the related purchase order number, if applicable.”
- **New PO / New Bill items:** “Select items and enter quantities and rates.” (tax behavior unchanged).

---

## 6. Density changes

- `PurchasesPageShell` / `FormSection` optional `compact` (~10–15% less vertical space).
- Applied on New Purchase Order and New Vendor Bill (section padding, gaps, notes/summary cards).
- Cream / forest / gold language preserved; no design-system redesign.

---

## 7. FUTURE FUNCTIONAL IMPROVEMENT

> **PO Detail → New Bill** should eventually prefill/link vendor, PO reference, and eligible line items when backend/API support is implemented.

Documentation only — not implemented in Stage 2A.1.

---

## 8. TypeScript result

```text
npx tsc --noEmit
```

**PASS** (exit 0)

---

## 9. Build result

```text
npm run build
```

**PASS** (exit 0) — Next.js 14.2.5 compiled successfully. Existing repo ESLint warnings unrelated to this stage remain.

---

## 10. Backend changes

**NO**

---

## 11. Accounting logic changes

**NO** (presentation / labels / layout only; no GST, journals, or posting logic changes)

---

SARVEDA ACCOUNTING UI REVAMP STAGE 2A.1 READY FOR VISUAL REVIEW
