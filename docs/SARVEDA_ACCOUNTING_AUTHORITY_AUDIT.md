# SARVEDA Accounting Authority Audit

**Date:** 2026-09-02  
**Scope:** Read-only architecture audit (no code / DB / env / Zoho / gateway changes)  
**Environments inspected:** Local backend `.env`, Lightsail production-bound `backend/.env` (flags only; secrets not printed)

---

## Executive answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Is Zoho Books **required** for production order/refund/accounting correctness? | **No** for customer money movement, order/payment/refund status, native GST invoice PDF, inventory restock, and gateway refunds. |
| 2 | Is Zoho **optional / secondary** sync? | **Yes** for Books documents (invoice, customer payment, credit notes). Auto-invoked but non-blocking on commerce success paths. |
| 3 | Is Zoho unused/dead? | **No** — live secondary sync + admin tools + optional inventory webhook path. Inventory *push/pull* is default-off (`ZOHO_INVENTORY_SYNC`). |
| 4 | Can native Sarveda operate with Zoho completely disabled? | **Yes for commerce.** Native GL journals are designed to be independent; on Lightsail they are **flag-ready but fail-closed** until `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`. |
| 5 | Which flows still call Zoho automatically? | Paid-order invoice + payment + stock mirror; full-refund credit note (fire-and-forget); partial-refund credit note (staged); unpaid cancel void; optional webhook stock overwrite if wired. |

### Verdict (section 9)

**A. NATIVE ACCOUNTING IS AUTHORITATIVE — ZOHO OPTIONAL/SECONDARY**

Commerce + gateway truth live in Sarveda. Zoho Books is a downstream mirror. Native GL is the intended books of record when production posting is explicitly allowed.

---

## SALE_AUTHORITY

### Call order (paid online order)

1. Gateway capture / verify (`completePaidOrder` / Stripe / PayPal complete)
2. Payment row → `CAPTURED`; order → `PAID`; stock confirm
3. `afterOrderPaid(orderId)` (idempotent via `afterPaidRanAt`)
   - Native GST invoice PDF (`ensureOrderInvoicePdf`) — async, logged on failure
   - Confirmation email / coupon / cart clear / digital fulfill
   - **`await createZohoInvoiceForOrder`** — errors caught; order stays paid
   - **`void recordZohoPaymentForOrder`** — fire-and-forget
   - **`void mirrorOrderStockToZoho`** — fire-and-forget; no-op when `ZOHO_INVENTORY_SYNC` off
   - Optional auto-fulfillment → `PROCESSING`
4. Native `ORDER_PAID` journal — **not inline**. Posted later via accounting **discovery worker** / admin post APIs when sales posting + production guard allow.

### What makes the native order financially complete?

- Gateway payment captured
- Sarveda `Payment` + `Order` status committed
- Stock confirmed
- Native invoice PDF attempt (best-effort)
- Native `ORDER_PAID` journal when posting flags allow (shadow/discovery path)

Zoho invoice/payment IDs on the order are **not** required for completeness.

### If Zoho is unavailable

| Concern | Behavior |
|---------|----------|
| Customer payment / order completion | **Succeeds** |
| Native PDF / email / stock | Unaffected |
| Zoho invoice | Logged failure; retryable via admin Zoho routes |
| Native journal | Independent of Zoho |

### Zoho retry

- Invoice: awaited inside try/catch — **does not roll back** payment
- Customer payment + stock mirror: **async non-blocking**
- Idempotent on `order.zohoInvoiceId` / payment payload `zohoCustomerPaymentId`

---

## FULL_REFUND_AUTHORITY

### Trace

1. Admin/full refund path reserves refund → **gateway refund** → `finalizeGatewayRefund`
2. If fully refunded: **`void createZohoRefundDocumentsForOrder(...).catch(...)`** (credit note + Zoho refund)
3. Email `refund_initiated`
4. Native `ORDER_REFUNDED_FULL` via **refund discovery / admin post** (not hard-coupled to gateway step)

### Answers

| Question | Answer |
|----------|--------|
| Zoho credit note mandatory? | **No** |
| Native correct if Zoho fails after gateway? | **Yes** for money/order; native GL depends on refund posting flags/guard |
| Retry Zoho risk re-refunding gateway? | **No** — Zoho helpers idempotent on stored Zoho IDs; full-refund Zoho is separate fire-and-forget |
| Order/refund blocked on Zoho? | **No** |

---

## PARTIAL_REFUND_AUTHORITY

### Trace (`executeAuthoritativePartialRefund`)

Stages (`RefundSettlementStage`):

`RESERVED` → `GATEWAY_SUCCEEDED` → `ACCOUNTING_POSTED` → `ZOHO_SYNCED` → `COMPLETE` (or `FAILED` on gateway)

