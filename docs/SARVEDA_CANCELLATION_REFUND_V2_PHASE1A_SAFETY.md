# Sarveda Cancellation / Refund V2 — Phase 1A Safety Hardening

**Date:** 2026-09-01  
**Reference:** `docs/SARVEDA_CANCELLATION_REFUND_RETURN_V2_AUDIT.md`  
**Scope:** Safety only — no Phase 1B calculator, no RTO V2 UI, no Return/Replacement

---

## Summary

Phase 1A closes the dangerous cancellation/refund paths identified in the V2 audit:

- Server-side **dispatch gate** for customer cancellation
- **Admin approve cancel → full gateway refund** for online paid pre-dispatch orders
- **Correct captured payment selection** (no guessing on multi-capture)
- **Blocked admin PATCH → REFUNDED** without refund workflow
- **Shiprocket RTO** no longer auto-cancels or auto-restocks

---

## A. Cancellation eligibility source

**New module:** `backend/src/modules/orders/cancellation-eligibility.ts`

Authoritative function: `getCancellationEligibility(order)`

Inputs: `Order.status`, `Order.paymentStatus`, `Payment[]`, `Shipment[]`

---

## B. Authoritative dispatch state

Dispatch is true when **any** of:

| Signal | Values |
|--------|--------|
| `Order.status` | `SHIPPED`, `DELIVERED` |
| `Shipment.status` | `PICKED`, `INTRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RTO` |

`CREATED` shipment alone does **not** block cancellation (label may exist pre-pickup).

---

## C. Customer button behavior

- `canCancelRequest` from API when pre-dispatch + paid + no pending request
- `cancelBlockReason` returned when blocked (e.g. dispatched message)
- `OrderHistoryCard`: shows banner with reason; button becomes “Cancel unavailable”
- Cancel page uses `cancelBlockReason` from API

**Customer message after dispatch:**

> This order has already been dispatched and can no longer be cancelled online.

---

## D. Backend dispatch enforcement

- `submitServiceRequest` (cancel) → rejects with `CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH`
- `executeApprovedCancellationRequest` → same for admin approve after dispatch
- `canRequestCancel()` delegates to `getCancellationEligibility`

---

## E. COD before-dispatch behavior

Admin approve cancellation:

- `handlePaidOrderStatusChange(CANCELLED)` — restock once
- No gateway `Refund` row
- No automatic payout

---

## F. COD after-dispatch behavior

- Customer cancel request **rejected** (dispatch gate)
- Admin approve cancellation **rejected** with `CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH`

---

## G. Paid before-dispatch behavior

Admin approve cancellation (`reviewServiceRequest`):

1. `executeApprovedCancellationRequest`
2. `initiateGatewayRefund` — full remaining captured amount
3. `finalizeGatewayRefund` → `REFUNDED` + restock + Zoho credit note (existing path)

Approve no longer calls `CANCELLED` alone without refund for captured online payments.

---

## H. Paid after-dispatch behavior

- Customer cancel blocked
- Admin approve blocked — requires future RTO / in-transit workflow (Phase 1C)

---

## I. Correct captured-payment selection

**New module:** `backend/src/modules/payments/payment-selection.ts`

`pickCapturedPaymentForRefund(payments)`:

- Ignores `FAILED`, `PENDING`, `AUTHORIZED`, `REFUNDED`, `COD`
- Selects single `CAPTURED` or `PARTIALLY_REFUNDED`
- Used in `refund.service.ts` and `processServiceRequestRefund`

---

## J. Multiple captured-payment behavior

If **>1** distinct `CAPTURED` payment:

- Returns `MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED` (409)
- No automatic refund

---

## K. Direct REFUNDED status patch behavior

`PATCH /admin/orders/:id/status` with `REFUNDED`:

- **Rejected** with `REFUNDED_STATUS_PATCH_FORBIDDEN` (400)
- `CANCELLED` patch still allowed (admin ops) — use refund workflow for money movement

`handlePaidOrderStatusChange(REFUNDED)` remains internal to `finalizeGatewayRefund` / webhooks.

---

## L. Shiprocket RTO behavior — before

- `handleRtoShipment` → `CANCELLED` + full restock + notify

## M. Shiprocket RTO behavior — after

