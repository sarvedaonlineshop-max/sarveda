# ACCOUNTING_UI_SCREEN_INVENTORY.md
Current visible behavior only (from page sources).

## Shared chrome
- Accounting layout: max-w-[1600px], `AccountingUatBanner` ("Accounting UAT mode — Do not treat reports or journals created before cutover as official company books. Tag training docs with `TEST-UAT-ACC-*`."), then children.
- If flag off: title "Accounting (preview)"; amber box requiring `NEXT_PUBLIC_ACCOUNTING_ENABLED=1` and `NATIVE_ACCOUNTING_ENABLED=1`; "Back to dashboard".
- If email not allowed: title "Accounting"; stone box "Accounting is limited to designated finance users…"; "Back to dashboard".
- Page titles via `AdminAccountingHeader`: `h1` text-2xl font-semibold text-[#1e3a2f] + optional subtitle.

## Accounting Dashboard (`/admin/accounting`)
- Title: "Accounting Dashboard"
- Cards/KPIs (if dashboard loaded): Chart of Accounts, Journal entries, Posted journals, Failed posting events
- Alerts: API error (red); if `!nativeAccountingEnabled` amber about NATIVE_ACCOUNTING_ENABLED
- Info: "Discovery worker: on-demand (Phase 2B)|disabled. Use ORDER_PAID Shadow page…"
- Read-only

## Chart of Accounts
- Title: "Chart of Accounts"; subtitle "Sarveda / Indian e-commerce CoA seed (Phase 1)."
- Table: Code | Name | Type | System (Yes/No)
- Read-only

## Journals
- Title: "Journals"; subtitle "`{total} entries — synthetic/manual only in Phase 1.`"
- Table: Entry # | Date | Memo | Status | Debit | Credit (INR formatted)
- Read-only (list only; no create UI)

## ORDER_PAID Shadow Posting (nav: "Sales receipts")
- Title: "ORDER_PAID Shadow Posting"; subtitle about preview + Zoho authoritative
- Alert: "Calculation version ORDER_PAID_V1… Persistence requires ACCOUNTING_SALES_POSTING_ENABLED=1"
- Form: Order number (placeholder SRV-20260800001)
- Buttons: Preview; Post (shadow) [needs salesPostingEnabled]; Discovery dry-run
- Cards after preview: Grand total, Discount, Provider, Eligible
- Proposal: Balance OK/FAIL, Posting event status, Zoho merchandise variance; table Account|Debit|Credit|Source
- Messages: green success / red error; eligibility/buildError text
- Write-capable (post/discover); preview read

## ORDER_REFUNDED_FULL Shadow (nav: "Refunds")
- Title: "ORDER_REFUNDED_FULL Shadow"; subtitle full-refund reversal of ORDER_PAID_V1
- Buttons: Preview; Post (flag required); Discover dry-run
- Status line: "Refund posting enabled: yes|no (ACCOUNTING_REFUND_POSTING_ENABLED)"
- Eligibility block (code, autoPostable, reason); Recon V2 status/reason; proposal lines Account|Debit|Credit
- Write-capable when flag on

## Razorpay Settlement Shadow (nav: "Gateway settlements")
- Title: "Razorpay Settlement Shadow"; subtitle PAYMENT_GATEWAY_SETTLED_V1…
- Fields: settlement id (setl_…); Target bank account select
- Buttons: Preview / import evidence; Import only; Post journal; Discover dry-run (≤5)
- Sections: Journal preview (JSON lines); Settlement detail JSON; Imported settlements table (Settlement|Date|UTR|Net|Status|Journal)
- Write-capable (import/post)

## Purchase Accounting (nav: "Purchase recon")
- Title: "Purchase Accounting"; subtitle "Native AP, vendor payments, and standalone expenses — reconciliation V5…"
- Cutover banner: date + Forward-only posting ON/OFF
- KPIs: Native AP recognized/paid/outstanding; Overdue AP
- Cards: AP aging buckets (Current, 1–30, 31–60, 61–90, >90, Paid (native)); Expenses & data quality (Posted standalone, Unmapped, GST data gaps, Duplicate risks, Ops paid/native unpaid, Ops partial/native unpaid, Ops/native mismatch)
- Amber note: Mark paid / paidInPaise not financial authority; VendorPayment required; pre-cutover → opening balances
- Read-only dashboard

## Vendor Bill / AP Shadow (nav: "Bill postings")
- Title: "Vendor Bill / AP Shadow"; subtitle VENDOR_BILL_POSTED_V1…
- Inputs: Bill UUID, Bill number
- Buttons: Preview; Post shadow; Dry-run discover
- Snapshot grid: Vendor/GSTIN, Bill/ref, Dates, PO/Status, Totals, Eligibility/ITC
- Journal preview table Account|Debit|Credit|Memo; Reconciliation V4 block; Discovery dry-run list
- Write-capable (post)

## Vendor Payments / AP Settlement (nav: "Payments made")
- Title: "Vendor Payments / AP Settlement"; subtitle VENDOR_PAYMENT_MADE_V1…
- Flag line: ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED on/OFF
- Section "New Vendor Payment": Vendor, Payment date, Method (Bank transfer/UPI/Cheque → 1010, Cash → 1000), Bank/cash account, UTR, Notes
- Open bills table: Bill | Ops status | Bill total | Native outstanding | Allocate (paise) + Full
- Empty: "Select a vendor with POSTED AP bills…"
- Buttons: Save DRAFT; Preview journal; POST
- Payments table: #|Vendor|Date|Method|Account|UTR|Amount|Status|Journal|Open/Delete(draft)
- Journal preview list
- Write-capable (CRUD draft + post)

## Standalone Expenses Shadow (nav: "Expense postings")
- Title: "Standalone Expenses Shadow"; subtitle EXPENSE_RECORDED_V1…
- Flag: ACCOUNTING_EXPENSE_POSTING_ENABLED
- Expense ID; checkbox "Acknowledge possible bill duplicate"
- Buttons: Preview; POST; Discover dry-run
- Preview details + Duplicate classification; Recon V5 JSON; Discovery JSON
- Write-capable

## Expense Account / Payment Mappings (nav: "Expense accounts")
- Title: "Expense Account / Payment Mappings"
- Forms: Map expense account (source free-text → CoA 5300–5380); Map paidThrough → 1000 Cash / 1010 Bank
- Lists: Account mappings (Enable/Disable); Unmapped accounts; Payment mappings; Unmapped paidThrough
- Write-capable

## Banking & Cash (nav: "Accounts & transfers")
- Title: "Banking & Cash"; subtitle Phase 4B–4D…
- Alert if banking disabled
- Section "Accounts — BOOK BALANCE" table: Name|GL|Type|Masked|Book balance|Stmt balance|Recon Δ|Recon status|Flags|Actions (Set Razorpay target, Deactivate)
- Create account (synthetic/test): Name, GL, BANK/CASH/PETTY_CASH, masked; Create account
- Transfer: kinds Bank→Bank / Cash→Bank / Bank→Cash; date; amount ₹; source/dest; reference; Preview transfer; Post transfer; JSON preview
- Bank statements (Phase 4C): file csv/xlsx; Preview; Commit import; filters MATCHED/POSSIBLE/REVIEW_REQUIRED/UNMATCHED/DUPLICATE; Refresh lines; Rerun matching; line Actions Confirm/Unmatch/Charge/Interest/Ignore
- Payment gateway clearing table
- Bank reconciliation (Phase 4D): Create/Recompute/Reconcile/Reopen; ignore reason
- Recent transfers list
- Write-capable

## GST Management Reports (nav: "GST & ITC")
- Title: "GST Management Reports"
- Copy: "GSTR-style management / reconciliation views — not GSTN filing"
- Controls: Month; Refresh; Download XLSX; Discover ITC
- Tabs: Overview | Outward | B2B | B2C | Credit Notes | HSN | ITC | GST Ledger | Reconciliation | Data Gaps
- Overview KPIs: Output CGST/SGST/IGST, Total Output, Input recognized, ITC Eligible/Unverified/Blocked/Data Gap, Gateway provisional, ESTIMATED NET GST; Integrity status
- ITC: summary cards; table Source|Supplier|Total|Status|Detail/Verify/Block (prompt for reason); selected JSON
- Ledger/Recon/Gaps tables; empty "No rows."
- Write-capable (ITC verify/block/data-gap/discover); reports mostly read

## Financial Reports (nav: "Financial reports")
- Title: "Financial Reports"; subtitle "POSTED GL authority — statements, integrity & exports (Phase 6D)."
- Tabs: Overview | Trial Balance | General Ledger | Profit & Loss | Balance Sheet | Reconciliation / Integrity (badge 6D)
- Shared: From/To/As of/FY select; Download XLSX workbook
- Integrity: Run Integrity / Reconciliation; overall FINANCIAL REPORTING ENGINE HEALTHY | REVIEW REQUIRED; KPIs PASS/WARNING/FAIL/DATA GAP; checks table; Phase 7 carry-forward list
- Overview: Refresh Dashboard; KPI buttons (Revenue, Net Revenue, COGS, Gross Profit, Gross Margin %, OpEx, Net Profit, Cash+Bank, AR, AP, Inventory, Gateway Clearing, Input/Output GST); disclosures
- P&L / BS: Run + PDF; statement rows with drill to GL; BALANCED/OUT OF BALANCE
- TB: As-of or From/To; Include zero balances; Run; PDF; Code|Account|Class|Close Dr/Cr
- GL: Account select; Run; GL XLSX; Opening/Period Debits/Credits/Closing; Date|Journal|Description|Event|Debit|Credit|Running; Orphan badge; Previous/Next
- Write: exports only (read statements)

## Inventory / Native Value Layers
- Title: "Inventory / Native Value Layers"
- KPIs: 1200 GL balance; Native layer value; GL vs layers variance; Classification summary JSON
- Sections: FIFO COGS (Preview/Post one/Dry-run discovery); Return/Restock COGS reversal; Purchase Capitalization (+ clearing table Bill|SKU|Billed|Received|Capitalized|1210 out|Status); Opening inventory XLSX (template download, Preview import, Save draft, Post opening); Physical inventory reconciliation sample; Opening batches list
- Write-capable (posts/discovery/opening)

## Production Opening / Cutover (nav: "Opening balances")
- Title: "Production Opening / Cutover"
- Amber resetNotice; Cutover Status dl (Native accounting, Opening balance module, Production-like, Cutover ready 7C, Posted opening batch)
- Opening Batch: Create batch; select existing; Template links (sku_mapping, inventory, bank, gateway, ap, ar, gst, equity)
- Section cards: SKU Mapping, Inventory, Banks/Cash, Gateway Clearing, AP, AR, GST, Equity, Staging (JSON) Save staging, Validation (Preview/Validate/Export Review/Post Opening)
- Confirm dialog: "Post production opening balance? This is idempotent but irreversible for cutover."
- Write-capable

---

## Purchases index
- Immediate redirect to purchase-orders (no UI)

## Vendors
- Search "Search vendors…"; "+ New vendor" (gold #b98a3e)
- Form: Name*, GSTIN, Email, Phone, Payment terms, City, State, Notes; Save/Cancel
- Table: Name|GSTIN|Contact|Terms|Edit
- Empty: "No vendors yet — add your first supplier."
- Write-capable

## Purchase orders list
- Search; status filter All/Draft/Issued/Partially received/Received/Cancelled; "+ New PO"
- Table: PO#|Date|Vendor|Status (pill)|Total
- Empty: "No purchase orders yet."
- Read list (links to detail)

## New PO
- Fields: Vendor*, Receiving warehouse, Reference#, Payment terms, Notes
- Lines: Item (catalog search), SKU, Qty, Rate (₹); + Add row
- Buttons: Save as draft; Save & issue
- Write-capable

## PO detail `[id]`
- Header poNumber, vendor, status, dates, total; Warehouse/Reference/Terms; Mark as issued (DRAFT)
- Lines: Item|SKU|Ordered|Received|Rate|Line total|[Receive now]
- Button: "Receive goods → update inventory" when SENT/PARTIALLY_RECEIVED
- Write-capable

## Bills list
- KPIs: Outstanding payables; Overdue (red)
- Search; "+ New bill"
- Table: Date|Bill#|Vendor|Status|Due|Amount|Mark paid (OPEN only)
- Empty: "No bills yet."
- Write-capable (mark paid; create elsewhere)

## New bill
- Vendor*, Reference#, Subject; line Item/Qty/Rate; + Add row
- Save draft; Save as open
- Write-capable

## Expenses (ops)
- Search; "+ Record expense"
- Form: Expense account*, Amount (₹)*, Paid through, Vendor optional, Invoice#
- Table: Date|Account|Vendor|Paid through|Amount
- Empty: "No expenses recorded."
- Footer note: "Recurring expenses, vendor credits & payments made — phase 2…"
- Write-capable (create)

## Purchases layout modes
- Both flags off: "Purchases (preview)" + Back
- Accounting+purchases on: UAT banner, content only (nav in OPS sidebar)
- Purchases only: gradient header "Purchases" + in-page `AdminPurchasesNav` rail (Ops / Purchases)
