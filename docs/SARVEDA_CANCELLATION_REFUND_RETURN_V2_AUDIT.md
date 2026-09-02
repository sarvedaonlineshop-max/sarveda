# Sarveda Cancellation / Refund / Return / Replacement V2 — Phase 1 Architecture Audit

**Date:** 2026-09-01  
**Mode:** READ-ONLY — no code, schema, DB, provider, or deployment changes  
**Scope:** Post-order customer-service lifecycle redesign foundation

---

## Executive summary

Sarveda already separates **customer request** (`OrderServiceRequest`), **gateway money movement** (`Refund` + provider APIs), and **physical restock** (`OrderInventoryRestockEvent`) at the schema and service-comment level. The P1 remediation correctly established that **partial monetary refund must not auto-restock**.

However, V2 business requirements are **not fully supported** by current production behavior:

| Area | Current state | V2 gap |
|------|---------------|--------|
| Cancellation eligibility | Order status only; `SHIPPED` still cancellable | Must gate on dispatch/shipment |
| Approve cancellation | Sets `CANCELLED` only; **no gateway refund** | Paid cancel needs linked refund workflow |
| RTO | Shiprocket auto-cancels + restocks; Delhivery passive | Needs explicit RTO-received workflow, no auto-refund |
| Refund calculator | `grandTotalInPaise` caps; no shipping-retained policy | Needs component breakdown |
| Adjustment reasons (4/5/6) | Treated as cancel | Needs separate resolution path |
| Return/replacement | Post-delivery request + admin refund | Phase 2 — boundaries defined below |

**Recommendation:** V2 requires schema + backend + admin UI work before launch-safe cutover. Return/replacement should be **Phase 2** after cancellation/RTO/refund foundation.

---

## 1. CURRENT ARCHITECTURE

### Domain entities (Prisma)

| Entity | Role |
|--------|------|
| `Order` | Commercial header: `subtotalInPaise`, `discountInPaise`, `shippingInPaise`, `taxInPaise`, `grandTotalInPaise`, `status`, `paymentStatus`, `fulfillmentStatus` |
| `OrderItem` | Line snapshots: `unitPriceInPaise`, `discountInPaise`, `taxInPaise`, `lineTotalInPaise`, `qtyOrdered` |
| `Payment` | Per-order payment attempt: `provider`, `status`, `amountInPaise`, `refundedInPaise`, `providerPaymentId` |
| `Refund` | Gateway refund ledger row: `paymentId`, `amountInPaise`, `providerRefundId`, `status` (string) |
| `OrderServiceRequest` | Customer cancel/return request: `type`, `status`, items, photos, refund totals |
| `OrderServiceRequestItem` | Per-line reason + optional `refundAmountInPaise` |
| `OrderInventoryRestockEvent` | Authoritative physical return: `disposition` (SELLABLE/DAMAGED/NON_RESTOCKABLE), `sourceType` |
| `Shipment` | Carrier row: `awb`, `status` (incl. `RTO`), `deliveredAt`, `rtoAt`, `carrierMeta` |
| `Invoice` | Sarveda PDF tax invoice — **never voided** on refund |
| `AccountingJournalEntry` | Native double-entry (ORDER_PAID, ORDER_REFUNDED_FULL, COGS reversal) |

**Key files:**
- `backend/src/modules/orders/order-service-request.service.ts`
- `backend/src/modules/payments/refund.service.ts`, `refund-sync.service.ts`
- `backend/src/modules/orders/orders.service.ts` (`handlePaidOrderStatusChange`, stock)
- `backend/src/modules/orders/order-inventory-restock.service.ts`
- `backend/src/modules/shipping/orderLifecycle.ts`
- `backend/src/modules/accounting/order-paid-journal.builder.ts`, `order-refunded-full-*.ts`
- `backend/src/modules/zoho/zoho-financials.ts`

### Conceptual separation (existing)

```
Customer Request (OrderServiceRequest)
        ↓ admin approve/reject
Admin Decision (status change, notes)
        ↓ separate action
Payment Refund (Refund row + gateway API)
        ↓ only when fully refunded OR cancel
Inventory Restock (OrderInventoryRestockEvent)
        ↓ async
Accounting (Zoho credit note / native journal)
```

**Principle preserved:** `Refund` rows are not restock provenance. Restock uses `OrderInventoryRestockEvent` or full-order status change.

---

## 2. CURRENT CUSTOMER FLOW

### Entry points

| Route | Purpose |
|-------|---------|
| `/profile` → Your Orders | `OrderHistoryCard` action buttons |
| `/profile/orders/{orderNumber}/cancel` | Cancellation request form |
| `/profile/orders/{orderNumber}/return` | Return/refund request form |
| `/order/cancelled` | Unpaid checkout abandoned |
| `/refunds` | Static policy page |

### Cancellation reasons (customer)

Defined in `order-service-request.constants.ts` / `frontend/lib/order-service-request.ts`:

