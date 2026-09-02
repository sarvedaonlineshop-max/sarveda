# SARVEDA Cancellation / Refund V2 — Phase 1D Pre-Dispatch Adjustments

**Date:** 2026-09-01  
**Scope:** Pre-dispatch adjustment request workflow (reasons 4/5/6) — request-only on submit, admin-gated execution  
**Status:** Implementation complete — ready for review

---

## A. Existing architecture reused

| Layer | Reused component |
|-------|------------------|
| Request container | `OrderServiceRequest` (extended, not parallel system) |
| Dispatch gate | `getCancellationEligibility()` / `orderIsDispatched()` from Phase 1A |
| Cancellation conversion | `executeApprovedCancellationRequest()` (Phase 1A) |
| Refund calculator | Phase 1B untouched — adjustments use separate `calculateAdjustmentCommercialDelta()` |
| RTO workflow | Phase 1C untouched |
| Inventory ledger | `applyOrderInventoryRestockTx()` + new `ORDER_ADJUSTMENT` source type |
| Admin service requests | `AdminOrderServiceRequests` + new `AdminOrderAdjustmentPanel` |
| Customer orders | `/profile/orders` + existing auth / order ownership checks |

---

## B. Schema changes

**Migration:** `backend/prisma/migrations/20260901140000_order_adjustment_phase1d/migration.sql`

| Change | Detail |
|--------|--------|
| `OrderServiceRequestType` | `+ ADJUST_BEFORE_DELIVERY` |
| `OrderServiceRequestStatus` | `+ NEEDS_DISCUSSION`, `+ CONVERTED_TO_CANCELLATION` |
| `OrderServiceRequestIntent` | New enum: `CANCEL`, `REFUND`, `CHANGE_ADDRESS`, `CHANGE_ITEM_VARIANT`, `CHANGE_QUANTITY` |
| `OrderServiceRequestExecutionStatus` | New enum: `NOT_APPLICABLE`, `PENDING`, `BLOCKED_AFTER_DISPATCH`, `COMMERCIAL_REVIEW_REQUIRED`, `ADDITIONAL_PAYMENT_REQUIRED`, `REFUND_REQUIRED`, `ACCOUNTING_REVIEW_REQUIRED`, `EXECUTED`, `FAILED` |
| `OrderServiceRequest` columns | `requestIntent`, `adjustmentPayload` (JSONB), `executionStatus`, `commercialDeltaPaise`, `commercialClassification`, `executionSourceId` (unique), `executedAt`, `executionError`, `reviewedByUserId` |
| `OrderInventoryRestockSourceType` | `+ ORDER_ADJUSTMENT` |

**Migration applied:** Local dev Postgres (`localhost:5432/sarveda_db`) via `npx prisma migrate deploy` on 2026-09-01.  
**Production data modified:** No — migration not deployed to staging/production in this session.  
**Historical rows:** Existing `OrderServiceRequest` rows backfilled safely via column defaults (`requestIntent=CANCEL`, `executionStatus=NOT_APPLICABLE`).

---

## C. Request types

| Customer reason code | Intent | Request type |
|---------------------|--------|--------------|
| `change_address` | `CHANGE_ADDRESS` | `ADJUST_BEFORE_DELIVERY` |
| `wrong_item` | `CHANGE_ITEM_VARIANT` | `ADJUST_BEFORE_DELIVERY` |
| `change_quantity` | `CHANGE_QUANTITY` | `ADJUST_BEFORE_DELIVERY` |
| Reasons 1/2/3/7 | `CANCEL` | `CANCEL_BEFORE_DELIVERY` (unchanged) |

Cancel submit with reasons 4/5/6 returns `USE_ADJUSTMENT_REQUEST`.

---

## D. Customer eligibility

Authoritative server check: `getCancellationEligibility().customerCanRequest` (same dispatch boundary as Phase 1A).

Blocked when:
- Order terminal (`CANCELLED`, `REFUNDED`, `DELIVERED`)
- Not paid (non-COD)
- Any shipment in `PICKED`, `INTRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RTO`
- Order status `SHIPPED` / `DELIVERED`
- RTO in progress
- Pending service request already exists

API exposes `canAdjustRequest` + `adjustBlockReason` on order list (mirrors cancel eligibility).

---

## E. Customer UI

| File | Purpose |
|------|---------|
| `frontend/app/profile/orders/[orderNumber]/adjust/page.tsx` | Adjustment request page |
| `frontend/components/orders/OrderAdjustmentRequestForm.tsx` | Reason-specific fields |
| `frontend/components/orders/OrderHistoryCard.tsx` | “Request order change” link |
| `frontend/app/profile/orders/[orderNumber]/cancel/page.tsx` | Uses `CANCEL_ONLY_REASONS` (excludes 4/5/6) |

Customer copy: “Request order change”, “We'll review your request before your order is dispatched.”

---

## F. Admin workflow

