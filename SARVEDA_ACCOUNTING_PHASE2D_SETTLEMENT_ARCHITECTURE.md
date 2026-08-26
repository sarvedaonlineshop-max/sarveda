# SARVEDA NATIVE ACCOUNTING — PHASE 2D
# PAYMENT GATEWAY SETTLEMENT ARCHITECTURE

**Date:** 2026-08-23  
**Mode:** Architecture / read-only analysis only  
**Depends on:** Phase 2C (`ORDER_PAID_V1`, `ORDER_REFUNDED_FULL_V1`) shadow-validated  
**Zoho Books:** remains authoritative for commerce invoices / credit notes  
**This document:** designs settlement accounting — **does not implement**

---

## 1. Executive Summary

Sarveda already posts **payment capture** into provider clearing accounts (`1020` / `1021` / `1022`) via `ORDER_PAID_V1`, and reverses full refunds via `ORDER_REFUNDED_FULL_V1`. **Bank settlement is a separate accounting event** and is not implemented.

**Current data reality (pre-launch Lightsail DB, read-only):**

| Field / signal | Reality |
|----------------|---------|
| `Payment.gatewayFeeInPaise` | Always **0** — **no writers** in codebase |
| `Payment.settledInPaise` | Always **0** — **no writers** |
| `Payment.settlementDate` | Always **null** — **no writers** |
| Razorpay settlement IDs / UTRs in DB | **None** persisted |
| Webhook `fee` / `tax` | Sometimes present under `rawPayload.lastWebhookPayload` — **not copied** to columns |
| Zoho local refs | Invoice + customer payment IDs only — **no settlement / UTR** |

**Capability reality:** installed `razorpay@^2.9.4` SDK exposes read-only settlement surfaces (`settlements.all`, `settlements.fetch`, `settlements.reports` → `/v1/settlements/recon/combined`). Sarveda code today only uses order create, signature verify, order payment fetch, and refunds — **never settlements**.

**Architecture conclusion:** Phase 2D can and should implement **Razorpay INR settlement-batch journals** via a **read-only importer** into Accounting-owned structures, with clearing reconciliation V3. Stripe / PayPal / FX / bank-statement matching defer.

---

## 2. Current Settlement Data Reality

### 2.1 Schema (exists since init)

```prisma
gatewayFeeInPaise Int       @default(0)
settledInPaise    Int       @default(0)
settlementDate    DateTime?
providerPaymentId String?
providerOrderId   String?
rawPayload        Json?
```

### 2.2 Writers vs readers

| Field | Writers found | Readers |
|-------|---------------|---------|
| `gatewayFeeInPaise` | **NONE** | Admin Excel export (`reports.handlers.ts`) |
| `settledInPaise` | **NONE** | Same |
| `settlementDate` | **NONE** | Same |
| `providerPaymentId` / `providerOrderId` | Verify / webhook / Stripe / PayPal complete paths | Everywhere |
| `rawPayload` | Checkout create, verify, webhooks (merge), Zoho payment ids | Debug / Zoho / accounting snapshots |

### 2.3 Lightsail population (read-only aggregate)

Across **all** providers (RAZORPAY 1726, STRIPE 109, PAYPAL 46, COD 1617):

- `gatewayFeeInPaise > 0`: **0**
- `settledInPaise > 0`: **0**
- `settlementDate IS NOT NULL`: **0**

### 2.4 Webhook payload usefulness

Razorpay webhook handler persists `lastWebhookEvent` + `lastWebhookPayload` for `payment.captured` / `payment.failed` / refunds. Captured payment entities **can** include:

- `fee`, `tax` (paise subunits)
- `amount`, `amount_refunded`, `order_id`, `id`
- `acquirer_data.rrn` (acquirer RRN — **not** bank settlement UTR)

They do **not** reliably include `settlement_id` or bank `utr`. Settlement is a later lifecycle.

**No** `settlement.*` webhook events are handled in `razorpay.webhook.ts`.

### 2.5 Zoho

Local Zoho refs on Order / Payment: `zohoInvoiceId`, `zohoInvoiceNo`, `zohoCustomerPaymentId` (in `rawPayload`). **No** settlement ID, UTR, or gateway fee invoice ID stored in Sarveda.

