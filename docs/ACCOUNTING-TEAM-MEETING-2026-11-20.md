# Accounting team meeting — 20 Nov 2026

**Use:** Answer questions from what is already built. Write down anything they need that we do not have yet. Do not promise a feature in the room unless it is listed as **Built** below.

**System:** Admin → **Accounting** (Sarveda native books). Zoho Books is **not** the live ledger.

**Who can open Accounting today:** allowlisted admin emails (`arjun@`, `partha@`, `accounts@`, `deepak@sarveda.com`, plus any extra names in `ACCOUNTING_ADMIN_EMAILS`).

---

## How to run the meeting

1. Walk the menus once (Dashboard → Sales → Purchases → Banking → Inventory → GST → Reports).
2. For each ask: **Built / Partial / Not built**. If Partial or Not built, log it in **Section D**.
3. Do not invent GST filing, TDS, or Zoho migration in the room.
4. After the meeting, engineering treats Section D as the backlog.

**Talking rule**

| If they ask… | Safe answer |
|--------------|-------------|
| “Does a paid order hit the books?” | Yes — `ORDER_PAID` journal (sales, GST output, gateway clearing / AR). |
| “Can we file GSTR from this?” | No. Management GST reports and XLSX only. Not GSTN / GSTR-1 / 3B filing. |
| “Is Zoho still the books?” | No. Native Sarveda accounting is the authority. Zoho is retired from live commerce. |
| “Are old Zoho years in here?” | No automatic migration. Historical Zoho is reference only. Opening balances are a cutover job. |
| “Can we type a manual journal?” | Not yet. Books are posted from sales, refunds, bills, expenses, bank, inventory events. |
| “Partial refund GST?” | Full refunds reverse. Partial refund GST is **not** auto-safe yet. |

---

## A. What we developed (use this to answer)

### Sales

| Capability | Status | Where |
|------------|--------|--------|
| Paid order → balanced sales journal | **Built** | Accounting → Sales → Sales Entries |
| GST output on sale (CGST/SGST or IGST) | **Built** | Same journal + GST → Sales GST |
| Customer GST invoice PDF | **Built** | Order / invoice (commerce), not a GSTR |
| Quotes (draft → convert) | **Built** | Sales → Quotes |
| Gateway settlement (Razorpay etc. → bank, fees) | **Built** | Sales → Gateway Settlements |
| Full refund accounting (invert sale + GST) | **Built** | Sales → Refunds |
| Partial refund money in commerce | **Built** (ops) | Orders / refunds |
| Partial refund **GST / journal** | **Not auto-posted** | Log if they need it as a book |

### Purchases / AP

| Capability | Status | Where |
|------------|--------|--------|
| Vendors, POs, goods receipt, bills, expenses | **Built** | Admin → Purchases |
| Vendor bill → AP + input GST journal | **Built** | Accounting → Advanced → Bill Recognition / Purchases |
| Vendor payments against bills | **Built** | Purchases → Vendor Payments |
| Standalone expenses + GL mapping | **Built** | Expenses + Advanced → Expense Account Rules |
| RCM (reverse charge) | **Blocked / not built** | System refuses RCM posts (`RCM_DATA_GAP`) |

### Banking

| Capability | Status | Where |
|------------|--------|--------|
| Bank & cash accounts | **Built** | Banking → Bank & Cash |
| Transfers | **Built** | Banking → Transfers |
| Statement import / matching | **Built** | Banking → Statements |
| Period reconciliation (lock) | **Built** | Banking → Reconciliation |
| Gateway clearing control | **Built** | Banking → Gateway Clearing |

### Inventory accounting

| Capability | Status | Where |
|------------|--------|--------|
| FIFO valuation / layers | **Built** | Inventory → Valuation |
| Purchase capitalization into stock | **Built** | Inventory → Purchase Capitalization |
| COGS on sale | **Built** | Inventory → Cost of Goods Sold |
| COGS reversal on sellable restock | **Built** | Inventory → Reversals |
| Inventory opening (cutover) | **Built** (high risk) | Advanced → Inventory Opening |
| Warehouse-wise costing | **Not built** | Single global SKU inventory |

### GST & tax

| Capability | Status | Where |
|------------|--------|--------|
| Output / input GST ledgers from **posted journals** | **Built** | GST → Ledger |
| ITC evidence / eligible vs unverified | **Built** (management) | GST → Purchase GST / ITC |
| GSTR-**style** reports + XLSX (outward, HSN, 3B-style summary) | **Built as management reports** | GST → Reports & Export |
| File GSTR-1 / 3B on GSTN | **Not built** | Never claim this |
| GSTR-2B import / auto-match | **Not built** | |
| TDS | **Not built** | |
| Buyer GSTIN completeness for B2B filing | **Partial** | Many sales are B2C / GSTIN missing |

### Accountant & reports

| Capability | Status | Where |
|------------|--------|--------|
| Chart of Accounts (seeded, **read-only**) | **Built** | Accountant → Chart of Accounts |
| Journal list / detail (immutable posted entries) | **Built** | Accountant → Journal Entries |
| Trial Balance, General Ledger, P&L, Balance Sheet | **Built** | Financial Reports |
| Export XLSX / PDF | **Built** | Reports |
| Books integrity checks | **Built** | Reports → Reconciliation & Checks |
| Cash flow statement | **Not built** | |
| Manual journal / void any journal | **Not built** | |
| Period close / lock UI | **Not built** (backend can block a closed period if seeded) | |
| CoA add/edit accounts in UI | **Not built** | |

### Cutover / openings

