# Sarveda CRM Database Audit — 2026-09-10

## Executive decision

CRM can be added safely as an isolated domain without changing launch-critical columns in the current Sarveda commerce/accounting schema.

The first CRM schema revision is intentionally **additive only**:

- no existing table is dropped
- no existing column is renamed
- no existing column type is changed
- no existing column becomes required
- no existing enum is changed
- no existing accounting, payment, checkout, inventory, quotation, order, support, or marketplace workflow is modified

The new CRM migration is staged only on `feature/crm-schema` and must not be applied to production before the launch freeze is lifted.

## Existing tables reviewed for CRM reuse

### User
Useful as the authenticated identity for CRM owners, assignees, admins, and optional links to contacts who also have storefront accounts.

Do **not** use `User` as the CRM contact master. CRM must support people who have never registered on the website.

Decision: keep `User` unchanged. New CRM tables reference it with nullable foreign keys.

### Order / OrderItem / Payment / Invoice
These already contain the authoritative post-sale commercial history.

Decision: CRM must read/link to these tables; it must not duplicate order/payment/invoice accounting data.

### Quotation / QuotationItem
This is already the correct pre-sale commercial document and already converts to `Order` without becoming accounting until the sale proceeds.

Decision: reuse as the quote layer beneath CRM deals. `CrmDeal.quotationId` is optional.

### EnquiryThread / EnquiryMessage / WhatsAppAgentSession
These are strong lead-source and communication-history inputs.

Decision: keep them unchanged. A CRM lead can optionally link to one enquiry thread; CRM activities may also link back to enquiry threads.

### Complaint / TaskAssignee / TaskNotification / ComplaintEvent
These are support/task concepts, but their semantics are tied to complaint/support workflows.

Decision: do not overload them for sales follow-up. Introduce dedicated `CrmTask` and `CrmActivity` models.

### Product / ProductVariant
These are already the sellable catalog authority.

Decision: CRM deal line items may optionally reference `ProductVariant` while preserving product/price snapshots.

### MarketplaceOrder / LegacyOrderArchive / LegacyMarketplaceOrderArchive / ZohoHistoricalInvoice
These hold customer history from channels outside the primary live D2C order table.

Decision: do not copy this data into CRM tables. Customer-360 services can aggregate these sources later by linked identity/email/phone and explicit mappings.

### OrderAttribution
Useful for post-order marketing attribution.

Decision: keep unchanged. CRM lead attribution is stored independently at lead capture time because a lead may never become an order.

### Vendor / Purchases / Expenses
Supplier-side records are not CRM customer masters.

Decision: no changes.

### Native accounting tables
`AccountingAccount`, `AccountingJournalEntry`, `AccountingJournalLine`, `AccountingPostingEvent`, `AccountingDocumentLink`, banking, settlement, inventory costing, vendor payments, periods, and reconciliation remain isolated.

Decision: CRM never posts directly to the GL. Deal-stage changes, notes, calls, and lead conversion are non-accounting events. Accounting begins only through existing commercial posting flows.

## New CRM foundation

The migration introduces:

- `CrmAccount` — organization/individual customer account master
- `CrmContact` — people independent of website registration
- `CrmLead` — unqualified/qualified lead capture and conversion
- `CrmPipeline` — configurable sales pipelines
- `CrmPipelineStage` — ordered stages and probability defaults
- `CrmDeal` — sales opportunities
- `CrmDealProduct` — expected products/quantities/value before order conversion
- `CrmActivity` — customer/deal timeline entries
- `CrmTask` — sales follow-ups and reminders
- `CrmSequence` — human-readable CRM numbering support

New enums:

- `CrmLeadStatus`
- `CrmLeadSource`
- `CrmDealStatus`
- `CrmStageType`
- `CrmActivityType`
- `CrmTaskStatus`
- `CrmTaskPriority`
- `CrmAccountKind`

## Safe optional bridges to existing Sarveda data

The new CRM tables contain nullable foreign keys to existing records where useful:

- CRM owner / assignee → `User`
- CRM contact → optional storefront `User`
- CRM lead → optional `EnquiryThread`
- CRM deal → optional `Quotation`
- CRM deal → optional `Order`
- CRM deal product → optional `ProductVariant`
- CRM activity → optional `EnquiryThread`, `Quotation`, `Order`

All deletion behavior is conservative: links to existing operational data use `SET NULL` so deletion/archival of a linked object does not cascade-delete CRM history.

## Why no existing columns were added in Phase 1

Adding reverse relation columns to existing database tables is not necessary at SQL level. The new CRM tables can own the foreign keys.

This is preferable during the launch freeze because it avoids DDL touching large/critical operational tables and avoids accidental coupling.

When Prisma models are integrated into the main `schema.prisma`, relation list fields may be added to existing Prisma models for ORM navigation. Those list fields are Prisma metadata only and do not create physical columns on the existing tables. That integration should be done and validated on the CRM branch after launch-critical work is stable.

## Deliberately deferred

Not included in the first migration:

- custom-field definition engine (JSON placeholders are available now)
- campaigns and marketing automation
- lead scoring rules
- territory management
- complex team hierarchy
- email mailbox sync
- WhatsApp automation rules
- SLA engines
- forecasting snapshots
- duplicate/contact merge engine
- customer-360 materialized tables
- direct accounting posting from CRM

These can be added later without redesigning the foundation.

## Production safety rule

The migration file existing in Git does **not** alter any database. It changes a database only if someone runs it through Prisma/SQL against that database.

Until launch is complete:

1. Keep `main` as the launch branch.
2. Keep CRM development on `feature/crm-schema`.
3. Point CRM development only at a development/staging database.
4. Do not run `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, or the CRM SQL migration against production.
5. After launch, validate the migration against a recent production clone before any production deployment.
