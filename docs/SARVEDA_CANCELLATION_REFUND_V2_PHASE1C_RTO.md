# SARVEDA Cancellation / Refund V2 — Phase 1C RTO Workflow

**Date:** 2026-09-01  
**Status:** Complete — ready for review  
**Depends on:** Phase 1A + Phase 1B (unchanged foundations)

---

## Executive summary

Phase 1C implements the **physical RTO workflow** as four separate concepts:

1. **Carrier RTO** — parcel returning per courier (webhook/poll)
2. **Physical receipt** — Sarveda warehouse confirmed receipt
3. **Disposition** — restockable / damaged / needs review → inventory effect
4. **Refund** — money processing (preview only; **automatic execution NOT enabled**)

**Automatic RTO refund execution was intentionally NOT enabled** because partial merchandise-only accounting (native journals + Zoho credit notes) is not yet safe. Gateway refund remains blocked on RTO orders via full-refund path; admin sees `ACCOUNTING_REVIEW_REQUIRED`.

---

## A. Previous RTO behavior (Phase 1A)

| Event | Behavior |
|-------|----------|
| Shiprocket RTO webhook | `handleRtoShipment()` — shipment `RTO`, `fulfillmentStatus=RETURNED`, order note, email, `[RTO_ALERT]` |
| Delhivery / poll RTO | Generic tracking persist only — **no** RTO email/notes (gap) |
| Auto restock | **None** |
| Auto refund | **None** |
| Customer cancel | Blocked (`RTO_IN_PROGRESS`) |

---

## B. New RTO lifecycle

```
NORMAL DELIVERY
      ↓
CARRIER RTO (Shipment.status=RTO, rtoAt set, fulfillment RETURNED)
      ↓
PHYSICAL RECEIPT (rtoReceivedAt, admin actor)
      ↓
DISPOSITION (RESTOCKABLE | DAMAGED_NON_RESTOCKABLE | NEEDS_REVIEW)
      ↓
INVENTORY (exactly-once restock ledger via OrderInventoryRestockEvent)
      ↓
REFUND REVIEW (rtoRefundWorkflowStatus — separate from inventory)
      ↓
[Future] REFUND EXECUTION (blocked until accounting safe)
```

Money and inventory remain **independent** — damaged items can still have the same customer refund policy preview.

---

## C. Schema changes

**Migration:** `20260901120000_rto_physical_receipt_workflow`

### New enums

- `RtoDisposition`: `RESTOCKABLE`, `DAMAGED_NON_RESTOCKABLE`, `NEEDS_REVIEW`
- `RtoRefundWorkflowStatus`: `NOT_APPLICABLE`, `PENDING`, `ACCOUNTING_REVIEW_REQUIRED`, `READY_FOR_REFUND`, `PROCESSING`, `REFUNDED`, `FAILED`

### Shipment fields (additive)

| Field | Purpose |
|-------|---------|
| `rtoReceivedAt` | Physical warehouse receipt timestamp |
| `rtoReceivedByUserId` | Admin actor |
| `rtoDisposition` | Condition disposition |
| `rtoDispositionAt` | Disposition timestamp |
| `rtoDispositionByUserId` | Admin actor |
| `rtoRefundWorkflowStatus` | Refund workflow state (money track) |
| `rtoRefundLastError` | Last refund failure message (future) |

### OrderInventoryRestockSourceType

Added: `RTO_PHYSICAL_RECEIPT` — idempotency scope `{shipmentId}:rto-disposition:{disposition}`

**No Order.status overload** — carrier/physical state lives on `Shipment`.

---

## D. Carrier RTO behavior (preserved + unified)

| Carrier | Phase 1C behavior |
|---------|-------------------|
| **Shiprocket** | RTO labels → `handleRtoShipment()` (unchanged) |
| **Delhivery / poll** | RTO mapped status → **`handleRtoShipment()`** (new — matches Shiprocket side effects) |

Carrier RTO **must NOT**: restock, refund, mark physical receipt, assume condition, post accounting.

---

## E. Physical receipt representation

- **API:** `POST /api/admin/shipments/:shipmentId/rto/received`
- **Service:** `markRtoReceived()` in `rto-workflow.service.ts`
- **Requires:** `Shipment.status === RTO`
- **Idempotent:** second call returns `alreadyReceived: true`
- **Does NOT restock**

Initial refund workflow status on receipt:
- COD → `NOT_APPLICABLE`
- Online captured → `ACCOUNTING_REVIEW_REQUIRED`

---

## F. Disposition representation

- **API:** `POST /api/admin/shipments/:shipmentId/rto/disposition` `{ disposition }`
- **Requires:** `rtoReceivedAt` set first
- **Locked** after RESTOCKABLE or DAMAGED (NEEDS_REVIEW can upgrade)

| Disposition | Restock disposition | onHand change |
|-------------|---------------------|---------------|
| RESTOCKABLE | SELLABLE | Yes (exactly once) |
| DAMAGED_NON_RESTOCKABLE | NON_RESTOCKABLE | No (event only) |
| NEEDS_REVIEW | — | No |

---

## G. Restock behavior