1. Reserve refund row + source linkage  
2. Gateway refund  
3. `finalizeGatewayRefund` → stage `GATEWAY_SUCCEEDED`  
4. `postOrderRefundedPartial(spec)` → stage `ACCOUNTING_POSTED` (catch → stay gateway-succeeded; **no gateway rollback**)  
5. `createZohoPartialCreditNoteForRefund` → stage `ZOHO_SYNCED` (catch → store `zohoSyncError`; **no rollback**)  
6. Both accounting + Zoho → `COMPLETE`  
7. `retryPartialRefundSettlementStages` retries accounting/Zoho **only** — never re-hits gateway  

### Answers

| Question | Answer |
|----------|--------|
| Complete safely with Zoho disabled? | **Yes** for money/order; stage may stop at `ACCOUNTING_POSTED` or `GATEWAY_SUCCEEDED` |
| Which stage is Zoho? | `ZOHO_SYNCED` (and `COMPLETE` requires Zoho after accounting) |
| Zoho failure operational vs integrity? | **Operational** for Books mirror; financial money movement already done at gateway |
| Native GL depend on Zoho response? | **No** — posted before Zoho; Zoho uses refund amount / invoice lines |

**Lightsail note:** `postOrderRefundedPartial` calls `assertRefundPostingPersistenceAllowed()`. With `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=0` on production-like DB, accounting stage can fail-soft even though refund money succeeded. That is a native posting gate, not a Zoho dependency.

---

## RTO_RETURN_AUTHORITY

| Flow | Money / refund engine | Zoho role |
|------|----------------------|-----------|
| RTO refund | `executeAuthoritativePartialRefund` (`sourceType` RTO, shipping-retained policy) | Secondary CN after accounting |
| Customer return refund | same settlement service via return-replacement | Secondary |
| Damaged / partial qty return | calculator → same settlement | Secondary |

Zoho is **not** in the authoritative financial decision (amount, policy, eligibility). It mirrors after gateway (+ native journal attempt).

---

## SUPPLEMENTARY_PAYMENT_AUTHORITY

| Aspect | Finding |
|--------|---------|
| Native event | `postOrderSupplementaryPaid` after capture (Razorpay/Stripe paths) |
| Zoho invoice/debit | **No automatic Zoho call** in `supplementary-payment.service.ts` |
| Blocks if Zoho missing? | **No** |
| Operational friction | Adjustment calculator marks `ACCOUNTING_REVIEW_REQUIRED` when **`order.zohoInvoiceId` already exists** (document presence, not live Zoho API) for non-address changes |
| Status | **P1/manual-review** for Zoho Books line-item parity; commerce can proceed with review flags |

---

## ZOHO_ROLE — production call sites

| Call site | Classification |
|-----------|----------------|
| `afterPaid` → `createZohoInvoiceForOrder` | **SECONDARY_SYNC** (auto, non-blocking on failure) |
| `afterPaid` → `recordZohoPaymentForOrder` | **SECONDARY_SYNC** (async) |
| `afterPaid` → `mirrorOrderStockToZoho` | **OPTIONAL** (default off via `ZOHO_INVENTORY_SYNC`) |
| Full refund → `createZohoRefundDocumentsForOrder` | **SECONDARY_SYNC** (fire-and-forget) |
| Partial refund → `createZohoPartialCreditNoteForRefund` | **SECONDARY_SYNC** (staged; not money-authoritative) |
| Cancel unpaid → `voidZohoInvoiceForCancelledOrder` | **SECONDARY_SYNC** |
| Admin `POST /api/zoho/...` manual sync | **OPTIONAL** / operator |
| `/api/zoho/webhook` stock overwrite | **OPTIONAL / LEGACY risk** if enabled externally — inventory master is Sarveda; webhook can still mutate `onHand` |
| Zoho stock sync job / push-pull | **OPTIONAL** (`ZOHO_INVENTORY_SYNC`, absent/off on LS) |
| Marketplace Zoho Books historical analytics | **OPTIONAL** read models (not checkout authority) |
| Native discovery / posting services | **AUTHORITATIVE** (intended GL) when flags + production guard allow |

Nothing in the sale/refund money path treats Zoho success as **AUTHORITATIVE**.

---

## FAILURE_BEHAVIOR (Zoho unavailable)

| Flow | A Money | B Native GL balanced* | C Order state | D Retry safe | E Stuck? |
|------|---------|----------------------|---------------|--------------|----------|
| SALE | Yes | Independent | Paid | Yes (idempotent invoice) | No |
| FULL REFUND | Yes | Independent | Refunded | Yes | No |
| PARTIAL REFUND | Yes | Independent | Partial/full refund status from gateway finalize | Yes (`retryPartialRefundSettlementStages`) | Stage may stay non-`COMPLETE` until Zoho/accounting retry |
| RTO / RETURN REFUND | Yes | Independent | Same as partial | Yes | Same stage caveat |
| SUPPLEMENTARY PAYMENT | Yes | Independent | Adjustment executes after capture | N/A for Zoho | No Zoho block |

