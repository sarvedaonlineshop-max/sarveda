# SARVEDA CUSTOMER CHECKOUT + PAYMENT LIFECYCLE
## READ-ONLY PRE-LAUNCH AUDIT

**Date:** 2026-08-30  
**Scope:** Customer-facing checkout / payment only (not admin accounting redesign)  
**Constraint:** Code and DB were **not** modified for this audit  

---

## Executive summary

Sarveda creates a **real `Order` in `PENDING_PAYMENT` before the customer completes payment** (online gateways). That is intentional and acceptable if retries correctly **reuse** that order when the cart is unchanged.

**Observed historical bug (pre–cart-fingerprint fix):** closing Stripe/Razorpay/PayPal and clicking Pay Now again often **resumed a stale pending order** *or* **created a new order after cart change without a clear UX story**. A recent frontend fix stores a **cart fingerprint** and only resumes when the live cart still matches; otherwise `create-order` runs and the backend **cancels the recent unpaid order** (20‑minute window) then creates a new one.

**Desired model:**

> ONE LOGICAL PURCHASE → ONE SARVEDA ORDER → ZERO/MANY PAYMENT ATTEMPTS → AT MOST ONE SUCCESSFUL PAYMENT

**Current model (code):**

| Layer | Reality |
|--------|---------|
| Sarveda Order | One row per successful `create-order` (or COD place) |
| Payment row | Typically **one `Payment` per Order** on create; resume **updates** the same row |
| Gateway sessions | Razorpay **reuses** `providerOrderId`; Stripe/PayPal **mint new sessions** on each resume |
| Retry (same cart, post-fingerprint) | Frontend **resumes** same Order via `GET /checkout/resume` |
| Retry (cart changed / no fingerprint) | Frontend **create-order** → backend **cancels** recent pending → **new** Order |

---

## 1. Complete customer flow (traced)

### Shared path (all methods)

| Step | Frontend | Backend |
|------|----------|---------|
| Add to cart | `cartAdd` (`frontend/lib/cart-api.ts`) → `POST /api/cart/add` | cart module |
| Cart | `CartPageClient`, `CartProvider` | `GET /api/cart` |
| Checkout page | `CheckoutClient` → `AddressFields`, shipping estimate, coupon, `PaymentSelector` | shipping rates, coupon APIs |
| Pay Now | `PaymentSelector.onSubmit` → `resolvePayableOrder` | see below |
| Success UI | `/order/confirmed` | public order fetch |
| Fail / dismiss UI | `/payment-failed` | public order fetch |

### Online: create vs resume

```
Pay Now
  └─ resolvePayableOrder()
       ├─ IF sessionStorage pending matches cart fingerprint + email + payment mode
       │     → GET /api/checkout/resume
       │     → reuse Sarveda Order + Payment
       │     → Razorpay: same rzp order_id
       │     → Stripe/PayPal: NEW gateway session, same Payment row
       └─ ELSE
             → POST /api/checkout/create-order
             → cancel recent PENDING_PAYMENT (≤20 min) for same user/email
             → create Order PENDING_PAYMENT + Payment PENDING
             → reserve stock
             → create gateway order/session
             → schedule 15‑min payment timeout
```

### Razorpay

| Step | Location |
|------|----------|
| Pay Now | `PaymentSelector` → `openRazorpay` |
| Create | `createCheckoutOrder` → Razorpay Orders API; store `payment.providerOrderId` |
| Resume | Reuse `payment.providerOrderId` as `rzpOrderId` |
| Client success | `POST /api/payments/razorpay/verify` → `completePaidOrder` → cart clear → `afterOrderPaid` |
| Webhook | `POST /api/payments/razorpay/webhook` (`payment.captured` / `payment.failed`) |
| Modal dismiss | `/payment-failed?outcome=dismiss` |

### Stripe

| Step | Location |
|------|----------|
| Create / resume | `createStripeCheckoutSession` (`stripe.checkout.ts`) — **new Checkout Session every time** |
| Redirect | Hosted `checkout.stripe.com` |
| Success URL | `/order/confirmed?...&stripe=1` (page waits for webhook; may send to pending fail page) |
| Cancel URL | `/payment-failed?...&outcome=dismiss` |
| Paid transition | **Webhook only** `checkout.session.completed` → `completeStripePaidOrder` |

