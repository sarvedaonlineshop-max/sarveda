# Sarveda Payment Retry Hardening — Implementation Report

**Date:** 2026-08-30  
**Scope:** Small commercial fingerprint / resume compatibility harden only.  
**Architecture:** Unchanged — one logical purchase → one Sarveda Order → zero/many payment attempts → at most one successful payment.

Reference audit: `docs/SARVEDA_CUSTOMER_PAYMENT_LIFECYCLE_AUDIT.md`

---

## A. Current fingerprint before change

Resume matching used a **lines-only** cart fingerprint:

- Format: `variantId:qty|…` (sorted)
- Stored on pending checkout in `sessionStorage` as `cartFingerprint`
- Matched via `pendingMatchesCart`
- Did **not** include currency or payable grand total
- Consequence: same SKUs/qty with a changed shipping/coupon/currency total could still resume a stale Order

## B. New fingerprint fields

Commercial fingerprint (`buildCommercialFingerprint`):

| Component | Source |
|-----------|--------|
| Line identity | `variantId:quantity` (sorted), same as before |
| Currency | Uppercased ISO (`INR` / `USD` / …) |
| Payable total | Integer minor units (`payableMinor` / Order `amountInPaise` / `grandTotalInPaise`) |

Format:

```text
v2|{variantId:qty|…}|{CURRENCY}|{payableMinor}
```

Example: `v2|v-a:1|v-b:2|INR|110000`

Shipping and coupon are **not** duplicated as separate fields when they already change `grandTotalInPaise`. Shipping method/zone that changes total is covered by the payable field. A shipping change that does not change total is not treated as a commercial mismatch (acceptable for launch).

## C. Fingerprint versioning

- Constant: `CHECKOUT_FINGERPRINT_VERSION = 2`
- Stored on pending payload as `fingerprintVersion: 2` when fingerprint is hardened
- Encoded in the fingerprint string prefix `v2|`
- Legacy / missing / non-`v2` fingerprints → **no auto-resume** → clear pending → `create-order`
- Browser `sessionStorage` only — **no DB migration**

## D. Same-cart retry behavior

Unchanged commercial snapshot (lines + currency + payable):

1. Frontend `pendingMatchesCommercial` succeeds
2. `resumeMatchesMode` requires same payment method
3. `GET /api/checkout/resume` with optional `currency` + `amountInPaise`
4. Backend returns same Order + same Payment row
5. Razorpay: same `providerOrderId` / `rzpOrderId`
6. No extra stock reservation; attribution unchanged

## E. Shipping-change behavior

If address/method changes **payable total**:

- Live fingerprint ≠ pending fingerprint → clear pending → `create-order`
- Backend optional snapshot guard returns `409 ORDER_SNAPSHOT_MISMATCH` if resume still attempted with wrong amount
- Existing 20-minute supersede cancels recent `PENDING_PAYMENT` and releases reserved stock
- New Order reserved once at new total

## F. Discount/coupon-change behavior

Same as shipping: payable minor units change → fingerprint mismatch → new Order (not resume).

## G. Currency-change behavior

Same lines with `INR` → `USD` (or any currency change) → fingerprint mismatch → new Order.

Backend also rejects resume when `currency` query ≠ Order.currency (`ORDER_SNAPSHOT_MISMATCH`).

## H. Razorpay retry behavior

Compatible pending:

- Same Sarveda Order
- Same Payment row
- **Same** `providerOrderId` (no new Razorpay Order)

## I. Stripe retry behavior

Compatible pending:

- Same Sarveda Order
- Same Payment row
- **New** Stripe Checkout Session URL (unchanged architecture)

## J. PayPal retry behavior

Compatible pending:

- Same Sarveda Order
- Same Payment row
- **New** PayPal approval URL / order session (unchanged architecture)

## K. COD affected — MUST BE NO

COD path untouched. COD does not use unpaid resume; `cancelUnpaidOrderWithRelease` still skips COD/PAID orders.

## L. Stock logic changed — MUST BE NO

Reserve / release / confirm / 15-minute timeout / 20-minute supersede unchanged. Resume does not re-reserve.

## M. Payment completion logic changed — MUST BE NO

Verify, webhooks, `completePaidOrder`, idempotent `providerPaymentId` unchanged.

## N. Webhooks changed — MUST BE NO

