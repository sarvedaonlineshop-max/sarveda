# Sarveda Native Accounting — Safe Architecture Plan

**Status:** Design only — no implementation in this document  
**Date:** 2026-08-22  
**Prerequisite audit:** [`SARVEDA_ACCOUNTING_CURRENT_STATUS.md`](SARVEDA_ACCOUNTING_CURRENT_STATUS.md)  
**Primary rule:** **Commerce must never depend on Accounting. Accounting may depend on Commerce.**

---

## Document purpose

This plan defines how to build a Zoho Books–style **native accounting module** as an **optional expansion** on top of the existing, production-stable Sarveda e-commerce platform. If accounting is disabled, fails, or is abandoned, storefront checkout, payments, inventory, fulfillment, and existing Zoho sales sync must behave **exactly as they do today**.

---

# 1. Protected Commerce Core

The following paths are **production-critical**. They were verified in the repository (Aug 2026). Accounting work must treat them as sacred unless explicitly marked **EXTENSION POINT ONLY**.

## Classification legend

| Policy | Meaning |
|--------|---------|
| **FREEZE** | No behavioral changes without commerce regression tests + explicit approval |
| **EXTENSION POINT ONLY** | May add a **non-blocking, fire-and-forget** hook; must not change existing control flow, return values, or transaction boundaries |
| **SAFE TO CHANGE** | Not on the critical payment/order path (rare for commerce core) |

---

## Protected Commerce Files

### Checkout & cart

| File | Function / entry | Responsibility | Accounting touches today? | Change policy |
|------|------------------|----------------|---------------------------|---------------|
| `backend/src/modules/checkout/checkout.service.ts` | `createCheckoutOrder` | Creates `Order`, items, addresses, `Payment`; reserves stock; starts gateway/COD | No native accounting. COD calls `afterOrderPaid` | **FREEZE** (hook only via `afterOrderPaid` for COD) |
| `backend/src/modules/checkout/checkout.service.ts` | `resumePendingCheckout` | Resumes unpaid Razorpay order | No | **FREEZE** |
| `backend/src/modules/checkout/checkout.controller.ts` | route handlers | HTTP layer for checkout | No | **FREEZE** |
| `backend/src/modules/checkout/checkout.routes.ts` | router mount | `/api/checkout/*` | No | **FREEZE** |
| `backend/src/modules/cart/cart.service.ts` | add/update/clear cart | Session/user cart | No | **FREEZE** |
| `backend/src/modules/cart/cart.controller.ts` | handlers | Cart API | No | **FREEZE** |
| `backend/src/modules/cart/couponCart.ts` | coupon apply | Cart-level discounts | No | **FREEZE** |