`AdminOrderAdjustmentPanel` integrated in `AdminOrderServiceRequests` for `ADJUST_BEFORE_DELIVERY`:

1. **CUSTOMER REQUEST** — reason, payload snapshot  
2. **ELIGIBILITY** — live dispatch re-check via preview  
3. **COMMERCIAL IMPACT** — delta, classification  
4. **INVENTORY IMPACT** — stock warnings  
5. **ADMIN DECISION** — Execute / Needs discussion / Convert to cancellation / Reject  

Standard approve/refund panels hidden for adjustment requests.

---

## G. Address change behavior

- Submit stores `before.shippingAddress` + `requested.shippingAddress` in `adjustmentPayload` — **does not** mutate `OrderAddress`
- Execute (admin): updates shipping `OrderAddress` when same postal code + country (`NO_PAYMENT_CHANGE`)
- Postal code or country change → `COMMERCIAL_REVIEW_REQUIRED` — **fail closed**, no silent shipping recalculation
- Re-checks dispatch eligibility at execute time

---

## H. Variant change behavior

- Submit validates requested variant belongs to same product, is `ACTIVE`
- Server loads authoritative variant pricing — client cannot supply price
- Same-value swap: restock old variant (`ORDER_ADJUSTMENT:release`) + decrement new variant + update `OrderItem`
- More expensive → `ADDITIONAL_PAYMENT_REQUIRED` — blocked in 1D
- Cheaper → `REFUND_REQUIRED` — blocked in 1D (no gateway partial refund)
- Zoho invoice present → `ACCOUNTING_REVIEW_REQUIRED`

---

## I. Quantity change behavior

- Submit stores `before.line.qtyOrdered` + `requested.qtyOrdered`
- Increase → `ADDITIONAL_PAYMENT_REQUIRED` — blocked
- Decrease → `REFUND_REQUIRED` — blocked; order qty unchanged until Phase 1E
- Same qty → `NO_PAYMENT_CHANGE` (no-op execute allowed in calculator; unlikely customer submission)

---

## J. Commercial delta calculation

**Service:** `order-adjustment-calculator.service.ts` → `calculateAdjustmentCommercialDelta()`

Integer paise throughout. Classifications:

| Classification | Execute in 1D? |
|----------------|----------------|
| `NO_PAYMENT_CHANGE` | Yes (when eligible + stock OK) |
| `ADDITIONAL_PAYMENT_REQUIRED` | No |
| `REFUND_REQUIRED` | No |
| `COMMERCIAL_REVIEW_REQUIRED` | No |
| `ACCOUNTING_REVIEW_REQUIRED` | No |

---

## K. Additional-payment handling

Requests marked `ADDITIONAL_PAYMENT_REQUIRED` / `executionStatus=ADDITIONAL_PAYMENT_REQUIRED`.  
No supplementary Razorpay/Stripe/PayPal collection in Phase 1D.  
**Phase 1E+ must add:** payment link or checkout delta settlement before item/qty upgrade executes.

---

## L. Refund-required handling

Cheaper variant or qty decrease calculates authoritative refund delta for admin preview.  
Does **not** call `initiateGatewayRefund` or partial accounting.  
**Phase 1E must add:** P1-ACC-1 safe partial merchandise refund + proportional Zoho credit note.

---

## M. Inventory transactions

New source: `OrderInventoryRestockSourceType.ORDER_ADJUSTMENT`  
Idempotency key: `executionSourceId` on request (defaults to request UUID)  
Variant swap: `{sourceId}:release` for restock  
Submit creates **zero** inventory movement.

---

## N. Accounting behavior

- `NO_PAYMENT_CHANGE` address / same-value variant: no payment/accounting mutation
- Financial deltas blocked before execution — no underpaid order state
- Item/qty change with existing `zohoInvoiceId` → `ACCOUNTING_REVIEW_REQUIRED`
- Convert-to-cancellation uses Phase 1A full refund path (Razorpay → `REFUNDED`)

---

## O. Zoho behavior

No new Zoho integration in 1D. Existing invoice blocks unsafe item/qty mutation. Full credit note path unchanged (cancellation conversion only).

---

## P. Invoice/document behavior

GST invoice / packing slip not regenerated on adjustment execute.  
If invoice already synced to Zoho, item/qty adjustments fail closed to accounting review.

---

## Q. Cancellation conversion

`convertAdjustmentToCancellation()` → `executeApprovedCancellationRequest()` (Phase 1A) → request status `CONVERTED_TO_CANCELLATION`.  
Same dispatch gates, payment picker, gateway refund idempotency, inventory restock as standard cancel.

---

## R. Idempotency

- Execute: early return when `executionStatus === EXECUTED`
- Inventory: `executionSourceId` on restock events
- Double admin execute: safe (tested)

---

## S. Concurrency/race protection

