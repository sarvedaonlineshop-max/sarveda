# SARVEDA ACCOUNTING UI REVAMP — STAGE 2C SALES

**Mode:** Frontend UX / presentation only  
**Date:** 2026-08-28  
**Locked prior stages:** Stage 2A / 2A.1 Purchases · Stage 2B / 2B.1 Banking  

---

## 1. Files changed

### New
- `frontend/components/admin/accounting/sales/AdminSalesNav.tsx`
- `frontend/components/admin/accounting/sales/sales-ui.tsx`
- `frontend/app/admin/accounting/sales/page.tsx` — Sales Accounting Overview
- `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2C_SALES.md` (this report)

### Rewritten
- `frontend/app/admin/accounting/order-paid/page.tsx` — Sales Entries
- `frontend/app/admin/accounting/order-refunded-full/page.tsx` — Refunds
- `frontend/app/admin/accounting/settlements/page.tsx` — Gateway Settlements

### Updated
- `frontend/components/admin/accounting/AdminAccountingNav.tsx` — Sales group includes Overview + existing routes

**Not changed:** backend APIs, journal builders, schemas, posting logic, feature flags, cutover rules.

---

## 2. Sales navigation

**Sidebar (Accounting → Sales):**
- Overview → `/admin/accounting/sales`
- Sales Entries → `/admin/accounting/order-paid`
- Refunds → `/admin/accounting/order-refunded-full`
- Gateway Settlements → `/admin/accounting/settlements`

**In-page tabs:** `AdminSalesNav` (same IA, quieter than sidebar) on all Sales pages via `SalesPageShell`.

Existing commerce/API routes unchanged.

---

## 3. Sales Overview

Header: **Sales Accounting**  
Subtitle: Review sales entries, refunds and payment gateway settlements.

**Metrics (only when real data exists):**
- Sales Entries Recorded — `orderPaidPostedCount` from dashboard
- Refunds Recorded — `orderRefundedFullPostedCount`
- Settlements Recorded — settlements list `count`
- Gateway Clearing Outstanding — banking dashboard gateway controls with known statuses

No fabricated zeroes.

**Needs Attention** from discover dry-runs + settlement list + gateway balances (when available).

**Quick Actions:** Record Sales Entry · Record Refund · Review Settlements · Open Gateway Clearing.

---

## 4. Sales Entries redesign

- Operator workflow: Order Number → Preview Entry → Record Sales Entry
- Readable order summary + Account / Debit / Credit table (name first, code secondary)
- Soft labels: Eligible / Already recorded / Not eligible / Needs review
- Technical reason in expandable details only
- Secondary: “Find unrecorded orders” (discover dry-run, no worker/phase language)
- Soft unavailable banner when posting not enabled (no env var names)
- Confirmation modal explains books ≠ bank receipt

---

## 5. Refunds redesign

- Full-refund workflow only: Order Number → Preview Refund → Record Refund
- Shows order, original sale, refund amount, provider/reference, status
- Accounting entry table with business labels
- Partial-refund note only when eligibility indicates partial
- Confirmation: records accounting reversal; does not imply returning money to customer
- Secondary: Find unrecorded refunds

---

## 6. Gateway Settlements redesign

- Clean imported list: Settlement ID, Provider, Date, Gross, Fees, Net, Status, Action
- Import / select → Review Settlement → Record Settlement
- Destination Bank Account from Banking registry (no “legacy 1010” copy)
- Soft note: Stripe / PayPal settlement tracking not configured yet
- Structured settlement + accounting effect UI (no raw JSON)

---

## 7. JSON / debug removal

Removed from Settlements UI:
- `JSON.stringify` of proposal lines
- `<pre>` detail dumps

Replaced with structured fields and journal line tables.

---

## 8. Terminology changes

User-facing copy no longer uses: Shadow, ORDER_PAID / ORDER_REFUNDED_FULL, Post to books, Discovery dry-run as primary, ACCOUNTING_* flag names, legacy 1010, Recon v2/v3, phase / worker wording, native accounting V1.

Internal API field names and constants unchanged.

`sales-ui.tsx` retains an internal regex matching `ACCOUNTING_` only to **humanize** backend error strings — not shown as product copy.

---

## 9. Confirmation safeguards

| Action | Modal |
|--------|--------|
| Record Sales Entry | Books recognition ≠ bank receipt |
| Record Refund | Accounting reversal ≠ gateway payout to customer |
| Record Settlement | Clears clearing into bank + fees |

Existing post handlers + eligibility / idempotency unchanged.

---

## 10. Cross-links to Banking

- Overview + Settlements → View Gateway Clearing (`/admin/accounting/banking/gateway`)
- Settlements → View Bank Account when a destination bank is selected (`/admin/accounting/banking/accounts/[id]`)

No duplication of Banking features inside Sales.

---

## 11. Empty / loading states

Empty states for no selection, already recorded, no settlements, no attention items.  
Loading disables repeat clicks; success/error via `AccountingAlert`; confirmations use `AdminConfirmModal` busy state.

---

## 12. APIs reused

- Status / dashboard: `fetchAccountingStatus`, `fetchAccountingDashboard`
- Sales: `previewOrderPaidAccounting`, `postOrderPaidAccounting`, `discoverOrderPaidAccounting`
- Refunds: `previewOrderRefundedFullAccounting`, `postOrderRefundedFullAccounting`, `discoverOrderRefundedFullAccounting`
- Settlements: `listAccountingSettlements`, `fetchAccountingSettlement`, `importAccountingSettlement`, `previewAccountingSettlement`, `postAccountingSettlement`, `discoverAccountingSettlements`
- Banking: `listBankAccounts`, `fetchBankingDashboard`
- Money: `formatInrPaise`

No new endpoints.

---

## 13. Deferred functionality

- Partial refund accounting UI
- Credit-note redesign
- Stripe / PayPal settlement parity
- COD remittance
- Inventory / GST stages
- New list endpoints / work queues beyond discover dry-run

---

## 14. Backend changes

**NONE**

---

## 15. Accounting logic changes

**NONE** — presentation and confirmation copy only.

---

## 16. TypeScript result

`npx tsc --noEmit` → **PASS**

---

## 17. Build result

`npm run build` → **PASS**

---

## 18. Visual review checklist

- [ ] Sales Overview metrics / Needs Attention / Quick Actions
- [ ] Sales Entries preview table + Record confirmation (books ≠ bank)
- [ ] Refunds preview + partial note only when relevant + Record confirmation
- [ ] Settlements list + structured review (no JSON) + Destination Bank + Record confirmation
- [ ] Sales sub-nav + sidebar Overview link
- [ ] Cross-links to Gateway Clearing / bank account
- [ ] Soft unavailable when posting flags off (no env names)
- [ ] Cream / white / forest / gold visual language matches 2A/2B

---

**Stage 2C complete. Do not begin Inventory or GST until instructed.**