\*Native GL balance requires posting flags + on Lightsail **`ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`**. With guard off, journals may not persist; commerce still correct.

---

## FEATURE_FLAGS

### Lightsail (production-bound)

| Flag | Value |
|------|-------|
| `NATIVE_ACCOUNTING_ENABLED` | **1** (enabled) |
| `ACCOUNTING_SALES_POSTING_ENABLED` | **1** |
| `ACCOUNTING_REFUND_POSTING_ENABLED` | **1** |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` | **1** |
| `ACCOUNTING_GST_ENABLED` | **1** |
| `ACCOUNTING_GST_REPORTING_ENABLED` | **1** |
| `ACCOUNTING_REPORTS_ENABLED` | **1** |
| `ACCOUNTING_COGS_POSTING_ENABLED` | **1** |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | **0** (persistence blocked on production-like DB) |
| `ZOHO_INVENTORY_SYNC` | **ABSENT** → treated as off |
| `ZOHO_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN` / `ORGANIZATION_ID` | **PRESENT** |
| `ZOHO_BOOKS_BASE_URL` | present (`zohoapis.in`) |
| `ZOHO_SALES_TAX_ID` | **ABSENT** |
| `AUTO_START_FULFILLMENT_ON_PAID` | **ABSENT** |

### Local backend `.env`

| Flag | Value |
|------|-------|
| Native accounting flags | **ABSENT** → module default **off** |
| Zoho OAuth/org credentials | **PRESENT** |
| `ZOHO_INVENTORY_SYNC` | **ABSENT** (off) |
| `ZOHO_SALES_TAX_ID` | **ABSENT** |

Defaults in code/`.env.example`: native accounting and Zoho inventory sync **off** until explicitly enabled.

---

## P0 / P1 / P2

### P0
- None for “Zoho required for money correctness” — it is not.
- **Do not** treat Zoho CN success as launch-blocking for refunds.

### P1
- Decide when to set **`ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`** on Lightsail so native journals become live books of record (currently fail-closed).
- Confirm operators use `retryPartialRefundSettlementStages` for `GATEWAY_SUCCEEDED` / Zoho error stages (never re-refund).
- Adjustment UX: `zohoInvoiceId` forces accounting review — document as operational policy, not money blocker.
- Audit whether Zoho **webhook** is registered in Zoho console; if yes, treat stock webhook as P1 risk vs Sarveda-as-master.

### P2
- Supplementary payment has **no** Zoho debit/invoice automation — Books parity may need manual CN/invoice or future sync.
- `ZOHO_SALES_TAX_ID` absent may weaken Zoho tax lines vs native GST (Books mirror quality only).
- Full-refund Zoho path is less staged than partial (fire-and-forget) — optional hardening to settlement stages.

---

## TEST PLAN IMPACT (section 10)

Because verdict is **A**:

### Remove from mandatory launch acceptance
- Zoho invoice created on every paid order
- Zoho customer payment recorded
- Zoho credit note on every full/partial/RTO/return refund
- Zoho availability during checkout / refund UAT

### Keep as optional / secondary integration tests
- Zoho invoice + payment idempotent sync when credentials present
- Partial CN + `RefundSettlementStage` → `COMPLETE`
- Admin manual `/api/zoho` re-sync
- Inventory sync only if `ZOHO_INVENTORY_SYNC=1` (default off)

### Launch authority tests (mandatory)
- Gateway capture → order `PAID` / payment `CAPTURED`
- Native invoice PDF generation path
- Cart/stock confirm/release
- Full & partial gateway refunds + Sarveda refund rows + order payment status
- RTO / return refund policy amounts without Zoho
- Supplementary capture + order adjustment application
- Native journal **preview**/post when flags allow; on Lightsail assert production-guard behavior explicitly
- GST figures from native order/tax snapshots / journals (not Zoho)

---

## Summary matrix

| Domain | Authority |
|--------|-----------|
| SALE_AUTHORITY | Sarveda commerce + gateway; Zoho invoice/payment secondary |
| FULL_REFUND_AUTHORITY | Gateway + Sarveda refund finalize; Zoho CN secondary |
| PARTIAL_REFUND_AUTHORITY | Gateway + optional native journal; Zoho stage secondary |
| RTO_RETURN_AUTHORITY | Same as partial settlement; Zoho mirror only |
| SUPPLEMENTARY_PAYMENT_AUTHORITY | Native capture + adjustment; no auto Zoho; review if Zoho invoice id exists |
| ZOHO_ROLE | Optional secondary Books sync (+ optional inventory tools) |
| FAILURE_BEHAVIOR | Commerce continues; stages/logs for Books catch-up |

---

**SARVEDA ACCOUNTING AUTHORITY AUDIT COMPLETE — READY FOR FINAL UAT PLAN**