| Capability | Status | Notes |
|------------|--------|--------|
| Opening balance batches | **Built** | Advanced → Opening Balances — super-admin / cutover only |
| Historical order mass-backfill | **Off by design** | Prospective posting from cutover; no blind replay of old orders |
| Accounting reset | **CLI only** | Must never be a normal accounts action |

---

## B. Already known gaps (do not rediscover — confirm if they still care)

Mark **Still needed?** during the meeting. If yes, copy the row into Section D with owner and urgency.

| # | Gap | Why it matters | Still needed? (Y/N) | Notes |
|---|-----|----------------|---------------------|-------|
| K1 | GSTN filing (GSTR-1 / 3B) | Statutory return vs management report | | |
| K2 | GSTR-2B import | ITC claim vs government 2B | | |
| K3 | TDS | Vendor payments / 194C etc. | | |
| K4 | RCM journals | If any RCM vendors exist | | |
| K5 | Partial refund GST journals | Partial refunds today can leave GST review gaps | | |
| K6 | Cash flow statement | Indirect/direct cash flow | | |
| K7 | Manual journals / adjustments | Write-offs, opening tweaks, auditor adjustments | | |
| K8 | Period close UI (month lock) | Stop back-dated posts after close | | |
| K9 | Chart of Accounts CRUD | New expense/bank codes without engineering | | |
| K10 | Historical Zoho year migration | Apr–Aug (or prior) books inside Sarveda | | |
| K11 | Buyer GSTIN on B2B checkout | Real GSTR-1 B2B quality | | |
| K12 | Shipping GST completeness | If shipping is taxed and they want it in GST reports | | |
| K13 | COD collection accounting | COD path is not first-class in books | | |
| K14 | Bad-debt / write-off | Uncollectable AR | | |
| K15 | Multi-warehouse costing | Cost by location | | |
| K16 | Credit/debit notes beyond full-refund flow | Standalone CN/DN | | |

---

## C. Questions to ask them (so we do not guess)

Fill answers in the right column.

| # | Question | Their answer |
|---|----------|--------------|
| Q1 | Who is the accountant of record for FY (name / firm)? | |
| Q2 | Which FY are they closing / operating in this system? | |
| Q3 | Do they still open Zoho for anything daily? If yes, what? | |
| Q4 | Opening balances: posted in Sarveda already, or still pending? | |
| Q5 | Any RCM vendors? | |
| Q6 | Any TDS deductees (transporters, professionals)? | |
| Q7 | Who files GST — in-house or CA? What is the filing calendar? | |
| Q8 | Do they need GSTR-1 **export that a CA can upload**, or full GSTN API? | |
| Q9 | How do they treat international (Stripe/PayPal) vs India (Razorpay) in GST? | |
| Q10 | Partial refunds: how often, and do they need GST credit notes now? | |
| Q11 | Bank accounts in use (list). Statements: CSV from whom? | |
| Q12 | Inventory: do they accept FIFO as the only method? | |
| Q13 | Reports they must produce monthly (TB, P&L, GST, MIS). | |
| Q14 | Who should have Accounting access besides the current allowlist? | |
| Q15 | Anything they currently do in Excel that they expect here? | |

---

## D. Capture sheet — missing items raised in this meeting

Copy a new row for every request that is **not already Built**. One row = one later development item.

| ID | Raised by | Ask (plain language) | Why they need it | Already in product? (Built / Partial / No) | If Partial, what works today | Severity (Blocker / High / Medium / Low) | Needed by (month) | Workaround until built | Owner (Accounts / Eng) | Eng notes after meeting |
|----|-----------|----------------------|------------------|--------------------------------------------|------------------------------|------------------------------------------|-------------------|------------------------|------------------------|-------------------------|
| M1 | | | | | | | | | | |
| M2 | | | | | | | | | | |
| M3 | | | | | | | | | | |
| M4 | | | | | | | | | | |
| M5 | | | | | | | | | | |
| M6 | | | | | | | | | | |
| M7 | | | | | | | | | | |
| M8 | | | | | | | | | | |
| M9 | | | | | | | | | | |
| M10 | | | | | | | | | | |

**Severity guide**

- **Blocker** — cannot close books / file / pay vendors without it
- **High** — monthly close is painful or numbers are untrustworthy
- **Medium** — workaround exists (Excel / CA)
- **Low** — convenience / nicer report

---

## E. Decisions in the room

| Decision | Yes / No / Later | Detail |
|----------|------------------|--------|
| Native Sarveda books are the system of record going forward | | |
| Zoho stays read-only archive only | | |
| Opening balances: who posts, by when | | |
| GST filing stays with CA using our XLSX (for now) | | |
| Partial refund GST is accepted as a later build | | |
| Extra Accounting logins to add | | |

---

## F. After the meeting (engineering)

1. Move every **Blocker / High** row from Section D into the sprint board.
2. Do not start K-list items they marked **N**.
3. If they need a screen that already exists, schedule a 30-min walkthrough instead of a build.

**Menu cheat-sheet for screen-share**

| They say | Open |
|----------|------|
| Sales / revenue | `/admin/accounting/order-paid` |
| Quotes | `/admin/accounting/quotes` |
| Refunds | `/admin/accounting/order-refunded-full` |
| Razorpay settlement | `/admin/accounting/settlements` |
| Vendors / PO / bill | `/admin/purchases/...` |
| Pay vendor | `/admin/accounting/vendor-payments` |
| Bank rec | `/admin/accounting/banking/reconciliation` |
| Stock value / COGS | `/admin/accounting/inventory/valuation` and `.../cogs` |
| GST | `/admin/accounting/gst` |
| P&L / BS / TB | `/admin/accounting/reports` |
| Journals | `/admin/accounting/journals` |
