# SARVEDA NATIVE ACCOUNTING — PHASE 2D SETTLEMENT IMPLEMENTATION

**Date:** 2026-08-23  
**Phase:** Razorpay INR settlement import + clearing reconciliation V3  
**Zoho Books:** remains authoritative  
**Depends on:** Phase 2B `ORDER_PAID_V1`, Phase 2C `ORDER_REFUNDED_FULL_V1`  

---

## 1. Executive Summary

Phase 2D V1 implements **read-only Razorpay settlement import**, **accounting-owned settlement tables**, **PAYMENT_GATEWAY_SETTLED** shadow journals, **gateway fee recognition without automatic GST ITC**, and **Reconciliation V3**.

| Capability | Status |
|------------|--------|
| `AccountingGatewaySettlement` + `AccountingGatewaySettlementLine` | Done |
| Additive Prisma migration (Lightsail applied) | Done |
| GET-only Razorpay settlement adapter | Done |
| Idempotent import + `SETTLEMENT_MISMATCH` on hash change | Done |
| Map `pay_` / `rfnd_` → Payment / Refund (else UNMAPPED) | Done |
| Journal: Bank + 5100 + Razorpay Clearing (no revenue/GST re-post) | Done |
| Fee/tax: store both; expense conservatively; ITC = unverified | Done |
| Detect fee-inclusive vs tax-exclusive Razorpay arithmetic | Done |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` + production dual guard | Done |
| Admin preview / import / post / discover + UI | Done |
| Reconciliation V3 (order + settlement batch) | Done |
| Local test matrix + commerce regression | Done |
| Pre-launch Lightsail shadow post (1 settlement + 1 preview) | Done |

**Deferred (as specified):** Stripe, PayPal, multi-currency/FX, bank statement match, COD collection, partial-refund GST, automatic ITC claim, purchases / Phase 3.

---

## 2. Settlement Models

### `AccountingGatewaySettlement`

| Field | Notes |
|-------|--------|
| `provider` | `PaymentProvider` (V1 posts Razorpay only) |
| `providerSettlementId` | Unique with provider (`setl_…`) |
| `currency`, `settledAt`, `utr` | Razorpay-authoritative dating |
| `grossInPaise`, `feeInPaise`, `taxInPaise`, `netInPaise` | Integer paise |
| `status` | IMPORTED / PREVIEWED / POSTED / MISMATCH / SKIPPED / FAILED |
| `gstItcStatus` | Default `UNVERIFIED_PENDING_TAX_INVOICE` |
| `sourcePayloadHash` | SHA-256 of source evidence |
| `rawPayload` | Header + recon snapshot |
| `postingEventId`, `journalEntryId` | Optional 1:1 links |

### `AccountingGatewaySettlementLine`

| Field | Notes |
|-------|--------|
| `lineType` | PAYMENT / REFUND / TRANSFER / ADJUSTMENT / UNKNOWN |
| `providerEntityId` | `pay_` / `rfnd_` / etc. |
| amounts + debit/credit | From recon |
| `providerPaymentId` / `providerRefundId` | When applicable |
| `paymentId` / `orderId` | Nullable mapped commerce FKs (no invented rows) |
| `mappingStatus` | MAPPED / UNMAPPED_* / DATA_GAP / UNKNOWN_ADJUSTMENT |
| `rawPayload` | Line evidence |

Commerce `Payment.gatewayFeeInPaise` / `settledInPaise` / `settlementDate` are **not** written by settlement code.

---

## 3. Migration

**Migration:** `backend/prisma/migrations/20260823010000_accounting_phase2d_gateway_settlement/`

**Objects added (additive only):**

- Enums: `AccountingGatewaySettlementStatus`, `AccountingGatewaySettlementLineType`, `AccountingGatewaySettlementLineMappingStatus`
- Tables: `AccountingGatewaySettlement`, `AccountingGatewaySettlementLine`
- Uniques/indexes as in migration SQL
- FKs to `AccountingPostingEvent`, `AccountingJournalEntry` (SET NULL); cascade delete lines with settlement

**Not altered:** Order, OrderItem, Payment, Refund, Inventory, Invoice, Shipment, Zoho tables.

**Validation:** `npx prisma validate` → schema valid. Applied on local + pre-launch Lightsail.

---

## 4. Razorpay Read-only Adapter

`backend/src/modules/accounting/razorpay-settlement.adapter.ts`

| Allowed | Forbidden (contract list for tests) |
|---------|--------------------------------------|
| `listSettlements` → settlements.all | captures, refunds, transfers |
| `fetchSettlement` → settlements.fetch | on-demand settlement create |
| `fetchSettlementRecon` → recon/combined GET | any mutation API |

Tests assert `RAZORPAY_SETTLEMENT_ADAPTER_FORBIDDEN_METHODS` cannot be invoked via the narrow client surface.

---

## 5. Importer

`settlement-import.service.ts`

1. Fetch header + recon (GET only).
2. Map lines; aggregate fee/tax from recon lines.
3. Persist one `AccountingGatewaySettlement` per `provider + providerSettlementId`.
4. Identical source hash → same record (idempotent).
5. Different material payload → `SETTLEMENT_MISMATCH` (no silent overwrite of posted history).

---

## 6. Mapping

| Provider entity | Mapping |
|-----------------|---------|
| `pay_…` | `Payment.providerPaymentId` → Order → ORDER_PAID event if present |
| `rfnd_…` | `Refund.providerRefundId` → Payment / Order → ORDER_REFUNDED_FULL if present |
| Unknown | `UNMAPPED_PAYMENT` / `UNMAPPED_REFUND` / `UNKNOWN_ADJUSTMENT` — **no invented commerce rows** |

---

## 7. Settlement Journal Builder

`settlement-journal.builder.ts` — `PAYMENT_GATEWAY_SETTLED_V1`

Touches only:

- **1010 Bank** — net deposit/debit
- **5100 Payment Gateway Charges** — gateway cost
- **1020 Razorpay Clearing** — payment release (Cr) / refund recovery (Dr)

Never Product Sales / Output GST on settlement.

**Fee/tax arithmetic (real Razorpay correction):**

- Prefer **tax-exclusive** when uniquely `G − F − T = N` → expense `F + T` to 5100.
- Else if **fee-inclusive** `G − F = N` (tax informational, nested in fee) → expense `F` only; still store `taxInPaise`.
- Else fail closed (`UNKNOWN` identity).

Simple payment-only journal when fee-inclusive:

```
Dr 1010 Bank              N
Dr 5100 Gateway Charges   F
    Cr 1020 Clearing      G
