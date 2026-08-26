# Sarveda Accounting & Commerce — Current Implementation Audit

**Audit date:** 2026-08-22  
**Repository:** `/home/radha/sarveda`  
**Auditor scope:** Read-only inspection of code, Prisma schema, and migrations. No runtime deployment verification.  
**Important:** This system is primarily an **e-commerce platform** with **operational finance hooks** and **Zoho Books as external accounting**. It does **not** currently implement a native double-entry general ledger.

---

## Executive summary

| Layer | Status |
|-------|--------|
| E-commerce (catalog, cart, checkout, orders, payments) | **Mature / production-oriented** |
| Sarveda operational inventory | **Implemented** (global per-SKU, not warehouse-split) |
| GST customer invoice PDF | **Implemented** (tax-inclusive, CGST/SGST/IGST on PDF) |
| Native accounting engine (CoA, journals, AR/AP ledger) | **NOT IMPLEMENTED** |
| Zoho Books integration (sales invoices, payments, credit notes) | **PARTIALLY IMPLEMENTED** |
| Purchases module (Vendor → PO → Receipt → Bill → Expense) | **PARTIALLY IMPLEMENTED** (Phase 1, feature-flagged, no Zoho bill sync) |
| Banking / reconciliation | **MINIMAL** (gateway mismatch list + Razorpay per-order reconcile) |
| Financial reports (P&L, Balance Sheet, Trial Balance) | **NOT IMPLEMENTED** |
| Automated tests for accounting | **NOT IMPLEMENTED** |

Reports and operational analytics are overwhelmingly computed **directly from `Order`, `Payment`, `Product`, marketplace tables, and imported Zoho historical data** — not from journal entries.

---

# 1. Current system architecture

## Stack (verified from `package.json`)

| Layer | Technology | Version (package.json) |
|-------|------------|------------------------|
| Frontend | Next.js (App Router) | 14.2.5 |
| Frontend UI | React, Tailwind CSS | React 18.3.1 |
| Backend | Node.js + Express + TypeScript | Express 4.19.2, TS 5.5.4 |
| Database | PostgreSQL | via Prisma 5.16.2 |
| ORM | Prisma | `@prisma/client` 5.16.2 |
| Cache / queues | Redis + BullMQ | ioredis 5.4.1, bullmq 5.8.0 |
| Auth | JWT (httpOnly cookie + Bearer), Google OAuth, OTP | `jsonwebtoken`, Passport |
| Payments | Razorpay, Stripe, PayPal, COD | razorpay, stripe, paypal-rest-sdk |
| Media | AWS S3 (+ optional CloudFront) | `@aws-sdk/client-s3` |
| Email | Nodemailer / SendGrid patterns | `notifications/email.ts` |

## Authentication / authorization

- **Storefront users:** `User` model, roles `CUSTOMER | ADMIN | SUPER_ADMIN` (`backend/prisma/schema.prisma`).
- **Admin API:** `requireAdmin` middleware (`backend/src/middleware/admin.ts`) — JWT from cookie or Bearer; requires `ADMIN` or `SUPER_ADMIN`.
- **Super-admin only:** `requireSuperAdmin` for admin activity log (`backend/src/middleware/adminActivity.ts`).
- **No granular accounting permissions** (e.g. separate “view P&L” vs “post journal”) — binary admin access.

## API architecture

- **REST only** — Express routers mounted in `backend/src/app.ts`.
- Public/storefront: `/api/products`, `/api/cart`, `/api/checkout`, `/api/payments`, `/api/orders`, etc.
- Admin: `/api/admin/*` (`backend/src/modules/admin/admin.routes.ts`).
- Zoho: `/api/zoho/*` (`backend/src/modules/zoho/index.ts`).
- **Frontend proxy:** Next.js rewrites `/api/*` → backend (`frontend/next.config.js`); staging points to Lightsail `13.204.112.165`.

## Deployment (visible in repo)

| Component | Target |
|-----------|--------|
| Frontend | Vercel (`sarveda-demo.xyz` staging per CLAUDE.md) |
| Backend | AWS EC2 / Lightsail Express (port 5000) |
| Database | PostgreSQL (local Docker dev; Lightsail/RDS prod) |
| Redis | On EC2 (BullMQ jobs) |
| S3 | `sarveda-media` bucket (us-east-1) |

## E-commerce architecture

Classic modular monolith:

```
Browser → Next.js (Vercel) → /api rewrite → Express
Express → Prisma → PostgreSQL
Express → Redis (checkout idempotency, BullMQ)
Express → Razorpay/Stripe/PayPal webhooks
Express → Shiprocket/Delhivery shipping
Express → S3 (media, invoice PDFs)
```

## “Accounting module” architecture

There is **no separate accounting service**. Financial behavior is distributed:

1. **Operational records** in PostgreSQL (`Order`, `Payment`, `Invoice`, purchases tables).
2. **GST PDF generation** in-process (`backend/src/modules/invoices/`, `backend/src/utils/invoice.ts`).
3. **External accounting** via Zoho Books API (`backend/src/modules/zoho/zoho-invoices.ts`, `zoho-financials.ts`).
4. **Historical analytics** from imported Zoho invoice snapshots (`ZohoHistoricalInvoice`).

## E-commerce ↔ accounting communication

| Event | Sarveda DB | Zoho Books |
|-------|------------|------------|
| Checkout | Order, reserve stock | None |
| Payment success | Confirm stock, Invoice PDF, `afterPaidRanAt` | Create invoice + customer payment (async in `afterOrderPaid`) |
| Refund | Restock, Payment/Order status | Credit note + refund (if invoice exists) |
| Purchase receipt | `Inventory.onHand++` | None (bill sync not built) |

**No message bus** — synchronous/queued function calls within Express + BullMQ for payment timeout.

## Background jobs / webhooks

**BullMQ jobs** (`backend/src/jobs/`):

- `paymentTimeoutJob.ts` — cancel unpaid orders after 15 min
- `zohoStockSyncJob.ts` — Zoho stock pull (disabled when `ZOHO_INVENTORY_SYNC` off)
- `emailQueue.ts`, `cartCleanupJob.ts`, marketplace sync jobs (Amazon/Etsy/Flipkart), shipping retry, etc.

