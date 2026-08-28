# SARVEDA ACCOUNTING UI REVAMP — STAGE 2C AUDIT

**Mode:** READ-ONLY discovery (no application code modified)  
**Date:** 2026-08-28  
**Locked prior stages:** Stage 2A / 2A.1 Purchases · Stage 2B / 2B.1 Banking  

---

## 1. Executive recommendation

**Recommended Stage 2C: Sales (Sales Entries + Refunds + Gateway Settlements)**

After Purchases/Payables and Banking, the next coherent operator workflow is the **sales ledger cycle**:

1. Customer pays → **Sales entry** (ORDER_PAID journal)  
2. Refund when needed → **Full refund entry**  
3. Gateway remits cash → **Settlement** into bank (feeds Banking / Gateway Clearing)

Backend posting for these three surfaces is **real and mature**. The UI is still largely **shadow/UAT console** (env-var banners, “Post to books”, discovery dry-runs, JSON dumps on Settlements). That is the same class of debt Stage 2A/2B fixed — and it can be addressed **frontend-only**.

Inventory and GST are strong later candidates (2D/2E) but are heavier, more technical, or more report-centric than the day-to-day sales posting workspace.

---

## 2. Inventory of Accounting frontend routes

| Route | Nav group | Stage status |
|-------|-----------|--------------|
| `/admin/accounting` | Dashboard | Stage 1 (keep) |
| `/admin/purchases/*` + vendor payments | Purchases | **2A locked** |
| `/admin/accounting/banking/*` | Banking | **2B locked** |
| `/admin/accounting/order-paid` | Sales → Sales Entries | **Candidate 2C** |
| `/admin/accounting/order-refunded-full` | Sales → Refunds | **Candidate 2C** |
| `/admin/accounting/settlements` | Sales → Gateway Settlements | **Candidate 2C** |
| `/admin/accounting/inventory` | Inventory | Later |
| `/admin/accounting/gst` | GST & Tax | Later |
| `/admin/accounting/accounts` | Accountant → CoA | Later / light polish |
| `/admin/accounting/journals` | Accountant → Journals | Later / light polish |
| `/admin/accounting/reports` | Reports | Stage 1.1 partial polish |
| `/admin/accounting/expense-mappings` | Advanced (muted) | Defer |
| `/admin/accounting/expenses` | Advanced | Overlaps Purchases expenses |
| `/admin/accounting/vendor-bills` | Advanced | Books recognition (Purchases-adjacent) |
| `/admin/accounting/purchases` | Advanced | Ops/books dashboard remnant |
| `/admin/accounting/opening` | Advanced | Cutover / opening |

---

## 3. Candidate area audits

### 3.1 Sales — Sales Entries (`order-paid`)

**A. Existing functionality**

| Layer | Status |
|-------|--------|
| Frontend | **Partial** — single-order lookup UI (“shadow” style) |
| Backend/API | **Implemented** — preview / post / discover / reconciliation |
| DB/models | **Implemented** — posting events + journal documents |
| Accounting/posting | **Implemented** — `ORDER_PAID` journal via posting-event idempotency |
| Stub | Discovery worker exists; UI exposes dry-run discover |

**B. Accounting capability (verified)**

- Creates **journal entries / lines** (revenue, discounts, output GST split CGST/SGST/IGST, gateway clearing e.g. Razorpay 1020 path, related AR/clearing per builder)  
- Consumes commerce **Order / Payment** evidence  
- Does **not** invent bank cash until settlement  
- Idempotent post (duplicate → same journal)

**C. Current UI**

- One-page console: order number → Preview → Post to books → Discover dry-run  
- Engineering copy: `ACCOUNTING_SALES_POSTING_ENABLED=1`  
- Readable line table when preview loads (better than raw JSON)  
- No sales work queue / list of unposted eligible orders in primary UI  
- Dangerous post with limited confirmation language

**D. Gaps**

| Type | Notes |
|------|--------|
| **UI_GAP** | No operator worklist of eligible/unposted paid orders; no soft flags; env banners |
| **DATA_GAP** | None for core paid-order posting when order exists |
| **BACKEND_GAP** | No “list eligible for posting” first-class list API in UI use (discover exists) |
| **ACCOUNTING_GAP** | None for full ORDER_PAID path |

**Maturity:** Backend **High** · Accounting **High** · UI **Low**

---

