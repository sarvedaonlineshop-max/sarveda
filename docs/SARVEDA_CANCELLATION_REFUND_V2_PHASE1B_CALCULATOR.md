# SARVEDA Cancellation / Refund V2 — Phase 1B Calculator

**Date:** 2026-09-01  
**Status:** Complete — ready for review  
**Depends on:** Phase 1A (`docs/SARVEDA_CANCELLATION_REFUND_V2_PHASE1A_SAFETY.md`) — **unchanged and intact**

---

## Executive summary

Phase 1B adds a **pure, authoritative server-side refund calculator** (`calculateOrderRefund`) and a **read-only admin preview API + UI**. Calculation is separated from execution. Phase 1A dispatch gates, payment selection, idempotency, and RTO safety remain intact.

**Not implemented (by design):** Return/Replacement, RTO physical receipt workflow (Phase 1C), order modification reasons 4/5/6 (Phase 1D), automatic carrier RTO refunds.

---

## A. Existing order money composition

Authoritative Prisma fields on `Order` and related models:

| Component | Source field(s) | Notes |
|-----------|-----------------|-------|
| Items subtotal | `Order.subtotalInPaise` | Sum of `OrderItem.lineTotalInPaise` at checkout |
| Item-level discount | `OrderItem.discountInPaise` | Always folded into `lineTotalInPaise` at order creation |
| Coupon / order discount | `Order.discountInPaise` | Order-level coupon; allocated pro-rata across lines |
| Shipping charge (customer-paid) | `Order.shippingInPaise` | What customer was charged at checkout |
| Shipping discount | *none* | No separate field; free shipping = `shippingInPaise = 0` |
| Tax at checkout | `Order.taxInPaise` | **Always 0** — GST is inclusive in line prices |
| Grand total / customer paid | `Order.grandTotalInPaise` | `subtotal - discount + shipping + tax` |
| Captured gateway amount | `Payment.amountInPaise` | Via `capturedAmountInPaise()`; falls back to `grandTotalInPaise` if payment amount is 0 |
| Already refunded | `Payment.refundedInPaise` | Successful/processed refunds only (Phase 1A sync) |
| Wallet / credits | *none* | Not in schema |
| COD | `Payment.provider = COD` | No gateway capture; `status` may be `PENDING` |

**Reconciliation invariant (enforced by calculator):**

```
merchandiseNet + shippingNet + taxInPaise === grandTotalInPaise
```

If this fails → `REFUND_BREAKDOWN_UNAVAILABLE` (no guessing).

---

## B. Authoritative captured amount

```typescript
capturedAmountInPaise(payment) =
  payment.amountInPaise > 0
    ? payment.amountInPaise
    : order.grandTotalInPaise
```

Only payments with `status ∈ { CAPTURED, PARTIALLY_REFUNDED }` and `provider ≠ COD` contribute. COD → captured = 0.

Payment selection uses Phase 1A `pickCapturedPaymentForRefund()` — multiple captured payments → `MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED` (calculator refuses).

---

## C. Merchandise calculation

```typescript
merchandiseGrossPaise   = Order.subtotalInPaise
merchandiseDiscountPaise = Order.discountInPaise
merchandiseNetPaise     = nativeMerchandiseNetPaise(items, discountInPaise)
```

`nativeMerchandiseNetPaise` uses `allocateOrderDiscountPaise()` — same helper as native accounting journals.

---

## D. Shipping calculation

```typescript
shippingGrossPaise    = Order.shippingInPaise
shippingDiscountPaise = 0   // no separate field exists
shippingNetPaise      = Order.shippingInPaise
```

**Customer shipping charge** (`Order.shippingInPaise`) is used — **not** carrier/Shiprocket operational cost.

---

## E. Discount / coupon allocation

Order-level `discountInPaise` is allocated pro-rata by line `lineTotalInPaise`:

1. `totalDiscount = min(discountInPaise, grossTotal)`
2. For each line except last: `round(lineTotal × totalDiscount / grossTotal)`
3. Last line absorbs remainder: `totalDiscount - allocated`

