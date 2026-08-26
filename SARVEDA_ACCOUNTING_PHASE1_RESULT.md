# Sarveda Native Accounting — Phase 0 + Phase 1 Result

**Date:** 2026-08-22  
**Milestone:** Commerce safety baseline + isolated accounting foundation  
**Status:** Complete — awaiting architectural review before Phase 2/3

---

## Summary

Phase 0 (commerce regression tests) and Phase 1 (isolated accounting schema, journal engine, CoA, admin UI shell) are implemented per `SARVEDA_ACCOUNTING_SAFE_ARCHITECTURE_PLAN.md`.

**No forbidden commerce production files were modified.**

---

## COMMERCE PRODUCTION FILES MODIFIED

```
NONE
```

Verified unchanged:

- `backend/src/modules/checkout/checkout.service.ts`
- `backend/src/modules/orders/afterPaid.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/payments/razorpay.verify.ts`
- `backend/src/modules/payments/razorpay.webhook.ts`
- `backend/src/modules/payments/stripe.*` / `paypal.*`
- `backend/src/modules/payments/refund.service.ts`
- `backend/src/modules/invoices/invoice.service.ts`
- `backend/src/utils/gst.ts`
- `backend/src/utils/invoice.ts`
- `backend/src/modules/zoho/*`
- Storefront checkout/cart/product pages

**Non-commerce changes (allowed):**

- `backend/src/modules/admin/admin.routes.ts` — mounts `/api/admin/accounting/*` (admin-only, feature-flagged)
- New isolated module `backend/src/modules/accounting/*`
- New admin UI `frontend/app/admin/accounting/*`
- Test infrastructure under `backend/test/*`

---

## Part A — Commerce Safety Baseline

### Test infrastructure

| File | Purpose |
|------|---------|
| `backend/vitest.config.ts` | Vitest config (single-thread DB tests) |
| `backend/test/setup.ts` | Test env defaults (`NATIVE_ACCOUNTING_ENABLED=0`, mock-friendly shipping flags) |
| `backend/test/helpers/commerce.ts` | Product/cart/order factories + cleanup |
| `backend/test/commerce/setup-mocks.ts` | Hoisted mocks for Zoho, Razorpay, S3, email, Firebase |

### Commerce regression tests (16 cases across 4 files)

| Test file | Coverage |
|-----------|----------|
| `backend/test/commerce/stock.test.ts` | Reserve, confirm, release, restock, out-of-stock rejection |
| `backend/test/commerce/checkout.test.ts` | `PENDING_PAYMENT` + reserve; timeout cancel; COD flow; COD timeout skip |
| `backend/test/commerce/payment-flow.test.ts` | PAID transition; single stock decrement; duplicate webhook idempotency; invoice PDF; Zoho invoice/payment; flag-off accounting isolation |
| `backend/test/commerce/refund.test.ts` | Full refund restock; Zoho credit-note call |

External services mocked: Razorpay, Zoho, S3/PDF upload, email, Firebase push, Shiprocket (via env skip).