1. Placed the order by mistake (`mistake`)
2. Found it cheaper somewhere else (`price_high`)
3. Delivery is taking too long (`delivery_slow`)
4. Need to change the delivery address (`change_address`)
5. Ordered the wrong item, size, or colour (`wrong_item`)
6. Need to change the quantity (`change_quantity`)
7. No longer needed (`no_longer_needed`)
8. Other (`other`)

**Note:** V2 spec lists 7 reasons ending in "Others"; production has 8 including `no_longer_needed`.

### Return reasons (customer — Phase 2 preview)

11 reasons including defective, wrong item, damaged, replace variant, changed mind, other. Photos **required** per item.

### Eligibility (backend `canRequestCancel` / `canRequestRefund`)

**Cancel (`canRequestCancel`):**
- ❌ `DELIVERED`, `CANCELLED`, `REFUNDED`
- ✅ Paid for service: `paymentStatus === CAPTURED` OR `status === PAID` OR COD (not pending/cancelled/refunded)
- **Does NOT check:** `Shipment.status`, AWB existence, `SHIPPED`/`PACKED`

**Return (`canRequestRefund`):**
- ✅ `status === DELIVERED` only
- ✅ Paid for service
- ✅ Within **7 days** of `resolveDeliveredAt()` (shipment `deliveredAt` or status history)
- Blocked if `PENDING_APPROVAL` service request exists

### Request submission

- `POST /api/orders/:orderNumber/cancel-request` — auth required, multipart (optional photos)
- `POST /api/orders/:orderNumber/refund-request` — auth required, photos required per item
- One `PENDING_APPROVAL` request per order at a time
- `qtySelected` is always set to full `qtyOrdered` — **no partial quantity selection**

### Customer-visible status

`OrderHistoryCard` shows banners for `serviceRequest.status`:
- `PENDING_APPROVAL` — waiting
- `APPROVED` / `REJECTED` — outcome
- No distinct "refund initiated" / "refund completed" customer states beyond order `paymentStatus`

### Automatic cancellations (not customer-initiated)

| Trigger | Behavior |
|---------|----------|
| Payment timeout (15 min) | `cancelUnpaidOrderWithRelease` — releases reservation, no customer email |
| Payment failure webhook | Same for online payments |
| New checkout supersedes | Prior unpaid order cancelled |
| Shiprocket RTO webhook | `handleRtoShipment` → `CANCELLED` + restock + notify |

---

## 3. CURRENT ADMIN FLOW

### Direct actions (`admin.handlers.ts`)

| Action | Endpoint | When |
|--------|----------|------|
| Cancel unpaid | `POST /admin/orders/:id/cancel` | `PENDING_PAYMENT` → release stock |
| Cancel COD | same | `handlePaidOrderStatusChange(CANCELLED)` + restock |
| Cancel paid online | same | **Blocked** — `USE_REFUND` |
| Full gateway refund | `POST /admin/orders/:id/refund` | Captured payment; refunds **remaining** amount |
| Status patch | `PATCH /admin/orders/:id/status` | Can set `CANCELLED`/`REFUNDED` — **restocks without gateway** |
| Inventory restock | `POST /admin/orders/:id/inventory-restock` | Explicit physical return |
| AWB cancel | shipping controller | Delhivery/Shiprocket void before dispatch |

### Service request workflow (`AdminOrderServiceRequests.tsx`)

1. **Approve** — cancellation → `CANCELLED` only; return → status only (**no money**)
2. **Reject** — updates request + emails customer
3. **Process refund** — per-item rupee amounts (editable text fields), gateway or COD note

**Critical ops gap:** Approving a paid customer's cancellation request does **not** trigger Razorpay/Stripe/PayPal refund. Admin must separately use "Refund to customer" or service-request refund panel.

### Authorization

- All admin routes: `requireAdmin` (JWT, role `ADMIN` | `SUPER_ADMIN`)
- No elevated permission for refunds vs cancel
- `logAdminMutations` audits POST/PATCH including `REFUND` classification
- `reviewedByEmail` stored on service requests; `changedBy` on status history (optional UUID)

---

## 4. CURRENT REFUND MODEL

### `Refund` table

```
Refund {
  paymentId        → Payment
  amountInPaise    → integer
  providerRefundId → unique when set (partial index)
  status           → "pending" | "processed" | "created" | "failed" (untyped string)
  reason           → optional
}
```

**Not stored on Refund:**
- `orderId`, `orderItemId`, `variantId`, quantity
- Shipping component, tax component, discount allocation
- `requestedBy`, `approvedBy` (only on `OrderServiceRequest`)
- Link to `OrderServiceRequest`

**Association to items:** via `OrderServiceRequestItem.refundAmountInPaise` + `refundProviderId` after admin processes service-request refund.

### Refund capacity model (`refund-sync.service.ts`)

- `pending` / `created` / `processed` rows **reserve** refundable capacity
- `failed` releases capacity
- `Payment.refundedInPaise` = sum of `processed` only
- `SELECT … FOR UPDATE` on payment during reserve

### Full vs partial