Deterministic integer paise; odd-paise cases tested (test Q).

Merchandise net after discount:

```
merchandiseNet = Σ (lineTotalInPaise - lineDiscountPaise[i])
```

---

## F. GST / tax treatment

- Checkout stores `taxInPaise = 0` (GST-inclusive pricing).
- Calculator extracts GST from inclusive merchandise lines per `taxClass` via `gstFromInclusiveLine()` + `lookupGstRate()`.
- `taxShippingPaise = 0` (no shipping tax field stored).
- GST applies only when `currency === INR` and ship-to country is `IN`.

**Dispatched / RTO policies:** calculator returns merchandise GST breakdown for preview but emits warning `PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED` — partial merchandise-only credit notes are not auto-posted in Phase 1B.

---

## G. Rounding treatment

All amounts in **integer paise**. No floating-point rupee arithmetic in calculator paths. Discount allocation remainder goes to last line. `proposedRefundAmountPaise <= remainingRefundableAmountPaise` always.

---

## H. Already-refunded calculation

```typescript
alreadyRefundedAmountPaise = payment.refundedInPaise ?? 0
```

Failed/pending `Refund` rows do not increment `refundedInPaise` (Phase 1A sync). Reserved refund capacity follows existing `refund-sync.service.ts` concurrency — calculator reads finalized `refundedInPaise` only.

---

## I. Remaining-refundable formula

```typescript
remainingRefundableAmountPaise = max(0, capturedAmountPaise - alreadyRefundedAmountPaise)
```

**Hard invariant:** never refund more than `remainingRefundableAmountPaise`.

---

## J. Pre-dispatch policy formula (Policy A)

**Policy:** `FULL_PRE_DISPATCH_CANCELLATION`

```
refundableMerchandise = merchandiseNetPaise
refundableShipping    = shippingNetPaise
retainedShipping      = 0
policyMaximum         = remainingRefundableAmountPaise
proposedRefund        = remainingRefundableAmountPaise
```

Preserves Phase 1A full-refund behavior for paid pre-dispatch cancellation.

---

## K. Dispatched policy formula (Policy B)

**Policy:** `DISPATCHED_SHIPPING_RETAINED` (admin preview / future manual processing)

```
refundableMerchandise = merchandiseNetPaise
refundableShipping    = 0
retainedShipping      = shippingNetPaise
policyMaximum         = min(merchandiseNetPaise, remainingRefundableAmountPaise)
proposedRefund        = policyMaximum
warnings              += PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED
```

Does **not** reopen customer self-cancel after dispatch (Phase 1A gate unchanged).

---

## L. RTO policy formula (Policy C)

**Policy:** `RTO_SHIPPING_RETAINED`

Same formula as Policy B. Preview only — no automatic carrier RTO trigger, no inventory movement, no gateway call, no order-status mutation. Phase 1C will call after physical receipt.

---

## M. COD behavior

**Policy:** `COD_CANCELLATION`

```
capturedAmountPaise     = 0
proposedRefundAmountPaise = 0
customerPaidAmountPaise = grandTotalInPaise  // informational
```

Stock/cancellation behavior remains Phase 1A. Cash settlement is manual/offline.

---

## N. Multiple-payment behavior

`pickCapturedPaymentForRefund()` from Phase 1A:

- Single captured payment → use it
- Zero captured → COD fallback or `NO_CAPTURED_PAYMENT`
- Multiple captured → `MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED` (409 on preview API; blocks service-request refund path)

Calculator does not silently combine payments.

---

## O. Preview API

**Endpoint:** `GET /api/admin/orders/:id/refund-preview?policy=auto|FULL_PRE_DISPATCH_CANCELLATION|DISPATCHED_SHIPPING_RETAINED|RTO_SHIPPING_RETAINED|COD_CANCELLATION`

**Handler:** `orderRefundPreview` in `admin.handlers.ts`  
**Loader:** `loadOrderRefundPreview()` in `order-refund-preview.service.ts`