### PayPal

| Step | Location |
|------|----------|
| Create / resume | `createPayPalOrder` — **new PayPal order every resume** |
| Return | `/checkout/paypal-return` → `POST /api/payments/paypal/capture` |
| Webhook | `PAYMENT.CAPTURE.COMPLETED` / DENIED / refunds |

### COD

| Step | Location |
|------|----------|
| Place | `create-order` with `paymentMethod: cod` |
| Immediate | Order → `PAID`, stock **confirmed**, invoice **row** upserted, `afterOrderPaid`, `codConfirmed: true` |
| No | Gateway, payment timeout, resume |

---

## 2. Exact Sarveda Order creation point

| Question | Answer |
|----------|--------|
| What triggers create-order? | `PaymentSelector.resolvePayableOrder` → `createOrder()` when resume is not allowed |
| Only on Pay Now? | **YES** for online/COD place (not on page load / address change alone) |
| Order before gateway? | **YES** (DB order + payment, then gateway for online) |
| Initial order status | `PENDING_PAYMENT` (online) / `PAID` (COD) |
| paymentStatus | `PENDING` (online); COD order `PAID` with payment still `PENDING` |
| fulfillmentStatus | Default `UNFULFILLED` |
| Stock reserved? | **YES** online (`reserveStockTx`); COD **confirms** immediately |
| Cart cleared on create? | **NO** |
| Attribution snapshotted? | **YES** on create (`createOrderAttributionInTx`) |
| Invoice PDF yet? | **NO** for online pending; COD gets invoice **row** then PDF via `afterOrderPaid` |

**Key files**

- `frontend/components/checkout/PaymentSelector.tsx`
- `frontend/lib/checkout-api.ts`
- `backend/src/modules/checkout/checkout.service.ts` (`createCheckoutOrder`)
- `backend/src/modules/checkout/checkout.routes.ts` / `checkout.controller.ts`

---

## 3. Pay Now double / repeat behavior (same cart)

### Current code (with cart fingerprint)

| Step | Behavior |
|------|----------|
| 1st Pay Now | `create-order` → Order A `PENDING_PAYMENT` → gateway opens → `savePendingCheckout(..., cartFingerprint)` |
| Close modal / abandon | Order A remains `PENDING_PAYMENT` until timeout (15 min) or supersede |
| 2nd Pay Now, **same cart** | Frontend **resumes** Order A (`GET /checkout/resume`) — **does not** call create-order |
| 2nd Pay Now, **cart changed** | Pending cleared / fingerprint mismatch → **create-order** → cancel Order A (if ≤20 min) → Order B |

### Exact answers for “same cart, close, Pay again”

| Question | Answer (current code) |
|----------|------------------------|
| Frontend calls POST create-order again? | **NO** (if fingerprint + email + mode match) |
| Backend creates fresh Sarveda Order? | **NO** on resume path |
| Finds existing pending? | Resume loads by `orderNumber` + email |
| Cancels prior? | Only on **create-order** supersede path |
| Reuses prior Order? | **YES** on resume |
| New gateway order only? | Razorpay: **reuse** RZP order; Stripe/PayPal: **new** session/order, same Payment row |

### Pre-fingerprint / legacy pending

Pending without `cartFingerprint` is **cleared** and forces create-order (defensive against stale Stripe totals).

---

## 4. Resume pending checkout

| Item | Detail |
|------|--------|
| API | `GET /api/checkout/resume?orderNumber=&email=` → `resumePendingCheckout` |
| Frontend entry | `sessionStorage` pending after first Pay Now; payment-failed “Try payment again (same order)” sets `?orderNumber=` (banner/prefill). **`resumeOrderNumber` prop is currently unused inside `resolvePayableOrder`** — actual resume gate is fingerprint match on pending storage |
| Auto on normal Pay Now? | **YES**, when pending matches cart fingerprint |
| Time limit (resume API) | **None** beyond order still `PENDING_PAYMENT` + pending Payment exists |
| Practical expiry | 15‑min BullMQ timeout cancels unpaid; 20‑min supersede on new create |
| Refuse when | Wrong email; not `PENDING_PAYMENT`; no `PENDING` payment; frontend mode/fingerprint mismatch |