### 2.6 Admin “reconciliation”

`POST /admin/orders/:id/reconcile-razorpay` only re-fetches Razorpay **order payments** and may call `completePaidOrder` — capture repair, **not** bank settlement.

---

## 3. Razorpay Lifecycle

```
Customer checkout
  → Sarveda Order + Payment (PENDING)
  → Razorpay Order (providerOrderId)
  → Customer pays
  → payment.captured / client verify
  → Payment CAPTURED + Order PAID          ← PAYMENT CAPTURE
  → Native ORDER_PAID_V1 (Dr 1020 Clearing)
  → (hours/days later)
  → Razorpay Settlement batch + bank UTR   ← BANK SETTLEMENT
  → Native PAYMENT_GATEWAY_SETTLED (proposed)
  → Bank statement shows UTR credit
```

| Stage | What Sarveda knows today |
|-------|---------------------------|
| Order created | Order totals, items, addresses |
| Razorpay order | `providerOrderId` |
| Capture | `providerPaymentId`, status CAPTURED, optional webhook fee/tax in JSON |
| ORDER_PAID_V1 | Clearing + sales/GST/shipping journals |
| Full refund | Refund row + ORDER_REFUNDED_FULL (Cr clearing) |
| Settlement | **Nothing persisted** |
| Bank deposit | **Nothing** |

**Hard separation:** Capture ≠ Settlement. Capture journals must never credit Bank. Settlement journals must never re-recognize sales revenue.

---

## 4. Settlement Authority

| Authority | Role |
|-----------|------|
| **Primary (Phase 2D)** | Razorpay Settlements API + Settlement Recon (`/v1/settlements`, `/v1/settlements/recon/combined`) |
| **Secondary** | Razorpay Dashboard settlement CSV (import fallback) |
| **Tertiary** | Bank statement UTR match (Phase later — not 2D) |
| **Not authority** | `Payment.settledInPaise` (unused), Order status, Zoho invoice, capture webhook alone |

Commerce `Payment` rows remain evidence of **capture**, linked by `providerPaymentId` ↔ recon `entity_id` (`pay_…`).

---

## 5. Event Model

### 5.1 Event type

**`PAYMENT_GATEWAY_SETTLED`** (provider-agnostic name)  
Calc version tag: **`PAYMENT_GATEWAY_SETTLED_V1`**  
Initial implementation: Razorpay only.

### 5.2 Fields (logical)

| Field | Source |
|-------|--------|
| Authoritative source | Razorpay settlement + recon lines |
| Event / accounting date | Settlement `created_at` / `settled_at` (prefer bank settlement day) |
| Settlement ID | `setl_…` |
| Provider | `RAZORPAY` |
| Gross captured in batch | Σ recon `type=payment.amount` (or credits semantics) |
| Refunds / adjustments in batch | Σ `type=refund` / `adjustment` / `transfer` |
| Gateway fee | Σ line `fee` (recon); settlement object `fees` often **0** for normal settlements — **do not trust header alone** |
| GST on gateway fee | Σ line `tax` |
| Net bank deposit | Settlement `amount` (must equal Σ credits − Σ debits of recon lines for that `settlement_id`) |
| UTR | Settlement `utr` / recon `settlement_utr` |
| Unique idempotency key | `provider:razorpay:settlement:{settlementId}` |
| Accounting period | Open period containing settlement date |
| Reconciliation refs | Links to Payment / Order / ORDER_PAID / ORDER_REFUNDED_FULL events |

### 5.3 Cardinality

**One Razorpay settlement typically contains many payments (and possibly refunds/adjustments).**  
Never assume settlement ≡ one order.

---

## 6. Journal Design (Razorpay)

### 6.1 Capture (already implemented)

```
Dr 1020 Razorpay Clearing     gross_capture
    Cr 4000/210x/4100/4200    (ORDER_PAID_V1 components)
```

### 6.2 Settlement batch (proposed)

For each settlement, build from recon lines + settlement header. Identity that must hold (paise, integer):

```
net_bank = settlement.amount
Σ payment_gross_settled - Σ refund_gross_settled ± adjustments - Σ fees - Σ tax_on_fees = net_bank
```