### npm scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:commerce": "vitest run test/commerce",
"test:accounting": "vitest run test/accounting"
```

---

## Part B — Isolated Accounting Schema

### Migration

`backend/prisma/migrations/20260822190000_native_accounting_phase1/migration.sql`

- **Accounting-only** — no commerce table alterations
- PostgreSQL `CHECK` on journal lines: XOR debit/credit, non-negative amounts
- Unique `(eventType, uniqueKey)` on `AccountingPostingEvent`

### Prisma models added

| Model | Purpose |
|-------|---------|
| `AccountingAccount` | Chart of Accounts |
| `AccountingJournalEntry` | Journal header |
| `AccountingJournalLine` | Debit/credit lines (integer paise) |
| `AccountingPostingEvent` | Idempotency + async queue record |
| `AccountingDocumentLink` | Polymorphic commerce document pointer |
| `AccountingPeriod` | Fiscal period control |
| `AccountingSequence` | Journal numbering |
| `AccountingAuditLog` | Accounting mutation trail |

Enums: `AccountingAccountType`, `AccountingJournalStatus`, `AccountingPostingEventStatus`, `AccountingPeriodStatus`

---

## Part C — Accounting Invariants

| Rule | Implementation |
|------|----------------|
| Balanced POSTED entry | `journal.service.ts` — `validateJournalBalance()` + atomic `$transaction` |
| Line debit XOR credit | App validation + DB `CHECK` constraint |
| POSTED immutability | `updateJournalEntry`, `deleteJournalLine` reject POSTED |
| Idempotency | `posting-event.service.ts` — unique `(eventType, uniqueKey)` |

---

## Part D — Chart of Accounts Seed

Script: `backend/scripts/seed-accounting-coa.ts`  
npm: `npm run seed:accounting-coa`

**23 system accounts** (codes 1000–5300):

- Assets: Cash, Bank, Razorpay/Stripe/PayPal Clearing, AR, Inventory
- Liabilities: AP, Output/Input CGST/SGST/IGST
- Equity: Owner Capital, Retained Earnings
- Revenue: Product Sales, Shipping Income, Discounts
- Expenses: COGS, Gateway Charges, Shipping, Operating

Local seed result: `{ created: 0, skipped: 23 }` (already seeded during tests).

---

## Part E — Synthetic Journal Tests

File: `backend/test/accounting/journal.test.ts` (11 tests)

- Balanced sale (AR Dr ₹1,180 / Sales + GST Cr)
- Payment clearing journal
- Unbalanced rejection
- Debit+credit same line rejection
- Zero-value rejection
- Duplicate posting rejection
- POSTED header/line modification rejection
- Discovery worker stub skipped when flag off

---

## Part F — Feature Flags

`backend/src/modules/accounting/accounting-flag.ts`

| Flag | Default |
|------|---------|
| `NATIVE_ACCOUNTING_ENABLED` | `0` |
| `ACCOUNTING_SALES_POSTING_ENABLED` | `0` |
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | `0` |
| `ACCOUNTING_REPORTS_ENABLED` | `0` |

Documented in `backend/.env.example` and `frontend/.env.example` (`NEXT_PUBLIC_ACCOUNTING_ENABLED`).

**Not referenced from any commerce code.**

---

## Part G — Read-only Accounting UI

| Route | Page |
|-------|------|
| `/admin/accounting` | Dashboard (shadow banner) |
| `/admin/accounting/accounts` | Chart of Accounts table |
| `/admin/accounting/journals` | Journal list |

Gated by `NEXT_PUBLIC_ACCOUNTING_ENABLED=1` (frontend) + `NATIVE_ACCOUNTING_ENABLED=1` (backend APIs).

Sidebar link in `AdminSidebar.tsx` when frontend flag on.

---

## Part H — Discovery Worker (Design Only)

File: `backend/src/modules/accounting/discovery-worker.ts`

- Read-only scan stub for paid orders missing `ORDER_PAID` posting events
- **Not registered** in `server.ts`
- `startAccountingDiscoveryWorker()` logs "not started" only

---

## Part I — Verification Results

| Check | Result |
|-------|--------|
| `npx prisma validate` | ✅ Pass |
| `npx prisma migrate deploy` (local dev DB only) | ✅ Applied `20260822190000_native_accounting_phase1` |
| `npm run build` (backend) | ✅ Pass |
| `npm run test` | ✅ **27/27 passed** |
| `npm run seed:accounting-coa` | ✅ 23 accounts (skipped if exist) |
| `npm run build` (frontend) | ✅ Pass |
| `npm run lint` (frontend) | ✅ Pass (pre-existing warnings in unrelated components) |

### Test breakdown

```
test/commerce/stock.test.ts         5 passed
test/commerce/checkout.test.ts      4 passed
test/commerce/payment-flow.test.ts  6 passed
test/commerce/refund.test.ts        1 passed
test/accounting/journal.test.ts    11 passed
```

### Warnings

- Vitest: CJS Node API deprecation notice (vitest/vite — non-blocking)
- Frontend lint: pre-existing `<img>` and a11y warnings in unrelated storefront components
- Prisma query logging visible during tests (dev `DATABASE_URL` config)

---

## Files Created (Phase 0 + 1 — accounting scope)

### Backend — accounting module

```
backend/src/modules/accounting/accounting-errors.ts
backend/src/modules/accounting/accounting-flag.ts
backend/src/modules/accounting/accounting-sequence.ts
backend/src/modules/accounting/accounting.handlers.ts
backend/src/modules/accounting/accounting.routes.ts
backend/src/modules/accounting/discovery-worker.ts
backend/src/modules/accounting/index.ts
backend/src/modules/accounting/journal.service.ts
backend/src/modules/accounting/posting-event.service.ts
backend/src/modules/accounting/seed-coa.ts
backend/scripts/seed-accounting-coa.ts
backend/prisma/migrations/20260822190000_native_accounting_phase1/migration.sql
```

### Backend — tests

```
backend/vitest.config.ts
backend/test/setup.ts
backend/test/helpers/commerce.ts
backend/test/helpers/mocks.ts
backend/test/commerce/setup-mocks.ts
backend/test/commerce/stock.test.ts
backend/test/commerce/checkout.test.ts
backend/test/commerce/payment-flow.test.ts
backend/test/commerce/refund.test.ts
backend/test/accounting/journal.test.ts
```

### Frontend — accounting admin UI

```
frontend/lib/accounting-api.ts
frontend/components/admin/accounting/AdminAccountingNav.tsx
frontend/app/admin/accounting/layout.tsx
frontend/app/admin/accounting/page.tsx
frontend/app/admin/accounting/accounts/page.tsx
frontend/app/admin/accounting/journals/page.tsx
```

---

## Files Modified (Phase 0 + 1 — accounting scope)

```
backend/.env.example                       (+ accounting flags)
backend/package.json                       (+ vitest, test scripts, seed script)
backend/package-lock.json                  (+ vitest deps)
backend/prisma/schema.prisma               (+ accounting models; note: also contains prior purchases models)
backend/src/modules/admin/admin.routes.ts  (+ /accounting route mount)
frontend/.env.example                      (+ NEXT_PUBLIC_ACCOUNTING_ENABLED)
frontend/components/admin/AdminSidebar.tsx (+ Accounting nav link)
```

---

## git diff --stat (tracked files only)

```
 backend/.env.example                       |    8 +
 backend/package-lock.json                  | 2060 +++++++++++++++++++++++-----
 backend/package.json                       |   10 +-
 backend/prisma/schema.prisma               |  385 ++++++
 backend/src/modules/admin/admin.routes.ts  |    4 +
 frontend/.env.example                      |    6 +
 frontend/components/admin/AdminSidebar.tsx |   14 +
 frontend/public/sw.js                      |    2 +-
 8 files changed, 2170 insertions(+), 319 deletions(-)