Uses existing `applyOrderInventoryRestockTx()` with `RTO_PHYSICAL_RECEIPT` source type.

- Idempotent on `(sourceType, sourceId, orderItemId)`
- Caps quantity to remaining returnable per line
- **Independent of refund** — partial/gateway refund does not auto-restock

---

## H. Damaged behavior

`DAMAGED_NON_RESTOCKABLE` records `NON_RESTOCKABLE` restock events without incrementing `Inventory.onHand`. No quarantine stock model exists — quantity stays outside sellable inventory (documented limitation).

Customer refund **preview** remains available (refund entitlement ≠ resellability).

---

## I. COD RTO behavior

- Gateway refund = **₹0** (calculator `COD_CANCELLATION` / preview policy)
- No fake Refund rows for Razorpay/Stripe/PayPal
- After disposition (not NEEDS_REVIEW): order → `CANCELLED` with status history
- RESTOCKABLE → inventory restored exactly once

---

## J. Online paid RTO behavior

After physical receipt, admin UI loads Phase 1B calculator with `RTO_SHIPPING_RETAINED`:

- Refunds merchandise net (after coupon allocation)
- Retains customer `Order.shippingInPaise`
- Respects prior partial refunds via `Payment.refundedInPaise`
- Emits `PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED`

**No automatic gateway execution.**

---

## K. Phase 1B calculator integration

- `loadOrderRefundPreview(orderId, { policy: "RTO_SHIPPING_RETAINED" })` used by workflow loader + admin UI
- UI displays calculator output only — **never recomputes in browser**
- `loadRtoWorkflowState()` bundles workflow + preview when `anyReceived`

---

## L. Shipping retention

Uses actual customer-paid `Order.shippingInPaise` — not carrier operational cost. Verified in test L/M.

---

## M. Partial GST reversal analysis

| Capability | Status |
|------------|--------|
| GST extraction in calculator preview | ✅ Per-line inclusive GST via `gstFromInclusiveLine()` |
| Native `ORDER_REFUNDED_FULL` auto-post | ❌ Requires single refund = full grand total |
| Partial merchandise journal builder | ❌ Not implemented |
| Proportional credit note line allocation | ❌ Not implemented |

**Verdict:** Partial GST/accounting **cannot be proven safe** for auto-execution.

---

## N. Native accounting behavior

No new partial refund journal event posted in Phase 1C. Existing `ORDER_REFUNDED_FULL` remains full-refund-only and fail-closed for partial amounts.

---

## O. Zoho credit-note behavior

`createZohoRefundDocumentsForOrder()` still triggers only on `fullyRefunded` and creates **full-invoice** credit notes. Would over-credit after partial RTO gateway refund — **not wired**.

---

## P. Whether automatic RTO refund execution was enabled

**NO.**

`refundExecutionEnabled: false` in workflow state. Admin UI shows:

> Automatic RTO refund execution is disabled — partial merchandise-only accounting is not yet auto-safe.

Manual gateway refund after accounting review remains the safe path until partial accounting is built.

---

## Q. Gateway execution path (blocked)

| Path | Phase 1C |
|------|----------|
| `initiateGatewayRefund()` on RTO order | **Blocked** → `RTO_WORKFLOW_REQUIRED` (409) |
| Admin RefundCancelPanel on RTO orders | **Hidden** (`showRefundActions` excludes RTO) |
| Future RTO partial execute | Not implemented — requires accounting safe path |

Existing `initiatePartialGatewayRefund()` + `reserveGatewayRefund()` / `finalizeGatewayRefund()` infrastructure remains available for future wiring.

---

## R. Refund idempotency

Unchanged Phase 1A/1B payment-layer idempotency. Phase 1C adds no new refund execution paths.

---

## S. Restock idempotency

| Protection | Mechanism |
|------------|-----------|
| Double-click received | `rtoReceivedAt` check |
| Double-click disposition | Same disposition → early return |
| Duplicate restock | `@@unique([sourceType, sourceId, orderItemId])` |
| Webhook retry | Carrier RTO does not restock |

---

## T. Failure/retry behavior

Designed for independent operations:

| Scenario | Behavior |
|----------|----------|
| Received but refund fails (future) | Receipt/disposition/restock retained |
| Restock succeeds, refund pending | Stock correct; refund status separate |
| Accounting sync fails (future) | No duplicate gateway refund (existing reserve/finalize) |

Phase 1C does not implement refund execution retries — status field `rtoRefundLastError` reserved for future.

---

## U. Customer UI

- `rtoCustomerStatus` on order list API (`deriveCustomerRtoStatus()`)
- **Return in transit** — before physical receipt
- **Return received** — after receipt; online orders mention refund review timeline
- Cancel button **not shown** during RTO (existing Phase 1A gate)
- `OrderHistoryCard` violet banner for RTO status

No Return/Replacement workflow exposed.

---

## V. Admin UI

**Component:** `AdminOrderRtoWorkflow.tsx` on order detail page

Stages:
1. Carrier RTO detected (AWB, courier, timestamp)
2. Mark RTO received
3. Disposition buttons (Restockable / Damaged / Needs review)
4. Inventory status from restock ledger
5. Refund preview (Phase 1B breakdown)
6. Refund status + accounting review notice

