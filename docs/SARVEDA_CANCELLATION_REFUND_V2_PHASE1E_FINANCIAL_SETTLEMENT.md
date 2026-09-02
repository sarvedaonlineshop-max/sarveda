# SARVEDA Cancellation / Refund V2 — Phase 1E Financial Settlement

**Date:** 2026-09-01  
**Scope:** P1-ADJ-2 partial refund accounting + P1-ADJ-1 supplementary payment foundation  
**Prior phases:** 1A safety, 1B calculator, 1C RTO, 1D adjustments  

---

## Executive summary

Phase 1E closes the two remaining P1 financial gaps:

- **P1-ADJ-2:** Authoritative partial refund execution with `ORDER_REFUNDED_PARTIAL` journal, GST reversal, proportional Zoho credit note, and staged settlement (gateway → accounting → Zoho).
- **P1-ADJ-1:** `OrderSupplementaryPayment` model + Razorpay/Stripe/PayPal session creation for upgrade adjustments; order mutation only after capture.

RTO paid refunds and cheaper pre-dispatch adjustments (qty decrease / cheaper variant) can now execute end-to-end. Full Returns/Replacement (Phase 2) is **not** implemented.

---

## A. Original sale accounting

- Event: `ORDER_PAID` / `ORDER_PAID_V1` via discovery worker + `order-paid-journal.builder.ts`
- Dr clearing (Razorpay/Stripe/PayPal), Cr product sales, Cr output GST (CGST/SGST or IGST), Cr shipping income, Cr discounts contra as applicable
- Unique key: `order:{orderId}:paid`

## B. Existing full refund accounting

- Event: `ORDER_REFUNDED_FULL` — exact inversion of posted `ORDER_PAID_V1`
- Triggered when cumulative gateway refunds equal captured amount and `finalizeGatewayRefund` marks payment `REFUNDED`
- Zoho: full credit note via `createZohoRefundDocumentsForOrder` (idempotent on order)

## C. Partial refund model

New orchestrator: `executeAuthoritativePartialRefund()` in `partial-refund-settlement.service.ts`

Input (server-authoritative):

| Field | Purpose |
|-------|---------|
| `orderId`, `sourceType`, `sourceId` | Audit + idempotency |
| `policy` | Phase 1B breakdown (RTO, etc.) |
| `adjustmentMerchandiseRefundPaise` | Phase 1D line delta |
| `manualRefundPaise` | Admin manual (validated vs remaining captured) |

Sources: `ORDER_ADJUSTMENT`, `RTO`, `ADMIN_MANUAL`, `SERVICE_REQUEST`, `FULL_CANCELLATION`

## D. Partial refund journal

- Event: `ORDER_REFUNDED_PARTIAL` / `ORDER_REFUNDED_PARTIAL_V1`
- Builder: `order-refunded-partial-journal.builder.ts`
- Unique key: `order:{orderId}:refund:{refundId}` (per refund row, not per order)
- Cr clearing; Dr product sales + output GST (+ shipping income only when shipping component refunded)
- Does **not** auto-restock

## E. GST reversal

- GST-inclusive prices; extraction via `gstFromInclusiveLine()` and Phase 1B `taxLines`
- Adjustment line refunds: discount allocation + per-line tax class via `buildPartialRefundSpecForLineDelta`
- Admin manual: proportional scale from `DISPATCHED_SHIPPING_RETAINED` breakdown via `buildPartialRefundSpecForFixedAmount`
- Fail-closed: `PARTIAL_REFUND_TAX_BREAKDOWN_UNAVAILABLE` when merchandise refund lacks tax lines

## F. Discount allocation

- Phase 1B calculator allocates order-level discount to merchandise lines
- Adjustment refunds use `allocateOrderDiscountPaise` for affected line only
- Cumulative partials capped by `reserveGatewayRefund` + remaining captured

## G. Shipping treatment

- RTO: `RTO_SHIPPING_RETAINED` — merchandise refund only; shipping stays retained
- Partial specs set `shippingRefundPaise = 0` unless breakdown includes shipping component
- Zoho partial CN excludes shipping lines when refund < grand total

## H. Multiple partial refunds