| Type | Order status | Restock | Zoho credit note | Native ORDER_REFUNDED_FULL |
|------|--------------|---------|------------------|----------------------------|
| Full gateway | `REFUNDED` | Yes (SELLABLE events) | Yes (async) | Yes (if single full refund) |
| Partial gateway | unchanged | No | No | No |
| COD manual (service request) | unchanged | No | No | No (COD excluded) |
| Cancel (no refund row) | `CANCELLED` | Yes | Void invoice if no capture | No |

---

## 5. RAZORPAY REFUND FLOW

**Initiate:** `refundRazorpay()` → `rzp.payments.refund(paymentId, { amount, notes })`

**Reserve → call → finalize:**
1. `reserveGatewayRefund` creates `pending` row
2. API returns `providerRefundId`
3. `finalizeGatewayRefund` sets `processed`, recomputes payment/order status
4. If fully refunded → `handlePaidOrderStatusChange(REFUNDED)` + Zoho docs

**Webhook:** `razorpay.webhook.ts` — `refund.created`, `refund.processed` → `applyExternalProviderRefund`

**Idempotency:** `providerRefundId` unique; duplicate → `DUPLICATE_REFUND` 409 (P1 fix)

**Gaps:** No `refund.failed` webhook handler; failed admin path uses `failReservedRefund`

---

## 6. STRIPE REFUND FLOW

**Initiate:** `refundStripe()` → `stripe.refunds.create({ payment_intent, amount, reason: "requested_by_customer" })`

**Webhook:** `charge.refunded` + `refund.*` events → `applyExternalProviderRefund`

**Status mapping:** `succeeded` → processed, `failed` → failed, `pending` → pending

---

## 7. PAYPAL REFUND FLOW

**Initiate:** `refundPayPal()` → `POST /v2/payments/captures/{captureId}/refund`

**Webhook:** `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.REFUND.COMPLETED`

**Payment resolution:** `custom_id` (DB payment UUID) and/or capture ID from links

---

## 8. COD FLOW

### Checkout (`checkout.service.ts`)

COD orders: `reserveStockTx` + `confirmStockTx` in **same transaction** at checkout.
- Order → `PAID`, `paymentStatus` → `PENDING`
- Stock deducted immediately (not reserved-only)
- Payment timeout job **skipped** for COD

### Cancellation

| Path | Stock | Money | Refund row |
|------|-------|-------|------------|
| Admin cancel COD | Restock via `CANCELLED` | Manual message | None |
| Approve customer cancel request | Restock | None | None |
| Customer cancel before dispatch | Request only | N/A until approved | None |

### COD refund (service request)

- Requires `codRefundNote` (UPI/bank details)
- Updates `OrderServiceRequestItem.refundAmountInPaise`, `refundProviderId: "COD_MANUAL"`
- **Does not** set order `REFUNDED` or create `Refund` row
- No gateway API call (correct)

---

## 9. CURRENT INVENTORY REVERSAL

### Stock lifecycle

| Stage | Function | `onHand` | `reserved` |
|-------|----------|----------|------------|
| Checkout | `reserveStockTx` | — | +qty |
| Paid / COD confirm | `confirmStockTx` | -qty | -reserved |
| Unpaid cancel / timeout | `releaseStockTx` | — | -reserved |
| Paid cancel / full refund | `restockPaidOrderTx` | +qty (SELLABLE) | — |
| Partial refund | — | unchanged | — |
| Admin explicit restock | `adminApplyInventoryRestock` | +qty if SELLABLE | — |

**No `InventoryMovement` ledger** — audit via `OrderInventoryRestockEvent` + counters.

### Restock dispositions

- `SELLABLE` — increments `onHand`
- `DAMAGED` / `NON_RESTOCKABLE` — event only

### Idempotency

Unique `(sourceType, sourceId, orderItemId)` prevents double restock.

---

## 10. CURRENT ACCOUNTING / GST REVERSAL

### Dual systems

1. **Zoho Books** — operational invoices, credit notes, customer payments
2. **Native accounting** — journals behind feature flags

### Sale (ORDER_PAID)

`order-paid-journal.builder.ts` splits:
- Product sales (4000) — post-discount merchandise via `allocateOrderDiscountPaise`
- Shipping income (4100)
- Discounts contra (4200)
- Output CGST/SGST/IGST (2100–2102) — from inclusive line GST extraction
- Clearing account by provider (1020–1022) or AR for COD

### Full refund (ORDER_REFUNDED_FULL)

Exact inversion of ORDER_PAID journal — only when:
- Single authoritative `processed` refund = `grandTotalInPaise`
- Original ORDER_PAID journal exists
- Razorpay/Stripe/PayPal only (COD excluded)
- **Cumulative partials that sum to total do NOT auto-post**

### Partial refund accounting

- No native auto-post
- No Zoho credit note auto-generation
- Reconciliation worker flags `UNPOSTED_PARTIAL`

### COGS reversal

Triggered by SELLABLE `OrderInventoryRestockEvent` with `inventoryIncremented=true` → `INVENTORY_COGS_REVERSED` journal.