**Canonical journal (payment-only settlement, fees tax-exclusive):**

```
Dr 1010 Bank                      net_bank
Dr 5100 Payment Gateway Charges   Σ fee
Dr 22xx Input GST                 Σ tax
    Cr 1020 Razorpay Clearing     Σ payment.amount   // gross released from clearing
```

Verify against Razorpay recon arithmetic (docs example):

- `amount` 100000, `fee` 2900, `tax` 0, `credit` 97100  
- `credit + fee + tax = amount` ✓

Use **recon line amounts**, not illustrative rupee examples.

### 6.3 Fail-closed rules

- Imbalance > 2 paise → do not post  
- Missing settlement id / UTR (if required by policy) → `DATA_GAP`  
- Unknown `pay_` not in Sarveda → allocate to clearing suspense / `DATA_GAP` line item (see tests) — do not invent Order  
- Currency ≠ INR in V1 → skip / defer

### 6.4 What not to journal

- Do not re-credit Product Sales on settlement  
- Do not touch Output GST on settlement  
- Do not use capture-time webhook fee as settlement authority (may differ; recon is authoritative)

---

## 7. Refund + Settlement Interaction

Phase 2C already posts:

```
Cr 1020 Razorpay Clearing   (full refund invert)
```

Settlement must **not** double-count that economic reversal.

| Case | Clearing effect | Settlement treatment |
|------|-----------------|----------------------|
| **A. Sale settled, then refund** | Capture Dr clearing; settlement Cr clearing (to 0); refund Cr clearing (negative / payable to gateway) | Later settlement recon `type=refund` **Dr Clearing** (and reduces bank / increases debit) — restores clearing toward 0. Do **not** skip ORDER_REFUNDED_FULL. |
| **B. Refund before settlement** | Capture Dr; refund Cr → clearing ~0 | Settlement may omit payment or include payment+refund netting. Post settlement lines only for **recon present** amounts; expected clearing release = net still owed. |
| **C. Refund deducted from later settlement** | Same as A | Batch journal includes refund debit lines; bank net lower. |
| **D. Refund funded separately by merchant** | Rare / manual | `DATA_GAP` / manual adjustment journal — out of auto V1. |
| **E. Multi sale + refund batch** | Aggregate | One settlement journal; line-level allocation table maps each `pay_` / `rfnd_` |
| **F. Negative / adjustment settlement** | `type=adjustment` | Post to clearing ± expense/income clearance account; fail-closed if unexplained |

**Rule:** `ORDER_REFUNDED_FULL` remains the **revenue reverse**. Settlement only moves **cash / fees / clearing**, using recon debit/credit directions.

---

## 8. Clearing Reconciliation

Accounts: `1020` Razorpay, `1021` Stripe, `1022` PayPal.

```
Opening clearing
+ ORDER_PAID (Dr)
- ORDER_REFUNDED_FULL (Cr)
- PAYMENT_GATEWAY_SETTLED gross release (Cr)
± settlement refund/adjustment clearing legs
= Expected closing clearing
```

Compare to sum of unsettled captured payments (commerce) and to gateway “unsettled” if available.

| Status | Meaning |
|--------|---------|
| `MATCHED` | Clearing 0 (or within 2 paise) for fully settled+refunded set |
| `UNSETTLED` | Sale posted; no settlement allocation yet |
| `PARTIALLY_SETTLED` | Some payments in order/payment set settled, not all (rare per payment) |
| `SETTLEMENT_MISMATCH` | Settlement journal vs recon header amounts disagree |
| `FEE_MISMATCH` | Fee/tax vs recon lines disagree |
| `REFUND_PENDING` | Refund posted; settlement reclaim not yet seen |
| `DATA_GAP` | Missing sale journal, missing Payment map, non-INR, etc. |
| `ERROR` | Builder / guard failure |

---

## 9. Settlement Granularity

**Prefer A — one journal per settlement batch.**

Reasons:

1. Razorpay deposits **one UTR / one net amount** per settlement.  
2. Fees/tax are meaningful at batch + recon-line level.  
3. Matches bank statement line.  
4. One idempotency key per `setl_…`.

**Reject B as primary** (per-order settlement journals): would fragment one bank deposit into N journals and obscure UTR.