**Does resume re-price from live cart?** **NO** — uses frozen `order.grandTotalInPaise` (hence fingerprint gate is mandatory).

---

## 5. Cancel recent unpaid order (create-order)

**Location:** `checkout.service.ts` ~466–491  

| Property | Value |
|----------|--------|
| Window | **20 minutes** |
| Match | Logged-in: `customerId`; Guest: `email` + `customerId: null` |
| Status | `PENDING_PAYMENT` only |
| Cart matching | **None** — any recent pending for that customer/email |
| Action | `cancelUnpaidOrderWithRelease(..., "Superseded by new checkout attempt")` |
| Side effects | Release reserved stock; payment → `FAILED`; order → `CANCELLED` |

**Intent:** Defensive abandoned-checkout cleanup so a new attempt does not double-reserve stock. Not a full “abandoned checkout product,” but intentional.

---

## 6. Payment attempt model

| Concept | Cardinality in practice |
|---------|-------------------------|
| Order → Payment rows | Schema allows many; **create creates one**; resume does **not** insert another |
| Order → Gateway sessions | Razorpay: 1 order_id reused; Stripe/PayPal: many sessions over time on **same** Payment (`providerOrderId` overwritten) |
| Successful captures | Guarded by `providerPaymentId` uniqueness checks + order already PAID early returns |

**Verdict:** **PARTIAL** support for “many payment attempts per Order” — logically one Payment row; Stripe/PayPal attempt multiplicity is gateway-side, not a first-class `PaymentAttempt` table.

---

## 7. Razorpay specifics

| Topic | Behavior |
|-------|----------|
| When RZP order created | Inside create transaction |
| Stored as | `Payment.providerOrderId` |
| Resume | Reuses same id |
| Retry after close | Same RZP order (if resume) |
| Verify | Client HMAC + webhook `payment.captured` |
| Idempotency | Existing `providerPaymentId` + CAPTURED → no-op |
| Failed payment webhook | Cancels unpaid order + email |

---

## 8. Stripe specifics

| Topic | Behavior |
|-------|----------|
| Creation | Stripe **Checkout Session** (not a long-lived PaymentIntent API surface in app code) |
| Amount | Snapshot from Order |
| Resume / retry | **New** Checkout Session each time; updates `providerOrderId` |
| Idempotency | Redis on create-order; webhook dup by `providerPaymentId` |
| Paid | Webhook `checkout.session.completed` only |
| Cancel | Hosted cancel → `/payment-failed` |

---

## 9. PayPal specifics

| Topic | Behavior |
|-------|----------|
| Creation | PayPal order on create/resume |
| Resume | **New** PayPal order each resume |
| Capture | Return page + webhook |
| Dup protection | CAPTURED / provider payment id checks |

---

## 10. COD

Intentionally different: Place Order → Order `PAID`, stock confirmed, `afterOrderPaid`, no gateway, no timeout, not resumeable as online pending.

---

## 11. Browser back / close / refresh matrix

| Case | Expected DB state |
|------|-------------------|
| A. Close gateway modal | Order stays `PENDING_PAYMENT` until timeout/supersede |
| B. Browser Back | Same; cart kept |
| C. Refresh checkout | Pending in sessionStorage may still resume if fingerprint matches |
| D. Close tab | Order remains until 15‑min job or 20‑min supersede |
| E. Payment fails | Webhook/fail path → cancel unpaid + FAILED payment (gateway-dependent) |
| F. Network drop after pay | Webhook or verify/poll should still complete; cart may clear via webhook `afterOrderPaid` (logged-in) |
| G. Pay success, redirect lost | Webhook should still mark PAID; customer can open orders |
| H. Webhook before verify | Idempotent complete; verify returns already paid |
| I. Verify before webhook | Idempotent; webhook treats as duplicate |

---

## 12. Inventory

| Event | Effect |
|-------|--------|
| create-order (online) | `reserved += qty` |
| Paid | `confirmStockTx` (onHand−, reserved−) |
| Cancel / timeout / supersede | `releaseStockTx` |
| Risk double reserve | Mitigated by cancel-before-create (20 min) + single-order reserve |
| Oversell | Guarded at reserve time if available qty insufficient |

