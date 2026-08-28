# ACCOUNTING_UI_TERMINOLOGY.md
User-visible / technical terms as used in the admin UI and linked API fields.

| CURRENT TERM | SCREEN | WHAT IT REPRESENTS IN THE CODE | RELATED API/FIELD |
|--------------|--------|--------------------------------|-------------------|
| Accounting UAT mode | Banner on accounting/purchases | Env-gated notice that pre-cutover books are not official | `NEXT_PUBLIC_ACCOUNTING_UAT_MODE`; status `uatMode`/`uatBanner` |
| TEST-UAT-ACC-* | UAT banner | Suggested doc tag for training journals | UI string only |
| Native accounting / NATIVE_ACCOUNTING_ENABLED | Dashboard, layouts, banking | Backend master switch for Accounting* modules | `AccountingStatus.nativeAccountingEnabled` |
| NEXT_PUBLIC_ACCOUNTING_ENABLED | Layout gate | Frontend feature flag for UI | `isAccountingEnabled()` |
| Discovery worker | Dashboard | Background/on-demand discovery of postable events | `discoveryWorkerActive` → "on-demand (Phase 2B)" vs "disabled" |
| ORDER_PAID Shadow / ORDER_PAID Shadow Posting | order-paid page; dashboard copy | Shadow journal from paid commerce order without changing commerce | `POST /order-paid/preview|post|discover`; calc `ORDER_PAID_V1` |
| ORDER_PAID_V1 | order-paid alert | Calculation version for sales receipt journal | `calcVersions.orderPaid`; proposal.calcVersion |
| Post (shadow) | order-paid | Persist shadow journal when sales posting enabled | `postOrderPaidAccounting`; `salesPostingEnabled` / ACCOUNTING_SALES_POSTING_ENABLED |
| Discovery dry-run / Discover dry-run | Multiple shadow screens | Bounded scan without (or with limited) posting | `discover*` endpoints; `dryRun: true` |
| Posting event | order-paid preview | AccountingPostingEvent status for the order | `preview.postingEvent.status` |
| Eligible / Eligibility | order-paid, refunds, vendor bills, expenses | Whether engine will auto-build/post | `eligibility.eligible|code|reason|autoPostable|warnings` |
| Zoho remains authoritative | Many subtitles | Explicit that Zoho Books still owns books | UI disclaimer |
| Zoho merchandise variance | order-paid | Parity diagnostic vs Zoho merchandise net | `proposal.diagnostics.zohoParity.merchandiseVariancePaise` |
| ORDER_REFUNDED_FULL Shadow | refunds page | Full refund reversing ORDER_PAID_V1 | `/order-refunded-full/*`; `ORDER_REFUNDED_FULL` event |
| Recon V2 / Reconciliation V2 | refunds | Sales+refund reconciliation row | `GET /reconciliation/v2`; `status`, `statusReason` |
| Razorpay Settlement Shadow | settlements | Gateway settlement evidence → journal | `PAYMENT_GATEWAY_SETTLED_V1`; `/settlements/*` |
| PAYMENT_GATEWAY_SETTLED_V1 | settlements subtitle | Settlement calc version | `calcVersions.paymentGatewaySettled` |
| Fee+tax expense to 5100 | settlements subtitle | Fee+tax booked to expense until tax invoice verified | diagnostics.feeInPaise, taxInPaise, gstItcStatus |
| ITC (Input Tax Credit) | settlements, vendor bills, GST | GST input credit treatment | `gstItcStatus`, ITC APIs `/gst/itc*` |
| Purchase Accounting / Purchase recon | purchases dashboard; nav label "Purchase recon" | Native AP/expense reconciliation dashboard V5 | `GET /dashboard/purchases`; version field |
| Native AP recognized / paid / outstanding | purchase dashboard | Native accounting AP amounts (not ops Mark paid) | `vendorBills.totalNativeAp*` |
| Forward-only posting | purchase dashboard cutover banner | Cutover policy | `status.cutover.forwardOnly` |
| Cutover | purchases, opening | Accounting go-live date / policy | `cutover.cutoverDate`; opening cutoverReady |
| Ops paid / native unpaid | purchase DQ card | Ops bill PAID without native VendorPayment | `dataQuality.opsPaidNativeUnpaidCount` |
| Ops partial / native unpaid | purchase DQ | Partial ops payment vs native unpaid | `opsPartialNativeUnpaidCount` |
| Mark paid / paidInPaise | purchase amber note; bills UI | Operational payment flag, not GL authority | purchases `PATCH bill status PAID`; recon `opsPaidInPaise` |
| VendorPayment | purchase amber note | Native payment entity with allocations | `/vendor-payments` |
| Vendor Bill / AP Shadow / Bill postings | vendor-bills | Shadow AP recognition journal | `VENDOR_BILL_POSTED_V1`; `/vendor-bills/*` |
| 1210 clearing / 5300 expense / 2000 AP | vendor-bills subtitle | GL accounts in bill journal | proposal lines accountCode |
| Reconciliation V4 | vendor-bills | Bill-level AP recon | `/reconciliation/v4` |
| Native AP outstanding | vendor-bills recon | Remaining AP after native payments | `outstandingNativeApInPaise` |
| Payments made | nav + vendor-payments | Vendor payment UI | `/vendor-payments` |
| VENDOR_PAYMENT_MADE_V1 | vendor-payments | Payment journal version | calcVersions.vendorPaymentMade |
| Native outstanding | vendor-payments table | Amount still allocatable in native books | `nativeOutstandingInPaise` |
| Save DRAFT / POST | vendor-payments | Draft payment then post journal | create + `/vendor-payments/post` |
| Standalone Expenses Shadow / Expense postings | expenses accounting | Expense journal from purchases Expense row | `EXPENSE_RECORDED_V1`; `/expenses/*` |
| Acknowledge possible bill duplicate | expenses | Override duplicate-risk gate | `acknowledgePossibleDuplicate` |
| Recon V5 expense | expenses | Expense reconciliation | `/reconciliation/v5-expenses` |
| Expense Account / Payment Mappings / Expense accounts | expense-mappings | Map free-text → CoA / cash-bank | `/expense-mappings*` |
| UNMAPPED | expenses preview | Missing mapping codes | `mappedExpenseAccountCode` / `mappedPaymentAccountCode` |
| BOOK BALANCE | banking | GL book balance for bank registry | `bookBalanceInPaise` |
| Book ≠ bank ≠ reconciled | banking subtitle | Distinguishes book, statement, recon states | UI |
| razorpay-target | banking flags | Settlement target bank | `razorpaySettlementTarget` |
| MATCHED_EXACT / MATCHED_MANUAL / POSSIBLE / REVIEW_REQUIRED / UNMATCHED / DUPLICATE | banking stmt filter | Statement line matchStatus | `BankStatementLineRow.matchStatus` |
| Payment gateway clearing | banking | Gateway GL control balances | `gatewayControls` from banking dashboard |
| RECONCILED / REOPENED | banking messages | Bank reconciliation lifecycle | `/bank-reconciliations/*/reconcile|reopen` |
| GST Management Reports / GST & ITC | gst | Management GST views (not GSTN filing) | `/gst/*` |
| ESTIMATED NET GST | gst overview | Estimated net GST position | `netPosition.estimatedNetGstPositionInPaise` |
| DATA GAP / Data Gaps / ITC Data Gap | gst tabs, integrity KPIs, ITC | Missing/incomplete tax data status | IntegrityStatus `DATA_GAP`; `/gst/data-gaps`; itc dataGap buckets |
| Integrity | gst overview, reports integrity tab | Engine health checks | `/gst/reports/integrity`; `/reports/integrity` |
| FINANCIAL REPORTING ENGINE HEALTHY / REVIEW REQUIRED | reports integrity | Overall integrity status | `FinancialIntegrityReport.overallStatus` |
| productionCutoverReady | reports integrity | Always shown false in Phase 6D copy | `productionCutoverReady` |
| Orphan | GL table badge | Journal without posting event | `GeneralLedgerLine.orphanJournal` |
| POSTED GL authority | reports subtitle | Statements from posted journals only | reports APIs |
| Inventory / Native Value Layers | inventory | FIFO layers vs ops stock | `/inventory/*` |
| 1200 GL / Native layer value / GL vs layers variance | inventory KPIs | Inventory GL vs layer control | `financialControl.*` |
| Purchase Capitalization / 1210 Clearing | inventory | Capitalize receipt against bill clearing | `/inventory/purchase-capitalization/*` |
| FIFO COGS / Cost of Goods Sold | inventory | Recognize COGS from layers | `/inventory/cogs/*`; Dr 5000 / Cr 1200 |
| Opening / Cutover / Production Opening | opening page; nav Opening balances | Stage & post opening batch | `/opening/*` |
| Cutover ready (7C) | opening status | Production cutover readiness flag | `OpeningStatus.cutoverReady` |
| Staging (JSON) | opening | Editable OpeningStagingPayload | PUT `.../staging` |
| equity3900* | opening staging | Equity plug account approval fields | batch equity3900Reason/Reviewer/Approved |
| Sales receipts | nav label | Friendly name for order-paid shadow | href `/admin/accounting/order-paid` |
| Gateway settlements | nav | Settlements page | `/admin/accounting/settlements` |
| Manual journals | nav | Journals list page | `/admin/accounting/journals` |
| Chart of accounts | nav + page | CoA | `/accounts` |
| UNPOSTED_PARTIAL | (not a dedicated UI label found) | May appear only inside API `status`/`code`/`eligibility.code` payloads rendered as raw strings | recon/eligibility response fields — no hard-coded UI string in inventoried pages |