### Traceability chain

```
Settlement journal (JE-…)
  ← AccountingPostingEvent uniqueKey provider:razorpay:settlement:{setl}
  ← AccountingDocumentLink documentType=GATEWAY_SETTLEMENT documentId=setl_…
  ← AccountingGatewaySettlement (+ lines)   [recommended]
       → providerPaymentId pay_…
       → Payment.id / Order.id
       → ORDER_PAID uniqueKey order:{orderId}:paid
       → ORDER_REFUNDED_FULL uniqueKey order:{orderId}:refunded_full
```

---

## 10. Data Model Assessment

### 10.1 Existing tables

| Artifact | Can support? |
|----------|--------------|
| `AccountingPostingEvent` | Yes — idempotent event + `payloadJson` |
| `AccountingJournalEntry` / `Line` | Yes — batch journal |
| `AccountingDocumentLink` | Yes — link `GATEWAY_SETTLEMENT` / `PAYMENT` |
| `AccountingAuditLog` | Yes |
| `Payment.settlement*` columns | **Insufficient & unsafe** as authority (unused; writing them mutates commerce) |

### 10.2 Recommended new entity (document only — no migration now)

**`AccountingGatewaySettlement`** (+ optional **`AccountingGatewaySettlementLine`**)

Why dedicated entity (not payload-only):

- Query “which orders in setl_X?”  
- Store full recon snapshot for audit  
- Allocation status per payment without touching `Payment`  
- UTR / fee / tax / net as first-class columns  

Minimal columns (illustrative):

- `provider`, `providerSettlementId` (unique), `utr`, `settledAt`, `currency`  
- `grossInPaise`, `feeInPaise`, `taxInPaise`, `netInPaise`, `rawPayload`  
- `postingEventId` / `journalEntryId`  
- Lines: `entityType`, `providerEntityId`, `paymentId?`, `orderId?`, amounts, fee, tax  

**Phase 2D implementation may start with PostingEvent.payloadJson only** if product wants zero schema change for a spike — but **production-grade V1 should add the settlement tables** before broad backfill.

### 10.3 Do **not** write commerce `Payment.settlementDate` / `settledInPaise` / `gatewayFeeInPaise` in Phase 2D

Keeps commerce isolation. Optional later: read-only denormalized mirror behind an explicit flag — not required.

---

## 11. Gateway Fee Accounting

CoA already has:

- **`5100` Payment Gateway Charges** (EXPENSE) — **sufficient** for Razorpay MDR / platform fee  

Fee amount = Σ recon line `fee` (paise).  
Do not invent fee % in code.

---

## 12. GST on Gateway Fees

CoA:

- `2200` Input CGST  
- `2201` Input SGST  
- `2202` Input IGST  

Razorpay recon exposes a single **`tax`** amount (tax on fee), **not** CGST/SGST split.

**Recommendation for V1 journal:**

1. Post API `tax` to a **single** input tax account chosen by **configured policy** after reviewing Razorpay’s GST tax invoice / SAC treatment for Sarveda’s GSTIN (seller state Karnataka / GSTIN `29…` in ops config).  
2. **Do not assume Input IGST** solely because tax is one field.  
3. Until invoice evidence is confirmed, allow config: `ACCOUNTING_RAZORPAY_FEE_TAX_ACCOUNT=2202` (or split 2200/2201 when invoice shows 9%+9%).  
4. Accounting recognition of tax from recon ≠ automatic ITC claim (see §13).

---

## 13. Razorpay Tax Invoice Boundary

| Layer | Purpose |
|-------|---------|
| **Accounting recognition** | Dr fee + Dr input tax from recon so P&L and clearing match cash |
| **GST ITC documentation** | Requires Razorpay **tax invoice** / e-invoice compliance under GST law |

**Settlement API tax alone is insufficient for claiming ITC.**  
Phase 2D may recognize tax in books for management accounts while marking ITC status `UNVERIFIED_PENDING_TAX_INVOICE` in reconciliation metadata.

---

## 14. Stripe Design (defer)

**Today:** Checkout Session → `payment_intent` capture; webhook `checkout.session.completed`; no balance_transaction / payout handling; fees not stored.

