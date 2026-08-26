# SARVEDA NATIVE ACCOUNTING — PHASE 2C ARCHITECTURE
# REFUNDS, SETTLEMENTS & RECONCILIATION

**Date:** 2026-08-22  
**Phase type:** READ-ONLY design  
**Depends on:** Phase 2B `ORDER_PAID_V1` shadow posting (implemented + locally validated)  
**Zoho Books:** remains authoritative until explicit cutover  

---

## 1. Executive Summary

Phase 2C must extend native accounting **after** sale recognition (`ORDER_PAID`) into:

1. **Money returned** (refunds / credit notes)
2. **Money settled** (gateway → bank, fees)
3. **Clearing reconciliation** (1020/1021/1022 balances)
4. **COD cash collection** (AR → cash/bank) — only when evidence exists

This document traces **actual Sarveda code and schema**. It does **not** invent commerce behavior.

### Core conclusions

| Topic | Conclusion |
|-------|------------|
| Authoritative refund money event | `Refund` row after successful gateway API call (`refund.service.ts`), keyed by `providerRefundId` when present |
| `Order.status = REFUNDED` alone | **Not** proof money was returned (webhooks / status changes can set it without complete money metadata) |
| Full refund native posting | Feasible now via discovery of `Refund` + original `ORDER_PAID` payload |
| Partial refund GST posting | **Not safe** as default — amount-only gateway refunds lack tax allocation; line-level data exists only on service-request path |
| Zoho credit notes | Created for **full** refunds only; rebuild invoice lines; shipping separate; inclusive tax |
| Gateway fee / settlement columns | Exist on `Payment` but are **never written** by application code today |
| COD collection | **Not recorded** as cash received; delivery ≠ collection |
| Preferred Phase 2C implementation slice | Full-refund shadow + refund discovery + recon V2 for sale/refund; settlement **import design** (no live API in first coding slice unless approved); **defer** partial GST, COD collection, bank statement matching, COGS |

### Recommended readiness

**READY FOR PHASE 2C IMPLEMENTATION** — with an explicitly **bounded** first coding slice (see §19). Architectural gaps for partial refunds and settlements are documented as **scope boundaries**, not blockers to starting full-refund shadow work.

---

## 2. Current Refund Flow

### 2.1 Schema (money + status)

**`Payment`**

- `status`: includes `CAPTURED`, `PARTIALLY_REFUNDED`, `REFUNDED`, …
- `refundedInPaise`
- `gatewayFeeInPaise`, `settledInPaise`, `settlementDate` (unused writers — §9)
- `rawPayload` / JSON (stores Zoho credit-note ids after full refund)

**`Refund`**

- `paymentId`, `amountInPaise`, `reason`, `providerRefundId`, `status` (`pending` / `created` / `processed`), `createdAt`
- **No** line-item FK, qty, tax, shipping split, or GST fields

**`Order`**

- `status` can become `REFUNDED` or `CANCELLED`
- `paymentStatus` can become `REFUNDED` / `PARTIALLY_REFUNDED`

**`OrderServiceRequest` / `OrderServiceRequestItem`** (customer return/refund workflow)

- Line selection: `orderItemId`, `qtySelected`
- Optional `refundAmountInPaise`, `refundedAt`, `refundProviderId`
- Request-level `refundTotalInPaise`, `refundProcessedAt`, `codRefundNote`

### 2.2 Admin full gateway refund

| Field | Detail |
|-------|--------|
| SOURCE | `backend/src/modules/payments/refund.service.ts` → `initiateGatewayRefund` |
| ENTRY | `admin.handlers.refundOrder` → `POST /admin/orders/:id/refund` |
| MODELS | Creates `Refund`; updates `Payment.status=REFUNDED`, `refundedInPaise=grandTotal`; `handlePaidOrderStatusChange(..., "REFUNDED")` |
| GATEWAY | Razorpay / Stripe / PayPal refund APIs for full `grandTotalInPaise` |
| COD | **No** gateway refund — cancels order; message “arrange cash refund manually”; **no** `Refund` row |
| ZOHO | `createZohoRefundDocumentsForOrder` (async, fire-and-forget) |
| STOCK | Restock via `handlePaidOrderStatusChange` if paid pipeline + stock confirmed |
| IDEMPOTENCY | Gateway-side; DB does not unique-constrain `providerRefundId` |

