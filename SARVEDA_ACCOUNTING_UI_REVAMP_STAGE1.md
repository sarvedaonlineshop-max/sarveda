# SARVEDA ACCOUNTING UI REVAMP — STAGE 1

**Status:** Ready for visual review  
**Scope:** Frontend UX/UI only (navigation IA, shared design system, UAT banner, Accounting Dashboard, terminology)  
**Date:** 2026-08-28

---

## Summary

Stage 1 delivers an accountant-oriented Overview, business-friendly navigation labels, a compact UAT strip, and shared presentation components. **No backend, API, Prisma, posting, GST, inventory, payment, feature-flag, or cutover logic was changed.**

---

## Files changed

| Path | Change |
|------|--------|
| `frontend/components/admin/accounting/accounting-ui.tsx` | **New** — shared accounting UI primitives + button helpers |
| `frontend/components/admin/accounting/AdminAccountingNav.tsx` | Nav IA regroup/relabel; header uses shared `AccountingPageHeader` |
| `frontend/components/admin/accounting/AccountingUatBanner.tsx` | Compact UAT status strip + Details expand |
| `frontend/app/admin/accounting/page.tsx` | Full Overview dashboard redesign |

**Not modified (intentionally):** backend modules, Prisma, accounting APIs, other accounting detail pages (beyond shared header/nav consumption), storefront.

---

## Components created

In `accounting-ui.tsx`:

- `AccountingPageHeader`
- `AccountingSectionHeader`
- `AccountingSectionCard`
- `AccountingMetricCard`
- `AccountingStatusBadge`
- `AccountingAlert`
- `AccountingEmptyState`
- `AccountingQuickAction`
- `accountingButtonClass` / `accountingUi` tokens
- `humanizeAccountingStatusCode` (presentation only)

**Not added** (avoid over-componentization): `AccountingFilterBar` — deferred until list pages need it in Stage 2+.

`AdminAccountingHeader` remains a thin alias over `AccountingPageHeader` so existing pages keep working.

---

## Navigation before / after

Routes are **unchanged**. Labels and grouping updated.

### Before (approx.)

- Dashboard → Overview  
- Sales → Sales receipts / Refunds / Gateway settlements  
- Purchases → ops links + Bill postings / Payments made / Expense postings / Expense accounts / Purchase recon (mixed ops + engineering)  
- Banking → Accounts & transfers  
- Accountant → CoA / Manual journals / Inventory / Opening balances  
- GST → GST & ITC  
- Reports → Financial reports  

### After

| Group | Items | Routes |
|-------|--------|--------|
| **Overview** | Dashboard | `/admin/accounting` |
| **Sales** | Sales Entries, Refunds, Gateway Settlements | `order-paid`, `order-refunded-full`, `settlements` |
| **Purchases** | Vendors, POs, Bills, Expenses (ops if flag), Vendor Payments | `/admin/purchases/*` + `vendor-payments` |
| **Banking** | Banking | `banking` |
| **Inventory** | Inventory Valuation | `inventory` |
| **GST & Tax** | GST & ITC | `gst` |
| **Accountant** | Chart of Accounts, Journals | `accounts`, `journals` |
| **Reports** | Financial Reports | `reports` |
| **Advanced** | Expense Account Rules, Bill Recognition, Expense Recognition, Purchase Reconciliation, Opening Balances | `expense-mappings`, `vendor-bills`, `expenses`, `purchases`, `opening` |

Engineering/setup surfaces moved under **Advanced**; ops purchase routes still linked when purchases flag is on.

---

## Terminology changes (UI only)

| Old / engineering-facing | New (user-facing) |
|--------------------------|-------------------|
| Sales receipts / ORDER_PAID shadow language | Sales Entries |
| ORDER_REFUNDED_FULL shadow | Refunds |
| Gateway settlements / Razorpay settlement shadow | Gateway Settlements |
| Expense accounts / mappings | Expense Account Rules |
| Inventory (under Accountant) | Inventory Valuation |
| Opening balances | Opening Balances |
| Bill/expense postings in main Purchases | Bill Recognition / Expense Recognition (**Advanced**) |
| DATA_GAP (display) | Needs attention |
| Discovery worker / Phase * copy | Removed from Overview; “Find unposted transactions” phrasing |
| Integrity | Financial health (humanized) |