Execute re-loads order + shipments and calls `getCancellationEligibility()` **at approval time**.  
If dispatched between submit and execute → `BLOCKED_AFTER_DISPATCH` persisted on request.

---

## T. Notifications

Email kind label updated for `ADJUST_BEFORE_DELIVERY` (“Order change request received”).  
No “refund completed” or “payment received” for blocked financial states.

---

## U. Authorization/security

- Customer: own orders only (`customerId` or email match)
- Admin: existing admin middleware on execute/preview routes
- Server reloads variant price, stock, dispatch state — never trusts client amounts

---

## V. API endpoints

| Method | Path | Role |
|--------|------|------|
| POST | `/api/orders/:orderNumber/adjust-request` | Customer submit |
| GET | `/api/orders/:orderNumber/adjustment-options?orderItemId=` | Customer variant/address options |
| GET | `/api/admin/orders/:orderId/service-requests/:requestId/adjustment-preview` | Admin preview |
| POST | `/api/admin/orders/:orderId/service-requests/:requestId/execute-adjustment` | Admin execute |
| POST | `.../needs-discussion` | Admin mark discussion |
| POST | `.../convert-to-cancellation` | Admin convert |

---

## W. Admin UI files

- `frontend/components/admin/AdminOrderAdjustmentPanel.tsx`
- `frontend/components/admin/AdminOrderServiceRequests.tsx` (adjustment branch)

---

## X. Customer UI files

- `frontend/app/profile/orders/[orderNumber]/adjust/page.tsx`
- `frontend/components/orders/OrderAdjustmentRequestForm.tsx`
- `frontend/components/orders/OrderHistoryCard.tsx`
- `frontend/lib/order-service-request.ts`

---

## Y. Tests / build

| Check | Result |
|-------|--------|
| `backend` tsc | Pass |
| `frontend` tsc | Pass |
| `frontend` production build | Pass |
| Commerce tests (19 files, 178 tests) | Pass |
| Phase 1D tests (`adjustment-phase1d.test.ts`, 12 tests) | Pass |
| Phase 1A/1B/1C regression | Pass (included in commerce suite) |

Phase 1D tests cover: submit no mutation, cancel reason rejection, dispatch race, address execute, postal commercial block, same-value variant + inventory, expensive/cheaper blocks, idempotent execute, convert to cancellation, calculator unit, delivered ineligible.

---

## Z. Newly discovered issues

| ID | Severity | Item |
|----|----------|------|
| P1-ADJ-1 | P1 | No supplementary payment collection for `ADDITIONAL_PAYMENT_REQUIRED` (deferred to 1E+) |
| P1-ADJ-2 | P1 | No partial refund execution for `REFUND_REQUIRED` (requires Phase 1E / P1-ACC-1) |
| P2-ADJ-1 | P2 | Shipment delivery address snapshot not updated separately (only `OrderAddress` — verify carrier label regen workflow) |
| P2-ADJ-2 | P2 | Admin staged card could show raw `adjustmentPayload` JSON for audit (currently preview summary only) |

---

## AA. Deliberately blocked / fail-closed

- Post-dispatch customer adjustment submit and execute
- Partial gateway refund on qty decrease / cheaper variant
- Additional payment pretense without collection
- Postal/country address change without commercial review
- Item/qty change when Zoho invoice exists
- Standard admin “Approve” on adjustment requests (`USE_EXECUTE_ADJUSTMENT`)
- Auto cancellation for reasons 4/5/6

---

## AB. Ready for Phase 1E partial-refund accounting?

**YES** — Phase 1D establishes request/preview/execute separation and `REFUND_REQUIRED` classification. Phase 1E should implement safe partial merchandise refund + accounting journal + proportional Zoho credit note, then wire execute path for `REFUND_REQUIRED` and qty decrease.

---

## Final execution verdict

| # | Question | Verdict |
|---|----------|---------|
| 1 | Same-value adjustment executes safely | **YES** — same-value address + same-price variant swap tested |
| 2 | Address adjustment executes safely | **YES** — same postal/country only; postal change fail-closed |
| 3 | Quantity increase executes financially | **NO** — blocked (`ADDITIONAL_PAYMENT_REQUIRED`) |
| 4 | Quantity decrease executes financially | **NO** — blocked (`REFUND_REQUIRED`) |
| 5 | More-expensive variant executes financially | **NO** — blocked |
| 6 | Cheaper variant executes financially | **NO** — blocked |
| 7 | Post-dispatch mutation impossible server-side | **YES** — tested at execute |
| 8 | Inventory exactly-once | **YES** — for allowed executes; `ORDER_ADJUSTMENT` idempotency |
| 9 | Accounting remains correct | **YES** — fail-closed on partial refund / Zoho invoice |
| 10 | Ready for Phase 1E | **YES** |

---

**SARVEDA CANCELLATION / REFUND V2 PHASE 1D ADJUSTMENTS COMPLETE — READY FOR REVIEW**