### 3.2 Sales — Refunds (`order-refunded-full`)

**A. Existing functionality**

| Layer | Status |
|-------|--------|
| Frontend | **Partial** — shadow preview/post + recon v2 row |
| Backend/API | **Implemented** — preview / post / discover + recon v2/v3 |
| DB/posting | **Implemented** — full-refund journal path |
| Stub | Partial-refund / credit-note UX not a separate product surface |

**B. Accounting capability**

- Creates **refund journals** (reverses sales recognition path)  
- Links to order refund evidence  
- Reconciliation helpers for ops↔books refund status

**C. Current UI**

- Env flag text `ACCOUNTING_REFUND_POSTING_ENABLED`  
- Preview dump / recon snippet style  
- Same console pattern as sales entries

**D. Gaps**

| Type | Notes |
|------|--------|
| **UI_GAP** | No refund work queue; engineering terminology |
| **ACCOUNTING_GAP** | Partial refund / multi-step credit-note UX may be incomplete as a dedicated product (full refund path exists) |

**Maturity:** Backend **High** · Accounting **Med–High** · UI **Low**

---

### 3.3 Sales — Gateway Settlements

**A. Existing functionality**

| Layer | Status |
|-------|--------|
| Frontend | **Partial** — list + import/preview/post + bank target picker |
| Backend/API | **Implemented** — list/detail/import/preview/post/discover |
| DB | **Implemented** — `AccountingGatewaySettlement` + target bank FK |
| Posting | **Implemented** — clears gateway clearing → bank; fees |

**B. Accounting capability**

- Creates **settlement journals**  
- Debits **bank**, credits **gateway clearing**, fee expense lines  
- Integrates with **Banking** registry (`targetBankAccountId`, Razorpay target) and **Gateway Clearing** balances  
- Razorpay primary; Stripe/PayPal settlement posting **not configured** (DATA_GAP — already surfaced in Banking)

**C. Current UI**

- Raw **`JSON.stringify`** for proposal lines and detail  
- “legacy 1010” bank fallback wording  
- Engineering “Accounting* only” messages  
- Post without Stage-2B-style readable review + confirm

**D. Gaps**

| Type | Notes |
|------|--------|
| **UI_GAP** | Readable settlement workspace; confirmations; no JSON |
| **DATA_GAP** | Stripe/PayPal settlement parity; COD remittance |
| **BACKEND_GAP** | Not required for Razorpay UI revamp |
| **ACCOUNTING_GAP** | None for Razorpay settlement path |

**Maturity:** Backend **High** (Razorpay) · Accounting **High** (Razorpay) · UI **Low**

---

### 3.4 Inventory Valuation

**A. Existing functionality**

| Layer | Status |
|-------|--------|
| Frontend | **Partial** — one mega-page: recon v4, opening XLSX, capitalization, COGS, COGS reversal |
| Backend/API | **Implemented** — many routes (recon v1–v4, capitalization, cogs, reversal, opening batches) |
| DB | **Implemented** — cost layers / consumption models (Phase 3D1+) |
| Posting | **Implemented** — capitalization, COGS, reversal, opening inventory |

**B. Accounting capability**

- Journals for **purchase capitalization**, **COGS**, **COGS reversal**, **inventory opening**  
- Clearing account **1210** style purchase clearing  
- Physical vs accounting inventory recon reports  

**C. Current UI**

- Severe engineering mega-page  
- Multiple **`JSON.stringify` / `<pre>`** dumps  
- Account codes (1200/5000) in instructional copy  
- Dangerous posts adjacent to debug recon  

**D. Gaps**

| Type | Notes |
|------|--------|
| **UI_GAP** | Entire operator IA missing |
| **DATA_GAP** | Opening valuation source quality / ops stock alignment |
| **BACKEND_GAP** | Low for core paths |
| **ACCOUNTING_GAP** | Low for implemented event types |

**Maturity:** Backend **High** · Accounting **High** · UI **Very Low**  

**Stage 2C fit:** Strong later stage (2D). Too large and specialist to combine with Sales in one presentation pass.

---

### 3.5 GST & Tax

**A. Existing functionality**

| Layer | Status |
|-------|--------|
| Frontend | **Partial–Med** — tabbed GST page (overview, outward, B2B/B2C, credit notes, HSN, ITC, ledger, recon, gaps) |
| Backend/API | **Implemented** — gst overview/ledger/recon + rich reports + ITC discover/verify/block |
| Posting | GST amounts come from **sales/purchase journals**; GST module is largely **reporting + ITC workflow**, not a separate “post GST” button surface |