### 2.3 Admin / service-request partial refund

| Field | Detail |
|-------|--------|
| SOURCE | `initiatePartialGatewayRefund` in `refund.service.ts`; also `order-service-request.service.ts` after item selection |
| MODELS | Creates `Refund` for **amount only**; Payment → `PARTIALLY_REFUNDED` or `REFUNDED`; Order `paymentStatus` partial **without** Zoho credit note |
| LINE DATA | Present on **service request items** when that path is used; **absent** on bare admin amount refund |
| ZOHO | Credit note **only when fully refunded** |

### 2.4 Razorpay webhook

| Field | Detail |
|-------|--------|
| SOURCE | `razorpay.webhook.ts` — `refund.created` / `refund.processed` |
| MODELS | Upserts `Refund` by `providerRefundId`; on `processed` calls `handlePaidOrderStatusChange(..., "REFUNDED")` |
| RISK | Marks order **fully REFUNDED** even if webhook refund amount is partial; may **not** update `refundedInPaise` |
| ZOHO | Not called from webhook path |

### 2.5 PayPal webhook

| Field | Detail |
|-------|--------|
| SOURCE | `paypal.webhook.ts` — `PAYMENT.CAPTURE.REFUNDED` |
| MODELS | Sets order `REFUNDED` via `handlePaidOrderStatusChange` |
| RISK | May create **no** `Refund` row and **not** update `refundedInPaise` |
| ZOHO | Not called |

### 2.6 Stripe webhook

| Field | Detail |
|-------|--------|
| SOURCE | `stripe.webhook.ts` |
| REFUND | **No refund event handling found** |

### 2.7 RTO / paid cancellation

| Field | Detail |
|-------|--------|
| SOURCE | `shipping/orderLifecycle.ts` → `handleRtoShipment` |
| ORDER | Sets **`CANCELLED`**, not `REFUNDED` |
| MONEY | Does **not** automatically refund gateway |
| ZOHO | Cancel path can void invoice (`voidZohoInvoiceForCancelledOrder`), distinct from credit note |
| STOCK | Restock via paid-status handler |

### 2.8 Duplicate / failure / retry

| Concern | Observed behavior |
|---------|-------------------|
| Duplicate gateway refund id | Webhook checks `providerRefundId` before insert; admin path does not hard-unique |
| Refund API failure | Throws; no `Refund` row; order stays paid |
| Retry | Re-calling admin refund may attempt gateway again — **not** a closed idempotent commerce transaction |
| Partial then full | Supported via cumulative `refundedInPaise` vs `grandTotalInPaise` |

---

## 3. Refund Authority Point

### Authoritative for **cash/clearing movement** (Phase 2C accounting)

**Primary:** `Refund` record with:

- `status` in (`processed`, or admin-created `processed`)
- `amountInPaise > 0`
- preferably `providerRefundId` present (online)

**Supporting:** `Payment.refundedInPaise` and `Payment.status`.

### Not authoritative alone

| Signal | Why insufficient |
|--------|------------------|
| `Order.status = REFUNDED` | Can be set by webhook without complete money metadata; also conflates partial vs full in Razorpay webhook |
| `Order.status = CANCELLED` | Used for RTO / COD cancel — often **no** money return recorded |
| Zoho credit note id in `rawPayload` | Secondary finance doc; may lag or fail while gateway refund succeeded |
| Delivery / RTO timestamps | Logistics only |

### Native accounting rule

> Discover and post refunds from **`Refund` (+ Payment)** after commit.  
> Never hook inside gateway refund API transactions.  
> Never treat REFUNDED status alone as money returned.

---

## 4. Full Refund Accounting

### 4.1 Goal

Reverse the **economic effect** of `ORDER_PAID_V1` for the same order when cumulative refunded amount ≥ grand total (or a single refund equals grand total).

### 4.2 Approach choice

| Option | Description | Verdict |
|--------|-------------|---------|
| A. Mutate / reverse-in-place original journal | Edit or void original POSTED entry | **Reject** — breaks Phase 1.5 immutability |
| B. Separate credit-note-style journal | New POSTED journal linked to original | **Adopt** |

**Adopt B** — safer and more auditable:

- Original `ORDER_PAID` journal remains immutable evidence of sale recognition
- Refund journal is a new event with its own unique key
- Matches Zoho pattern (invoice stays; credit note + refund created)

### 4.3 Calculation source

Prefer, in order:

1. **`AccountingPostingEvent.payloadJson`** from original `ORDER_PAID` (calc version, diagnostics, line allocations)
2. Else recompute with **same** `ORDER_PAID_V1` builder from current order snapshot, and flag `RECOMPUTED` in metadata

Never silently switch GST algorithms.

### 4.4 Proposed journal shape (`ORDER_REFUNDED_FULL_V1`)

Mirror invert of sale (signs flipped):

**Online (Razorpay example)**

| Side | Account | Amount source |
|------|---------|---------------|
| Dr | 4000 Product Sales | original pre-discount taxable |
| Dr | 2100/2101 or 2102 Output GST | original post-discount GST |
| Dr | 4100 Shipping Income | original shipping (if any) |
| Cr | 4200 Discounts (contra) | original discount taxable contra (if any) |
| Cr | 1020 Razorpay Clearing | `grandTotalInPaise` (or refund amount if equal) |

**Stripe / PayPal:** credit clearing `1021` / `1022`.

**COD full “refund” (cancel without gateway money):**  
Do **not** post `ORDER_REFUNDED_FULL` as cash reverse unless a real money document exists. Prefer:

- If sale was `Dr 1100 AR`: post **sale reversal** / credit-note style against AR (`Cr 1100`) when business confirms no collectible — only when policy says AR write-off / cancellation of sale recognition.  
- Manual cash refund to customer is a **separate** future cash event (out of COD AR).

### 4.5 Unique key

```text
eventType = ORDER_REFUNDED_FULL
uniqueKey = order:{orderId}:refunded_full
```

Optional secondary link document: `REFUND` / `{refundId}` via `AccountingDocumentLink`.

### 4.6 Accounting date

Prefer `Refund.createdAt` (or gateway processed time if stored). Do not use “today” unless missing.

---

## 5. Partial Refund Feasibility

### 5.1 What Sarveda knows

| Data | Gateway amount refund | Service-request refund |
|------|----------------------|-------------------------|
| Refund amount | YES (`Refund.amountInPaise`) | YES |
| Which order lines | NO | YES (`orderItemId`, `qtySelected`) |
| Per-line refund paise | NO | OPTIONAL (`refundAmountInPaise`) |
| Shipping refund split | NO | NO (not modeled) |
| Tax / GST on refund | NO | NO |
| Discount re-allocation | NO | NO |
| Stock returned | Implied by restock on full cancel/refund paths; partial restock not generally modeled per refund | Partial item selection exists for request, restock behavior must be re-verified at implementation |

### 5.2 Options

| Option | Description | Safety |
|--------|-------------|--------|
| A. Proportional financial refund | Scale ORDER_PAID components by `refundAmount/grandTotal` | Simple; **GST may be wrong** vs Zoho/legal credit note |
| B. Admin-selected line allocation | Use service-request lines + re-run inclusive GST extract | Better when that path is used |
| C. Explicit credit-note allocation model | New structured allocation table | Best long-term; **schema later** |
| D. Defer GST accounting | Post **cash/clearing only** (Dr clearing Cr liability/clearing wash) or post nothing until allocation exists | Safest short-term |

### 5.3 Recommendation

**Default for Phase 2C coding slice: D + partial discovery visibility**

1. Discover partial `Refund` rows and show them in Reconciliation V2 as **DATA GAP / UNPOSTED_PARTIAL**
2. Do **not** auto-post GST/revenue reversal for amount-only partials
3. When `OrderServiceRequestItem` allocation exists **and** sums match refund amount, allow optional **preview** of line-based GST extract (implementation later); still prefer matching Zoho credit-note policy (today Zoho CN is full-only)

**Do not invent GST allocation** for bare amount refunds.

---

## 6. Credit Note Architecture

### 6.1 Current Zoho behavior (`zoho-financials.ts`)

On **full** refund only:

1. Load Zoho invoice by `order.zohoInvoiceId`
2. Build credit note `line_items` from **invoice lines** (`item_id`, `name`, `quantity`, `rate`)
3. If invoice `shipping_charge > 0`, add shipping line against Zoho “Shipping Charge” account
4. `is_inclusive_tax: true`
5. Date = today
6. `reference_number = orderNumber`
7. Apply CN to invoice for `grandTotal` rupees
8. Create CN refund (`refund_mode` banktransfer/cash; optional `ZOHO_REFUND_FROM_ACCOUNT_ID`)
9. Store ids on `Payment.rawPayload` (`zohoCreditNoteId`, `zohoCreditNoteNumber`, `zohoCreditNoteRefundId`) — idempotent skip if refund id present

**Not done today for partials.**

### 6.2 Native equivalent (design)

| Zoho | Native |
|------|--------|
| Credit note | `ORDER_REFUNDED_FULL` journal (credit-note style) |
| Apply to invoice | `AccountingDocumentLink`: `ORDER` + `REFUND` + link to original journal via posting metadata |
| CN refund from bank | Future settlement/cash movement; **not** required to recognize revenue reversal |
| Inclusive tax lines | Reversal of ORDER_PAID_V1 components (not PDF-basis) |

Do not change Zoho or PDF behavior in Phase 2C implementation without separate approval.

---

## 7. Refund Event Catalogue

Only events justified by Sarveda data:

### `ORDER_REFUNDED_FULL`

| Field | Definition |
|-------|------------|
| TRIGGER | Sum(`Refund.amountInPaise` for payment) ≥ `Order.grandTotalInPaise` **or** Payment.status=`REFUNDED` **with** matching Refund rows totaling grand total |
| SOURCE | `Refund` + `Payment` + `Order` |
| UNIQUE KEY | `order:{orderId}:refunded_full` |
| DATE | Latest qualifying Refund.createdAt |
| REQUIRED | Original ORDER_PAID event/journal (or recompute flag); refund totals; provider |
| IDEMPOTENCY | PostingEvent unique (eventType, uniqueKey) |
| PHASE | **2C implementation IN** |

### `ORDER_PARTIALLY_REFUNDED` (observation / optional soft event)

| Field | Definition |
|-------|------------|
| TRIGGER | Refund rows exist and cumulative < grand total |
| SOURCE | `Refund` |
| UNIQUE KEY | `order:{orderId}:refund:{refundId}` (per refund) if posting cash-only later |
| ACCOUNTING | **Defer GST**; recon status `UNPOSTED_PARTIAL` |
| PHASE | Discovery + recon in 2C; **posting deferred** |

### `CREDIT_NOTE_CREATED` (Zoho mirror — optional metadata)

| Field | Definition |
|-------|------------|
| TRIGGER | `Payment.rawPayload.zohoCreditNoteId` present |
| USE | Reconciliation link only; **do not** double-post if `ORDER_REFUNDED_FULL` already posted |
| PHASE | Recon V2 |

### Explicitly **not** justified as money events yet

| Candidate | Why rejected |
|-----------|--------------|
| `REFUND_FAILED` | Failures throw; no durable failed refund ledger row |
| `REFUND_SETTLED` | No settlement/fee writers exist |
| `RTO_REFUNDED` | RTO → CANCELLED; money not automatic |

---

## 8. GST Reversal Design

### Full refund

- Reverse **ORDER_PAID_V1** GST components (post-discount output GST) using stored diagnostics
- Intra-state: reverse CGST+SGST; inter-state: reverse IGST
- Discount contra and shipping income reverse as in §4
- Aligns with Zoho full CN rebuilding inclusive lines (parity variance may remain — expose, don’t Round Off)

### Partial refund

- **Cannot** safely reverse GST from amount alone
- Service-request lines enable a **future** discount-first extract on refunded inclusive merchandise only — still needs shipping/discount policy rules
- Flag gap: native cannot claim legal GST credit-note parity for amount-only partials

### Invoice/PDF

- Out of scope — do not change

---

## 9. Settlement Data Availability

### Schema fields on `Payment`

- `gatewayFeeInPaise` (default 0)
- `settledInPaise` (default 0)
- `settlementDate` (nullable)

### Writers

**None found** in application modules. Only **read** in admin reporting (`reports.handlers.ts` / analytics exports).

### Conclusion

Settlement / fee / UTR / settlement batch ID are **not populated** today.  
Any settlement accounting requires a **new importer** (Razorpay settlements API / CSV / webhook), not discovery of existing columns.