```

Complex batches use recon payment/refund/adjustment legs; unexplained non-zero adjustments fail closed on post (no Round Off filler).

---

## 8. Refund Interaction

Preserves Phase 2C economics:

- ORDER_PAID → Dr Clearing  
- ORDER_REFUNDED_FULL → Cr Clearing  
- Settlement payment release → Cr Clearing  
- Settlement refund effect → Dr Clearing  

Settlement does **not** reverse revenue again.

---

## 9. Fee + Tax Policy

| Store | GL V1 |
|-------|-------|
| `feeInPaise`, `taxInPaise` separately | Expense gateway cost to **5100** per detected mode |
| Tax visible for future ITC | **No** automatic `Dr Input GST` |

---

## 10. GST ITC Boundary

`gstItcStatus = UNVERIFIED_PENDING_TAX_INVOICE` always for V1.

Future (not implemented): reclassify to Input GST after tax-invoice verification.

---

## 11. Idempotency

| Item | Value |
|------|--------|
| Event type | `PAYMENT_GATEWAY_SETTLED` |
| Unique key | `provider:razorpay:settlement:{settlementId}` |
| DB uniqueness | `AccountingPostingEvent (eventType, uniqueKey)` |

Repeated import / preview / post / 20 concurrent posts → **one** event, **one** journal.

---

## 12. Feature / Production Guards

| Flag | Default |
|------|---------|
| `NATIVE_ACCOUNTING_ENABLED` | off |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` | off |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | required for production-like persist |

Bulk discovery additionally uses existing bulk-positive guard; discovery defaults dry-run.

**Lightsail `.env`:** settlement/production posting flags **not** permanently enabled (validated absent after run).

---

## 13. Admin UI / API

Under authenticated `/api/admin/accounting/*`:

- Preview / import evidence / preview journal / post one settlement  
- Bounded discovery  
- Reconciliation V3 (order + settlement batch)

Frontend: `frontend/app/admin/accounting/settlements/page.tsx` + `accounting-api.ts` + nav.

Shows settlement id, date, UTR, currency, gross/fees/tax/net, line counts, mapping, journal preview, balance, posting status, ITC status, recon status.

---

## 14. Reconciliation V3

Lifecycle: `ORDER_PAID` → `ORDER_REFUNDED_FULL` (if any) → `PAYMENT_GATEWAY_SETTLED` → BANK.

Per payment/order and settlement batch views include clearing movements, fee/tax, UTR, remaining clearing, statuses:

`MATCHED`, `UNSETTLED`, `PARTIALLY_SETTLED`, `SETTLEMENT_MISMATCH`, `FEE_MISMATCH`, `REFUND_PENDING`, `UNMAPPED`, `DATA_GAP`, `ERROR`.

---

## 15. Tests

`backend/test/accounting/settlement.test.ts` covers core matrix items including:

1. one-payment journal  
2. multi-payment  
3. payment + refund  
4–5. fee+tax + odd paise + **fee-inclusive identity**  
6–7. duplicate import/post  
8. 20 concurrent posts  
9–11. unknown pay_/rfnd_/adjustment fail-closed  
12–15. malformed / mismatch / missing UTR / missing date  
18–19. INR vs non-INR  
20–22. flags / dry-run / production dual  
24. no commerce Payment mutation  
25. GET-only adapter contract  

Plus existing production-guard, api-security, order-paid, order-refunded-full, commerce suites.

---

## 16. Concurrency

20 parallel `postRazorpaySettlement` calls → single journal entry number (DB unique key).

---

## 17. Real Lightsail Validation

**Environment:** Pre-launch Lightsail (`13.204.112.165`), flags process-scoped only.