**Read-only — does NOT:**
- Call Razorpay / Stripe / PayPal
- Create `Refund` rows
- Change `Order` / `Shipment` status
- Restock inventory
- Post accounting / Zoho credit notes

**Response:**

```json
{
  "success": true,
  "data": {
    "orderNumber": "SRV-...",
    "currency": "INR",
    "breakdown": { /* OrderRefundBreakdown */ }
  }
}
```

Policy `auto` resolves from order state: COD → RTO shipment → dispatched → pre-dispatch full.

---

## P. Admin UI

**Component:** `frontend/components/admin/AdminOrderRefundPreview.tsx`  
**Placement:** `frontend/app/admin/orders/[id]/page.tsx` — above service requests section

Displays:
- Customer paid / Captured (gateway)
- Products paid value / Shipping paid
- Coupon/discount (if any)
- Already refunded / Shipping retained
- Remaining refundable
- **Proposed refund** (highlighted)
- Policy label + explanation
- Warnings (e.g. accounting review)

Phase 1B is preview/calculation only — no new unsafe arbitrary refund execution path.

---

## Q. Manual refund cap behavior

`processServiceRequestRefund()` in `order-service-request.service.ts` now:

1. Existing cap: `totalInPaise <= grandTotal - alreadyRefundedOnPayment`
2. **New:** loads `loadOrderRefundPreview({ policy: "auto" })`
3. Rejects if `totalInPaise > policyMaximumRefundableAmountPaise` → `AMOUNT_TOO_HIGH`
4. `capRefundAmountToPolicy(breakdown, totalInPaise)` — ceiling = `min(remainingRefundable, policyMaximum)`

Phase 1A `initiateGatewayRefund()` full pre-dispatch cancellation path unchanged.

---

## R. Accounting implications

| Scenario | Phase 1B behavior |
|----------|-------------------|
| Full pre-dispatch cancel | Existing `ORDER_REFUNDED_FULL` + Zoho credit note path (Phase 1A) |
| Dispatched partial (merchandise only) | Preview only; `PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED` warning |
| RTO partial | Preview only; same warning |
| GST reversal on partial | Tax lines computed for preview; no auto journal/credit-note post |

Partial merchandise refund credit notes require accounting review before Phase 1C execution wiring.

---

## S. Schema changes

**None.** Phase 1B uses existing `Order`, `OrderItem`, `Payment`, `Refund` fields.

---

## T. Backend files changed / added

| File | Role |
|------|------|
| `backend/src/modules/orders/order-refund-calculator.types.ts` | Types |
| `backend/src/modules/orders/order-refund-calculator.service.ts` | Pure `calculateOrderRefund()`, `capRefundAmountToPolicy()` |
| `backend/src/modules/orders/order-refund-preview.service.ts` | DB loader + policy resolution |
| `backend/src/modules/admin/admin.handlers.ts` | `orderRefundPreview` handler |
| `backend/src/modules/admin/admin.routes.ts` | `GET /orders/:id/refund-preview` |
| `backend/src/modules/orders/order-service-request.service.ts` | Policy cap on manual refunds |
| `backend/test/commerce/order-refund-calculator.test.ts` | Calculator unit tests |
| `backend/test/commerce/order-refund-preview.test.ts` | Preview no-mutation tests |

---

## U. Frontend files changed / added

| File | Role |
|------|------|
| `frontend/components/admin/AdminOrderRefundPreview.tsx` | Preview panel |
| `frontend/lib/admin-api.ts` | `fetchOrderRefundPreview()` + types |
| `frontend/app/admin/orders/[id]/page.tsx` | Renders preview |

---

## V. Tests

### New tests

- `backend/test/commerce/order-refund-calculator.test.ts` — policies A–Y (pure calculator, caps, reconciliation, odd paise)
- `backend/test/commerce/order-refund-preview.test.ts` — loader + HTTP handler no-mutation (test X)

### Regression (all passed 2026-09-01)