**Reservation expiry:** effectively **15 minutes** via payment timeout job (not a separate reservation TTL table).

---

## 13. Cart

| Event | Cart |
|-------|------|
| create-order | Kept |
| Abandon | Kept |
| Paid (verify / afterPaid / confirmed page) | Cleared |
| Retry same cart | Same cart lines; order snapshot already frozen on Order items |

Order line snapshots are independent of later cart edits.

---

## 14. Attribution

| Path | Snapshot |
|------|----------|
| create-order | **Yes** (new Order → new attribution row) |
| resume | **No overwrite** |
| Impact of cancel+recreate | Multiple Orders → multiple attribution rows; only paid ones should drive “converted” analytics if reports filter by paid |

---

## 15. Invoice / accounting

PENDING_PAYMENT / abandoned do **not** run paid Tax Invoice PDF / sales journal / GST liability / COGS / revenue / shipment via `afterOrderPaid` (gated on paid / COD placed).

Intentional pre-payment records: Order, OrderItems, Payment PENDING, stock reservation, attribution, optional status history.

---

## 16. Admin experience

Repeated abandons can produce:

```
SRV-001 CANCELLED (superseded / timeout) — unpaid attempt
SRV-002 CANCELLED
SRV-003 PAID
```

Admin abandoned-checkout bucketing (`abandoned-checkout.ts` / admin handlers) treats unpaid cancels and aged `PENDING_PAYMENT` as **abandoned/attempted**, distinct from “genuine” cancelled (e.g. COD / captured refunds).  

**Impact:** Order list noise and raw order counts rise; conversion/attribution reports must filter **paid** (or use abandoned buckets). Customer “My orders” should not treat superseded unpaid as successful purchases (status CANCELLED / pending).

---

## 17. Idempotency guards

| Guard | Mechanism |
|-------|-----------|
| Frontend Pay Now | `payStarted` / busy flags |
| create-order | `Idempotency-Key` header → Redis 30 min (`checkout:idem:{key}:{country}:{method}`); key includes cart fingerprint from FE |
| Razorpay verify / webhooks | `providerPaymentId` + already PAID |
| Stripe / PayPal complete | Same pattern |
| afterOrderPaid | `Order.afterPaidRanAt` once |
| Webhook retries | Duplicate → 200 idempotent |

---

## 18. Comparison to desired principle

| Desired | Current |
|---------|---------|
| One Order per logical purchase | **Mostly**, if fingerprint resume works; else cancel+new Order |
| Many payment attempts | **Partial** (gateway sessions; not a PaymentAttempt entity) |
| At most one successful payment | **Yes** (idempotent complete) |

---

## 19. When should a new Order be created? (recommendation)

Create a **new** Order only when:

- Cart fingerprint changes (lines/qty)
- Currency / payment method family forces incompatible snapshot
- Grand total / shipping / discount materially changes (today fingerprint is lines-only — **shipping/coupon changes alone may still resume**)
- Pending Order expired/cancelled
- Customer identity changes
- Prior Order already paid

**Reuse window:** while Order is `PENDING_PAYMENT` and within payment timeout (~15 min), prefer resume.

**Gap to note:** fingerprint is **variantId:qty only** — not shipping address, coupon, or computed total. Address/shipping change with same lines can resume an order with outdated shipping amount until create-order is forced another way.

---

## 20. Gateway vs Sarveda IDs

| ID | Reuse on retry (same Order resume)? |
|----|--------------------------------------|
| Sarveda Order number | **Yes** |
| Payment.id | **Yes** |
| Razorpay order_id | **Yes** |
| Stripe Checkout Session | **No** — new session |
| PayPal order id | **No** — new order |
| providerPaymentId (capture) | Set once on success |

---

## 21. Abandoned checkout model (recommendation)

**Minimal pre-launch-safe approach: D + harden A**

- Keep `PENDING_PAYMENT` Orders
- Prefer **reuse** (resume) when cart fingerprint (+ ideally total) matches
- Keep cancel-on-supersede for cart changes
- Filter abandoned in admin metrics
- **Avoid** a large CheckoutSession rewrite before launch

Optional later: dedicated AbandonedCheckout analytics table — not required to ship.

---