| Step | Result |
|------|--------|
| List ≤5 settlements (GET) | OK |
| Selected | `setl_TS0efFrJpgfPDo` (net ₹2,075.96) |
| Preview balanced | Yes (`FEE_INCLUSIVE_OF_TAX`: fee 5404, tax 824 stored, expense 5404) |
| Import + shadow post | `JE-202608-00004` Dr=Cr=213000 |
| Replay | `duplicate: true` |
| Second settlement | `setl_TRU0w9ZcWNXBxO` preview only (not posted) |
| Commerce mutations | **NONE** |
| Permanent `.env` flags | **ABSENT** |

**Note:** Real `pay_TRwgkUyZjaVQw6` was `UNMAPPED_PAYMENT` (not in Sarveda Payment table — likely pre-migration/Woo). Batch journal still balanced; clearing vs ORDER_PAID linkage incomplete until mapped SRV payments settle.

Script: `backend/scripts/phase2d-lightsail-settlement-validation.ts`

---

## 18. Commerce Integrity

Settlement path writes **Accounting\*** tables only.

Verified: no writers to Payment settlement columns; Lightsail report `COMMERCE_MODIFICATIONS: NONE`.

---

## 19. Known Limitations

1. Razorpay V1 / INR only.  
2. Unmapped historical `pay_` lines common on migrated settlements.  
3. No bank statement auto-match.  
4. No automatic GST ITC.  
5. Unexplained adjustments fail closed (no suspense CoA added — not required for validated batch).  
6. Fee-inclusive vs tax-exclusive detection based on recon arithmetic; document tax invoices before any ITC reclass.  
7. Full historical settlement backfill not run (cap ≤5, one posted).

---

## 20. Files Changed

### Phase 2D backend (settlement)

- `backend/src/modules/accounting/settlement.constants.ts`
- `backend/src/modules/accounting/settlement.types.ts`
- `backend/src/modules/accounting/razorpay-settlement.adapter.ts`
- `backend/src/modules/accounting/settlement-import.service.ts`
- `backend/src/modules/accounting/settlement-journal.builder.ts`
- `backend/src/modules/accounting/settlement-posting.service.ts`
- `backend/src/modules/accounting/settlement-discovery-worker.ts`
- Updates: `accounting-flag.ts`, `production-guard.ts`, `accounting-errors.ts`, `reconciliation.service.ts`, `accounting.handlers.ts`, `accounting.routes.ts`, `order-paid.constants.ts` (5100), `index.ts`
- `backend/prisma/schema.prisma` + migration `20260823010000_accounting_phase2d_gateway_settlement`
- `backend/scripts/phase2d-lightsail-settlement-validation.ts`
- `backend/test/accounting/settlement.test.ts` (+ production-guard / api-security extensions)
- `backend/.env.example` — `ACCOUNTING_SETTLEMENT_POSTING_ENABLED`

### Frontend

- `frontend/app/admin/accounting/settlements/page.tsx`
- `frontend/lib/accounting-api.ts`
- `frontend/components/admin/accounting/AdminAccountingNav.tsx`

### Mount only

- `backend/src/modules/admin/admin.routes.ts` — mounts `/accounting` (and existing purchases)

---

## 21. Safety Audit

```
COMMERCE PRODUCTION FILES MODIFIED:
NONE (checkout/orders/payments webhook/verify commerce logic untouched)

PAYMENT FLOW FILES MODIFIED:
NONE

REFUND COMMERCE FILES MODIFIED:
NONE

ZOHO FILES MODIFIED:
NONE

EXISTING COMMERCE TABLES ALTERED:
NONE

ACCOUNTING TABLES/MIGRATIONS ADDED:
- AccountingGatewaySettlement
- AccountingGatewaySettlementLine
- Enums: AccountingGatewaySettlementStatus, AccountingGatewaySettlementLineType,
  AccountingGatewaySettlementLineMappingStatus
- Migration: 20260823010000_accounting_phase2d_gateway_settlement

PROVIDER MUTATION API CALLS:
NONE

UNEXPECTED FILES MODIFIED:
NONE attributable to Phase 2D settlement scope
(admin.routes.ts only mounts accounting router; purchases module is separate Phase-1 work in tree)

COMMERCE REGRESSION:
PASS
```

### Verification totals (local)

| Check | Result |
|-------|--------|
| Prisma validate | PASS |
| Settlement suite | PASS (12 tests) |
| Full `vitest run` | PASS — **14 files / 145 tests** |
| Backend build (`tsc`) | PASS |
| Frontend build | PASS |
| Lightsail shadow | PASS (1 posted + 1 preview) |

---

## 22. Recommendation

1. Keep settlement posting flags **off** on Lightsail/production until intentional controlled runs.  
2. Prefer settlements whose `pay_`/`rfnd_` map to Sarveda Payment/Refund rows for clearing lifecycle MATCHED status.  
3. Before ITC work: require documentary Razorpay tax invoices; do not promote recon `tax` alone.  
4. Next optional: bounded discovery dry-runs against more batches without posting; Stripe/PayPal remain deferred.

---

PHASE 2D SETTLEMENT SHADOW VALIDATED
