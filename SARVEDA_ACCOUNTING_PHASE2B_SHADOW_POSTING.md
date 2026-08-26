# SARVEDA NATIVE ACCOUNTING — PHASE 2B SHADOW POSTING

**Date:** 2026-08-22  
**Calculation version:** `ORDER_PAID_V1`  
**Status:** Implementation complete — awaiting architectural review

---

## 1. Executive Summary

Phase 2B implements **discovery-driven, idempotent ORDER_PAID shadow posting** for Razorpay, Stripe, PayPal, and COD using the approved Phase 2A journal algorithm. Native accounting reads **committed commerce state after the fact** — no hooks in payment, checkout, refund, stock, invoice, or Zoho code paths.

Key deliverables:

- Pure `buildOrderPaidJournal(orderSnapshot)` — no DB writes
- Zoho-aligned discount allocation with explicit parity variance reporting
- Discovery worker (default `dryRun=true`, max 500/batch)
- Admin preview/post/reconciliation API + UI
- Production guard for bulk backfill
- 40 new tests; **90/90** backend tests passing

Zoho Books remains authoritative. `ACCOUNTING_SALES_POSTING_ENABLED` must stay **off** on production until explicit cutover approval.

---

## 2. Files Changed

### Backend — new

| File | Purpose |
|------|---------|
| `order-paid.constants.ts` | Version tag, account codes, provider mapping, unique keys |
| `discount-allocation.ts` | Paise allocation + Zoho parity mirrors |
| `order-paid-journal.types.ts` | Snapshot and proposal types |
| `order-paid-journal.builder.ts` | Pure ORDER_PAID_V1 journal builder |
| `order-eligibility.ts` | Paid-pipeline + payment eligibility |
| `production-guard.ts` | Bulk discovery + sales posting guards |
| `order-snapshot.service.ts` | Read-only order snapshot loader |
| `order-paid-posting.service.ts` | Preview + persist via posting events |
| `reconciliation.service.ts` | Native vs PDF vs Zoho variance rows |

### Backend — modified

| File | Change |
|------|--------|
| `discovery-worker.ts` | Full ORDER_PAID discovery (was stub) |
| `accounting.handlers.ts` | Preview/post/discover/reconcile endpoints |
| `accounting.routes.ts` | ORDER_PAID admin routes |
| `accounting-errors.ts` | ORDER_PAID + guard error classes |

### Backend — tests

| File | Purpose |
|------|---------|
| `test/accounting/order-paid.test.ts` | Builder matrix A–T + integration O–Y |
| `test/accounting/order-paid-discovery.test.ts` | Discovery worker + production guard |
| `test/accounting/discount-allocation.test.ts` | Zoho parity tests |
| `test/accounting/production-guard.test.ts` | Guard unit tests |
| `test/helpers/accounting-orders.ts` | Synthetic paid order factory |

### Frontend — new/modified

| File | Change |
|------|--------|
| `app/admin/accounting/order-paid/page.tsx` | Single-order preview/post UI |
| `lib/accounting-api.ts` | ORDER_PAID API client |
| `components/admin/accounting/AdminAccountingNav.tsx` | Nav link |
| `app/admin/accounting/page.tsx` | Discovery status copy |

---

## 3. Order Snapshot Design

`OrderPaidSnapshot` is built read-only from:

- `Order` header (totals, currency, status, placedAt, zoho refs)
- `OrderItem[]` + `Product.taxClass` via variant join
- Shipping address (country/state for GST jurisdiction)
- Primary `Payment` (COD if present; else latest CAPTURED; else latest)

No writes to commerce tables. Missing `placedAt`, lines, address, or payment → ineligible.

---

## 4. Journal Builder

`buildOrderPaidJournal(snapshot)` returns:

- Proposed debit/credit lines with account codes and amount sources
- `ORDER_PAID_V1` memo and `order:{orderId}:paid` unique key
- Diagnostics: pre/post discount taxable, GST split, line allocations
- PDF-basis comparison (gross-line GST extraction)
- Zoho merchandise net variance