```

*(Untracked new files listed above are not included in diff stat.)*

---

## Categorized Diff Summary

| Category | Change |
|----------|--------|
| **Commerce core** | **No changes** |
| **Test safety net** | New Vitest suite — 16 commerce + 11 accounting tests |
| **Accounting domain** | New module, migration, journal engine, CoA seed |
| **Admin API** | `/api/admin/accounting/*` (flag-gated) |
| **Admin UI** | `/admin/accounting/*` (isolated workspace) |
| **Config** | Feature flags documented; defaults OFF |
| **Dependencies** | `vitest` added to backend devDependencies |

---

## Explicitly NOT Done (per milestone scope)

- ❌ `afterPaid.ts` event hook
- ❌ ORDER_PAID commerce integration
- ❌ Discovery worker activation
- ❌ Refund/reconciliation/banking/GST reports
- ❌ Zoho replacement or cutover
- ❌ Production DB migration

---

## Next Steps (after review)

1. Architect review of journal invariants + CoA structure
2. Enable flags on staging: `NATIVE_ACCOUNTING_ENABLED=1`, `NEXT_PUBLIC_ACCOUNTING_ENABLED=1`
3. Run `npm run seed:accounting-coa` on staging after migration
4. Phase 2: manual/synthetic journals in admin UI (optional)
5. Phase 3 (later): activate discovery worker OR thin `afterPaid` emit — **only after review**

**STOP — awaiting architectural review.**