## 22. Frontend UX

| After close gateway | Today |
|---------------------|------|
| Redirect | Often `/payment-failed` with Try again |
| Silent new order | Avoided when fingerprint matches; on cart change create-order is silent aside from new order number at gateway |
| Clarity | Improved by “Try payment again (same order)” vs “Checkout with current cart” on payment-failed |

Further UX: on checkout, if pending matches, show “Continue payment for SRV-…” — not implemented as primary banner for all cases.

---

## 23. FINAL VERDICT

| # | Question | Answer |
|---|----------|--------|
| **A** | Order created before payment | **YES** |
| **B** | Architecturally acceptable | **YES** (with resume + timeout + supersede) |
| **C** | Repeat Pay Now creates new Sarveda Order | **NO** if same cart fingerprint; **YES** if cart changed / no pending / create path |
| **D** | Previous pending after retry (create path) | **CANCELLED** + stock released (“Superseded…”) if ≤20 min |
| **E** | Same Order can be resumed | **YES** |
| **F** | Normal frontend automatically uses resume | **YES** (fingerprint match) |
| **G** | Multiple payment attempts per Order | **PARTIAL** |
| **H** | Razorpay order reused on retry | **YES** (resume) |
| **I** | Stripe PaymentIntent/session reused | **NO** (new Checkout Session) |
| **J** | PayPal order reused | **NO** |
| **K** | Duplicate order risk | **LOW–MEDIUM** if fingerprint missing/legacy or shipping-only change; mitigated for line changes |
| **L** | Double-payment risk | **LOW** (idempotent capture) |
| **M** | Inventory reservation risk | **LOW** (cancel releases; 15‑min timeout) |
| **N** | Attribution/reporting impact | Abandoned Orders inflate attempt counts; paid filter required |
| **O** | Acceptable for launch | **YES**, with awareness of fingerprint scope + admin abandoned noise |
| **P** | Recommended change before launch | **SMALL** |
| **Q** | Exact minimal change | Extend fingerprint to include **currency + grand total (or shipping+discount)**; wire `?orderNumber=` resume only when fingerprint matches; ensure payment-failed CTAs stay clear |
| **R** | Backend changes required | Optional: reject resume if client sends mismatched cart total; else none mandatory |
| **S** | Frontend changes required | Small fingerprint/total hardening + UX copy |
| **T** | Schema changes required | **NONE** for launch |
| **U** | Payment-provider changes required | **NONE** |
| **V** | Regression tests required | Same-cart retry (all gateways); cart-change retry; webhook-before-verify; 15‑min timeout; double Pay Now click |

---

## Key file index

| Area | Path |
|------|------|
| Pay Now / resume FE | `frontend/components/checkout/PaymentSelector.tsx` |
| Pending storage | `frontend/lib/pending-checkout.ts` |
| Checkout API FE | `frontend/lib/checkout-api.ts` |
| Create / resume BE | `backend/src/modules/checkout/checkout.service.ts` |
| Cancel unpaid | `backend/src/modules/orders/orders.service.ts` |
| After paid | `backend/src/modules/orders/afterPaid.ts` |
| Timeout job | `backend/src/jobs/paymentTimeoutJob.ts` |
| Razorpay | `razorpay.verify.ts`, `razorpay.webhook.ts` |
| Stripe | `stripe.checkout.ts`, `stripe.service.ts`, `stripe.webhook.ts` |
| PayPal | `paypal.ts`, `paypal.complete.ts`, `paypal.webhook.ts` |

---

## Direct answer to the opening concern

> Cart → Checkout → Pay Now → PENDING_PAYMENT Order → close gateway → Pay Now again → **NEW Order?**

**With current fingerprint logic and unchanged cart:** **No** — resume same Order.  
**If cart changed (or legacy pending without fingerprint):** **Yes** — create-order cancels the old pending (within 20 minutes) and creates a new Order. That cancel+recreate path is intentional for stock safety, not a silent bug — but it must stay aligned with fingerprint rules and clear UX.

---

*Audit method: static code review of the repository as of the audit date. No production payment traffic was executed as part of this document.*

SARVEDA CUSTOMER PAYMENT LIFECYCLE AUDIT COMPLETE — READY FOR REVIEW