No webhook file edits.

## O. Accounting changed — MUST BE NO

No accounting module edits.

## P. Order Attribution changed — MUST BE NO

Resume still does not write attribution (covered by existing attribution-checkout tests).

## Q. Schema/migration — MUST BE NONE

No Prisma schema or migration changes.

## Payment method compatibility (documented)

Frontend `resumeMatchesMode` (unchanged):

| Selected mode | Resume requires |
|---------------|-----------------|
| Razorpay | `paymentMethod === "razorpay"` + `rzpOrderId` + `razorpayKeyId` |
| Stripe | `paymentMethod === "stripe"` + `stripeCheckoutUrl` |
| PayPal | `paymentMethod === "paypal"` + `paypalApprovalUrl` |
| COD | COD confirmed shape (COD is not an unpaid resume flow in practice) |

Switching Razorpay ↔ Stripe ↔ PayPal ↔ COD clears pending (mode mismatch) and calls `create-order` for the new method.

## Authoritative totals

- **Persist:** fingerprint built from Order response `currency` + `amountInPaise` (create/resume API)
- **Live match:** checkout estimate `estimatedTotal` (merchandise after discount + shipping when ready) + `displayCurrency`
- **Backend guard:** optional query `currency` / `amountInPaise` vs Order `currency` / `grandTotalInPaise`
- No second pricing engine

Physical cart without shipping estimate → empty fingerprint → no resume (safe).

## Files changed

| File | Change |
|------|--------|
| `frontend/lib/pending-checkout.ts` | Commercial fingerprint v2 + legacy reject |
| `frontend/lib/pending-checkout.test.ts` | Unit tests |
| `frontend/components/checkout/PaymentSelector.tsx` | Build/match commercial FP; resume snapshot; clear on mismatch |
| `frontend/lib/checkout-api.ts` | Optional resume snapshot query params |
| `frontend/app/payment-failed/page.tsx` | CTA “Try payment again” |
| `backend/src/modules/checkout/checkout.controller.ts` | Parse optional snapshot query |
| `backend/src/modules/checkout/checkout.service.ts` | Optional `ORDER_SNAPSHOT_MISMATCH` guard |
| `backend/test/commerce/resume-snapshot.test.ts` | Resume / supersede / Stripe / PayPal tests |
| `backend/test/commerce/setup-mocks.ts` | Stripe + PayPal mocks for commerce tests |

## R. Frontend tests

`npx tsx --test lib/pending-checkout.test.ts` — **11 passed**

Covers: same commercial resume; total / currency / qty / variant change; legacy missing version; lines-only legacy; email mismatch.

## S. Backend tests

`vitest run test/commerce/resume-snapshot.test.ts` (+ related commerce suite) — **passed**

Includes:

1. Razorpay same Order + same `providerOrderId`
2. Amount mismatch → `ORDER_SNAPSHOT_MISMATCH`
3. Currency mismatch → `ORDER_SNAPSHOT_MISMATCH`
4. Stripe same Order/Payment, new session URL
5. PayPal same Order/Payment, new approval URL
6. Supersede releases old reservation once; new Order reserves once

Also re-ran: `checkout`, `attribution-checkout`, `payment-flow`, `stock` — **26 tests passed** across the batch.

## T. TypeScript

- Frontend `tsc --noEmit` — **PASS**
- Backend `tsc --noEmit` — **PASS**

## U. Build

- Frontend `npm run build` — **PASS**

## V. Remaining risk

1. Frontend estimate vs backend `grandTotalInPaise` can diverge (shipping estimate lag, coupon edge cases) → forces create + supersede (safe, may cancel a still-valid pending order more often than ideal).
2. Shipping/method change with **identical** grand total still resumes (rare; launch-acceptable).
3. Double-click / Idempotency-Key / payStarted flags not redesigned; covered by existing guards, not a new component test.
4. Manual payment UAT on staging still required for real Razorpay/Stripe/PayPal gateways.

## W. Ready for production payment UAT — YES

Code hardening is launch-safe for UAT. Confirm on staging: same-checkout Razorpay dismiss/retry; shipping/coupon/currency change creates new Order; Stripe/PayPal resume opens a new session for the same Order.

---

SARVEDA PAYMENT RETRY HARDENING COMPLETE — READY FOR PRODUCTION UAT