**B. Accounting capability**

- Consumes posted sales/purchase tax lines  
- GST ledger aggregates, GSTR-oriented reports, ITC evidence states  
- Explicit **data-gap** endpoints  

**C. Current UI**

- Better structured than Sales/Inventory consoles  
- Still technical labels (tabs, gap codes, flags)  
- Depends on sales/purchases data quality  

**D. Gaps**

| Type | Notes |
|------|--------|
| **UI_GAP** | Operator polish, softer terminology |
| **DATA_GAP** | ITC verification / shipping policy / incomplete evidence |
| **ACCOUNTING_GAP** | Not primarily a posting workspace |

**Maturity:** Backend **High** · Accounting **Med–High** (reporting) · UI **Med**  

**Stage 2C fit:** Better **after** Sales UI so outward/credit-note reports reflect cleaner sales language and workflows.

---

### 3.6 Accountant — Chart of Accounts & Journals

**A.** Read list UIs over seeded CoA and journal entries — **implemented** BE/DB; FE is simple tables.  
**B.** Consumes journals; CoA does not post.  
**C.** Minimal / utilitarian; status enums raw; no mega-JSON.  
**D.** **UI_GAP** for filters/detail drill; low urgency.  
**Maturity:** Backend **High** · Accounting **High** · UI **Med–Low**  
**Stage 2C fit:** Supporting polish only, not a full stage.

---

### 3.7 Reports

**A.** TB / GL / P&L / BS / integrity / export — **implemented** (flag-gated); Stage 1.1 already improved tabs/labels and P&L/BS auto-load.  
**B.** Consumes posted ledger only.  
**C.** Much closer to Stage 1 visual language than Sales/Inventory.  
**D.** Residual **UI_GAP** polish possible; not blocking.  
**Maturity:** Backend **High** · Accounting **High** · UI **Med–High**  
**Stage 2C fit:** Not the primary next workspace redesign.

---

### 3.8 Opening / Advanced remnants

- **Opening balances:** Full batch/import/validate/preview/post — cutover tool; belongs Advanced.  
- **Expense mappings / accounting expenses / vendor-bills books / purchases dashboard:** UAT/advanced recognition surfaces; Purchases ops already in 2A.  
Do **not** make these Stage 2C.

---

## 4. Why Sales is Stage 2C

1. **Natural cycle:** Purchases (AP) + Banking → next is **Sales / AR-clearing / Settlements**.  
2. **Backend ready:** Preview/post/discover/settlement import already ship.  
3. **Largest remaining day-to-day UI debt** among revenue-path modules (shadow pages + Settlements JSON).  
4. **Frontend-only:** Labels, IA, work queues (where discover/list already exist), confirmations, readable entry preview — same pattern as 2A/2B.  
5. **Cross-module payoff:** Settlements → bank accounts / Gateway Clearing already in Banking.  

**Exclude from Stage 2C implementation (FUTURE):**

- Stripe/PayPal settlement parity  
- COD remittance posting  
- Changing ORDER_PAID / refund / settlement journal builders  
- New schema / flags / posting guards  
- Inventory / GST full redesign  

---

## 5. Proposed Stage 2C information architecture (Sales)

```
Sales
  Overview
  Sales Entries
  Refunds
  Gateway Settlements
```

(Entry point: expand Accounting → Sales nav; `/admin/accounting/order-paid` can become Overview or redirect to Sales Overview.)

### 5.1 Sales Overview

| | |
|--|--|
| **Purpose** | Situation board for sales recognition & settlements |
| **KPIs** (only if already available from status/dashboard/discover/recon — else omit) | Sales posting on/off (soft), recent posted sales journals count if listable, settlements outstanding hint via gateway clearing link, refunds needing attention if recon exposes |
| **Tables** | Needs attention shortcuts; recent settlements |
| **Primary actions** | Go to Sales Entries / Settlements |
| **Empty** | “No items need attention” |
| **Dangerous** | None |

Do not invent FY sales totals without an existing API field.

### 5.2 Sales Entries