### Catalog & products (storefront)

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/products/products.service.ts` | list/get/search | Storefront catalog | No | **FREEZE** |
| `backend/src/modules/products/products.controller.ts` | public routes | Product API | No | **FREEZE** |
| `backend/src/modules/categories/*` | category tree | Navigation/catalog | No | **FREEZE** |

### Auth & customers

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/auth/router.ts` | login/register/OAuth/OTP | Customer & admin auth | No | **FREEZE** |
| `backend/src/modules/auth/service.ts` | credential/OAuth logic | User sessions | No | **FREEZE** |
| `backend/src/middleware/auth.ts` | JWT verify | Request auth | No | **FREEZE** |
| `backend/src/middleware/admin.ts` | `requireAdmin` | Admin gate | No | **FREEZE** |

### Order creation & lifecycle (commerce)

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/orders/orders.service.ts` | `reserveStockTx` | Checkout stock reservation | No | **FREEZE** |
| `backend/src/modules/orders/orders.service.ts` | `releaseStockTx` | Timeout/fail/cancel release | No | **FREEZE** |
| `backend/src/modules/orders/orders.service.ts` | `confirmStockTx` | Paid/COD stock confirm | No | **FREEZE** |
| `backend/src/modules/orders/orders.service.ts` | `restockPaidOrderTx` | Refund restock | No | **FREEZE** |
| `backend/src/modules/orders/orders.service.ts` | `cancelUnpaidOrderWithRelease` | Unpaid cancel | No | **FREEZE** |
| `backend/src/modules/orders/orders.service.ts` | `handlePaidOrderStatusChange` | Refund/cancel status + Zoho void/mirror | **Zoho only** (void invoice, stock mirror) | **EXTENSION POINT ONLY** (add accounting emit after status commit) |
| `backend/src/modules/orders/orders.service.ts` | `mirrorOrderStockToZoho` | Optional Zoho stock nudge | Zoho inventory (flag-gated) | **FREEZE** (do not remove; accounting unrelated) |
| `backend/src/modules/orders/afterPaid.ts` | `afterOrderPaid` | Post-payment side effects: PDF, email, cart, Zoho invoice/payment | **Zoho invoice + payment**; invoice PDF | **EXTENSION POINT ONLY** — **primary accounting hook candidate** |
| `backend/src/modules/orders/fulfillDigitalPurchases.ts` | enrollments/bookings | Digital fulfillment | No | **FREEZE** |
| `backend/src/modules/orders/orders.controller.ts` | public order/invoice | Customer order views | No | **FREEZE** |
| `backend/src/modules/orders/orders.routes.ts` | router | Order API mount | No | **FREEZE** |

### Payments

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/payments/razorpay.verify.ts` | `completePaidOrder` | Signature verify → PAID + confirm stock → `afterOrderPaid` | Indirect via `afterOrderPaid` | **FREEZE** (no await accounting here) |
| `backend/src/modules/payments/razorpay.webhook.ts` | `razorpayWebhookHandler` | Webhook idempotency, capture/fail/refund | Indirect | **FREEZE** |
| `backend/src/modules/payments/stripe.service.ts` | `completeStripePaidOrder` | Stripe paid path | Indirect | **FREEZE** |
| `backend/src/modules/payments/stripe.webhook.ts` | webhook handler | Stripe events | Indirect | **FREEZE** |
| `backend/src/modules/payments/paypal.complete.ts` | `completePayPalPaidOrder` | PayPal capture | Indirect | **FREEZE** |
| `backend/src/modules/payments/paypal.webhook.ts` | webhook handler | PayPal events | Indirect | **FREEZE** |
| `backend/src/modules/payments/payments.controller.ts` | verify/capture routes | Client verify paths | Indirect | **FREEZE** |
| `backend/src/modules/payments/refund.service.ts` | `initiateGatewayRefund`, `initiatePartialGatewayRefund` | Gateway refund + order status + Zoho credit note | **Zoho credit note** (fire-and-forget) | **EXTENSION POINT ONLY** |
| `backend/src/jobs/paymentTimeoutJob.ts` | `schedulePaymentTimeout`, worker | 15 min unpaid cancel | No | **FREEZE** |

### GST invoice PDF (customer-facing — not the ledger)

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/invoices/invoice.service.ts` | `ensureOrderInvoicePdf`, `buildInvoiceInputFromOrder` | GST PDF + S3 + `Invoice` row | No native GL | **FREEZE** |
| `backend/src/utils/invoice.ts` | `buildOrderInvoicePdf`, CGST/SGST/IGST layout | PDF rendering | No | **FREEZE** |
| `backend/src/utils/gst.ts` | `gstRatePercent`, `gstFromInclusiveLine`, `isInterState` | Tax math for PDF | No | **FREEZE** (accounting may **read/copy** rates later, not change semantics) |

### Shipping & fulfillment

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/shipping/orderLifecycle.ts` | `onOrderEnteredProcessing`, tracking | AWB lifecycle | No | **FREEZE** |
| `backend/src/modules/shipping/shipping.controller.ts` | createShipment, labels, track | Admin/shipping API | No | **FREEZE** |
| `backend/src/modules/shipping/router.ts` | `autoSelectAndCreate` | Courier selection | No | **FREEZE** |
| `backend/src/modules/shipping/shiprocket.ts`, `delhivery.ts` | carrier APIs | Label creation | No | **FREEZE** |

### Notifications

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/notifications/email.ts` | `notifyOrderEmail`, `sendOrderEmail` | Transactional email | No | **FREEZE** |
| `backend/src/modules/notifications/whatsapp.ts` | WhatsApp triggers | WATI messages | No | **FREEZE** |

### Existing Zoho sales sync (must keep running)

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/zoho/zoho-invoices.ts` | `createZohoInvoiceForOrder` | Zoho sales invoice | External GL today | **FREEZE** — do not remove until cutover |
| `backend/src/modules/zoho/zoho-financials.ts` | `recordZohoPaymentForOrder` | Zoho customer payment | External GL today | **FREEZE** |
| `backend/src/modules/zoho/zoho-financials.ts` | `createZohoRefundDocumentsForOrder` | Zoho credit note + refund | External GL today | **FREEZE** |
| `backend/src/modules/zoho/zoho-financials.ts` | `voidZohoInvoiceForCancelledOrder` | Void unpaid/paid cancel path | External GL today | **FREEZE** |
| `backend/src/modules/zoho/index.ts` | manual sync routes | Admin replay `/api/zoho/sync/invoice/:orderId` | No | **FREEZE** |
| `backend/src/modules/zoho/zoho-inventory-sync-flag.ts` | inventory sync gate | Stock mirror flag | No native accounting | **FREEZE** |

### Admin commerce (high risk if broken)

| File | Function | Responsibility | Accounting touches? | Change policy |
|------|----------|----------------|---------------------|---------------|
| `backend/src/modules/admin/admin.handlers.ts` | `inventoryList`, `patchInventory`, import | Stock admin | Zoho mirror on patch (flag-gated) | **FREEZE** for stock logic; **EXTENSION POINT ONLY** for future `STOCK_ADJUSTED` emit |
| `backend/src/modules/admin/admin.handlers.ts` | `refundOrder`, order status | Admin refunds | Via refund.service | **FREEZE** |
| `backend/src/modules/admin/admin.handlers.ts` | `reconcileRazorpayOrder` | Payment repair | No | **FREEZE** |

### Frontend commerce (must not mix accounting UI)

| Path | Responsibility | Change policy |
|------|----------------|---------------|
| `frontend/app/checkout/**` | Checkout | **FREEZE** |
| `frontend/app/cart/**` | Cart | **FREEZE** |
| `frontend/app/product/**`, `frontend/app/shop/**` | Catalog | **FREEZE** |
| `frontend/lib/cart.ts`, `frontend/lib/api.ts` | Client commerce | **FREEZE** |
| `frontend/app/admin/orders/**` | Order ops (existing) | **FREEZE** — accounting gets separate routes |

### Purchases module (operational AP — separate from storefront commerce)

| Path | Responsibility | Change policy |
|------|----------------|---------------|
| `backend/src/modules/purchases/*` | Vendor, PO, Bill, Expense | **SAFE TO EXTEND** — not on storefront critical path; feature-flagged. Emit accounting events from here later, not from checkout. |

---

## Summary: where accounting may attach (later)

Only these **extension points** — always **non-blocking**:

1. `afterOrderPaid` → `ORDER_PAID`, `INVOICE_ISSUED` (after PDF attempt)
2. `refund.service` / `handlePaidOrderStatusChange` → `ORDER_REFUNDED`, `ORDER_PARTIALLY_REFUNDED`
3. `purchases.service.receivePurchaseOrder` → `STOCK_RECEIVED`, `PURCHASE_BILL_POSTED` (when bill posted)
4. Optional later: admin inventory patch → `STOCK_ADJUSTED`

**Never** inside: `createCheckoutOrder` transaction, `completePaidOrder` transaction, webhook handlers before 200 response, `confirmStockTx`.

---

# 2. Isolation Principle

## Architecture diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                    COMMERCE CORE (frozen)                    │
│  checkout → reserve → pay → confirm stock → afterOrderPaid  │
│  invoice PDF │ email │ ship │ refund │ existing Zoho sync    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │  emit (async, optional)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ACCOUNTING EVENT BRIDGE (new, thin)               │
│  if NATIVE_ACCOUNTING_ENABLED → enqueue AccountingPostingEvent │
│  never throws to caller │ never in commerce DB transaction   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           NATIVE ACCOUNTING DOMAIN (new, isolated)           │
│  journal engine │ CoA │ shadow postings │ reconciliation     │
│  failures → FAILED status + admin health UI                  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation rules in this repo

1. **New module** `backend/src/modules/accounting-bridge/` (thin) + `backend/src/modules/accounting/` (heavy). Bridge has **zero** imports from accounting posting logic into commerce files except one function: `emitCommerceAccountingEvent(type, payload)`.

2. **Call pattern** (mirror existing Zoho safety in `afterPaid.ts`):

   ```typescript
   // Inside afterOrderPaid ONLY — after commerce work, same as Zoho payment:
   void emitCommerceAccountingEvent({ type: "ORDER_PAID", orderId }).catch((err) => {
     logger.error("accounting_event_emit_failed", { orderId, err });
   });
   ```

3. **No `await`** of accounting posting from commerce unless behind a feature flag AND proven non-throwing (prefer never).

4. **Separate worker** (BullMQ queue `accounting-postings`) processes events. Commerce never waits on queue depth.

5. **Separate router** `/api/admin/accounting/*` — no changes to `/api/checkout`, `/api/payments`, `/api/cart`.

6. **Dependency direction**:

   ```text
   accounting → accounting-bridge → (reads) commerce DB tables
   commerce → accounting-bridge ONLY (one emit function)
   commerce ↛ accounting (no import of journals, CoA, posting engine)
   ```

7. **Purchases** (`/api/admin/purchases`) emits events the same way — purchases handlers call bridge after successful commit; purchases never imported by checkout.

---

# 3. Do Not Modify Existing Commerce Table Semantics

## Frozen models — meaning must not change

| Model | Current meaning | Accounting rule |
|-------|-----------------|-----------------|
| `Order` | E-commerce sales order + fulfillment lifecycle | Read-only source for events. **Never** add journal lines here. Optional: none initially — use `AccountingDocumentLink` instead of new Order columns |
| `OrderItem` | Line snapshot at sale | Read-only |
| `Payment` | Gateway payment attempt/capture | Read-only. Do not repurpose `rawPayload` for native journals (keep Zoho IDs there) |
| `Refund` | Gateway refund record | Read-only |
| `Invoice` | Customer GST PDF metadata (`pdfUrl`, `invoiceNo`) | **Not** the accounting ledger. Native AR uses `AccountingJournalEntry` |
| `Product` / `ProductVariant` | Catalog + `taxClass`, `hsnCode`, `costInPaise` | Read-only for posting; optional future `AccountingItemMapping` table |
| `Inventory` | Operational `onHand` / `reserved` | Unchanged semantics. Native COGS/inventory asset from **movements**, not by altering Inventory columns |

## Allowed commerce schema touches (strictly limited)

| Change type | When | Example |
|-------------|------|---------|
| New nullable column | Only if bridge needs a cached pointer AND link table insufficient | **Avoid** — prefer `AccountingDocumentLink` |
| New index on commerce | Performance for accounting reads | `Order.placedAt` already indexed — OK |
| New tables | Always preferred | All GL tables |

**Forbidden:** enum changes on `OrderStatus`, `PaymentStatus`; renaming paise columns; merging Invoice into journals.

---

# 4. Proposed Separate Accounting Domain

## Backend layout (new — not implemented)

```text
backend/src/modules/
├── accounting-bridge/           # THIN — commerce may import ONLY this
│   ├── emit.ts                  # emitCommerceAccountingEvent()
│   ├── event-types.ts           # ORDER_PAID, etc.
│   └── index.ts
│
└── accounting/                  # THICK — never imported by commerce
    ├── accounting-flag.ts       # NATIVE_ACCOUNTING_ENABLED, sub-flags
    ├── accounts/
    │   ├── accounts.service.ts
    │   ├── accounts.handlers.ts
    │   └── coa-seed.ts          # default Indian e-commerce CoA
    ├── journals/
    │   ├── journal.service.ts   # createEntry, validate balanced
    │   └── journal.handlers.ts
    ├── postings/
    │   ├── posting-worker.ts    # BullMQ consumer
    │   ├── posting-handlers/    # order-paid.handler.ts, refund.handler.ts
    │   └── idempotency.ts
    ├── sales/
    │   └── sales-posting.ts     # ORDER_PAID → journal template
    ├── purchases/
    │   └── ap-posting.ts        # bill/receipt templates
    ├── taxes/
    │   ├── gst-mapping.ts
    │   └── tax-code.service.ts
    ├── banking/                 # Phase 8+
    ├── reports/
    │   ├── trial-balance.ts
    │   ├── general-ledger.ts
    │   └── pl-balance-sheet.ts
    ├── reconciliation/
    │   ├── zoho-compare.service.ts
    │   └── reconciliation.handlers.ts
    ├── audit/
    │   └── accounting-audit.service.ts
    ├── accounting.routes.ts     # /api/admin/accounting/*
    └── index.ts
```

## Frontend layout (new — not implemented)

```text
frontend/app/admin/accounting/
├── layout.tsx                   # Accounting shell + nav (independent of purchases)
├── page.tsx                     # Dashboard / health
├── sales/
├── purchases/                   # May deep-link to /admin/purchases OR embed read-only
├── banking/
├── accountant/                  # Manual journals (later)
├── gst/
├── reports/
└── reconciliation/            # Zoho vs native shadow compare
```

**Existing** `frontend/app/admin/purchases/` remains operational AP entry; native accounting **consumes** purchase events but UI can stay split until merge is deliberate.

**Do not** add accounting widgets to `frontend/app/checkout`, `frontend/app/cart`, or storefront layout.

---

# 5. Accounting Database Design

All tables use prefix `Accounting*` or schema namespace to avoid collision with commerce. **No migrations in this plan.**

## Core ledger tables

### `AccountingAccount`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Chart of Accounts node |
| **PK** | `id` UUID |
| **Important columns** | `code` (e.g. `1100`), `name`, `type` (`ASSET\|LIABILITY\|EQUITY\|REVENUE\|EXPENSE`), `parentId?`, `currency` (default INR), `isActive`, `isSystem`, `zohoAccountId?` |
| **Unique** | `[code]` or `[code, companyId]` if multi-entity later |
| **Indexes** | `type`, `isActive`, `parentId` |
| **FKs** | `parentId` → self |
| **Commerce link** | None direct — mapped via posting rules |

### `AccountingJournalEntry`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Journal header (one business posting) |
| **PK** | `id` UUID |
| **Important columns** | `entryNumber`, `entryDate`, `memo`, `status` (`DRAFT\|POSTED\|VOID`), `sourceEventId?`, `postedAt`, `postedByUserId?`, `totalDebitInPaise`, `totalCreditInPaise`, `currency` |
| **Unique** | `entryNumber`; optional `sourceEventId` when 1:1 with posting event |
| **Indexes** | `entryDate`, `status`, `postedAt` |
| **FKs** | `sourceEventId` → `AccountingPostingEvent.id` (optional) |
| **Commerce link** | **None** — link via `AccountingDocumentLink` |

### `AccountingJournalLine`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Debit/credit lines |
| **PK** | `id` UUID |
| **Important columns** | `journalEntryId`, `accountId`, `debitInPaise`, `creditInPaise`, `lineMemo`, `taxCodeId?`, `hsnCode?`, `sortOrder` |
| **Unique** | none (multiple lines per entry) |
| **Indexes** | `journalEntryId`, `accountId` |
| **FKs** | `journalEntryId` → `AccountingJournalEntry` CASCADE; `accountId` → `AccountingAccount` |
| **Constraint** | CHECK: exactly one of debit/credit > 0 per line (application-enforced) |
| **Commerce link** | Optional `documentLinkId` → `AccountingDocumentLink` |

### `AccountingDocumentLink`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Polymorphic read-only pointer to commerce/AP documents |
| **PK** | `id` UUID |
| **Important columns** | `documentType` (`ORDER\|PAYMENT\|REFUND\|INVOICE_PDF\|PURCHASE_ORDER\|VENDOR_BILL\|EXPENSE`), `documentId` UUID/string, `journalEntryId`, `zohoDocumentId?`, `zohoDocumentType?` |
| **Unique** | `[documentType, documentId, journalEntryId]` |
| **Indexes** | `[documentType, documentId]` |
| **Commerce link** | **Read-only** FK by UUID to `Order.id`, `Payment.id`, etc. (no Prisma FK to avoid cascade deletes affecting GL — soft reference + integrity checks in app) |

### `AccountingPostingEvent`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Idempotency + async processing queue record |
| **PK** | `id` UUID |
| **Important columns** | `eventType`, `sourceType`, `sourceId`, `uniqueKey`, `payloadJson`, `status` (`PENDING\|RETRYING\|POSTED\|FAILED\|SKIPPED`), `attemptCount`, `lastError`, `processedAt`, `journalEntryId?` |
| **Unique** | **`[eventType, uniqueKey]`** — e.g. `ORDER_PAID:order:{orderId}:v1` |
| **Indexes** | `status`, `createdAt`, `[sourceType, sourceId]` |
| **Commerce link** | `sourceId` references commerce UUID; no FK |

**Example unique keys:**

| Event | uniqueKey pattern |
|-------|-------------------|
| ORDER_PAID | `order:{orderId}:paid` |
| ORDER_REFUNDED | `order:{orderId}:refund:{refundId}` |
| INVOICE_ISSUED | `order:{orderId}:invoice` |
| STOCK_RECEIVED | `po-receipt:{receiptId}` |
| VENDOR_BILL_POSTED | `vendor-bill:{billId}:open` |

### `AccountingPeriod`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Fiscal period control (Indian FY) |
| **PK** | `id` UUID |
| **Columns** | `name`, `startDate`, `endDate`, `status` (`OPEN\|CLOSED`), `closedAt` |
| **Unique** | `[startDate, endDate]` |
| **Indexes** | `status` |

### `AccountingSequence`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Concurrency-safe document numbering for journals |
| **PK** | `id` UUID |
| **Columns** | `sequenceType` (`JOURNAL`, etc.), `prefix`, `yearMonth`, `lastSeq` |
| **Unique** | `[sequenceType, yearMonth]` |
| **Indexes** | — |

### `AccountingAuditLog`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Immutable accounting mutation trail (separate from `AdminActivityLog`) |
| **PK** | `id` UUID |
| **Columns** | `actorUserId?`, `action`, `entityType`, `entityId`, `beforeJson?`, `afterJson?`, `createdAt` |
| **Indexes** | `entityType, entityId`, `createdAt` |

## Phase-later tables

| Table | Purpose |
|-------|---------|
| `AccountingTaxCode` | GST rate, CGST/SGST/IGST split rules, maps from `Product.taxClass` |
| `AccountingGstLedgerMapping` | Output tax, input tax, RCM accounts |
| `AccountingBankAccount` | Ledger-linked bank accounts |
| `AccountingBankTransaction` | Imported bank lines |
| `AccountingBankReconciliation` | Match bank ↔ payments |
| `AccountingVendorPayment` | AP payment document (links `VendorBill`) |
| `AccountingCreditNote` / `AccountingDebitNote` | Native CN/DN (shadow Zoho CN) |
| `AccountingStockMovement` | Audit trail mirroring commerce inventory changes (optional bridge from commerce events) |
| `AccountingReconciliationRun` | Zoho vs native compare batch |
| `AccountingReconciliationLine` | Per-order mismatch detail |

## Relationship to existing commerce (read-only)

```text
Order (commerce) ──read──► AccountingPostingEvent.sourceId
                         └──► AccountingDocumentLink.documentId
                         └──► AccountingJournalEntry (via link, not FK)

VendorBill (purchases) ──read──► same pattern

Zoho (external) ──read──► AccountingReconciliationLine.zohoTotal
```

---

# 6. Event Bridge Design

## Flow

```text
1. Commerce completes (order PAID, stock confirmed, DB committed)
2. afterOrderPaid runs (existing)
3. emitCommerceAccountingEvent({ type: "ORDER_PAID", orderId })
   a. if !NATIVE_ACCOUNTING_ENABLED → return immediately
   b. INSERT AccountingPostingEvent status=PENDING ON CONFLICT DO NOTHING
   c. enqueue BullMQ job accounting-post-{eventId}
4. Worker loads event, loads Order/Payment/Invoice read-only
5. Posting handler builds journal lines, validates debits=credits
6. INSERT AccountingJournalEntry + Lines in transaction
7. UPDATE event status=POSTED, link journalEntryId
```

## Event catalog (phase order)

| eventType | Trigger source | Shadow of |
|-----------|----------------|-----------|
| `ORDER_PAID` | `afterOrderPaid` | Zoho invoice + payment |
| `INVOICE_ISSUED` | after PDF success (optional separate event) | GST PDF totals |
| `ORDER_REFUNDED` | refund.service full refund | Zoho credit note |
| `ORDER_PARTIALLY_REFUNDED` | partial refund | Zoho partial CN (if applicable) |
| `ORDER_CANCELLED` | unpaid cancel | Zoho void (if any) |
| `STOCK_RECEIVED` | `receivePurchaseOrder` | — |
| `VENDOR_BILL_POSTED` | VendorBill → OPEN | Future Zoho bill |
| `VENDOR_PAYMENT_RECORDED` | future AP payment | Zoho vendor payment |
| `STOCK_ADJUSTED` | admin inventory patch | — |
| `EXPENSE_RECORDED` | Expense create | Zoho expense |

## Idempotency

- **Unique constraint** on `AccountingPostingEvent(eventType, uniqueKey)`
- Worker: if status=`POSTED`, exit success
- If journal exists for event, mark POSTED (repair path)
- Commerce never checks posting status

## Payload

Store minimal JSON snapshot in `payloadJson` at emit time (order totals, tax breakdown hash) so posting can detect commerce row changes vs event time (`sourceVersion` optional).

---

# 7. Failure Isolation

| Failure scenario | Commerce behavior | Accounting behavior |
|------------------|-------------------|---------------------|
| Posting throws | **Unchanged** — order stays PAID | Event → `FAILED`, `lastError` populated |
| Unbalanced journal | N/A | Reject posting, `FAILED`, alert |
| Missing GST mapping | N/A | `FAILED` with code `MISSING_TAX_MAP`, admin fix + retry |
| Missing account mapping | N/A | `FAILED`, configurable default or fail closed for shadow |
| Worker down | **Unchanged** | Events accumulate `PENDING`; health page shows backlog |
| DB down (accounting tables) | **Unchanged** — emit catches error, logs | No posting; events not inserted if insert fails — log only |
| Report query fails | N/A | API error; no commerce impact |

## Admin visibility (`/admin/accounting/health`)

- Count by status: PENDING, FAILED, POSTED (24h)
- Last 50 failures with `orderNumber`, `eventType`, `lastError`
- Actions: **Retry** (re-queue event), **Skip** (mark SKIPPED with reason)
- Never auto-modify commerce rows from health UI

## Retry policy

- Exponential backoff: 1m, 5m, 15m, 1h — max 10 attempts → `FAILED` permanent until manual retry
- Retry does not re-run Zoho sync

---

# 8. Feature Flags

## Master kill switch

```env
NATIVE_ACCOUNTING_ENABLED=0   # default OFF — zero behavior change
```

When `0`:

- `emitCommerceAccountingEvent` returns immediately (single boolean check)
- No accounting routes registered OR routes return 503 with clear message
- No worker started
- Existing Zoho + commerce 100% unchanged

## Sub-flags (recommended)

```env
ACCOUNTING_SALES_POSTING_ENABLED=0      # ORDER_PAID, refunds
ACCOUNTING_PURCHASES_POSTING_ENABLED=0 # AP events from purchases module
ACCOUNTING_REPORTS_ENABLED=0            # TB, GL, P&L UI
ACCOUNTING_SHADOW_RECONCILIATION_ENABLED=0 # Zoho vs native compare jobs
ACCOUNTING_MANUAL_JOURNALS_ENABLED=0      # accountant UI
```

Frontend:

```env
NEXT_PUBLIC_ACCOUNTING_ENABLED=0        # sidebar + routes hidden
```

**Rule:** Sub-flags cannot enable posting unless master flag is on.

## Coexistence with existing flags

| Flag | Interaction |
|------|-------------|
| `ZOHO_INVENTORY_SYNC` | Independent — leave off; unrelated to native GL |
| `PURCHASES_MODULE_ENABLED` | Purchases can run without native accounting |
| `NATIVE_ACCOUNTING_ENABLED` | Does not disable Zoho |

---

# 9. Keep Zoho Running — Shadow Mode

## Parallel paths (mandatory during Phases 3–9)

```text
Order Paid (afterOrderPaid)
│
├── [EXISTING — authoritative] createZohoInvoiceForOrder
├── [EXISTING — authoritative] recordZohoPaymentForOrder (async)
├── [EXISTING] ensureOrderInvoicePdf
│
└── [NEW — shadow only] emitCommerceAccountingEvent(ORDER_PAID)
         └── native journal (non-blocking, may FAIL without user impact)
```

**Zoho path must not be modified** to wait for native posting.

**Native path must not** skip or replace Zoho until cutover (Section 11).

## Shadow mode labeling

- UI badge: **“Shadow ledger — not official”**
- Reports exported from native module include watermark/disclaimer
- `AccountingJournalEntry.status=POSTED` does **not** imply statutory filing

---

# 10. Zoho vs Native Reconciliation

## New tables (Phase 4+)

- `AccountingReconciliationRun` — batch for date range
- `AccountingReconciliationLine` — per commerce document

## Compare dimensions (sales)

| Field | Source A | Source B | Source C |
|-------|----------|----------|----------|
| Order total | `Order.grandTotalInPaise` | — | — |
| GST PDF total | `Invoice` + PDF rebuild | — | — |
| Zoho invoice | `Order.zohoInvoiceId` → API or cached | — | — |
| Native journal | Sum debits on linked entry | — | — |
| Payment | `Payment.amountInPaise` CAPTURED | Zoho customer payment | native cash/AR lines |
| Refund | `Refund.amountInPaise` | Zoho CN | native reversal entry |

## Status enum

`MATCHED | MISMATCH | MISSING_ZOHO | MISSING_NATIVE | MISSING_COMMERCE | TOLERANCE_OK`

**Tolerance:** configurable ₹1 rounding (100 paise) for GST split differences during shadow.

## API

`GET /api/admin/accounting/reconciliation/runs`  
`POST /api/admin/accounting/reconciliation/runs` (date range)  
`GET /api/admin/accounting/reconciliation/lines?runId=&status=MISMATCH`

Native remains **non-authoritative** until cutover criteria met.

---

# 11. Cutover Rule — When Zoho Could Become Non-Authoritative

**Do not recommend cutover in Phase 0–7.** Zoho stays source of truth for statutory books until ALL criteria below are met for an agreed period (suggest **90 consecutive days** of production shadow):

| # | Criterion | Measurement |
|---|-----------|-------------|
| 1 | Balanced journals | 100% POSTED entries have debit=credit |
| 2 | Zero duplicate postings | No duplicate `uniqueKey` violations in prod |
| 3 | GST match | Native tax lines vs `ensureOrderInvoicePdf` totals ≤ tolerance |
| 4 | Zoho invoice match | ≥ 99.5% ORDER_PAID events MATCHED on totals |
| 5 | Payment match | Gateway capture = Zoho payment = native cash line |
| 6 | Refund match | Full + partial refunds MATCHED |
| 7 | AP match | Vendor bills (when enabled) MATCHED to Zoho bills |
| 8 | Trial Balance | Native TB ties to control accounts |
| 9 | P&L / BS | Management sign-off vs Zoho reports for same period |
| 10 | Automated tests | Commerce regression + accounting suite green in CI |
| 11 | Kill switch drill | Disable native accounting — commerce unaffected (proven) |
| 12 | Business sign-off | Arjun/finance explicit written approval |

**Until then:** Zoho exports remain official for CA/GST filing.

**Cutover is Phase 10+ decision** — optionally stop Zoho invoice create (one-way flag), never automatic.

---

# 12. Database Migration Safety

## Rules for all accounting migrations

1. **CREATE TABLE** only for accounting prefix tables
2. **CREATE INDEX** freely on new tables
3. **ADD COLUMN** on commerce tables: **discouraged** — requires `COMMERCE-IMPACTING MIGRATION — MANUAL REVIEW REQUIRED`
4. **Never** in accounting phase: DROP/RENAME commerce column, change enum values, alter FK ON DELETE on Order/Payment/Inventory

## Migration file naming

```text
20260830_accounting_coa_and_journals     # safe
20260901_commerce_order_add_ledger_id    # FLAG — manual review
```

## Rollback strategy

- Accounting migrations reversible independently
- Dropping accounting tables must not cascade to commerce

---

# 13. API Isolation

## New mount (in `app.ts` — additive only)

```text
app.use("/api/admin/accounting", accountingRoutes);  // requireAdmin + accounting flags
```

## Proposed routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/accounting/health` | Posting backlog, failures |
| GET/POST | `/api/admin/accounting/accounts` | CoA CRUD |
| GET | `/api/admin/accounting/journals` | List/filter entries |
| GET | `/api/admin/accounting/journals/:id` | Entry + lines |
| POST | `/api/admin/accounting/journals/manual` | Phase 5+ manual entry |
| POST | `/api/admin/accounting/postings/:eventId/retry` | Retry failed event |
| GET | `/api/admin/accounting/trial-balance` | TB report |
| GET | `/api/admin/accounting/general-ledger` | GL by account |
| GET | `/api/admin/accounting/profit-and-loss` | P&L |
| GET | `/api/admin/accounting/balance-sheet` | BS |
| GET/POST | `/api/admin/accounting/reconciliation/*` | Zoho compare |
| GET | `/api/admin/accounting/gst/*` | Phase 9 GST reports |

## Must NOT change

- `/api/checkout/*`
- `/api/payments/*` (except additive webhook — none planned)
- `/api/cart/*`
- `/api/admin/orders/*` semantics
- `/api/zoho/*` existing sync routes

---

# 14. Frontend Isolation

## Recommended nav (when `NEXT_PUBLIC_ACCOUNTING_ENABLED=1`)

```text
Admin → Accounting          (/admin/accounting)
 ├─ Dashboard & Health      /admin/accounting
 ├─ Sales                   /admin/accounting/sales
 ├─ Purchases               /admin/accounting/purchases  → links to /admin/purchases ops
 ├─ Banking                 /admin/accounting/banking
 ├─ Accountant              /admin/accounting/accountant
 ├─ GST                     /admin/accounting/gst
 ├─ Reports                 /admin/accounting/reports
 └─ Reconciliation          /admin/accounting/reconciliation
```

Separate from existing:

- `/admin/orders` — commerce ops (unchanged)
- `/admin/inventory` — stock ops (unchanged)
- `/admin/purchases` — AP ops (unchanged, may emit events)
- `/admin/reconciliation` — **rename or deprecate later** to avoid confusion with accounting reconciliation (plan: keep payment mismatch page as “Payment reconciliation”, new page as “Ledger reconciliation”)

**No** accounting components in storefront `app/layout.tsx`, checkout, or product pages.

---

# 15. Testing Safety Net

## Phase 0 — Commerce regression suite (required before any shadow posting)

Implement as integration tests against Docker Postgres + Redis (new `backend/tests/commerce/`):

| # | Test | Asserts |
|---|------|---------|
| 1 | Checkout creates PENDING_PAYMENT order | Order + Payment rows |
| 2 | Stock reserves on checkout | `reserved` incremented |
| 3 | Razorpay verify marks PAID | status + CAPTURED |
| 4 | Stock confirms once on pay | `onHand` down once |
| 5 | Duplicate webhook idempotent | No double stock decrement |
| 6 | Failed payment releases reserve | `reserved` back |
| 7 | Payment timeout cancels | Order CANCELLED |
| 8 | Invoice PDF generates | `Invoice.pdfUrl` set |
| 9 | Zoho invoice called (mock) | mock invoked once per order |
| 10 | Zoho payment called (mock) | mock invoked |
| 11 | Refund succeeds | Payment REFUNDED, restock |
| 12 | Zoho credit note (mock) | on full refund |
| 13 | COD path | PAID at checkout, stock confirmed |
| 14 | `NATIVE_ACCOUNTING_ENABLED=0` | emit no-ops; all above still pass |

**Gate:** Phase 3 cannot start until 1–14 pass in CI.

## Accounting tests (separate suite `backend/tests/accounting/`)

- Journal balance validation
- Idempotent posting event
- ORDER_PAID handler with fixture order
- FAILED event retry
- Reconciliation MATCHED/MISMATCH logic

Commerce and accounting test jobs **separate** in CI so accounting failures don’t block commerce deploy initially — but commerce regression must pass on every PR touching `afterPaid`, checkout, or payments.

---

# 16. Rollback / Kill Switch

## Immediate disable

```env
NATIVE_ACCOUNTING_ENABLED=0
```

Restart backend → worker stops processing; emit becomes no-op.

## What continues

| System | Status |
|--------|--------|
| Checkout / cart | ✅ |
| Payments / webhooks | ✅ |
| Stock reserve/confirm | ✅ |
| Invoice PDF | ✅ |
| Zoho invoice/payment/CN | ✅ |
| Shipping | ✅ |
| Refunds | ✅ |
| Purchases module (if enabled) | ✅ |

## Dormant data

- `AccountingPostingEvent` PENDING/FAILED remain in DB
- `AccountingJournalEntry` POSTED remain read-only
- Re-enable flag → worker resumes from PENDING/FAILED (optional auto-retry policy)

**No** migration rollback required for kill switch.

---

# 17. Phase Plan

## Phase 0 — Protect commerce (weeks 1–2)

- Commerce regression test suite (Section 15)
- Document extension points in code comments only
- CI gate on checkout/payment paths
- **No accounting tables**

## Phase 1 — Isolated schema + CoA (weeks 2–4)

- Migrations: accounting tables only
- Seed default CoA (Indian e-commerce: Cash, Razorpay clearing, AR, Sales, GST output, Inventory asset, COGS, AP)
- Admin UI: accounts list only
- Flags default OFF

## Phase 2 — Journal engine (weeks 4–6)

- Manual/synthetic journal creation in admin
- Balance validation, sequences, audit log
- No commerce connection

## Phase 3 — Event bridge + shadow ORDER_PAID (weeks 6–8)

- `accounting-bridge` module
- **Single commerce touch:** fire-and-forget emit in `afterOrderPaid` (EXTENSION POINT)
- BullMQ worker + ORDER_PAID handler (shadow)
- Health admin page

## Phase 4 — Zoho reconciliation (weeks 8–10)

- Compare native vs Zoho vs commerce totals
- Mismatch dashboard
- Still non-authoritative

## Phase 5 — Refunds & credit notes (weeks 10–12)

- Emit from `refund.service` / status handler
- Native reversal journals (shadow)
- Reconciliation includes refunds

## Phase 6 — Purchases/AP shadow (weeks 12–14)

- Emit from purchases receive/bill open
- AP journal templates
- No change to purchases commerce isolation

## Phase 7 — Financial reports (weeks 14–18)

- TB, GL, P&L, BS from native journals only
- Disclaimers on shadow data

## Phase 8 — Banking (weeks 18–22)

- Bank accounts, import, match to Razorpay settlements

## Phase 9 — GST reporting (weeks 22–26)

- GSTR-oriented exports from native tax lines
- Compare to invoice PDF / Zoho

## Phase 10 — Cutover evaluation (earliest ~6 months)

- Review Section 11 criteria
- Business decision only — optional Zoho retirement plan

---

# 18. Output Summary Sections

## SAFE TO START

These tasks are **fully isolated** — zero commerce code changes:

1. Create `SARVEDA_ACCOUNTING_SAFE_ARCHITECTURE_PLAN.md` review with architect ✅ (this doc)
2. Prisma migrations for `Accounting*` tables only (Phase 1)
3. `backend/src/modules/accounting/` scaffold with flags default OFF
4. Chart of Accounts seed script + admin read-only API
5. Journal entry service with synthetic/manual entries (Phase 2)
6. Unit tests for balance validation, sequences, idempotency keys
7. Frontend `/admin/accounting` shell + CoA list (gated by env)
8. BullMQ queue wiring **without** commerce emit connected
9. ORDER_PAID posting handler using **fixture orders** in tests only
10. Reconciliation compare logic using mocked Zoho API responses
11. Commerce regression test suite (Phase 0) — **tests commerce without changing it**

## REQUIRES COMMERCE TOUCH

These need **EXTENSION POINT ONLY** changes — minimal, reviewed, with regression tests:

| Task | File | Change |
|------|------|--------|
| Emit ORDER_PAID | `backend/src/modules/orders/afterPaid.ts` | Add `void emitCommerceAccountingEvent(...).catch(...)` after existing Zoho calls |
| Emit refunds | `backend/src/modules/payments/refund.service.ts` | Same pattern after successful refund |
| Emit partial refund | `refund.service.ts` | Separate event type |
| Emit cancel/refund status | `orders.service.ts` `handlePaidOrderStatusChange` | Optional emit |
| Emit stock received | `purchases.service.ts` `receivePurchaseOrder` | After transaction commit |
| Emit vendor bill | `purchases.handlers.ts` | On bill OPEN |
| Register accounting routes | `backend/src/app.ts` | Additive `app.use` only |
| Admin sidebar link | `frontend/components/admin/AdminSidebar.tsx` | Gated env flag |

**Estimated commerce diff for Phase 3:** < 30 lines total across 2–3 files.

## DO NOT TOUCH YET

Freeze until shadow mode proves stable (Phase 4+ complete):

| Area | Reason |
|------|--------|
| `checkout.service.ts` transaction body | Payment/stock atomicity |
| `completePaidOrder` / webhook handlers | Idempotency critical path |
| `confirmStockTx` / `reserveStockTx` / `releaseStockTx` | Inventory correctness |
| `Order` / `Payment` / `Invoice` schema semantics | Commerce truth |
| `createZohoInvoiceForOrder` / `recordZohoPaymentForOrder` | Authoritative GL today |
| `utils/gst.ts` / `utils/invoice.ts` PDF logic | Customer-facing legal doc |
| Storefront checkout/cart/product pages | UX stability |
| Removing or gating Zoho sync on flag | Until cutover approved |
| Repurposing `/admin/reconciliation` without UX plan | Operator confusion |
| Multi-warehouse inventory refactor | Out of accounting scope; high risk |
| Merging purchases into accounting UI prematurely | Keep modules separable |

---

## Appendix: Dependency graph (target state)

```text
                    ┌──────────────┐
                    │  Storefront  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   Commerce   │◄── FREEZE
                    │   modules    │
                    └──────┬───────┘
                           │ emit only
                    ┌──────▼───────┐
                    │ accounting-  │
                    │   bridge     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ accounting│ │ purchases│ │   Zoho   │
        │  (native) │ │   (AP)   │ │ (official)│
        └──────────┘ └──────────┘ └──────────┘
              │                         │
              └──── reconciliation ─────┘
                        (shadow)
```

---

*End of plan. No application code was modified.*