- Shipment `RTO` + `rtoAt` recorded
- `fulfillmentStatus: RETURNED`
- Order note appended — **no** order cancel, **no** restock, **no** refund
- `[RTO_ALERT]` log retained for ops

**Temporary state until Phase 1C:** Order may remain `SHIPPED` while shipment is `RTO`.

---

## N. Delhivery RTO behavior

Unchanged — `persistShipmentTrackingFromCarrier` sets shipment `RTO` + fulfillment `RETURNED` only. No restock (already safe).

---

## O. Inventory restoration rules

| Event | Restock |
|-------|---------|
| COD cancel before dispatch (approve) | Yes — once |
| Online full refund before dispatch (approve) | Yes — once via `REFUNDED` |
| Partial monetary refund | No |
| Carrier RTO (Shiprocket/Delhivery) | **No** (Phase 1A fix) |
| Cancel requested after dispatch | No |

---

## P. Accounting reversal behavior

Unchanged — full gateway refund still triggers:

- `ORDER_REFUNDED_FULL` journal (when eligible)
- Zoho credit note via `createZohoRefundDocumentsForOrder`

No new journal design in Phase 1A.

---

## Q. Request idempotency

- One `PENDING_APPROVAL` request per order (existing)
- Second approve → `ALREADY_REVIEWED` (409)

---

## R. Refund idempotency

Preserved: `reserveGatewayRefund`, `providerRefundId` uniqueness, `DUPLICATE_REFUND`, capacity caps.

---

## S. Schema changes

**None** — Phase 1A achieved without migration.

---

## T. Backend files changed

| File | Change |
|------|--------|
| `cancellation-eligibility.ts` | **New** — eligibility + dispatch detection |
| `payment-selection.ts` | **New** — captured payment picker |
| `order-service-request.service.ts` | Dispatch gate, `executeApprovedCancellationRequest`, approve→refund |
| `refund.service.ts` | Uses `pickCapturedPaymentForRefund` |
| `admin.handlers.ts` | Block PATCH `REFUNDED` |
| `orderLifecycle.ts` | RTO — no auto-cancel/restock |
| `shiprocket.webhook.ts` | RTO response uses actual order status |
| `orders.controller.ts` | `cancelBlockReason` in API |
| `test/commerce/setup-mocks.ts` | Email partial mock fix |

---

## U. Customer frontend files changed

| File | Change |
|------|--------|
| `frontend/lib/orders-api.ts` | `cancelBlockReason` type |
| `frontend/components/orders/OrderHistoryCard.tsx` | Banner + disabled cancel state |
| `frontend/app/profile/orders/[orderNumber]/cancel/page.tsx` | Uses `cancelBlockReason` |

---

## V. Admin frontend files changed

**None** — Phase 1A is backend safety; admin UX unchanged (approve now triggers refund server-side).

---

## W. Tests

**New:** `backend/test/commerce/cancellation-phase1a.test.ts` (16 tests)

Covers: eligibility unit tests, payment picker, COD before/after dispatch, paid approve→refund, dispatched reject, RTO no restock, duplicate approve, submit reject, PATCH REFUNDED blocked.

**Regression run:**

| Suite | Result |
|-------|--------|
| cancellation-phase1a | 16/16 PASS |
| refund-hardening | PASS |
| order-inventory-restock | PASS |
| refund.test | PASS |
| payment-flow | PASS |
| order-refunded-full | PASS |
| **Total (6 files)** | **68/68 PASS** |

---

## X. TypeScript / build

| Check | Result |
|-------|--------|
| Backend `tsc` | PASS |
| Frontend `tsc` | PASS |
| Frontend production build | PASS |

---

## Y. Newly discovered P0/P1

None in Phase 1A implementation. Known deferred items:

- Adjustment reasons 4/5/6 → Phase 1D
- Shipping-retained refund calculator → Phase 1B
- RTO physical receipt workflow → Phase 1C
- Admin UI unified Cancellation & Refunds card → later phase

---

## Ready for Phase 1B refund calculator?

**YES** — dispatch gate, payment selection, approve→refund linkage, REFUNDED patch block, and RTO restock safety are in place.

---

SARVEDA CANCELLATION / REFUND V2 PHASE 1A SAFETY COMPLETE — READY FOR REVIEW