---

## 11. CURRENT CREDIT NOTE FLOW

**Zoho only** (`createZohoRefundDocumentsForOrder`):
1. Triggered on **full** gateway refund only
2. Creates credit note from invoice line items + shipping
3. Applies to original invoice
4. Records credit note refund (bank transfer)
5. Stores `zohoCreditNoteId` on payment `rawPayload`

**Sarveda native invoice:** PDF persists; never voided on refund.

**Cancel before capture:** `voidZohoInvoiceForCancelledOrder` voids Zoho invoice.

---

## 12. CURRENT SHIPMENT / RTO MODEL

### Shipment statuses

`CREATED` → `PICKED` → `INTRANSIT` → `OUT_FOR_DELIVERY` → `DELIVERED` | `RTO`

### Order status coupling

- Tracking updates can promote order to `SHIPPED`, `DELIVERED`
- RTO sets `fulfillmentStatus: RETURNED`

### RTO handling

| Source | Behavior |
|--------|----------|
| **Shiprocket webhook** | `handleRtoShipment`: shipment `RTO`, order `CANCELLED`, **full restock**, `order_returned` email/WhatsApp |
| **Delhivery webhook** | Shipment status RTO only — **no order cancel** |
| **Polling** | Excludes RTO shipments from sync |

**Gap:** RTO auto-cancels and restocks **without** admin physical-receipt confirmation. Contradicts V2 principle ("restock when Sarveda confirms receipt").

### Carrier cancellation (pre-dispatch)

- Delhivery: `cancelShipment` / MPS cancel
- Shiprocket: multiple cancel API shapes
- Admin UI: cancel AWB before dispatch; "Remove label only" if already cancelled in carrier dashboard
- **No automatic** carrier cancel when customer cancellation approved

### Intercept / RTO request

- Delhivery reverse pickup (RVP) exists for returns
- No explicit "request intercept" workflow for in-transit cancellation

---

## 13. CURRENT NOTIFICATION MODEL

| Event | Email | WhatsApp | Trigger |
|-------|-------|----------|---------|
| Service request submitted | Customer + care@sarveda.com | No | `notifyServiceRequestSubmitted` |
| Service request reviewed | Customer + care | No | `notifyServiceRequestReviewed` |
| `refund_initiated` | Yes | Yes | Gateway refund success |
| `order_cancelled` | Yes | Yes | Admin cancel, status patch |
| `order_returned` | Yes | Yes | Shiprocket RTO |
| `order_shipped` / `delivered` | Yes | Yes | Tracking milestones |

**Gaps:** No WhatsApp for service-request submit/approve. Approve does not send refund-initiated.

---

## 14. SECURITY / AUTHORIZATION

| Action | Current gate |
|--------|--------------|
| Customer cancel/return request | `requireAuth` + order ownership |
| Admin approve/reject/refund | `ADMIN` or `SUPER_ADMIN` |
| Direct full refund | Same — no extra gate |
| Status patch to REFUNDED | Same — **high risk** |
| Inventory restock | Same |

**Audit trail:**
- `OrderServiceRequest.reviewedByEmail`, `adminNote`
- `OrderStatusHistory.reason`, `changedBy` (optional)
- Admin activity log for mutations
- **No immutable financial audit log** for refund amount decisions

---

## 15. IDENTIFIED GAPS

### P0/P1-class (launch blockers for V2)

| # | Gap |
|---|-----|
| G1 | **Approve cancel does not refund** captured online payments |
| G2 | **`PATCH status → REFUNDED`** restocks without gateway money movement |
| G3 | **Cancellation allowed while `SHIPPED`** — no dispatch gate (backend or frontend) |
| G4 | **Shiprocket RTO auto-restock** without physical receipt confirmation |
| G5 | **No shipping-retained refund calculator** — only `grandTotalInPaise` caps |
| G6 | **Payment picker** uses newest `.find()` not authoritative captured payment |
| G7 | **No adjustment workflow** for address/variant/qty change reasons |

### P2-class

| # | Gap |
|---|-----|
| G8 | Delhivery RTO does not trigger workflow |
| G9 | `Refund.status` untyped string |
| G10 | `created` refund status can reserve capacity indefinitely |
| G11 | Partial refunds: no Zoho credit note, no native journal |
| G12 | Service-request refund allowed on approved **cancel** type (no type guard) |
| G13 | No customer request withdrawal |
| G14 | `qtySelected` always full line qty |
| G15 | No `CONTACTED` / `RESOLVED_BY_ADJUSTMENT` states |
| G16 | No concurrency guard: shipment dispatches while admin approves cancel |

---

## 16. PROPOSED CANCELLATION STATE MACHINE

Smallest correct model extending `OrderServiceRequest`:

```
                    ┌─────────────┐
                    │  REQUESTED  │  (= PENDING_APPROVAL)
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐   ┌────────────┐   ┌──────────────┐
    │ CONTACTED  │   │  REJECTED  │   │  WITHDRAWN   │
    └─────┬──────┘   └────────────┘   └──────────────┘
          │
    ┌─────┴──────────────────────────┐
    ▼                                  ▼
┌──────────┐                  ┌─────────────────────┐
│ APPROVED │                  │ RESOLVED_BY_ADJUST  │
│ (cancel) │                  │ (address/qty/variant)│
└────┬─────┘                  └─────────────────────┘
     │
     ▼
┌─────────────────┐     ┌──────────────┐
│ FULFILMENT_STOP │ ──► │ REFUND_LINKED │ (if prepaid)
└─────────────────┘     └──────────────┘
```

**Rules:**
- `APPROVED` triggers fulfilment stop + stock reversal policy (pre-dispatch only)
- `REFUND_LINKED` is separate sub-state or spawns `RefundWorkflow`
- `RESOLVED_BY_ADJUSTMENT` closes request without cancel/refund
- Customer cannot reach `APPROVED` without admin action

---

## 17. PROPOSED REFUND STATE MACHINE

Separate from cancellation request — money movement entity:

```
REQUESTED (optional — tied to service request)
    ↓
APPROVED_FOR_REFUND (admin confirms amount breakdown)
    ↓
REFUND_PENDING (reserved row created)
    ↓
REFUND_PROCESSING (provider API called)
    ↓
REFUNDED | REFUND_FAILED
```

**Mapping to current:**
- `REFUND_PENDING` ≈ `Refund.status = pending`
- `REFUND_PROCESSING` ≈ `created` (awaiting webhook)
- `REFUNDED` ≈ `processed`
- `REFUND_FAILED` ≈ `failed`

**Admin approval ≠ gateway success** — keep distinct.

For partial refunds, order stays active; only `paymentStatus` → `PARTIALLY_REFUNDED`.

---

## 18. PROPOSED RTO STATE MACHINE

**New operational concept** (not customer return):

```
IN_TRANSIT
    ↓ carrier reports RTO
RTO_INITIATED (shipment.status = RTO, order NOT auto-cancelled)
    ↓ Sarveda physically receives
RTO_RECEIVED (admin confirms + disposition)
    ↓
┌─────────────────┬────────────────────┐
│ RESTOCK_SELLABLE│ RESTOCK_DAMAGED    │
└────────┬────────┴──────────┬─────────┘
         ▼                   ▼
   Inventory event      Inventory event
         ↓
   REFUND_EVALUATION (product amount, shipping retained per policy)
         ↓
   REFUND_PENDING → REFUNDED
```

**Replace** current `handleRtoShipment` auto-cancel+restock with this gated workflow.

---

## 19. CUSTOMER UI DESIGN (proposed)

### Eligibility display (`getCancellationEligibility`)

| State | Customer action | Message |
|-------|-----------------|---------|
| Unpaid | None (or resume checkout) | "Payment not completed" |
| Paid, not dispatched | **Cancel order** | Submit request |
| Paid, dispatched/in transit | **Contact support** (no self-cancel) | "Your order is on the way" |
| Delivered, ≤7 days | **Return or replace** | Phase 2 |
| Delivered, >7 days | None | "Return window closed" |
| Cancel requested | View status | "Under review" |
| RTO in progress | Informational | "Delivery could not be completed" |

### Status chips (customer-friendly)

- Cancellation requested
- Under review
- Cancellation approved
- Cancellation rejected
- Refund initiated
- Refund completed
- Resolved — order updated (adjustment)

**Do not expose:** journal IDs, provider refund IDs, COGS, Zoho references.

---

## 20. ADMIN UI DESIGN (proposed)

### Single **Cancellation & Refunds** card

**Read-only panel:**
- Customer request (type, reasons per item, photos, note)
- Payment method, captured amount, refunded to date, remaining
- Fulfilment: order status, shipment status, AWB, dispatch time
- Amount breakdown: merchandise, discount, shipping, tax, grand total
- **Calculated refundable** (per policy selector)
- Prior refunds list
- Inventory implication preview

**Actions (eligibility-gated):**
| Action | When |
|--------|------|
| Mark contacted | Request pending |
| Approve cancellation | Pre-dispatch, request valid |
| Reject | Any pending |
| Resolve as adjustment | Reasons 4/5/6 |
| Stop fulfilment / cancel AWB | AWB exists, not picked |
| Initiate refund | Approved + amount confirmed |
| Retry failed refund | `REFUND_FAILED` |
| Mark RTO received | Shipment RTO + physical receipt |
| Restock (disposition) | After RTO received or return |
| Process return refund | Phase 2 |

**Remove or restrict:** Unrestricted status patch to `REFUNDED`.

---

## 21. REFUND CALCULATION DESIGN (proposed)

### Authoritative server function: `calculateRefund(options)`

**Inputs:**
```typescript
{
  order: Order + items + payments + prior Refunds,
  policy: 'FULL' | 'PRODUCT_ONLY' | 'SELECTED_ITEMS' | 'SELECTED_QTY',
  selectedItems?: { orderItemId, qty }[],
  includeShipping: boolean,
  priorRefunds: Refund[],
}
```

