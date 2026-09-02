# SARVEDA Return / Replacement V2 — Phase 2

**After-delivery customer service workflow**  
**Date:** 2026-09-01  
**Builds on:** Phase 1A–1E (cancellation, calculator, RTO, adjustments, financial settlement)

---

## A. Return eligibility

**Authoritative helper:** `getReturnEligibility()` in `backend/src/modules/orders/return-eligibility.service.ts`

Checks (server-side only):

| Gate | Code |
|------|------|
| Order `DELIVERED` + `deliveredAt` | `NOT_DELIVERED` |
| No active RTO shipment | `RTO_ACTIVE` |
| Payment captured (incl. COD collected) | `NOT_PAID` |
| Return window from `deliveredAt` | `RETURN_WINDOW_EXPIRED` |
| No pending `REFUND_AFTER_DELIVERY` request | `REQUEST_PENDING` |
| Qty ≤ ordered − restocked − refunded − replaced | `QTY_EXCEEDS_AVAILABLE` |

---

## B. Return window

- **Existing policy:** 7 days (legal page + `RETURN_WINDOW_DAYS` in constants).
- **Configurable:** `RETURN_WINDOW_DAYS` env (default `7`).
- **Anchor:** `deliveredAt` from shipment or status history — not order-created date.

---

## C. Reasons

Stable codes in `REFUND_AFTER_DELIVERY_REASONS` + `RETURN_REASON_SPEC` (`return-replacement.constants.ts`):

`defective`, `wrong_item_sent`, `damaged_delivery`, `different_description`, `missing_parts`, `replace_variant`, `quality_issue`, `extra_item`, `arrived_late`, `changed_mind`, `other`

Customer note supported per item + overall message.

---

## D. Resolution types

`ReturnReplacementResolution` enum:

- `RETURN_FOR_REFUND`
- `REPLACEMENT`
- `PARTIAL_REFUND`
- `KEEP_ITEM_PARTIAL_REFUND`

Server exposes allowed resolutions per reason via `allowedResolutionsForReason()` — not all actions for all reasons.

---

## E. Schema

Migration: `20260901180000_return_replacement_phase2`

**Extended:** `OrderServiceRequest` — `returnPhysicalStatus`, `resolutionStatus`, `shippingRefundPolicy`, `returnPayload`  
**Extended:** `OrderServiceRequestItem` — `requestedResolution`, `requestedVariantId`  
**New:** `OrderReturnShipment`, `OrderReplacementFulfillment`  
**Restock source:** `CUSTOMER_RETURN_RECEIPT` on `OrderInventoryRestockSourceType`

Additive only — historical requests preserved.

---

## F. Customer request

- **API:** `POST /api/orders/:orderNumber/refund-request` (multipart)
- **Service:** `submitReturnReplacementRequest()` — partial qty, resolution, snapshot in `returnPayload`, conditional evidence
- **UI:** `/profile/orders/[orderNumber]/return` — qty, resolution picker, evidence when required

---

## G. Admin review

- Approve → `approveReturnReplacementRequest()` — sets physical/resolution status, creates return shipment + replacement fulfillment rows
- Reject / needs discussion — existing service-request paths
- **Extra item** (`extra_item`) — blocked at approval (`MANUAL_REVIEW_REQUIRED`)
- **Panel:** `AdminOrderReturnReplacementPanel` — staged workflow UI

---

## H. Physical return

Mirrors Phase 1C RTO pattern without duplicating RTO engine:

`AWAITING_RETURN` → `IN_TRANSIT` → `RECEIVED` → `INSPECTED`

Service: `customer-return-workflow.service.ts`

---

## I. Return shipment

**Mode:** `MANUAL_RETURN_SHIPMENT` (default — no reverse-logistics API assumed)

Stored: courier, AWB, tracking URL, `receivedAt`

Admin routes: return-shipment, return-received

---

## J. Disposition

Reuses `RtoDisposition`: `RESTOCKABLE`, `DAMAGED_NON_RESTOCKABLE`, `NEEDS_REVIEW`

Restock via `CUSTOMER_RETURN_RECEIPT` source — idempotent per `(sourceId, orderItemId)`.

---

## K. Inventory

- **Approval does not restock**
- **Received does not restock**
- **Disposition controls stock** — exactly once per line
- **Gateway refund does not restock** — `restockPaidOrderLinesTx` skips qty already returned via any source

---

## L. Partial quantity

`qtySelected` on request item; validated against `maxReturnableQty`.  
Example: ordered 3, return 1 — supported.

---

## M. Refund calculation

`calculateReturnItemRefund()` — line net after discount allocation, optional shipping per policy.

Execution: `executeReturnReplacementRefund()` → `executeAuthoritativePartialRefund()` with `sourceType: SERVICE_REQUEST`, server-computed amount — **no browser amount**.

---

## N. Shipping policy

Per-reason `ReturnShippingRefundPolicy`:

| Policy | Typical reasons |
|--------|-----------------|
| `SHIPPING_REFUNDABLE` | wrong item, damaged, defective |
| `SHIPPING_RETAINED` | changed mind, quality, size swap |
| `MANUAL_REVIEW` | extra item, other |

Uses customer-paid shipping — never carrier cost.

---

## O. GST / accounting

Phase 1E path: `ORDER_REFUNDED_PARTIAL` via `buildPartialRefundSpecForLineDelta` for `SERVICE_REQUEST` source.

---

## P. Zoho

Partial credit note via `createZohoPartialCreditNoteForRefund()` — same as Phase 1E settlement stages.

---

## Q. COD