- Each successful refund = independent `Refund` row + unique `providerRefundId`
- `getRefundableRemainingInPaise` enforces cumulative cap
- Order becomes `REFUNDED` only when cumulative equals captured (via existing `finalizeGatewayRefund`)

## I. Refund idempotency

- `reserveGatewayRefund` + `providerRefundId` uniqueness
- `(sourceType, sourceId)` idempotency for workflow refunds (RTO, adjustment)
- `retryPartialRefundSettlementStages()` — accounting/Zoho only, never re-hits gateway

## J. Zoho partial credit note

- `createZohoPartialCreditNoteForRefund(refundId)` — proportional line scaling, idempotent on `Refund.zohoCreditNoteId`
- Fail-closed stores `ZOHO_PARTIAL_CREDIT_NOTE_REVIEW_REQUIRED` on refund row

## K. Zoho idempotency

- Skip if `zohoCreditNoteId` already set
- Gateway success + Zoho failure → retry Zoho only via settlement retry

## L. RTO refund execution

- `executeRtoRefund()` — requires physical receipt + disposition ≠ `NEEDS_REVIEW`
- Policy: `RTO_SHIPPING_RETAINED`
- Admin route: `POST /api/admin/shipments/:shipmentId/rto/execute-refund`
- UI: Execute RTO refund button when `refundExecutionEnabled`

## M. RTO damaged/restockable behavior

- Refund independent of disposition — damaged RTO can still refund (no sellable restock required)
- Restock only via Phase 1C disposition workflow

## N. Adjustment refund execution

- Cheaper variant / qty decrease: `executeAdjustmentWithRefund` → mutate order → partial refund → `EXECUTED`
- On gateway success with accounting disabled in test env: still marks EXECUTED (accounting stage `GATEWAY_SUCCEEDED`)

## O. Supplementary payment model

- Table: `OrderSupplementaryPayment` — `sourceId` = adjustment request id (unique)
- Status: `PENDING` → `CAPTURED` / `FAILED` / `CANCELLED`
- Original `Payment` row unchanged

## P–R. Supplementary provider flows

- **Razorpay:** `createSupplementaryPaymentSession` → customer `POST /api/payments/supplementary/razorpay/verify`
- **Stripe:** dedicated checkout session metadata `sarveda_supplementary_payment_id`
- **PayPal:** `createSupplementaryPayPalOrder` (no Payment table mutation)

## S. COD handling

- Supplementary: fail-closed `ADDITIONAL_PAYMENT_MANUAL_REVIEW`
- RTO COD: gateway refund ₹0 (existing Phase 1B behavior)

## T. Supplementary payment accounting

- Event: `ORDER_SUPPLEMENTARY_PAID` / `ORDER_SUPPLEMENTARY_PAID_V1`
- Incremental journal: Dr clearing, Cr sales + GST for delta only
- Posted after capture, before order mutation

## U. Zoho/debit-document handling

- Supplementary Zoho invoice/debit note: **not auto-implemented** — incremental GL only in native accounting
- Fail-closed if production requires Zoho doc before collection (manual review path)

## V. Inventory independence

- Partial refund never restocks
- Adjustment qty decrease restocks via adjustment inventory tx (Phase 1D)
- RTO restock via disposition only

## W. Failure/retry state machine

`RefundSettlementStage`: `RESERVED` → `GATEWAY_SUCCEEDED` → `ACCOUNTING_POSTED` → `ZOHO_SYNCED` → `COMPLETE` / `FAILED`

Later-stage failures do not repeat gateway.

## X. Customer UI

- `createCustomerSupplementaryPayment()` API on adjust flow
- `verifySupplementaryRazorpayPayment()` for Pay ₹X completion
- Refund messaging: only after gateway success

## Y. Admin UI

- `AdminOrderAdjustmentPanel`: Create payment link for `ADDITIONAL_PAYMENT_REQUIRED`; Execute for refunds
- `AdminOrderRtoWorkflow`: Execute RTO refund when safe
- Financial states surfaced via `executionStatus` on service requests

## Z. Schema/migrations