**Outputs:**
```typescript
{
  lines: [{ orderItemId, qty, merchandisePaise, discountPaise, taxPaise }],
  shippingPaise: number,
  shippingTaxPaise: number,
  grossRefundPaise: number,
  remainingRefundablePaise: number,
  warnings: string[],
  allocationVersion: string,
}
```

**Rules:**
1. Reuse `allocateOrderDiscountPaise` for line-level discount reversal
2. Reuse GST extraction from `order-paid-journal.builder.ts` math
3. Shipping: explicit policy flag — `includeShipping: true` only for pre-dispatch full cancel
4. In-transit / RTO: `includeShipping: false` (product amount only per V2 proposed rule)
5. Cap: `min(calculated, payment.captured - payment.refundedInPaise)`
6. **Frontend displays breakdown; backend authorizes**

**Existing foundation:** `discount-allocation.ts`, `order-paid-journal.builder.ts`, `order-refunded-full-journal.builder.ts` (inversion logic).

---

## 22. INVENTORY MATRIX

| Scenario | Reserve | Deduct | Cancel/Refund event | Restock trigger | Result onHand |
|----------|---------|--------|---------------------|-----------------|-------------|
| Checkout online unpaid | +qty | — | Timeout cancel | `releaseStockTx` | unchanged |
| Paid online | was reserved | -qty on capture | — | — | -qty |
| COD checkout | +qty | -qty same tx | — | — | -qty |
| Cancel before dispatch (paid) | — | — | `CANCELLED` | `restockPaidOrderTx` | +qty |
| Approve cancel (paid, no refund yet) | — | — | `CANCELLED` | restock | +qty |
| Partial monetary refund | — | — | — | **none** | unchanged |
| Full refund | — | — | `REFUNDED` | `restockPaidOrderTx` | +qty |
| Admin explicit return | — | — | — | `ADMIN_EXPLICIT` SELLABLE | +qty |
| Shiprocket RTO (current) | — | — | `CANCELLED` | auto restock | +qty ⚠️ |
| RTO received (proposed) | — | — | admin marks | restock after disposition | +qty |
| Return damaged | — | — | — | DAMAGED event | unchanged |

---

## 23. ACCOUNTING MATRIX

| Scenario | Invoice | Zoho | Native journal | Credit note |
|----------|---------|------|----------------|-------------|
| COD cancel pre-dispatch | PDF persists | Void invoice | No refund journal | N/A |
| Paid cancel pre-dispatch + full refund | PDF persists | Credit note (full) | ORDER_REFUNDED_FULL | Yes |
| Paid in-transit, product-only refund | PDF persists | Manual partial CN? | Not auto-posted | **Gap** |
| Partial item refund | PDF persists | Manual | UNPOSTED_PARTIAL | **Gap** |
| Multiple partials = full | PDF persists | Manual | Not auto (by design) | **Gap** |
| RTO shipping retained | PDF persists | Partial CN needed | New event type needed | **Gap** |
| COD manual refund note | PDF persists | Manual | COD excluded | N/A |

**Principle confirmed:** Issued invoices are never deleted. Reversals via credit note / refund journal.

---

## 24. PROVIDER MATRIX

| Capability | Razorpay | Stripe | PayPal | COD |
|------------|----------|--------|--------|-----|
| Full refund API | ✅ | ✅ | ✅ | N/A |
| Partial refund API | ✅ | ✅ | ✅ | N/A |
| Webhook reconciliation | ✅ (no failed event) | ✅ | ✅ | N/A |
| Idempotency | providerRefundId unique | same | same | N/A |
| Currency validation | INR primary | multi | multi | N/A |
| Manual refund path | — | — | — | codRefundNote |
| Auto refund on cancel approve | ❌ must call separately | ❌ | ❌ | N/A |

---

## 25. CONCURRENCY / IDEMPOTENCY DESIGN

| Risk | Current | Proposed |
|------|---------|----------|
| Admin double-click refund | `reserveGatewayRefund` + FOR UPDATE | Keep + UI disable |
| Two admins approve | `ALREADY_REVIEWED` 409 | Keep |
| Customer double submit | `REQUEST_PENDING` 409 | Keep |
| Webhook during admin action | `applyExternalProviderRefund` idempotent | Keep |
| Shipment dispatches during approve | **No guard** | Eligibility re-check in transaction before approve |
| Refund API timeout | `pending` row; webhook may complete | Reconciliation job for stuck `pending`/`created` |
| Duplicate providerRefundId | DUPLICATE_REFUND 409 (P1) | Keep |
| Late payment after cancel | Unpaid cancel releases stock; paid path separate | Explicit reconcile job |

---

## 26. PHASE 2 RETURN / REPLACEMENT BOUNDARIES

**Do not implement in V2 Phase 1.** Design boundaries now:

| Concept | V2 cancellation architecture must leave room for |
|---------|--------------------------------------------------|
| Request type | Add `RETURN`, `REPLACEMENT` to `OrderServiceRequestType` |
| Outcomes | REFUND, REPLACE (new order/challan), KEEP_ITEM_PARTIAL_REFUND |
| Inventory | Reuse `OrderInventoryRestockEvent` + disposition |
| Refund | Reuse `calculateRefund` with item/qty selection |
| Shipping | Reverse logistics via Delhivery RVP / Shiprocket return AWB |
| Replacement | Link to `DeliveryChallanReason.REPLACEMENT` (exists) |

Cancellation architecture should **not** conflate post-delivery return with pre-delivery cancel.

---

## 27. REQUIRED SCHEMA CHANGES

| Change | Priority |
|--------|----------|
| `OrderServiceRequestStatus` + `CONTACTED`, `RESOLVED_BY_ADJUSTMENT`, `WITHDRAWN` | High |
| `OrderServiceRequestType` + adjustment subtype or `resolutionType` enum | High |
| `Refund` → optional `orderServiceRequestId`, `approvedByUserId` | Medium |
| `Refund` component breakdown JSON (`merchandisePaise`, `shippingPaise`, `taxPaise`) | High |
| `Refund.status` → Prisma enum | Medium |
| `RtoReceipt` or `Shipment.rtoReceivedAt` + `rtoDisposition` | High |
| `OrderServiceRequestItem.qtySelected` < `qtyOrdered` support | Medium (Phase 2) |
| `CancellationEligibilitySnapshot` (cached dispatch state at request time) | Low |
| Financial audit log table | Medium |

---

## 28. REQUIRED BACKEND CHANGES

1. `getCancellationEligibility(order)` — authoritative server function
2. `calculateRefund(...)` — component breakdown
3. Gate `canRequestCancel` on shipment dispatch state
4. Link approve-cancel → auto-initiate refund for captured payments (or enforce two-step with blocking)
5. Replace RTO auto-cancel with `RTO_RECEIVED` workflow
6. Restrict `patchOrderStatus(REFUNDED)` — require gateway refund or super-admin override
7. Unify payment picker with `pickPrimaryPayment`
8. Carrier cancel hook on approve-cancel (pre-dispatch)
9. Adjustment resolution endpoints (address/variant/qty — likely new order, not mutate invoiced order)
10. Stuck refund reconciliation job
11. Partial refund accounting events (Phase 1b or post-launch)

---

## 29. REQUIRED CUSTOMER FRONTEND CHANGES

1. Eligibility-driven buttons from API (`customerAction`, `blockedReason`)
2. Status chips for request + refund lifecycle
3. Hide cancel when dispatched (backend-enforced)
4. Separate "Contact support" for in-transit
5. Adjustment reason UX (message that team will contact)
6. No client-side refund amount calculation

---

## 30. REQUIRED ADMIN FRONTEND CHANGES

1. Unified Cancellation & Refunds card
2. Refund breakdown display from `calculateRefund`
3. Policy toggle: full vs product-only (shipping retained)
4. Remove/disable dangerous status patch to REFUNDED
5. RTO received + disposition UI
6. Adjustment resolution flow
7. Concurrency: disable buttons during processing
8. Show remaining refundable prominently

---

## 31. REQUIRED TESTS

| Suite | Cases |
|-------|-------|
| Eligibility | COD-A, COD-B, PAID-A, PAID-B, delivered, RTO |
| Refund calculator | Full, product-only, coupon, free shipping, multi-item |
| Payment selection | Failed+success, double capture, partial then full |
| Cancel approve + refund | End-to-end prepaid |
| RTO workflow | No restock until received |
| Concurrency | Dispatch during approve, double refund |
| Accounting | Pre-dispatch full, in-transit partial, shipping retained |
| Inventory matrix | All rows in §22 |
| Provider | Razorpay/Stripe/PayPal idempotency |
| Regression | Partial refund does NOT restock (P1) |

---

## 32. MIGRATION SAFETY

1. **No rewrite of historical financial records** — new workflows apply forward
2. In-flight `PENDING_APPROVAL` requests: migrate to new status enum with mapping
3. Existing `Refund` rows remain valid; add optional breakdown columns nullable
4. Shiprocket RTO behavior change: feature-flag `RTO_V2_WORKFLOW` per carrier
5. Disable `patchOrderStatus(REFUNDED)` via config before enabling new UI
6. Zoho partial credit notes may need manual backlog for open partial refunds

---

## 33. LAUNCH RISK

| Risk | Severity | Mitigation |
|------|----------|------------|
| Approve cancel without refund (paid) | **Critical** | Block launch until linked workflow |
| Status patch REFUNDED without money | **Critical** | Restrict immediately |
| Cancel while shipped | **High** | Backend dispatch gate |
| RTO auto-restock | **High** | RTO V2 workflow |
| Shipping-retained refund manual errors | **High** | `calculateRefund` |
| Partial refund accounting gap | **Medium** | Manual Zoho until Phase 1b |
| Multi-payment refund wrong provider | **Medium** | `pickPrimaryPayment` |
| Customer receives goods after refund | **High** | Defer refund until RTO/intercept confirmed |