**Future event:** `STRIPE_PAYOUT_SETTLED` (or reuse `PAYMENT_GATEWAY_SETTLED` with provider=STRIPE)

**Authoritative Stripe objects:** Balance Transaction + Payout (net), fees on charge/refund balance transactions.

**Clearing:** `1021`.  
**Out of Phase 2D implementation scope.**

---

## 15. PayPal Design (defer)

**Today:** Order capture / webhook complete; `paypal-rest-sdk` / REST token; no payout fee import.

**Future:** Transaction fee + currency conversion + refund withholding via PayPal reports / Transactions API.

**Clearing:** `1022`.  
**Out of Phase 2D implementation scope.**

---

## 16. Multi-Currency

Sarveda has INR + international Stripe/PayPal paths. Razorpay path is INR-centric.

Settlement V1 must require:

- `currency === "INR"`  
- Bank account in INR  

**Defer:** FX rate, FX gain/loss, provider conversion fee, multi-currency bank.

Non-INR settlements → `DATA_GAP` / skip with explicit code `MULTI_CURRENCY_DEFERRED`.

---

## 17. Bank Account Design

Current CoA: single **`1010 Bank`**.

**Recommendation for Phase 2D:** keep **one** `1010` unless ops proves multiple settlement destination accounts with separate UTRs needing split books.

Do **not** add HDFC/ICICI sub-accounts until bank-statement matching phase requires them.

---

## 18. Import Architecture

| Approach | Safety | Fit |
|----------|--------|-----|
| **A. Provider API read-only importer** | High | **Recommended** |
| B. CSV/XLSX import | High (offline) | Fallback / audit |
| C. Webhook `settlement.processed` | Medium | Optional later signal to enqueue import — not required inside checkout |
| D. Manual admin entry | Low volume | Escape hatch |

**Recommended Phase 2D method:**

1. Admin/worker calls **GET-only** Razorpay `settlements` + `recon/combined`  
2. Persist Accounting settlement evidence  
3. Preview journal → post under flags + production dual guard  
4. **Never** invoke from `completePaidOrder` / checkout / refund.service  

Mutation APIs to **forbid** in importer: `createOndemandSettlement`, refunds, captures, transfers create, etc.

---

## 19. Idempotency

```
eventType: PAYMENT_GATEWAY_SETTLED
uniqueKey: provider:razorpay:settlement:{settlementId}
```

Concurrent / repeated imports → single PostingEvent + single journal (existing `postJournalFromEvent` pattern).

**Corrections:** if Razorpay revises a settlement (rare), do **not** mutate posted journal; post `PAYMENT_GATEWAY_SETTLEMENT_ADJUSTMENT` with new unique key `…:settlement:{id}:adj:{n}` or void+repost under explicit admin tool (Phase later). V1: reject second different payload hash as `SETTLEMENT_MISMATCH`.

---

## 20. Production Safety

Importer / poster must:

- Never mutate Order / OrderItem / Inventory / Invoice / Shipment  
- Never mutate Refund  
- Never mutate Payment **authority** fields (`amount`, status, provider ids)  
- Prefer **not** writing `Payment.settlement*` (commerce isolation)  
- Never call gateway **mutation** APIs  
- Never create/modify Zoho docs  
- Never run inside checkout/payment/refund transactions  
- Feature flags: e.g. `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` + existing `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` on production-like hosts  
- Bulk import guard analogous to `ACCOUNTING_BULK_DISCOVERY_ALLOWED`  
- Default dry-run  

---

## 21. Reconciliation V3

Lifecycle view per payment/order:

```
ORDER_PAID → ORDER_REFUNDED_FULL? → GATEWAY_SETTLEMENT allocation → BANK (UTR)
```

**Per order/payment row:**

- Commerce amount / provider payment id  
- Native sale journal #  
- Native refund journal #  
- Settlement id(s) + allocated gross / fee / tax / net  
- Clearing remaining  
- UTR  
- Status (`UNSETTLED` … `MATCHED`)

**Settlement-batch view:**

- Settlement id, date, UTR, net bank, Σ fee, Σ tax  
- Line grid of pay_/rfnd_/adj_  
- Link to journal  
- Match vs bank (placeholder until bank import)

---

## 22. Historical Settlement Backfill