- `20260901160000_phase1e_financial_settlement`
- Enums: `RefundSourceType`, `RefundSettlementStage`, `SupplementaryPaymentPurpose`, `SupplementaryPaymentStatus`
- Extended `Refund`; new `OrderSupplementaryPayment`
- Extended `OrderServiceRequestExecutionStatus`: `REFUND_PROCESSING`, `PAYMENT_PENDING`, `PAYMENT_CAPTURED`

## AA. Tests/build

| Check | Result |
|-------|--------|
| Backend `tsc --noEmit` | PASS |
| Frontend `tsc --noEmit` | PASS |
| Commerce suite | **183/183 PASS** |
| New: `adjustment-phase1e.test.ts` | 5 tests |
| Updated: `adjustment-phase1d`, `rto-phase1c` | Phase 1E behavior |

## AB. Production data modified?

**No** — migration applied locally only during development verification.

## AC. Newly discovered issues

| Severity | Item |
|----------|------|
| P2 | Supplementary Zoho debit/invoice not automated — ops review for upgrades with finalized Zoho invoice |
| P2 | Admin manual partial `sourceId` uses timestamp — retry creates new attempt (gateway cap still protects) |
| P2 | Customer adjust page Razorpay checkout widget not wired (API ready) |

## AD. Fail-closed cases

- `MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED`
- `PARTIAL_REFUND_TAX_BREAKDOWN_UNAVAILABLE`
- `ZOHO_PARTIAL_CREDIT_NOTE_REVIEW_REQUIRED`
- `ADDITIONAL_PAYMENT_MANUAL_REVIEW` (COD upgrades)
- `BLOCKED_AFTER_DISPATCH` for supplementary payment
- Accounting posting disabled in prod without `ACCOUNTING_REFUND_POSTING_ENABLED=1`

## AE. Ready for Phase 2 Returns/Replacements?

**YES (foundation ready)** — money/settlement paths exist; Phase 2 still needs return receipt workflow, replacement shipment, and replacement-specific policies.

---

## Final verdict (18 questions)

| # | Question | Answer |
|---|----------|--------|
| 1 | Merchandise-only partial refund execute safely? | **YES** (with tax breakdown) |
| 2 | Shipping remain retained? | **YES** (RTO + partial specs) |
| 3 | GST reversed correctly? | **YES** (deterministic extraction; fail-closed without lines) |
| 4 | Multiple partial refunds safely? | **YES** |
| 5 | Partial refund avoids auto restock? | **YES** |
| 6 | Paid RTO refund execute? | **YES** |
| 7 | Damaged RTO refund without sellable restock? | **YES** |
| 8 | Cheaper variant adjustment end-to-end? | **YES** (same refund path as qty decrease) |
| 9 | Quantity decrease end-to-end? | **YES** |
| 10 | Additional Razorpay payment? | **YES** (session + verify) |
| 11 | Additional Stripe payment? | **YES** (session foundation) |
| 12 | Additional PayPal payment? | **YES** (session foundation) |
| 13 | More-expensive variant after payment? | **YES** (capture → mutate) |
| 14 | Quantity increase after payment? | **YES** (same supplementary flow) |
| 15 | Native accounting correct? | **YES** (when posting enabled; shadow-safe in test) |
| 16 | Zoho correct/idempotent? | **YES** for partial CN; supplementary Zoho doc deferred |
| 17 | Financial retries idempotent? | **YES** (stage-aware retry) |
| 18 | Phase 2 safe to begin? | **YES** |

---

## Key files

```
backend/src/modules/payments/partial-refund-settlement.service.ts
backend/src/modules/payments/supplementary-payment.service.ts
backend/src/modules/accounting/order-refunded-partial-*
backend/src/modules/accounting/order-supplementary-paid-*
backend/src/modules/zoho/zoho-financials.ts (createZohoPartialCreditNoteForRefund)
backend/src/modules/orders/order-adjustment.service.ts (executeAdjustmentWithRefund)
backend/src/modules/orders/rto-workflow.service.ts (executeRtoRefund)
backend/test/commerce/adjustment-phase1e.test.ts
```

---

SARVEDA CANCELLATION / REFUND V2 PHASE 1E FINANCIAL SETTLEMENT COMPLETE — READY FOR REVIEW