---

## FINAL DECISION TABLE

| # | Question | Answer |
|---|----------|--------|
| **A** | Can existing cancellation model support V2 unchanged? | **No** — dispatch gating, adjustment path, refund linkage, RTO workflow missing |
| **B** | Should CancellationRequest and Refund remain separate? | **Yes** — keep `OrderServiceRequest` (request/decision) separate from `Refund` (money); link them |
| **C** | Can admin currently refund arbitrary amounts? | **Yes** — per-item rupee text fields in service-request refund panel; capped by line total and order remaining |
| **D** | Is that safe? | **Partially** — caps exist but no component breakdown; shipping-retained policy not enforceable; typos possible |
| **E** | Is refund tied to correct captured Payment? | **Mostly** — uses newest `CAPTURED`/`PARTIALLY_REFUNDED`; accounting has smarter `pickPrimaryPayment` but refund path doesn't use it |
| **F** | Is partial refund accounting correct? | **No auto-post** — native and Zoho both lack automated partial reversal |
| **G** | Is full refund accounting correct? | **Yes** for single full gateway refund — ORDER_REFUNDED_FULL + Zoho credit note |
| **H** | Is partial refund inventory behavior correct? | **Yes** — no auto-restock (P1 verified) |
| **I** | Is full refund inventory behavior correct? | **Yes** — restock on `REFUNDED` via SELLABLE events |
| **J** | Can COD cancellation safely restore inventory? | **Yes** — stock was confirmed at checkout; cancel restocks |
| **K** | Is dispatch state authoritative enough? | **No** — not used for cancel eligibility; must add shipment/AWB check |
| **L** | Does RTO need explicit state/workflow? | **Yes** — current Shiprocket auto-cancel+restock is unsafe for V2 |
| **M** | Can Refund schema support item/qty refunds? | **No** — only via `OrderServiceRequestItem`; `Refund` itself is payment-level |
| **N** | Can it support shipping-retained refunds? | **No** — no shipping component field; admin must manually under-refund |
| **O** | Can it support multiple partial refunds? | **Yes** — capacity model + per-item tracking on service request items |
| **P** | Are provider refunds idempotent? | **Yes** — `providerRefundId` unique + reserve/finalize pattern (P1 hardened) |
| **Q** | Are accounting reversals idempotent? | **Yes** — `AccountingPostingEvent` unique keys |
| **R** | Are inventory reversals idempotent? | **Yes** — `(sourceType, sourceId, orderItemId)` unique |
| **S** | Do we need schema migration? | **Yes** — RTO receipt, request statuses, refund breakdown, optional FKs |
| **T** | Can V2 cancellation be implemented safely before launch? | **Yes, in phases** — critical gaps (G1–G3, G5–G6) must ship in Phase 1 |
| **U** | Should Return/Replacement be same release? | **No** — implement cancellation/RTO/refund foundation first (Phase 1), returns Phase 2 |
| **V** | Recommended implementation phases | See below |

### Recommended phases

| Phase | Scope | Launch gate |
|-------|-------|-------------|
| **1a — Safety** | Restrict `patchOrderStatus(REFUNDED)`; dispatch gate on cancel; link approve-cancel → refund for prepaid; `pickPrimaryPayment` | **Required before cutover** |
| **1b — Calculator** | `calculateRefund` + admin breakdown UI; shipping-retained policy | **Required before cutover** |
| **1c — RTO V2** | RTO received workflow; remove auto-restock on carrier RTO | **Required before cutover** |
| **1d — Adjustment** | Resolve-as-adjustment for reasons 4/5/6; no unsafe order mutation | Recommended |
| **2 — Returns** | Return/replacement flows, reverse logistics, partial qty | Post-launch or fast-follow |
| **2b — Accounting** | Partial refund journals + Zoho partial credit notes | Post-launch |

---

## Appendix: Key code references

| Topic | Path |
|-------|------|
| Cancel eligibility | `order-service-request.service.ts` → `canRequestCancel` |
| Approve cancel (no refund) | `order-service-request.service.ts` → `reviewServiceRequest` L414–416 |
| Gateway refund | `refund.service.ts` → `initiatePartialGatewayRefund` |
| Payment pick (refund) | `refund.service.ts` L55–57 `.find()` |
| Payment pick (accounting) | `order-refund-snapshot.service.ts` → `pickPrimaryPayment` |
| RTO auto-cancel | `orderLifecycle.ts` → `handleRtoShipment` |
| Status patch danger | `admin.handlers.ts` → `patchOrderStatus` |
| Discount allocation | `discount-allocation.ts` |
| Restock semantics | `order-inventory-restock.service.ts` |
| Customer UI | `OrderHistoryCard.tsx`, cancel/return pages |
| Admin refund UI | `AdminOrderServiceRequests.tsx` → `ServiceRequestRefundPanel` |

---

SARVEDA CANCELLATION / REFUND / RETURN V2 AUDIT COMPLETE — READY FOR REVIEW