Fail-closed if `|imbalance| > 2` paise — no Round Off account manufactured.

---

## 5. GST/Discount Algorithm

For **India + INR**:

1. Allocate `discountInPaise` across lines by `lineTotalInPaise` weight (remainder on last line)
2. Pre-discount taxable = GST extract from gross inclusive lines
3. Post-discount taxable = GST extract from `(gross - lineDiscount)` inclusive lines
4. Post journal:
   - **Dr** gateway clearing / AR = `grandTotalInPaise`
   - **Dr** 4200 Discounts = `preTaxable - postTaxable` (contra revenue)
   - **Cr** 4000 Product Sales = `preTaxable` (gross presentation)
   - **Cr** 2100/2101 CGST/SGST or 2102 IGST from post-discount tax
   - **Cr** 4100 Shipping = `shippingInPaise`

For **non-GST / international**:

- Dr clearing, Dr 4200 = full `discountInPaise`, Cr 4000 = subtotal, Cr 4100 shipping

---

## 6. Zoho Allocation Parity Results

Mirrored `lineRatesAfterOrderDiscount()` from `zoho-invoices.ts` in `discount-allocation.ts`.

| Scenario | Parity |
|----------|--------|
| Single line, qty=1, no discount | **Exact** |
| qty>1 with discount | Usually ≤2 paise (unit-rate round2) |
| Multi-line, multi-rate, odd paise | **Documented variance** — native paise allocation vs Zoho `round2(unitRate)×qty` |

Reconciliation exposes `zohoParity.merchandiseVariancePaise`. Variance is **never** hidden via Round Off.

---

## 7. Provider Mapping

| Provider | Debit Account |
|----------|---------------|
| RAZORPAY | 1020 Razorpay Clearing |
| STRIPE | 1021 Stripe Clearing |
| PAYPAL | 1022 PayPal Clearing |
| COD | 1100 Accounts Receivable |

---

## 8. COD Treatment

COD `ORDER_PAID` = **sale recognised**, not cash received.

- Order status in paid pipeline (`PAID`, `PROCESSING`, …)
- Payment may remain `PENDING`
- Debits **1100 AR** — not Cash, not 1023 COD Clearing

---

## 9. Discovery Worker

`runOrderPaidDiscovery()`:

- Default `dryRun=true` (via `resolveDiscoveryDryRun`)
- Max **500** orders per execution
- Filters: `orderId`, `orderNumber`, `since`, `until`, `limit`
- Deterministic order: `placedAt ASC`, `id ASC`
- Skips deleted, unpaid pipeline, ineligible orders
- Never writes to Order/Payment/Inventory

Invoke: `POST /api/admin/accounting/order-paid/discover`

---

## 10. Idempotency

- `eventType = ORDER_PAID`
- `uniqueKey = order:{orderId}:paid`
- Uses Phase 1.5 `postJournalFromEvent` (`ON CONFLICT DO NOTHING` + row lock)
- 20 concurrent posts → exactly 1 event + 1 journal (tested)

---

## 11. Feature Flags

| Flag | Behavior |
|------|----------|
| `NATIVE_ACCOUNTING_ENABLED=0` | All accounting routes 503 (except `/status`) |
| `NATIVE_ACCOUNTING_ENABLED=1`, `ACCOUNTING_SALES_POSTING_ENABLED=0` | Preview + dry-run discovery only |
| `NATIVE_ACCOUNTING_ENABLED=1`, `ACCOUNTING_SALES_POSTING_ENABLED=1` | Manual/single-order + explicit discovery may persist |

**Production:** keep `ACCOUNTING_SALES_POSTING_ENABLED=0`.

---

## 12. Production Guard

`assertBulkDiscoveryAllowed()`:

- **Single order** (`orderId` / `orderNumber`) — always allowed (controlled verification)
- **Bulk** on production-like env (`NODE_ENV=production` or RDS/production DB markers) — blocked unless `ACCOUNTING_BULK_DISCOVERY_ALLOWED=1`