`rawPayload` may contain gateway snapshots but is not a structured settlement ledger.

---

## 10. Razorpay Settlement Design (future)

### Conceptual target journal (per settlement payment / line)

When fee + tax + net settlement are known:

| Side | Account | Meaning |
|------|---------|---------|
| Dr | 1010 Bank | Net UTR credit |
| Dr | 5100 Payment Gateway Charges | Fee (ex-GST if split known) |
| Dr | 2200/2201/2202 Input GST | GST on fees **if** provided separately |
| Cr | 1020 Razorpay Clearing | Gross captured amount being settled |
| Adjust | Clearing | Refunds already deducted by Razorpay must match prior refund credits to clearing |

Exact split depends on Razorpay settlement payload fields (fee, tax, amount, settlement_id, UTR). **Do not call Razorpay in this design phase.**

### Required import fields (minimum)

- `providerPaymentId` / payment id
- settlement id + settlement date
- settled amount, fee, tax
- UTR / bank reference
- refunds/adjustments in the same settlement

### Idempotency

```text
eventType = GATEWAY_SETTLEMENT
uniqueKey = razorpay:settlement:{settlementId}:payment:{providerPaymentId}
```

### Phase note

Model + importer design in 2C docs; **coding of live API pull** should be a gated sub-slice after full-refund shadow is green.

---

## 11. Stripe / PayPal Settlement Design

| Provider | Difference vs Razorpay |
|----------|------------------------|
| Stripe | Balance transactions / payouts; fees often per charge; multi-currency; no Indian UTR model |
| PayPal | Transaction + payout reports; fees; currency conversion |

Clearing accounts already exist (`1021`, `1022`).  
Provider-specific importers required; do not force Razorpay settlement shape.

Stripe refund webhooks are **absent** today — refund discovery must not rely on Stripe webhooks until commerce adds them; admin `Refund` rows remain source of truth for Stripe refunds initiated in-app.

---

## 12. Clearing Reconciliation

### Lifecycle

```text
ORDER_PAID     → Dr Clearing (gross)
ORDER_REFUNDED → Cr Clearing (refund out before/after settle)
SETTLEMENT     → Cr Clearing (gross settled) + Dr Bank + Dr Fees (+ Dr Input GST)
```

### Checks to design into Recon V2

| Check | Meaning |
|-------|---------|
| Captured not settled | Clearing open balance aging |
| Settlement mismatch | Settled ≠ expected clearing credit |
| Refund before settlement | Clearing reduced early — expected |
| Fee mismatch | Imported fee ≠ expected schedule |
| Duplicate settlement | Unique key collision / double import |
| Missing payment | Settlement references unknown payment |
| Orphan settlement | No ORDER_PAID native journal |

Accounts: **1020 / 1021 / 1022**.

---

## 13. COD Collection Design

### Current reality

- Phase 2B: `ORDER_PAID` for COD → **Dr 1100 AR** (sale recognised, not cash)
- COD cancel: order CANCELLED; manual cash message; typically **no** `Refund` row
- Shipping comments imply collection at delivery, but **no code** marks COD `Payment` CAPTURED or records cash on DELIVERED
- **DELIVERED ≠ COD_COLLECTED**

### Future event (only with evidence)

```text
COD_COLLECTED
uniqueKey = order:{orderId}:cod_collected
```

Possible journal:

| Side | Account |
|------|---------|
| Dr | 1000 Cash or 1010 Bank or future COD courier clearing |
| Cr | 1100 Accounts Receivable |

### Required source data (does not exist yet)

- Collection amount, date, method (cash/UPI/courier remittance)
- Courier remittance batch / UTR
- Actor / proof

Until then: recon shows COD AR as **UNSETTLED_AR**.

---

## 14. Sales Returns Account Review

| Approach | Pros | Cons |
|----------|------|------|
| A. Reverse 4000 Product Sales directly | Simple; mirrors ORDER_PAID invert | Mixes returns into gross sales netting in reports |
| B. New 4300 Sales Returns (contra) | Cleaner gross sales reporting | CoA change; dual mapping |
| C. Separate refund journal reversing originals | Audit trail of sale + reverse | Same as A economically |

**Recommendation for Phase 2C:** **C/A hybrid** — separate refund journal that **debits 4000** (and GST/shipping) matching Zoho CN economics, **without** adding 4300 yet. Revisit Sales Returns contra if management reporting requires gross sales preservation.