- No Razorpay/Stripe/PayPal call
- `COD_MANUAL` + required `codRefundNote` (bank/UPI audit trail)
- Fail-closed without manual details

---

## R. Replacement model

`OrderReplacementFulfillment` — links request item → replacement variant, qty, status, outbound shipment.

Flow: APPROVED → stock reserve → ship → deliver → CLOSED

---

## S. Same-variant replacement

Default variant from original `OrderItem` when `requestedVariantId` omitted. Stock check via `reserveReplacementStock()` — OOS → `FAILED` status.

---

## T. Different-variant replacement

`computeReplacementCommercialDelta()` — SAME / `REFUND_REQUIRED` / `ADDITIONAL_PAYMENT_REQUIRED`

Phase 1E supplementary / partial refund for price deltas (foundation wired; full customer pay widget deferred P2).

---

## U. Supplementary payment

Existing `OrderSupplementaryPayment` + Phase 1E session API reusable for upgrade replacements.

---

## V. Replacement shipment

`markReplacementShipped()` — reserves stock if needed, creates manual `Shipment`, updates fulfillment status.

---

## W. Documents

Delivery challan / replacement invoice automation **not fully wired** in Phase 2 — operational shipment record only. Credit notes via Phase 1E refund path.

---

## X. Notifications

Reuses `notifyServiceRequestSubmitted` / `notifyServiceRequestReviewed`.  
Dedicated return/refund/replacement event emails — **P2 defer** (same as broader notification backlog).

Refund-completed only after gateway success; replacement-shipped only after AWB exists.

---

## Y. Security

- Customer: own order only (customerId or email match)
- Admin: existing admin auth on all mutation routes
- Evidence: S3 via existing `uploadRequestPhotos` — no public upload path
- Zod on admin disposition / shipment bodies

---

## Z. Idempotency

| Action | Mechanism |
|--------|-----------|
| Duplicate submit | Pending request block |
| Double receive | `alreadyReceived` no-op |
| Double disposition | Same value no-op; locked after set |
| Double refund | `Refund` unique on `(sourceType, sourceId)` |
| Double restock | `(sourceType, sourceId, orderItemId)` unique |
| Full-order refund restock | Skips qty already physically returned |

---

## AA. Tests / build

| Check | Result |
|-------|--------|
| `backend tsc` | ✅ |
| `frontend tsc` | ✅ |
| `frontend build` | ✅ |
| Commerce suite | **191/191** (incl. `return-replacement-phase2.test.ts`) |
| Phase 1A–1E regressions | ✅ green |

Phase 2 test coverage: eligibility, window, partial qty, physical receipt, disposition restock, damaged no-restock, Phase 1E refund after receipt, refund blocked before receipt.

---

## AB. Schema migration / deployment

```bash
cd backend && npx prisma migrate deploy
```

Migration: `20260901180000_return_replacement_phase2`

Optional env: `RETURN_WINDOW_DAYS=7`

---

## AC. Newly discovered issues

| Sev | Item |
|-----|------|
| P1 | **Fixed:** Full gateway refund after customer-return restock attempted double restock — `restockPaidOrderLinesTx` now skips already-returned qty |
| P2 | Replacement Zoho delivery challan / zero-value tax docs not automated |
| P2 | Customer supplementary payment widget for upgrade replacement |
| P2 | Dedicated email/WhatsApp templates per return lifecycle event |
| P2 | Reverse pickup API (Shiprocket/Delhivery) — manual AWB only |

---

## AD. Fail-closed cases

- Not delivered → reject
- RTO active → reject
- Window expired → reject
- Extra item → admin approval blocked
- Refund before physical receipt (when return required) → reject
- Disposition `NEEDS_REVIEW` → no refund, no sellable restock
- COD without manual note → reject
- Multiple captured payments → existing Phase 1B block

---

## AE. Remaining manual UAT

1. End-to-end on staging with real photos + admin panel
2. Multi-item order: item A return + item B replacement same order
3. Wrong-item shipping-refundable refund amount vs calculator
4. Replacement OOS → admin fallback to refund
5. COD manual bank transfer audit
6. Zoho partial credit note on staging Zoho org

---

## AF. Ready for final certification

**Engineering verdict:** Core workflow implemented and regression-green.  
**Production certification:** **NO** until AE manual UAT + P2 document/notification items accepted or explicitly waived.

---

## Final verdict (13 questions)

| # | Question | Answer |
|---|----------|--------|
| 1 | Can customer request return after delivery? | **YES** — when eligible |
| 2 | Can partial quantity return? | **YES** |
| 3 | Is stock restored only after physical receipt + disposition? | **YES** |
| 4 | Can damaged item refund without restock? | **YES** — `DAMAGED_NON_RESTOCKABLE` |
| 5 | Can online refund execute correctly? | **YES** — Phase 1E after receipt + disposition (tested) |
| 6 | Can COD return be handled safely? | **YES** — manual path only, fail-closed |
| 7 | Can same-item replacement execute? | **YES** — reserve + ship (manual AWB) |
| 8 | Can size/colour replacement execute? | **YES** — via `requestedVariantId` |
| 9 | Can price-difference replacement use Phase 1E? | **PARTIAL** — delta computed; payment UI P2 |
| 10 | Are refunds/accounting idempotent? | **YES** |
| 11 | Are replacements/inventory idempotent? | **YES** — reserve + restock guards |
| 12 | Is Return/Replacement ready for launch? | **NO** — manual UAT + P2 docs/notifications |
| 13 | Ready for final Sarveda certification? | **NO** — pending AE |

---

SARVEDA RETURN / REPLACEMENT V2 PHASE 2 COMPLETE — READY FOR FINAL CERTIFICATION REVIEW