Backend enums and API field names are **unchanged**.

---

## Dashboard sections

1. **Header** — Accounting Overview + FY label (from `fetchFinancialYearConfig`) + As of date  
2. **Primary KPIs** — Sales, Purchases, Expenses, Net Profit  
3. **Secondary KPIs** — Bank & Cash, Inventory Value, Accounts Payable, GST Position  
4. **Needs Attention** — real counts/statuses only, human language + deep links  
5. **Quick Actions** — existing routes only  
6. **Recent Journals** — up to 8 rows from `fetchAccountingJournals`  
7. **System / Accounting Health** — former primary CoA/journal/failed-event counts (secondary)

---

## KPI data sources

| KPI | Source |
|-----|--------|
| Sales | `fetchFinancialDashboard` → `profitAndLoss.netRevenueInPaise` |
| Purchases | `fetchPurchaseAccountingDashboard` → `vendorBills.totalNativeApRecognizedInPaise` |
| Expenses | Purchases dashboard standalone posted, else P&L `operatingExpensesInPaise` |
| Net Profit | Financial dashboard `netProfitInPaise` |
| Bank & Cash | Banking dashboard book balances sum, else BS `cashAndBankInPaise` |
| Inventory Value | BS `inventoryInPaise` |
| Accounts Payable | Purchases outstanding, else BS AP |
| GST Position | Output GST − input GST from BS (labeled estimate) |

FY window: current FY start → today (Asia/Kolkata date).

### Omitted / “Not available yet”

- Primary Sales / Net Profit cards mark **Not available yet** when reports API is gated/fails.  
- Purchases card same when purchases posting dashboard unavailable.  
- Second-row cards omitted when their source is missing (no fabricated zeroes).  
- Period-over-period deltas not shown (comparison data unused to avoid noisy/incomplete UX).

---

## UAT banner behavior

- Shown only when `NEXT_PUBLIC_ACCOUNTING_UAT_MODE` is **not** `0`/`false`.  
- Compact strip: **ACCOUNTING UAT MODE**, Production posting ON/OFF (from status), Go-live date (cutover) or “Training data only”.  
- **Details** expands prior explanatory copy.  
- Loads `fetchAccountingStatus` for cutover / `productionPostingAllowed` only (no mutation).

---

## Responsive / accessibility

- KPI grids: 4 → 2 → 1 columns (`lg` / `sm`).  
- Journal table `min-w` + horizontal scroll.  
- Focus rings on buttons/links; status not color-only (icons + labels).  
- Existing accounting access layout / email allowlist unchanged.

---

## Build / typecheck

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (frontend) | **PASS** (exit 0) |
| `npm run build` (frontend) | **PASS** (exit 0) |

---

## Screenshots

**NO** — staging admin requires re-auth (`/login?next=/admin&reason=reauth`). Credentials were not used.

Owner can review after login at `/admin/accounting`.

---

## Backend / API improvements (future stages — not done)

1. Dedicated Overview payload aggregating KPIs + attention items in one call.  
2. First-class GST payable/refundable KPI (vs BS estimate).  
3. Unreconciled bank line counts on banking dashboard summary.  
4. Human-readable attention codes from API (`displayMessage`) alongside internal codes.  
5. Optional `AccountingFilterBar` when list pages are redesigned.

---

## Safety confirmation

| Item | Changed? |
|------|----------|
| Backend accounting logic | **No** |
| Accounting APIs | **No** |
| Prisma / migrations | **No** |
| Journal / GST / inventory / payment logic | **No** |
| Feature flags / cutover semantics | **No** |
| Permissions / auth | **No** |

---

## Stop

Stage 2+ (Banking, Inventory, GST, Journals, Reports detail redesigns) **not started** — awaiting visual approval of Stage 1.