| | |
|--|--|
| **Purpose** | Recognise paid orders in the books |
| **Filters** | Order number search; optional discover/eligible list if wired from existing discover API without new BE |
| **Form** | Order number → Preview entry |
| **Preview** | Readable debit/credit table (account **names** primary; codes secondary) — **no JSON** |
| **Primary** | Record Sales Entry (display label for post) |
| **Secondary** | Refresh preview; soft “recording unavailable” if flag off |
| **Statuses** | Eligible / Already recorded / Not eligible (from preview eligibility) |
| **Confirm** | Modal: posts accounting for this paid order; idempotent; does not move bank cash |
| **Empty** | Enter an order number to preview |
| **Dangerous** | Record Sales Entry — confirm required |

### 5.3 Refunds

| | |
|--|--|
| **Purpose** | Record full refunds in the books |
| **Form** | Order number → Preview → Record Refund |
| **Preview** | Readable lines + short recon status if already returned by API |
| **Confirm** | Explains reverse of sales recognition; idempotent |
| **Exclude** | Fake partial-refund UI if BE only supports full path |

### 5.4 Gateway Settlements

| | |
|--|--|
| **Purpose** | Clear gateway balances into bank when settlement arrives |
| **KPIs** | Link to Banking → Gateway Clearing |
| **Table** | Recent settlements (id, provider, date, net, status, bank) |
| **Form** | Settlement id / import → Review → Record Settlement |
| **Fields** | Destination bank (existing registry picker; no “legacy 1010” wording) |
| **Preview** | Structured debit/credit (replace JSON) |
| **Primary** | Import evidence / Record Settlement |
| **Confirm** | Moves clearing → bank; fees if present |
| **Empty** | No settlements imported yet |
| **DATA incomplete providers** | Soft note; do not pretend Stripe/PayPal fully tracked |

---

## 6. Cross-module integrity (existing only)

| Module | Relationship to Sales |
|--------|------------------------|
| **Purchases / Vendor Payments** | Separate AP cycle; shared CoA/journals |
| **Banking** | Settlement **target bank**; Gateway Clearing outstanding reflects uncleared sales collections |
| **Inventory** | COGS often follows delivery after sales recognition — separate stage |
| **GST** | Output tax lines born in sales journals; GST reports consume them |
| **CoA / Journals** | Sales posts appear as journals |
| **Reports** | P&L revenue / tax / clearing from posted sales & settlements |
| **Reconciliation (bank)** | Settlements become matchable bank credits |
| **Gateway Clearing** | Debited on paid orders; credited on settlements |

No new integrations proposed for Stage 2C.

---

## 7. Stage 2B closure check

Reviewed Banking routes delivered in 2B/2B.1 against the approved Stage 2B audit/IA:

| Expected | Present |
|----------|---------|
| Overview / Accounts / Statements / Transfers / Reconciliation / Gateway | Yes |
| Account detail | Yes |
| Readable import/match/transfer/recon (no mega-page JSON) | Yes |
| Dangerous actions confirmations | Yes (2B/2B.1) |

Deferred items from Stage 2B docs (reject-candidate UI, UNKNOWN categorize, live bank feeds, Stripe/PayPal parity) were **explicitly out of scope**, not accidental omissions from redesign.

No approved Stage 2B capability was found **inaccessible** solely due to the redesign.

**STAGE 2B CLOSED — NO MATERIAL UI GAPS FOUND**

---

## 8. Decision matrix

| Area | Backend maturity | Accounting maturity | Current UI maturity | Recommended stage |
|------|------------------|---------------------|---------------------|-------------------|
| Purchases / Payables | High | High | High (2A) | **Complete** |
| Banking | High | High | High (2B) | **Complete** |
| **Sales (Entries + Refunds + Settlements)** | **High** | **High** | **Low** | **Stage 2C** |
| Inventory Valuation | High | High | Very Low | Stage 2D (candidate) |
| GST & Tax | High | Med–High | Med | Stage 2E / after Sales |
| Reports | High | High | Med–High | Maintenance polish |
| CoA / Journals | High | High | Med–Low | Light polish later |
| Opening / Advanced | High | High | Low (cutover) | Keep Advanced |

---

## 9. Final decision block

**Recommended Stage 2C:** Sales (Sales Entries · Refunds · Gateway Settlements)

**Backend changes required for UI revamp:** **NO**

**Accounting logic changes required for UI revamp:** **NO**

**Stage 2B closure:** **CLOSED**

**Ready for Stage 2C design:** **YES**

---

*End of read-only audit. No application code was modified.*