**Do not modify CoA in design phase.**

---

## 15. Journal / Event Linkage

### Existing schema (sufficient for first slice)

- `AccountingPostingEvent` — `(eventType, uniqueKey)`, `sourceType/sourceId`, `payloadJson`, `journalEntryId`
- `AccountingDocumentLink` — `documentType` + `documentId` + `journalEntryId` (+ optional Zoho ids)

### Linkage design (no migration required)

| Link | How |
|------|-----|
| ORDER → sale journal | Existing `documentType=ORDER` |
| ORDER → refund journal | Same ORDER link on refund journal |
| REFUND → refund journal | `documentType=REFUND`, `documentId=refundId` |
| Original journal reference | Store `originalJournalEntryId` + `originalUniqueKey` in refund event `payloadJson` |
| Zoho CN | `zohoDocumentId` / `zohoDocumentType=credit_note` on document link when known |

### If later needed (document only)

- Explicit `parentJournalEntryId` on journals  
- Settlement batch table  

**No migration in this phase.**

---

## 16. Historical Refund Backfill Feasibility

| Case | Feasible? | Notes |
|------|-----------|-------|
| Full refund with Refund row + ORDER_PAID journal | YES | Preferred |
| Full refund, ORDER_PAID missing | Recompute then refund, or post sale first via discovery | Ordered pipeline |
| Multiple refunds summing to full | YES | One FULL event after threshold |
| Partial only | Recon only | No GST post |
| Missing providerRefundId | Use `refund:{id}` in links; weaker external audit |
| Missing Zoho CN | Still post native; recon DATA GAP |
| PayPal/Razorpay status REFUNDED without Refund row | **Repair/discovery heuristic** needed; do not blind-post | Prefer creating missing Refund from gateway export later |
| Event ordering | Always ensure ORDER_PAID before FULL refund post | Discovery dependency |

**Do not run backfill in design phase.**

---

## 17. Reconciliation V2 (design)

Per order / payment row conceptually:

| Column group | Fields |
|--------------|--------|
| Commerce | grand total, discount, shipping, provider, order status, payment status, refundedInPaise |
| Native sale | journal #, taxable, GST split, clearing Dr |
| Native refund | journal #, reversed GST, clearing Cr |
| Zoho | invoice id/no, credit note id/no |
| Gateway | captured, refunded (sum Refund), settled, fee |
| Clearing | implied open balance |
| Variance | native vs commerce vs Zoho |

### Statuses

| Status | Meaning |
|--------|---------|
| MATCHED | Sale + full refund + (optional) settlement consistent |
| EXPECTED_VARIANCE | Known PDF/Zoho algorithm differences |
| DATA_GAP | Partial refund unposted; missing Zoho; unsettleable COD |
| ERROR | Imbalance, duplicate journals, impossible totals |
| UNSETTLED | Clearing/AR open |

---

## 18. Production Integration Risks

### Preferred integration style (same as Phase 2B)

- **Refund table discovery** (after commit)
- **Settlement file/API importer** (explicit admin/job)
- **No hooks** in `refund.service.ts`, webhooks, `afterPaid`, checkout

### Future touchpoints (do **not** modify now)

| Area | Risk if hooked wrongly |
|------|------------------------|
| `refund.service.ts` | Double post / block customer refund |
| Razorpay/PayPal webhooks | Partial→full status bugs amplified |
| `handlePaidOrderStatusChange` | Cancel/RTO ≠ money |
| Zoho credit note creator | Dual authority confusion |

### Guards to reuse / extend

- `NATIVE_ACCOUNTING_ENABLED`
- `ACCOUNTING_SALES_POSTING_ENABLED` (or future `ACCOUNTING_REFUND_POSTING_ENABLED`)
- `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` dual guard
- Bulk discovery caps + dryRun default true

---

## 19. Recommended Phase 2C Implementation Scope

### IN (first coding slice)

1. Pure `buildOrderRefundedFullJournal` from ORDER_PAID payload / V1 recompute  
2. Refund discovery worker (Refund-table driven, dryRun default)  
3. Idempotent `ORDER_REFUNDED_FULL` posting via existing posting-event path  
4. Admin preview/post for one refunded order  
5. Reconciliation V2 columns for sale + full refund + Zoho CN ids + DATA_GAP partials  
6. Production dual-guard coverage for refund persistence  
7. Settlement **architecture already herein**; optional **schema proposal doc only** if importer needs tables — still no migration without approval  