**RefundCancelPanel** hidden for RTO orders.

---

## W. Notifications

| Event | Notification |
|-------|--------------|
| Carrier RTO | `order_returned` email (existing) |
| Physical receipt | No new "refund completed" email |
| Disposition | No customer notification in Phase 1C |
| Refund completed | Only after authoritative gateway success (unchanged) |

COD orders never receive gateway-refund wording.

---

## X. Tests / build

| Suite | Result |
|-------|--------|
| `rto-phase1c.test.ts` (13 tests) | ✅ Pass |
| `cancellation-phase1a` | ✅ Pass |
| `order-refund-calculator` | ✅ Pass |
| Full `test/commerce` (166 tests) | ✅ Pass |
| `order-refunded-full` accounting (28 tests) | ✅ Pass |
| Backend `tsc` | ✅ Pass |
| Frontend `tsc` | ✅ Pass |
| Frontend production build | ✅ Pass |

### Test matrix coverage

| ID | Case | Covered |
|----|------|---------|
| A | Shiprocket RTO → no restock | ✅ |
| B | Delhivery RTO → no restock | ✅ |
| C | Carrier RTO → no gateway refund | ✅ |
| D | Received → no auto restock before disposition | ✅ |
| E | Received idempotent | ✅ |
| F | RESTOCKABLE → restock once | ✅ |
| G | RESTOCKABLE repeated → no duplicate | ✅ |
| H | DAMAGED → no sellable restock | ✅ |
| I | NEEDS_REVIEW → no restock | ✅ |
| J | COD → no gateway refund | ✅ |
| K | COD RESTOCKABLE → stock once + cancelled | ✅ |
| L/M | Paid preview RTO_SHIPPING_RETAINED + shipping retained | ✅ |
| N–P | Multiple payments / prior partials | Partial (via Phase 1B tests) |
| Q | Full refund blocked before receipt workflow | ✅ |
| R | Calculator refuses (existing) | ✅ |
| S | Accounting gate → execution disabled | ✅ |
| T–W | Gateway/accounting/Zoho retry | N/A (no execution path) |
| X | Damaged still has refund preview | ✅ |
| Y | Customer cancel blocked | ✅ |
| Z | Phase 1A + 1B green | ✅ |

---

## Y. Newly discovered P0/P1

| ID | Severity | Finding |
|----|----------|---------|
| P1-ACC-1 | P1 | No partial merchandise refund native journal or proportional Zoho credit note — blocks auto RTO refund |
| P2-INV-1 | P2 | No damaged/quarantine inventory bucket — damaged goods tracked as event-only |

No new P0 security/financial regressions identified.

---

## Z. Ready for Phase 1D adjustments

**YES** — RTO physical workflow is independent of order modification reasons 4/5/6.

---

## AA. Ready for Phase 2 Return/Replacement

**YES (with prerequisites)** — disposition + restock ledger can extend to customer-initiated returns once Return/Replacement service request types and accounting partial path are built.

**Prerequisites before customer returns at scale:**
1. Partial refund accounting (`ORDER_REFUNDED_PARTIAL` or equivalent)
2. Proportional Zoho credit note
3. Optional quarantine inventory model for damaged goods

---

## Backend files changed / added

| File | Role |
|------|------|
| `prisma/schema.prisma` | RTO enums + Shipment fields + restock source type |
| `prisma/migrations/20260901120000_rto_physical_receipt_workflow/` | Migration |
| `src/modules/orders/rto-workflow.service.ts` | Core workflow |
| `src/modules/shipping/orderLifecycle.ts` | Unified Delhivery/poll RTO → `handleRtoShipment` |
| `src/modules/payments/refund.service.ts` | Block full refund on RTO orders |
| `src/modules/admin/admin.handlers.ts` | RTO API handlers |
| `src/modules/admin/admin.routes.ts` | RTO routes |
| `src/modules/orders/orders.controller.ts` | Customer `rtoCustomerStatus` |
| `test/commerce/rto-phase1c.test.ts` | Phase 1C tests |

## Frontend files changed / added

| File | Role |
|------|------|
| `components/admin/AdminOrderRtoWorkflow.tsx` | Admin RTO panel |
| `lib/admin-api.ts` | RTO API client |
| `app/admin/orders/[id]/page.tsx` | RTO panel + hide full refund on RTO |
| `components/orders/OrderHistoryCard.tsx` | Customer RTO banner |
| `lib/orders-api.ts` | `rtoCustomerStatus` type |

---

## Phase 1A / 1B integrity

| Protection | Status |
|------------|--------|
| Dispatch cancellation gate | ✅ Unchanged |
| Phase 1B calculator | ✅ Used for preview |
| Carrier RTO no auto-refund/restock | ✅ Preserved |
| Payment picker / idempotency | ✅ Unchanged |
| Money refund ≠ inventory restock | ✅ Preserved |

---

SARVEDA CANCELLATION / REFUND V2 PHASE 1C RTO COMPLETE — READY FOR REVIEW