| Suite | Result |
|-------|--------|
| `cancellation-phase1a` | 16 passed |
| `order-refund-calculator` | 16 passed |
| `order-refund-preview` | 2 passed |
| `refund-hardening` | passed |
| `refund.test` | passed |
| `payment-flow` | passed |
| `order-inventory-restock` | passed |
| `order-refunded-full` (commerce + accounting) | 28 + 28 passed |
| Full `test/commerce` suite | 186 passed |
| `discount-allocation` | passed |

### Test matrix coverage

| ID | Case | Covered |
|----|------|---------|
| A | Paid pre-dispatch → full captured remainder | ✅ |
| B | Pre-dispatch + shipping → shipping refunded | ✅ |
| C | Dispatched → shipping retained | ✅ |
| D | RTO policy → shipping retained | ✅ |
| E | COD pre-dispatch → gateway refund 0 | ✅ |
| F | Prior partial refund reduces remaining | ✅ |
| G | Cannot exceed captured amount | ✅ |
| H | Cannot exceed policy maximum | ✅ |
| I | Product discount | ✅ (via order discount on lines) |
| J | Order coupon | ✅ |
| K | Shipping charge | ✅ |
| L/M | Free / zero shipping | ✅ |
| N | Sale price | ✅ (line totals at checkout) |
| O | GST allocation | ✅ |
| P | Shipping tax | N/A — `taxInPaise` always 0 at order level |
| Q | Rounding / odd paise | ✅ |
| R/S | Multiple items / quantities | ✅ |
| T | Multiple captured payments | ✅ (preview service + payment-selection) |
| U | Failed payment ignored | ✅ (gatewayCapturedAmountPaise) |
| V | Failed refund not counted | ✅ (uses `refundedInPaise`) |
| W | Successful refund counts | ✅ |
| X | Preview endpoint no mutation | ✅ |
| Y | Calculator no side effects | ✅ |
| Z | Calculator no accounting effect | ✅ (pure function) |

---

## W. TypeScript / build

| Check | Result |
|-------|--------|
| `backend npx tsc --noEmit` | ✅ Pass |
| `frontend npx tsc --noEmit` | ✅ Pass |
| `frontend npm run build` | ✅ Pass |

---

## X. Newly discovered P0/P1

| ID | Severity | Finding |
|----|----------|---------|
| — | — | No new P0/P1 from Phase 1B implementation |

**Known pre-existing limitation (documented, not introduced):** No `shippingDiscountPaise` or per-component tax fields — sufficient for current Sarveda checkout model but partial refund accounting for dispatched orders requires manual credit-note review (`PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED`).

---

## Y. Cases where calculator refuses calculation

| Code | When |
|------|------|
| `REFUND_BREAKDOWN_UNAVAILABLE` | `merchandiseNet + shippingNet + tax ≠ grandTotal` |
| `MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED` | >1 captured gateway payment |
| `NO_CAPTURED_PAYMENT` | No captured gateway payment (non-COD policies) |
| `NOT_FOUND` | Order missing (preview loader only) |

Warnings (calculation proceeds):

| Warning | When |
|---------|------|
| `PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED` | Dispatched or RTO shipping-retained policies |

---

## Z. Ready for Phase 1C RTO workflow

**YES** — with caveats:

- Calculator policy `RTO_SHIPPING_RETAINED` is ready for Phase 1C to call after admin confirms physical receipt.
- Execution wiring (gateway refund + accounting credit note + restock decision) remains Phase 1C scope.
- Partial refund accounting still requires review before auto-posting.

---

## Phase 1A integrity checklist

| Protection | Status |
|------------|--------|
| Dispatch gate blocks customer cancel | ✅ Unchanged |
| `pickCapturedPaymentForRefund()` | ✅ Used by preview + refunds |
| Admin approve cancel → full gateway refund (pre-dispatch) | ✅ Unchanged |
| `PATCH status → REFUNDED` forbidden | ✅ Unchanged |
| Shiprocket RTO → shipment record only, no auto-cancel/restock | ✅ Unchanged |
| Money refund ≠ inventory restock for partial refunds | ✅ Unchanged |

---

SARVEDA CANCELLATION / REFUND V2 PHASE 1B CALCULATOR COMPLETE — READY FOR REVIEW