**Webhooks** (`backend/src/app.ts`):

- `POST /api/payments/razorpay/webhook`
- `POST /api/payments/stripe/webhook`
- `POST /api/payments/paypal/webhook`
- Shipping: Delhivery, Shiprocket
- WhatsApp, Zoho webhook handler

## Simplified architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        STOREFRONT (Next.js 14)                   │
│  /shop, /product, /checkout, /admin/*                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ /api/* (rewrite)
┌────────────────────────────▼────────────────────────────────────┐
│                    EXPRESS API (TypeScript)                      │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐ │
│  │ checkout    │ │ orders       │ │ payments   │ │ admin       │ │
│  │ cart        │ │ invoices     │ │ refunds    │ │ purchases*  │ │
│  │ products    │ │ shipping     │ │ webhooks   │ │ reports     │ │
│  └──────┬──────┘ └──────┬───────┘ └─────┬──────┘ └──────┬──────┘ │
│         │               │               │               │        │
│         └───────────────┴───────────────┴───────────────┘        │
│                              │ Prisma                             │
└──────────────────────────────┼────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   PostgreSQL              Redis/BullMQ            AWS S3
   (orders, inventory,     (timeouts, email)      (media, invoice PDFs)
    purchases*, zoho hist)
                               │
                               ▼
                    Zoho Books API (external GL)
                    invoices, payments, credit notes
                    [* purchases module feature-flagged]
```

---

# 2. Repository structure

## Top-level (commerce + accounting relevant)

```
sarveda/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # All DB models
│   │   └── migrations/            # 58 SQL migrations (init → purchases phase 1)
│   ├── src/
│   │   ├── app.ts                 # Express mount points, webhooks
│   │   ├── modules/
│   │   │   ├── checkout/          # Order creation, stock reserve
│   │   │   ├── orders/            # Stock confirm/release, afterPaid, cancellations
│   │   │   ├── payments/          # Razorpay/Stripe/PayPal, webhooks, refunds
│   │   │   ├── invoices/          # GST PDF generation
│   │   │   ├── products/          # Catalog CRUD, admin XL sheet
│   │   │   ├── cart/              # Cart API
│   │   │   ├── admin/             # Admin handlers, reports, inventory, reconciliation
│   │   │   ├── purchases/         # Vendor, PO, Bill, Expense (Phase 1)
│   │   │   ├── zoho/              # Zoho Books sync (invoices, stock, contacts)
│   │   │   ├── marketplaces/      # Amazon/Flipkart/Etsy ops + Zoho historical panel
│   │   │   └── shipping/          # Shiprocket, Delhivery
│   │   ├── jobs/                  # BullMQ workers
│   │   └── utils/
│   │       ├── gst.ts             # GST rate map, inclusive extraction
│   │       ├── invoice.ts         # PDF builder (CGST/SGST/IGST columns)
│   │       └── orderNumber.ts     # SRV-YYYYMM##### sequencing
│   └── scripts/                   # Import, HSN match, Zoho historical import
├── frontend/
│   ├── app/
│   │   ├── admin/                 # Admin UI (inventory, orders, purchases*, reports)
│   │   ├── checkout/              # Storefront checkout
│   │   └── product/               # PDP
│   ├── components/admin/          # AdminInventoryWorkspace, purchases nav, etc.
│   └── lib/
│       ├── admin-api.ts           # Admin fetch client
│       └── purchases-api.ts       # Purchases module client
└── data/                          # Compare/import JSON, HSN workbooks (not runtime)
```

## Module purposes (accounting-relevant)

| Path | Purpose |
|------|---------|
| `backend/src/modules/checkout/checkout.service.ts` | Creates `Order`, reserves inventory, initiates gateway payment |
| `backend/src/modules/orders/afterPaid.ts` | Post-payment orchestration (invoice PDF, Zoho, cart clear) |
| `backend/src/modules/orders/orders.service.ts` | Stock reserve/confirm/release/restock; paid status changes |
| `backend/src/modules/invoices/invoice.service.ts` | Builds GST invoice input, uploads PDF to S3 |
| `backend/src/modules/payments/razorpay.webhook.ts` | Idempotent payment capture handling |
| `backend/src/modules/payments/refund.service.ts` | Gateway refunds + Zoho credit note trigger |
| `backend/src/modules/zoho/zoho-invoices.ts` | Push sales invoice to Zoho Books |
| `backend/src/modules/zoho/zoho-financials.ts` | Customer payments, void invoice, credit notes |
| `backend/src/modules/purchases/*` | Operational AP: vendors, POs, receipts, bills, expenses |
| `backend/src/modules/admin/reports.handlers.ts` | Excel export reports (not GL-based) |
| `frontend/components/admin/AdminInventoryWorkspace.tsx` | Inventory admin (+ optional Zoho sync UI) |
| `frontend/app/admin/purchases/**` | Purchases UI (env-gated) |

**Note:** “Vendor” in `reports.handlers.ts` export type `vendors` refers to **PickupLocation / warehouse** revenue attribution — not `Vendor` (supplier) model.

---

# 3. Database audit

Schema source: `backend/prisma/schema.prisma`  
Latest purchases migration: `backend/prisma/migrations/20260822143856_purchases_module_phase1/migration.sql`  
Zoho historical migration: `backend/prisma/migrations/20260812100000_zoho_historical_invoices/migration.sql`

## Commerce / accounting tables (summary)

### `User`
- **Purpose:** Customers and admin users.
- **PK:** `id` (UUID)
- **Key columns:** `email` (unique), `phone` (unique), `role` (`CUSTOMER|ADMIN|SUPER_ADMIN`), `deletedAt`
- **FKs:** None incoming for accounting
- **Status:** **IMPLEMENTED** (customers)

### `Product` / `ProductVariant`
- **Purpose:** Catalog items and SKUs.
- **PK:** `id`
- **Unique:** `Product.slug`, `ProductVariant.sku`, `Product.wooCommerceId`
- **Accounting-relevant:** `Product.taxClass`, `Product.hsnCode`, `ProductVariant.costInPaise`, `ProductVariant.zohoItemId`
- **Status:** **IMPLEMENTED** (items/variants)

### `Inventory`
- **Purpose:** Stock per variant (single global bucket, not per warehouse).
- **PK:** `id`
- **Unique:** `variantId`
- **Columns:** `onHand`, `reserved`, `lowStockThreshold`
- **FK:** `variantId` → `ProductVariant`
- **Status:** **IMPLEMENTED** (stock-on-hand); **NOT IMPLEMENTED** (stock movements ledger)

### `Order`
- **Purpose:** E-commerce sales order (also acts as de facto sales document).
- **PK:** `id`
- **Unique:** `orderNumber`, `wooCommerceId`
- **Money:** all integer paise fields
- **Accounting hooks:** `zohoInvoiceId`, `zohoInvoiceNo`, `zohoSyncedAt`, `zohoSyncError`, `reportingTotalInInrPaise`, `afterPaidRanAt`
- **Soft delete:** `deletedAt`
- **Status:** **IMPLEMENTED** (sales orders — no separate SO entity)

### `OrderItem`
- **Purpose:** Line snapshots at order time.
- **FK:** `orderId` → `Order`, `variantId` → `ProductVariant`, optional `pickupLocationId`
- **Status:** **IMPLEMENTED** (sales order lines)

### `Payment`
- **Purpose:** Gateway payment record per order.
- **FK:** `orderId` → `Order`
- **Key columns:** `provider`, `providerOrderId`, `providerPaymentId`, `amountInPaise`, `status`, `gatewayFeeInPaise`, `settledInPaise`, `settlementDate`, `rawPayload` (JSON — stores Zoho payment IDs)
- **Unique constraints:** **None on `providerPaymentId`** (idempotency is application-level only)
- **Status:** **IMPLEMENTED** (payments); **NOT IMPLEMENTED** (payment allocations table)

### `Refund`
- **Purpose:** Refund rows linked to payment.
- **FK:** `paymentId` → `Payment`
- **Status:** **IMPLEMENTED** (refunds); no separate credit note table in Sarveda

### `Invoice`
- **Purpose:** Customer GST invoice PDF metadata (1:1 with paid order).
- **Unique:** `orderId`, `invoiceNo`
- **Columns:** `pdfUrl`, `issuedAt`
- **Status:** **IMPLEMENTED** (invoice header); line detail lives on `OrderItem`, not `InvoiceLine`

### `Vendor` (purchases migration 20260822)
- **Purpose:** Supplier master.
- **PK:** `id`
- **Key columns:** `name`, `gstin`, `pan`, addresses, `zohoContactId`, `isActive`
- **Indexes:** `name`, `isActive`
- **Status:** **IMPLEMENTED** (vendors — new, feature-flagged module)

### `PurchaseOrder` / `PurchaseOrderLine`
- **Purpose:** Operational purchase orders.
- **Unique:** `poNumber`
- **Status enum:** `DRAFT|SENT|PARTIALLY_RECEIVED|RECEIVED|CANCELLED`
- **FK:** `vendorId` → `Vendor`, optional `pickupLocationId` → `PickupLocation`
- **Status:** **IMPLEMENTED** (PO + lines)

### `PurchaseReceipt` / `PurchaseReceiptLine`
- **Purpose:** Goods receipt against PO (updates stock).
- **FK:** receipt → PO; line → receipt + PO line
- **Status:** **IMPLEMENTED** (goods receipt — no separate inventory transaction table)

### `VendorBill` / `VendorBillLine`
- **Purpose:** AP bills in Sarveda (not yet synced to Zoho in code).
- **Unique:** `billNumber`
- **Status enum:** `DRAFT|OPEN|PAID|VOID`
- **FK:** `vendorId`, optional `purchaseOrderId`, `zohoBillId` placeholder
- **Status:** **IMPLEMENTED** (vendor bills — operational only)

### `Expense`
- **Purpose:** Simple expense records (`expenseAccount` is a string, not FK to CoA).
- **Status enum:** `DRAFT|RECORDED`
- **Status:** **PARTIALLY IMPLEMENTED** (basic expense capture)

### `PickupLocation`
- **Purpose:** Fulfillment warehouse names for couriers (NOT inventory locations).
- **Status:** **IMPLEMENTED** (warehouses for shipping only)

### `ZohoHistoricalInvoice` / `ZohoHistoricalInvoiceLine`
- **Purpose:** Imported pre-cutover Zoho Books invoices for analytics.
- **Unique:** `zohoInvoiceId`; line `[invoiceId, lineIndex]`
- **Not linked** to `Order` or live accounting.
- **Status:** **IMPLEMENTED** (read-only analytics reference)

### `MarketplaceOrder` / `MarketplaceOrderItem` / `MarketplaceReturn`
- **Purpose:** External marketplace sales tracking (operational hub).
- **Does not** auto-post to Sarveda GL or reduce `Inventory` in verified flow.
- **Status:** **PARTIALLY IMPLEMENTED** (marketplace ops separate from shop inventory)

### `AdminActivityLog`
- **Purpose:** Admin mutation audit (HTTP-level), not financial immutability.
- **Status:** **PARTIALLY IMPLEMENTED** (audit log — not accounting-grade)

---

## Concept existence matrix

| Concept | Status | Evidence |
|---------|--------|----------|
| Customers | **IMPLEMENTED** | `User`, `Address`, order `email`/`phone` |
| Vendors (suppliers) | **IMPLEMENTED** | `Vendor` model + purchases API (flagged) |
| Items/products | **IMPLEMENTED** | `Product`, `ProductVariant` |
| Item variants | **IMPLEMENTED** | `ProductVariant` |
| HSN/SAC | **PARTIALLY IMPLEMENTED** | `Product.hsnCode`; SAC only on `Expense.hsnSac`; default HSN in invoice |
| GST rates | **PARTIALLY IMPLEMENTED** | Static map in `utils/gst.ts` from `taxClass`; not a DB tax table |
| Tax configuration | **PARTIALLY IMPLEMENTED** | Product `taxClass` slug; no admin tax rate CRUD |
| Warehouses (inventory) | **NOT IMPLEMENTED** | `PickupLocation` is fulfillment-only; stock is global |
| Stock | **IMPLEMENTED** | `Inventory.onHand`, `reserved` |
| Inventory transactions | **NOT IMPLEMENTED** | No movement/ledger table; direct `Inventory` updates |
| Sales orders (separate) | **NOT IMPLEMENTED** | `Order` serves this role |
| Sales order lines | **IMPLEMENTED** | `OrderItem` |
| Invoices | **IMPLEMENTED** | `Invoice` + PDF; Zoho mirror on `Order` |
| Invoice lines (normalized) | **NOT IMPLEMENTED** | Lines on `OrderItem`; PDF computed at render |
| Payments | **IMPLEMENTED** | `Payment` |
| Payment allocations | **NOT IMPLEMENTED** | One primary payment per order pattern |
| Refunds | **IMPLEMENTED** | `Refund` + gateway + Zoho credit note |
| Credit notes (local) | **NOT IMPLEMENTED** | Zoho credit note only (`zoho-financials.ts`) |
| Purchase orders | **IMPLEMENTED** | `PurchaseOrder` (flagged) |
| PO lines | **IMPLEMENTED** | `PurchaseOrderLine` |
| Vendor bills | **IMPLEMENTED** | `VendorBill` (no Zoho push yet) |
| Vendor payments | **NOT IMPLEMENTED** | `VendorBill.paidInPaise` status only; no payment document |
| Chart of accounts | **NOT IMPLEMENTED** | Zoho CoA read in scripts only |
| Accounts | **NOT IMPLEMENTED** | |
| Journal entries | **NOT IMPLEMENTED** | |
| Journal lines | **NOT IMPLEMENTED** | |
| Fiscal years | **NOT IMPLEMENTED** | Report range helper uses Indian FY in exports only |
| Document numbering | **PARTIALLY IMPLEMENTED** | `SRV-YYYYMM#####`, `PO-#####`, `BILL-#####`, invoice from order number |
| Bank accounts | **NOT IMPLEMENTED** | |
| Bank transactions | **NOT IMPLEMENTED** | |
| Reconciliation | **PARTIALLY IMPLEMENTED** | Order vs payment status mismatch list |
| Audit logs | **PARTIALLY IMPLEMENTED** | `AdminActivityLog`, `OrderStatusHistory` |

---

# 4. Accounting engine audit

## Double-entry accounting: **NOT IMPLEMENTED in Sarveda**

There is **no** Chart of Accounts, Journal Entry, or Ledger table in Prisma.  
There is **no** posting engine that enforces debits = credits in PostgreSQL.

**Zoho Books** acts as the external general ledger for **sales-side** documents when sync succeeds:

- Sales invoice → Zoho posts AR / Sales / Tax (implicit Zoho behavior)
- Customer payment → Bank/Clearing vs AR
- Credit note → Reversal

Sarveda stores **operational truth** (orders, stock, PDF invoice) and **pointers** (`zohoInvoiceId`, `rawPayload.zohoCustomerPaymentId`).

## Event → journal analysis (Sarveda local)

| Event | Sarveda journal? | What actually happens |
|-------|------------------|------------------------|
| **1. Sales invoice created** | **NO** | `ensureOrderInvoicePdf` → `Invoice` row + S3 PDF. Zoho: `createZohoInvoiceForOrder` → external invoice. |
| **2. Customer pays invoice** | **NO** | `Payment.status = CAPTURED`, `Order.status = PAID`. Zoho: `recordZohoPaymentForOrder` → customer payment applied to invoice. |
| **3. Order cancelled (unpaid)** | **NO** | `releaseStockTx`, `Order.status = CANCELLED`. Zoho void only if invoice existed (unusual for unpaid online). |
| **4. Refund** | **NO** | Gateway refund API, `Refund` row, `restockPaidOrderTx`, order → `REFUNDED`. Zoho: `createZohoRefundDocumentsForOrder` (credit note + refund). |
| **5. Credit note issued** | **NO local CN** | Zoho credit note via API only; no Sarveda `CreditNote` model. |
| **6. Vendor bill created** | **NO** | `VendorBill` + lines in DB; **no** journal, **no** Zoho bill API in codebase. |
| **7. Vendor payment made** | **NO** | Admin can set `VendorBill.status = PAID` / `paidInPaise`; no bank payment document. |

## Accounts referenced in code (Zoho-side only)

`backend/scripts/list-zoho-chart-of-accounts.ts` reads Zoho `/chartofaccounts` for diagnostics.  
`zoho-financials.ts` resolves Zoho account IDs for credit note line accounts.  
**None of these are modeled locally.**

## Conclusion

Accounting is **calculated and stored operationally** in order/payment tables plus **exported to Zoho** for books. This is **not** a native double-entry system.

---

# 5. Sales workflow

## Intended Zoho-style flow vs actual

| Stage | Zoho Books | Sarveda actual | Status |
|-------|------------|----------------|--------|
| Customer | Contact | `User` + guest checkout email | **IMPLEMENTED** |
| Quote/Estimate | Yes | **None** | **NOT IMPLEMENTED** |
| Sales Order | Optional | **`Order`** (includes unpaid state) | **PARTIAL** (combined cart checkout + SO) |
| Invoice | Yes | **`Invoice`** PDF + Zoho invoice | **IMPLEMENTED** |
| Payment | Customer payment | **`Payment`** + gateway | **IMPLEMENTED** |
| Credit Note | Yes | Zoho only on refund | **PARTIAL** |

## Order statuses (`OrderStatus`)

`PENDING_PAYMENT → PAID → PROCESSING → PACKED → SHIPPED → DELIVERED`  
Also: `CANCELLED`, `REFUNDED`

Transitions: admin patch status, payment webhooks, timeout job, refund service.

## Numbering

- Orders: `SRV-{YYYYMM}{5-digit}` — `backend/src/utils/orderNumber.ts`
- Invoices: derived from order number — `invoiceNumberForOrder()` in `utils/invoice.ts`
- No separate quote or sales-order number series.

## API endpoints (sales)

| Endpoint | Handler |
|----------|---------|
| `POST /api/checkout/create-order` | `checkout.service.createCheckoutOrder` |
| `POST /api/payments/razorpay/verify` | `razorpay.verify.completePaidOrder` |
| Webhooks | `razorpay.webhook`, `stripe.webhook`, `paypal.webhook` |
| `GET /api/admin/orders` | `admin.ordersList` |
| `POST /api/admin/orders/:id/refund` | `refundOrder` → `refund.service` |

## Frontend

| Route | Component |
|-------|-----------|
| `/checkout` | Checkout flow |
| `/admin/orders` | Order list |
| `/admin/orders/[id]` | Full order ops (refund, invoice, shipping) |

---

# 6. E-commerce → accounting integration

## Code path: checkout → books

1. **`POST /api/checkout/create-order`** (`checkout.service.ts`)
   - Creates `Order` (`PENDING_PAYMENT`), `OrderItem`, `OrderAddress`, `Payment` (`PENDING`)
   - **`reserveStockTx`** — `Inventory.reserved += qty`
   - Schedules BullMQ payment timeout

2. **Payment success** (`completePaidOrder` in `razorpay.verify.ts` or webhooks)
   - **`confirmStockTx`** — `onHand -= qty`, `reserved -= qty`
   - `Order.status = PAID`, `Payment.status = CAPTURED`

3. **`afterOrderPaid(orderId)`** (`orders/afterPaid.ts`)
   - Claim via `Order.afterPaidRanAt` (idempotent)
   - **`ensureOrderInvoicePdf`** → `Invoice` + S3
   - Email, coupon usage, cart clear, digital enrollments
   - **`createZohoInvoiceForOrder`** → Zoho Books invoice
   - **`recordZohoPaymentForOrder`** → Zoho customer payment (skipped for COD)
   - **`mirrorOrderStockToZoho`** — only if `ZOHO_INVENTORY_SYNC=1` (default off)

## Answers

| Question | Answer |
|----------|--------|
| Auto sales order? | **Yes** — `Order` at checkout (not a separate SO entity) |
| Auto invoice? | **Yes** — after payment in `afterOrderPaid`; COD at checkout |
| When invoice? | After `PAID` (or COD commit at checkout) |
| Journal entries? | **No** in Sarveda; Zoho posts implicitly |
| Stock reduced? | **Yes** — on payment capture (`confirmStockTx`) or COD checkout |
| When stock reduced? | **Paid event**, not at invoice PDF generation |
| Payment fails? | Webhook/timeout → `releaseStockTx`, order cancelled |
| Payment succeeds? | Confirm stock + afterPaid pipeline |
| Order cancelled unpaid? | Release reservation |
| Refund? | Gateway refund, restock, Zoho credit note if invoice exists |
| Partial refund? | `initiatePartialGatewayRefund` — supported at gateway level |
| Duplicate webhooks? | Mitigated by `providerPaymentId` checks + `afterPaidRanAt` |
| Idempotent? | **Mostly yes** for payment capture; **no DB unique on `providerPaymentId`** |

---

# 7. Inventory audit

## Architecture

- **One `Inventory` row per `ProductVariant`** — global stock, not per `PickupLocation`.
- **Available** = `onHand - reserved` (computed in admin UI logic).
- **`PickupLocation`** — fulfillment routing for Shiprocket/Delhivery and PO “receiving warehouse” label only.

## Feature matrix

| Feature | Status |
|---------|--------|
| Warehouses (stock split) | **NOT IMPLEMENTED** |
| Stock on hand | **IMPLEMENTED** |
| Reserved stock | **IMPLEMENTED** |
| Stock movements ledger | **NOT IMPLEMENTED** |
| Purchase receipt | **IMPLEMENTED** (`receivePurchaseOrder` in `purchases.service.ts`) |
| Sales issue | **IMPLEMENTED** (`confirmStockTx`) |
| Customer return / restock | **IMPLEMENTED** (`restockPaidOrderTx` on refund) |
| Vendor return | **NOT IMPLEMENTED** |
| Stock adjustment | **PARTIAL** — admin patch/import inventory only |
| Damaged stock | **NOT IMPLEMENTED** |
| Stock transfer | **NOT IMPLEMENTED** |
| Inventory valuation | **NOT IMPLEMENTED** — `costInPaise` updated on PO receive; no FIFO/WAVG engine |

## E-commerce inventory timeline

1. Add to cart — no stock change  
2. Checkout — **reserve**  
3. Pay — **confirm** (onHand down)  
4. Timeout/fail — **release reserve**  
5. Refund — **restock onHand**

## Zoho inventory sync

- Controlled by `ZOHO_INVENTORY_SYNC` (`zoho-inventory-sync-flag.ts`) — **default disabled**.
- When enabled: push/pull/mirror via `/api/zoho/sync/*` and admin inventory UI.
- Design intent (recent): **Sarveda is stock master**; Zoho for invoices/bills only.

---

# 8. GST / India tax engine

## Implemented

| Feature | Location | Notes |
|---------|----------|-------|
| HSN on products | `Product.hsnCode` | Admin + XL sheet; migration `20260606160000` |
| GST rate map | `backend/src/utils/gst.ts` | `standard/gst18/gst12/gst-5/gst-zero-rate` → % |
| Tax-inclusive prices | Storefront + orders | All money in paise; GST extracted for PDF |
| CGST/SGST vs IGST | `isInterState()` + `invoice.ts` PDF | Seller state from `SELLER_STATE` env (default Karnataka) |
| GST invoice PDF | `utils/invoice.ts`, `invoice.service.ts` | Line HSN, tax breakdown on PDF |
| PO/Bill line tax | `purchases.service.ts` | Computes tax from `taxClass` on lines |
| Reverse charge flag | PO/Bill/Expense models | Field exists; no full RC workflow verified |

## NOT implemented / partial

| Feature | Status |
|---------|--------|
| Customer GSTIN on B2B invoices | **NOT VERIFIED** on invoice PDF buyer block |
| SAC (services) | **PARTIAL** — `Expense.hsnSac` only |
| Cess | **NOT IMPLEMENTED** |
| Place of Supply rules (full) | **PARTIAL** — inter-state from shipping state |
| Shipping GST line | **PARTIAL** — shipping in order totals; PDF treatment varies |
| Credit note tax reversal (local) | **NOT IMPLEMENTED** (Zoho handles on refund sync) |
| GSTR-1/3B reports | **NOT IMPLEMENTED** |
| Exempt/zero-rated admin | **PARTIAL** — `gst-zero-rate` tax class exists |

## Rate determination

1. Product `taxClass` slug → `gstRatePercent()` in `utils/gst.ts`
2. If buyer country ≠ IN or currency ≠ INR → rate 0 on invoice build
3. If intra-state → CGST+SGST split on PDF; inter-state → IGST

Example: `taxClass: "gst-5"` → 5%; `"standard"` or `"gst18"` → 18%.

---

# 9. Purchase module

**Migration:** `20260822143856_purchases_module_phase1`  
**Feature flag:** `PURCHASES_MODULE_ENABLED=1` (`purchases-flag.ts`)  
**Frontend flag:** `NEXT_PUBLIC_PURCHASES_ENABLED=1`

## Workflow implemented

```
Vendor → Purchase Order (DRAFT/SENT) → Goods Receipt → Inventory.onHand++
                              ↓
                         Vendor Bill (DRAFT/OPEN/PAID)
Expense (standalone)
```

## NOT implemented

- Vendor payment documents
- Vendor credits/returns
- Recurring expenses/bills
- Zoho bill sync (`zohoBillId` column exists, no API writer)
- Accounting postings for AP

## API routes (`/api/admin/purchases/`)

| Route | Purpose |
|-------|---------|
| `GET/POST/PATCH /vendors` | Vendor CRUD |
| `GET/POST/PATCH /purchase-orders` | PO CRUD |
| `POST /purchase-orders/:id/receive` | Receipt + stock increment |
| `GET/POST/PATCH /bills` | Vendor bills |
| `GET/POST/PATCH /expenses` | Expenses |
| `GET /catalog-search` | Variant lookup for PO/bill lines |

## UI routes

| Route | Status |
|-------|--------|
| `/admin/purchases/vendors` | Functional (gated) |
| `/admin/purchases/purchase-orders` | Functional |
| `/admin/purchases/purchase-orders/new` | Functional |
| `/admin/purchases/purchase-orders/[id]` | Functional (receive goods) |
| `/admin/purchases/bills` | Functional |
| `/admin/purchases/expenses` | Basic functional |

## PO numbering

`PO-00001` format — `purchases-number.ts`  
Bills: `BILL-00001`

---

# 10. Banking

| Feature | Status |
|---------|--------|
| Bank accounts in DB | **NOT IMPLEMENTED** |
| Cash accounts | **NOT IMPLEMENTED** |
| Bank transactions | **NOT IMPLEMENTED** |
| Payment matching | **NOT IMPLEMENTED** |
| Reconciliation UI | **PARTIAL** — `/admin/reconciliation` compares order vs payment row status |
| Razorpay reconcile | **PARTIAL** — `POST /api/admin/orders/:id/reconcile-razorpay` per order |
| Gateway settlement import | **NOT IMPLEMENTED** |
| Gateway fees in books | **PARTIAL** — `Payment.gatewayFeeInPaise` column exists, not wired to CoA |
| Settlement vs bank | **NOT IMPLEMENTED** |

E-commerce gateway payments **cannot** be fully reconciled against bank settlements in-app today.

---

# 11. Reports

## Implemented (`/admin/reports` — Excel export only)

Source: `backend/src/modules/admin/reports.handlers.ts`

| Report type | Data source | Ledger-based? |
|-------------|-------------|---------------|
| `sales` | `Order` (paid statuses) | **B** — direct orders |
| `products` | Order items + products | **B** |
| `customers` | Users/orders (super-admin) | **B** |
| `vendors` | **PickupLocation** revenue attribution | **B** |
| `razorpay` / `paypal` / `stripe` | `Payment` rows | **B** |
| `gateways` | Combined payments | **B** |

Periods: daily, weekly, monthly, Indian financial year (Kolkata timezone helpers).

## Dashboard analytics

- `GET /api/admin/dashboard` — KPIs from orders/inventory
- `GET /api/admin/analytics/woo-products` — Zoho historical + Woo dump analytics
- `AdminDashboardAnalytics.tsx` — charts on dashboard
- `GET /api/admin/reports/analytics` — **backend exists, no UI consumer found**

## NOT implemented

Profit & Loss, Balance Sheet, Trial Balance, General Ledger, Customer/Vendor ledger, AR/AP aging, GST returns, Cash Flow — **all MISSING**.

**All existing reports = type B (operational aggregates).**

---

# 12. Auditability and data safety

| Mechanism | Exists? | Notes |
|-----------|---------|-------|
| Financial immutability | **NO** | Orders/payments/bills can be updated by admin flows |
| Soft delete | **PARTIAL** | `Order.deletedAt`, `User.deletedAt`, `Product.deletedAt` |
| Void | **PARTIAL** | Zoho invoice void; `VendorBillStatus.VOID` exists but limited UI |
| Reversal journals | **NO** | |
| `OrderStatusHistory` | **YES** | Status transitions logged |
| `AdminActivityLog` | **YES** | HTTP mutations by admins (not row-level financial audit) |
| `created_by` / `updated_by` on financial docs | **NO** on Order/Payment/Bill |
| Timestamps | **YES** | `createdAt`/`updatedAt` widely |

## Risk areas

- Admin inventory patch can change `onHand` without movement audit trail.
- PO/bill edits allowed until received/cancelled states — no immutable posting.
- Zoho sync errors stored in `Order.zohoSyncError` but no automatic compensating transaction locally.

---

# 13. Idempotency / duplicate protection

| Operation | Protection | Gap |
|-----------|------------|-----|
| Checkout retry | Redis `checkout:idem:{key}` 30 min | Same key required from client |
| Order number | Unique `orderNumber` + retry | Good |
| Razorpay capture | App check on `providerPaymentId` | **No DB UNIQUE** — race possible |
| `afterOrderPaid` | `afterPaidRanAt` claim | Good |
| Zoho invoice | Skip if `order.zohoInvoiceId` | Good |
| Zoho payment | Skip if `rawPayload.zohoCustomerPaymentId` | Good |
| Zoho credit note | Skip if `zohoCreditNoteRefundId` | Good |
| Payment timeout job | BullMQ `jobId: payment-timeout-{orderId}` | Good |
| PO/Bill numbers | Unique `poNumber`, `billNumber` | Good |
| Marketplace events | `MarketplaceEventLog` dedupe key | Good |
| Inventory receive | Validates qty ≤ remaining | Good within transaction |

---

# 14. Security / permissions

## Roles

- `CUSTOMER` — storefront
- `ADMIN` — full admin API access
- `SUPER_ADMIN` — + admin activity log, some reports

## Accounting-specific permissions

**NOT IMPLEMENTED** — any admin can:

- Refund orders
- Patch inventory
- Create/edit POs and bills (when module enabled)
- Export financial reports
- Reconcile Razorpay (per order)

## Sensitive endpoints (all require `requireAdmin` only)

- `POST /api/admin/orders/:id/refund`
- `PATCH /api/admin/inventory/:variantId`
- `/api/admin/purchases/*`
- `POST /api/zoho/sync/*`

No separate segregation of duties.

---

# 15. UI implementation status

| Screen | Route | Component | Backend API | Status | Functional? |
|--------|-------|-----------|-------------|--------|-------------|
| Dashboard | `/admin` | `AdminDashboardAnalytics` | `/api/admin/dashboard` | Complete | Yes |
| Orders list | `/admin/orders` | inline | `GET /api/admin/orders` | Complete | Yes |
| Order detail | `/admin/orders/[id]` | inline | order + refund + invoice APIs | Complete | Yes |
| Inventory | `/admin/inventory` | `AdminInventoryWorkspace` | `/api/admin/inventory` | Complete | Yes |
| Zoho sync panel | (within inventory) | same | `/api/zoho/sync/*` | Partial | Yes when flag on |
| Products | `/admin/products` | inline + `ProductForm` | `/api/admin/products` | Complete | Yes |
| Products XL | `/admin/products/xl` | inline | xl-sheet API | Complete | Yes |
| Purchases hub | `/admin/purchases` | layout + nav | purchases module | Partial | Gated |
| Vendors | `/admin/purchases/vendors` | inline | `/purchases/vendors` | Partial | Yes |
| Purchase orders | `/admin/purchases/purchase-orders` | inline | `/purchases/purchase-orders` | Partial | Yes |
| Bills | `/admin/purchases/bills` | inline | `/purchases/bills` | Partial | Yes |
| Expenses | `/admin/purchases/expenses` | inline | `/purchases/expenses` | Partial | Basic |
| Reconciliation | `/admin/reconciliation` | inline | `/api/admin/payments/reconciliation` | Partial | List only |
| Reports export | `/admin/reports` | inline | `/api/admin/reports/export` | Partial | Export only |
| Marketplaces | `/admin/marketplaces` | `MarketplaceOpsWorkspace` | marketplaces API | Complete | Yes |
| Zoho historical panel | (marketplaces tab) | `ZohoBooksHistoricalPanel` | zoho-books analytics | Complete | Read-only analytics |
| Pickup locations | `/admin/settings/pickup-locations` | inline | pickup-locations API | Complete | Yes (fulfillment) |
| Catalog gaps | `/admin/catalog-gaps` | inline | catalog gaps API | Complete | Yes (HSN/pricing gaps) |

**No UI for:** Chart of Accounts, Journal Entries, Bank Reconciliation, GST filing, Vendor Payments, Credit Notes (local), Quotes/Estimates.

---

# 16. Testing status

**Search result:** No `*.test.ts`, `*.spec.ts`, or test runner config found in repository.

| Area | Automated tests |
|------|-----------------|
| Accounting | **NONE** |
| GST | **NONE** |
| Sales/invoices | **NONE** |
| Payments/webhooks | **NONE** |
| Refunds | **NONE** |
| Purchases | **NONE** |
| Inventory | **NONE** |
| Reports | **NONE** |

Manual/script tests exist: `backend/scripts/test-*.ts`, `npm run test:shipping`, etc. — not CI unit tests.

### Important untested scenarios

- Double webhook payment capture
- Partial refund + Zoho credit note idempotency
- GST inter-state vs intra-state PDF correctness
- PO receive → inventory concurrency
- Bill paid vs PO received mismatch
- FX orders → `reportingTotalInInrPaise` accuracy

---

# 17. Technical debt / risks

| Risk | Severity | Detail |
|------|----------|--------|
| No native double-entry ledger | **CRITICAL** | Cannot produce Trial Balance/P&L from Sarveda DB alone |
| No `providerPaymentId` UNIQUE | **HIGH** | Duplicate capture possible under race |
| Global inventory (no warehouse stock) | **HIGH** | Cannot support multi-location books accurately |
| No inventory movement audit | **HIGH** | Silent stock edits via admin |
| Accounting split (Sarveda + Zoho) | **HIGH** | Sync failures leave books out of date (`zohoSyncError`) |
| Purchases not synced to Zoho | **HIGH** | AP exists only in Sarveda until phase 2 |
| Reports from orders not journals | **HIGH** | Misalignment if Zoho adjusted manually |
| No automated financial tests | **HIGH** | Regressions undetected |
| Mutable financial documents | **MEDIUM** | PO/bill edit, inventory patch |
| `Expense.expenseAccount` free text | **MEDIUM** | No CoA validation |
| Vendor bill “mark paid” without payment record | **MEDIUM** | Incomplete AP subledger |
| Marketplace orders ≠ shop inventory | **MEDIUM** | Channel stock not unified |
| Zoho inventory sync confusion | **MEDIUM** | Recently disabled; legacy UI may confuse |
| Invoice lines not normalized | **LOW** | Harder to regenerate historical tax detail |
| Timezone reporting | **LOW** | IST helpers exist; verify edge cases |

**Money handling positive:** Integer paise throughout — no float currency in DB.

---

# 18. Implementation completion matrix

| Module | Backend | Database | UI | Accounting Integration | Tests | Overall |
|--------|---------|----------|-----|------------------------|-------|---------|
| Customers | COMPLETE | COMPLETE | COMPLETE | N/A (operational) | MISSING | **PARTIAL** |
| Items | COMPLETE | COMPLETE | COMPLETE | Zoho item sync optional | MISSING | **COMPLETE** (catalog) |
| HSN/SAC | PARTIAL | PARTIAL (HSN on Product) | PARTIAL (XL/admin) | Zoho invoice lines | MISSING | **PARTIAL** |
| GST | PARTIAL | PARTIAL (taxClass) | PARTIAL (PDF) | Zoho tax on invoice | MISSING | **PARTIAL** |
| Sales Orders | COMPLETE | COMPLETE | COMPLETE | Via Order=SO | MISSING | **COMPLETE** (as e-com orders) |
| Invoices | COMPLETE | PARTIAL (no InvoiceLine) | COMPLETE (PDF download) | Zoho invoice sync | MISSING | **PARTIAL** |
| Payments | COMPLETE | COMPLETE | COMPLETE | Zoho customer payment | MISSING | **PARTIAL** |
| Credit Notes | PARTIAL | MISSING | MISSING | Zoho API on refund only | MISSING | **PARTIAL** |
| Vendors | COMPLETE | COMPLETE | PARTIAL (gated) | `zohoContactId` unused | MISSING | **PARTIAL** |
| Purchases | PARTIAL | COMPLETE | PARTIAL (gated) | No Zoho bill sync | MISSING | **PARTIAL** |
| Inventory | COMPLETE | PARTIAL (no movements) | COMPLETE | Zoho mirror optional/off | MISSING | **PARTIAL** |
| Banking | MISSING | MISSING | PARTIAL (reconcile list) | None | MISSING | **MISSING** |
| Chart of Accounts | MISSING | MISSING | MISSING | Zoho external only | MISSING | **MISSING** |
| Journal Engine | MISSING | MISSING | MISSING | Zoho implicit | MISSING | **MISSING** |
| Reports | PARTIAL (exports) | N/A | PARTIAL | Order-based only | MISSING | **PARTIAL** |
| Audit Trail | PARTIAL | PARTIAL | PARTIAL (activity log) | Not financial-grade | MISSING | **PARTIAL** |

---

# 19. Assessment (no rebuild proposal)

## A. What is already architecturally solid

1. **E-commerce core** — checkout, multi-gateway payments, webhooks, stock reserve/confirm/release pattern (`orders.service.ts`).
2. **Integer money** — all amounts in paise/minor units; GST extraction utilities are consistent (`utils/gst.ts`).
3. **Idempotent payment pipeline** — `afterPaidRanAt`, Zoho invoice/payment skip flags, BullMQ timeout jobs.
4. **GST invoice PDF pipeline** — S3-backed, CGST/SGST/IGST rendering (`utils/invoice.ts`).
5. **Admin modular routing** — clear pattern for new domains (`purchases/` mirrors `pickupLocations/`).
6. **Zoho as external GL for sales** — pragmatic split if Sarveda remains operational master.
7. **Purchases Phase 1 schema** — Vendor, PO, Receipt, Bill, Expense models are a reasonable AP foundation.
8. **Marketplace ops + Zoho historical import** — useful channel analytics without blocking shop.

## B. What is dangerous or incorrectly designed (for full Books parity)

1. **No local ledger** — reports will never match Zoho without tight sync discipline.
2. **Inventory without movement journal** — cannot audit stock changes for tax/audit.
3. **Single global stock** — incompatible with multi-warehouse accounting.
4. **Payment idempotency not DB-enforced** — application checks only.
5. **AP module disconnected from Zoho** — duplicate vendor/bill truth if both systems used manually.
6. **“Vendor” naming collision** — reports “vendors” = warehouses; new `Vendor` = suppliers (confusing).
7. **No financial test suite** — high regression risk as accounting expands.

## C. What is missing (major)

- Chart of Accounts, Accounts, Journal Entries, Journal Lines
- Quotes/Estimates, formal Sales Orders separate from checkout orders
- Local Credit Notes and debit notes
- Vendor payments, payment allocations, bank accounts, bank transactions
- Bank reconciliation against gateway settlements
- GST returns (GSTR-1, 3B), TDS/TCS full workflows
- Inventory valuation (FIFO/weighted average), stock movement table
- Warehouse-level stock
- P&L, Balance Sheet, Trial Balance, GL, AR/AP aging
- Purchases → Zoho Bills sync
- Role-based accounting permissions
- Automated tests for all financial flows

## D. Recommended next 5 technical milestones

1. **Architecture decision record** — Confirm Sarveda as operational master vs Zoho as sole GL; document which documents sync which direction (sales only vs AP too); freeze inventory sync off.

2. **Financial integrity hardening** — Add `UNIQUE` index on `Payment.providerPaymentId` (where not null); document and test idempotency matrix; immutable “posted” flags on PO receive and order paid.

3. **Inventory movement ledger** — Introduce `StockMovement` table (type, qty, refType, refId, variantId, createdAt) written from checkout, refund, admin adjust, PO receive — without yet building full GL.

4. **Purchases Phase 2 + Zoho AP** — Vendor payment records, Zoho bill push on `VendorBill` OPEN, link PO receipt to bill; keep Sarveda stock authoritative.

5. **Reporting foundation** — Either (a) export/sync Zoho ledger for P&L/BS in Sarveda read-only UI, or (b) implement minimal local `JournalEntry` model for events not in Zoho — with explicit decision before building reports in-app.

---

## Appendix: Key migrations (accounting-adjacent)

| Migration | Purpose |
|-----------|---------|
| `20260509171114_init` | Core commerce schema |
| `20260602143000_add_zoho_fields` | Order Zoho invoice fields |
| `20260604140000_variant_zoho_item_id` | Variant ↔ Zoho item |
| `20260606160000_add_product_hsn_code` | HSN on products |
| `20260530140000_order_reporting_inr` | FX normalization column |
| `20260728130000_marketplace_inventory_hub` | Marketplace ops tables |
| `20260812100000_zoho_historical_invoices` | Historical Zoho import |
| `20260822143856_purchases_module_phase1` | Vendor, PO, Bill, Expense |

---

## Appendix: Environment flags (accounting behavior)

| Variable | Effect |
|----------|--------|
| `ZOHO_INVENTORY_SYNC=0` | Disables stock pull/push/audit (default off) |
| `PURCHASES_MODULE_ENABLED=0` | Returns 403 on `/api/admin/purchases/*` |
| `NEXT_PUBLIC_PURCHASES_ENABLED` | Hides Purchases sidebar link |
| `SELLER_STATE` | GST intra/inter-state (default Karnataka) |
| `DEFAULT_HSN_CODE` | Fallback HSN on invoice lines |

---

*End of audit. No application code was modified during this review.*