| Topic | Guidance |
|-------|----------|
| Feasibility | Yes via `settlements.all` + dated `recon/combined` |
| Date range | Start from native accounting go-live / first `ORDER_PAID` shadow date — not full Woo history unless CoA opening balances prepared |
| Pagination | `count`/`skip`; recon day/month loops; respect Razorpay rate limits |
| Missing data | Older settlements without matching Sarveda `pay_` → `DATA_GAP` lines, still post bank/fee if mapped policy allows suspense |
| Duplicates | Idempotency key on settlement id |
| Zoho/bank | Optional cross-check UTR vs bank CSV later — not blocking for shadow |

**Do not backfill in this architecture phase.**

---

## 23. Recommended Phase 2D Implementation Scope

### IN (deliberately small)

- Razorpay only, INR only  
- Read-only settlement + recon importer  
- `AccountingGatewaySettlement` (+ lines) **or** equivalent payload persistence with clear follow-up schema  
- One journal per settlement batch  
- Fee → `5100`; tax → configured Input GST account  
- Clearing Cr `1020` for settled payment gross  
- Refund/adjustment legs per recon  
- Idempotency + preview/post admin APIs  
- Flags + production dual guard  
- Reconciliation V3 (sale/refund/settlement/clearing)  
- Bounded historical import tool (dry-run default)

### DEFER

- Stripe / PayPal settlements  
- Multi-currency / FX  
- Bank statement auto-match  
- Writing commerce `Payment.settlement*`  
- Partial refund GST allocation  
- COD collection  
- ITC automation from tax invoices  
- On-demand settlement creation  

---

## 24. Required Tests

1. Simple Razorpay settlement (one payment)  
2. Multiple payments one settlement  
3. Settlement with refund line  
4. Fee + GST on fee (tax-exclusive identity)  
5. Odd paise / 2-paise tolerance  
6. Duplicate import  
7. Concurrent import  
8. Missing Sarveda payment (`pay_` unknown)  
9. Unknown / malformed settlement  
10. Partial settlement state on payment set  
11. Amount mismatch fail-closed  
12. Settlement before ORDER_PAID discovery (`SALE_JOURNAL_REQUIRED` / skip allocation)  
13. Already refunded payment in batch  
14. Negative adjustment line  
15. Feature flag off → dry-run only  
16. Production guard blocks persist  
17. Assert **zero** Order/Payment/Refund row mutations  
18. Assert importer uses GET-only (mock; no refund/capture calls)  
19. Reconciliation V3 statuses  
20. Non-INR skipped  

---

## 25. Files Inspected

| Area | Paths |
|------|-------|
| Schema | `backend/prisma/schema.prisma` (Payment, Accounting*) |
| Migration init | `backend/prisma/migrations/20260509171114_init/migration.sql` |
| Razorpay | `razorpay.ts`, `razorpay.verify.ts`, `razorpay.webhook.ts`, `razorpay.client.ts` |
| Stripe | `stripe.service.ts`, `stripe.webhook.ts`, `stripe.checkout.ts` |
| PayPal | `paypal.ts`, `paypal.complete.ts`, `paypal.webhook.ts` |
| Refunds | `refund.service.ts` |
| Admin | `admin.handlers.ts` (reconcile-razorpay), `reports.handlers.ts` |
| Zoho | `zoho-financials.ts` (payment mode; no settlement) |
| Accounting | `seed-coa.ts`, `order-paid.*`, `order-refunded-full.*`, `reconciliation.service.ts`, `production-guard.ts` |
| SDK | `node_modules/razorpay` (`settlements.js`: `all`, `fetch`, `reports`) |
| Docs | Razorpay Settlements + Fetch Settlement Recon |
| Live DB (read-only) | Lightsail `sarveda_db` aggregates for fee/settled/date |

---

## 26. Code Modification Statement

**No source changes, schema changes, migrations, DB writes, provider mutation calls, settlement imports, or production accounting posts were performed for this Phase 2D architecture document.**

Only this file was created:

`SARVEDA_ACCOUNTING_PHASE2D_SETTLEMENT_ARCHITECTURE.md`

---

READY FOR PHASE 2D SETTLEMENT IMPLEMENTATION