Documented and tested in `production-guard.test.ts` and `order-paid-discovery.test.ts`.

---

## 13. Admin Preview/Post Flow

Routes (admin-authenticated):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/accounting/order-paid/preview` | Full calculation preview |
| POST | `/api/admin/accounting/order-paid/post` | Persist one order (requires sales flag) |
| POST | `/api/admin/accounting/order-paid/discover` | Bounded batch discovery |
| GET | `/api/admin/accounting/order-paid/reconciliation` | Variance report |

UI: `/admin/accounting/order-paid`

---

## 14. Reconciliation View

Per order row includes:

- Commerce: provider, grand total, discount, shipping
- Native: taxable, CGST/SGST/IGST, net revenue, journal totals/status
- PDF basis: pre-discount taxable + variance vs native
- Zoho: local `zohoInvoiceId` / `zohoInvoiceNo` or `NOT_AVAILABLE_LOCALLY`

No aggressive Zoho API calls for listing.

---

## 15. Tests

### New tests (40)

- `discount-allocation.test.ts` — 5
- `production-guard.test.ts` — 6
- `order-paid.test.ts` — 24 (builder A–T + integration O–Y)
- `order-paid-discovery.test.ts` — 5

### Matrix coverage

| Case | Covered |
|------|---------|
| A–N Builder scenarios | ✅ |
| O/P Duplicate + 20× concurrent | ✅ |
| Q Missing address | ✅ |
| R Missing taxClass | ✅ |
| S Malformed totals (T imbalance) | ✅ |
| T Imbalance >2 paise | ✅ |
| U/V Feature flags | ✅ |
| W Already posted | ✅ |
| X Cancelled unpaid | ✅ |
| Y Failed payment | ✅ |

---

## 16. Concurrency Results

`order-paid.test.ts` — **20 parallel `postOrderPaidJournal`** on same order:

- 1 non-duplicate post
- 19 duplicates
- 1 `AccountingPostingEvent`, 1 `AccountingJournalEntry`

---

## 17. Commerce Regression

All existing commerce tests pass unchanged:

- checkout, payment-flow, stock, refund — **no modifications**

---

## 18. Known Limitations

- No refunds, settlements, gateway fees, COGS (Phase 2C+)
- Zoho invoice totals not fetched locally for reconciliation list
- PDF vs native taxable variance expected when discounts apply (by design)
- Discovery not auto-scheduled (on-demand admin/BullMQ future)
- `Order.taxInPaise` at checkout remains 0 — native recomputes GST

---

## 19. Staging Verification Procedure

1. ✅ Unit + integration tests (90/90)
2. Set staging: `NATIVE_ACCOUNTING_ENABLED=1`, `ACCOUNTING_SALES_POSTING_ENABLED=0`
3. Single test order **preview** via admin UI
4. Single real staging order **dry-run** discover
5. Enable `ACCOUNTING_SALES_POSTING_ENABLED=1` on staging only
6. Single real staging order **shadow post**
7. Replay same order → confirm duplicate/idempotent
8. Small bounded batch (limit ≤10) with dry-run first
9. Reconciliation report review

**Do not** run steps 4+ against production.

---

## 20. Production Files Modified

**COMMERCE PRODUCTION FILES MODIFIED:** NONE

**PAYMENT FLOW FILES MODIFIED:** NONE

**ZOHO FILES MODIFIED:** NONE

**SCHEMA/MIGRATIONS CREATED:** NONE

**UNEXPECTED FILES MODIFIED:**

- `frontend/public/sw.js` — not modified in this phase (prior PWA build artifact unchanged)

---

## 21. Final Verdict

Implementation is complete with:

- Prisma validate ✅
- Backend tests **90/90** ✅
- Backend TypeScript build ✅
- Frontend build ✅
- Zero commerce/payment/Zoho touch ✅
- Production bulk guard ✅
- Idempotent concurrent posting ✅

**SAFE FOR STAGING SHADOW VALIDATION**

---

*Await architectural review before enabling `ACCOUNTING_SALES_POSTING_ENABLED` on staging or any production backfill.*