### DEFER

| Item | Reason |
|------|--------|
| Partial refund GST journals | Insufficient safe allocation for amount-only refunds |
| COD_COLLECTED posting | No collection evidence in commerce |
| Live Razorpay settlement API pull | Columns unused; needs importer product decision |
| Bank statement upload / auto-match | Separate ops product |
| COGS / inventory valuation | Unrelated to refund/settlement money |
| New Sales Returns CoA account | Optional reporting nicety |
| Fixing commerce webhook bugs | Out of accounting scope (may note as recommendations) |

### Explicit non-goals

- Changing refund commerce behavior  
- Changing Zoho credit note creation  
- Changing PDF GST  
- Production backfill without staging proof  

---

## 20. Required Tests (for future implementation)

| # | Scenario |
|---|----------|
| 1 | Full refund posts balanced reverse of ORDER_PAID_V1 |
| 2 | Duplicate full refund discovery → one journal |
| 3 | Refund after native ORDER_PAID exists |
| 4 | Refund when native sale missing → fail closed or ordered discovery |
| 5 | Refund row before sale discovery catches up |
| 6 | Partial refund → no GST auto-post; recon DATA_GAP |
| 7 | Multiple partials then full → single FULL event |
| 8 | Full after partials uses cumulative amounts |
| 9 | GST reversal intra-state |
| 10 | GST reversal inter-state |
| 11 | Discount contra reversal |
| 12 | Shipping income reversal |
| 13 | COD cancel without Refund row → no false cash refund journal |
| 14 | Gateway settlement import idempotency (when built) |
| 15 | Fee + input GST split (when built) |
| 16 | Duplicate settlement rejected |
| 17 | Mismatched settlement → ERROR status |
| 18 | Concurrent refund post attempts |
| 19 | Feature flags / production dual guard |
| 20 | Commerce rows unchanged after accounting post |
| 21 | Provider clearing account mapping Razorpay/Stripe/PayPal |
| 22 | Zoho CN ids surface in recon without API spam |

---

## 21. Explicit Files Inspected

| Area | Paths |
|------|-------|
| Refunds | `backend/src/modules/payments/refund.service.ts` |
| Admin refund API | `backend/src/modules/admin/admin.handlers.ts`, `admin.routes.ts` |
| Razorpay webhook | `backend/src/modules/payments/razorpay.webhook.ts` |
| PayPal webhook | `backend/src/modules/payments/paypal.webhook.ts` |
| Stripe webhook | `backend/src/modules/payments/stripe.webhook.ts` (no refund handler) |
| Order status / restock | `backend/src/modules/orders/orders.service.ts` (`handlePaidOrderStatusChange`) |
| Service-request refunds | `backend/src/modules/orders/order-service-request.service.ts` |
| Zoho CN | `backend/src/modules/zoho/zoho-financials.ts` |
| RTO | `backend/src/modules/shipping/orderLifecycle.ts` |
| Settlement field reads | `backend/src/modules/admin/reports.handlers.ts` |
| Schema | `backend/prisma/schema.prisma` (`Payment`, `Refund`, `OrderServiceRequest*`, Accounting*) |
| Phase 2B constants / CoA | `backend/src/modules/accounting/order-paid.constants.ts`, `seed-coa.ts`, journal builder |
| Phase 2B docs | `SARVEDA_ACCOUNTING_PHASE2B_SHADOW_POSTING.md`, staging validation report |

---

## 22. Explicit Code Modification Statement

**This Phase 2C design task modified only:**

- `SARVEDA_ACCOUNTING_PHASE2C_ARCHITECTURE.md` (this file)

**Did not modify:**

- checkout, payment success, webhooks, `afterPaid`, refunds, inventory, invoice/PDF, GST utils, Zoho integration  
- Prisma schema, migrations, env configuration  
- production / staging / local data  
- accounting runtime code  

No refunds, settlements, discovery activation, or Zoho calls were executed for this design.

---

## Final Verdict

**READY FOR PHASE 2C IMPLEMENTATION**
