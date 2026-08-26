# SARVEDA NATIVE ACCOUNTING — PHASE 2C FULL REFUND SHADOW

**Date:** 2026-08-22  
**Phase:** Bounded implementation — `ORDER_REFUNDED_FULL_V1` + Reconciliation V2  
**Zoho Books:** remains authoritative  
**Depends on:** Phase 2B `ORDER_PAID_V1` shadow posting  

---

## 1. Executive Summary

Phase 2C V1 implements **single full monetary refund** shadow posting that reverses a posted `ORDER_PAID_V1` journal, plus Reconciliation V2 for the sale/refund lifecycle.

**Critical scope correction honored:** multiple partial refunds that cumulate to grand total are **never** auto-posted as one full refund (wrong period timing). They surface as `CUMULATIVE_FULL_BUT_UNALLOCATED`.

| Capability | Status |
|------------|--------|
| Pure `buildOrderRefundedFullJournal` (invert sale lines) | Done |
| Eligibility: single processed full Refund only | Done |
| Sale journal dependency (`SALE_JOURNAL_REQUIRED`) | Done |
| Idempotent `ORDER_REFUNDED_FULL` posting event | Done |
| Refund-table discovery (default dry-run) | Done |
| `ACCOUNTING_REFUND_POSTING_ENABLED` + production dual guard | Done |
| Admin preview / post / discover | Done |
| Reconciliation V2 | Done |
| Settlements / partial GST / COD collection / bank recon | **Not implemented** (deferred) |

---

## 2. Files Changed

### Backend (accounting module)

| File | Role |
|------|------|
| `order-refunded-full.constants.ts` | Event type, unique key, calc version |
| `order-refunded-full.types.ts` | Context, eligibility, proposal types |
| `order-refunded-full-eligibility.ts` | Auto-postable vs DATA_GAP codes |
| `order-refunded-full-journal.builder.ts` | Pure line inversion of posted sale |
| `order-refund-snapshot.service.ts` | Load Refund + original sale journal |
| `order-refunded-full-posting.service.ts` | Preview / post via posting-event path |
| `refund-discovery-worker.ts` | Bounded Refund-table discovery |
| `reconciliation.service.ts` | Reconciliation V2 |
| `accounting.handlers.ts` / `accounting.routes.ts` | Admin APIs |
| `accounting-flag.ts` / `production-guard.ts` / `accounting-errors.ts` | Flags + guards + errors |
| `index.ts` | Export refund flag |
| `backend/.env.example` | Document `ACCOUNTING_REFUND_POSTING_ENABLED` |

### Tests / helpers / frontend

| File | Role |
|------|------|
| `test/accounting/order-refunded-full.test.ts` | 28 Phase 2C scenarios |
| `test/accounting/production-guard.test.ts` | Refund dual/bulk guards |
| `test/accounting/api-security.test.ts` | Route security assertions |
| `test/helpers/accounting-orders.ts` | Synthetic refund helpers |
| `frontend/lib/accounting-api.ts` | Client for refund + recon V2 |
| `frontend/app/admin/accounting/order-refunded-full/page.tsx` | Admin shadow UI |
| `frontend/components/admin/accounting/AdminAccountingNav.tsx` | Nav link |

---

## 3. Full Refund Eligibility

**AUTO_POSTABLE_FULL** requires all of:

1. Provider ∈ {RAZORPAY, STRIPE, PAYPAL} (not COD)
2. Exactly **one** monetary Refund row (`amountInPaise > 0`)
3. Amount == `Order.grandTotalInPaise`
4. Refund `status === "processed"`
5. `providerRefundId` present
6. Payment status ∈ {REFUNDED, PARTIALLY_REFUNDED} (not CAPTURED/PENDING)
7. If `refundedInPaise > 0`, it must equal the single refund amount
8. Native `ORDER_PAID` POSTED with calc version `ORDER_PAID_V1`

**Not auto-postable (examples):**

| Code | Meaning |
|------|---------|
| `UNPOSTED_PARTIAL` | Single refund < grand total |
| `MULTIPLE_REFUNDS_UNALLOCATED` | Multiple monetary refunds |
| `CUMULATIVE_FULL_BUT_UNALLOCATED` | Multiple partials sum to full — **do not post** |
| `SALE_JOURNAL_REQUIRED` | Eligible refund but sale journal missing |
| `NO_AUTHORITATIVE_REFUND` | No Refund row (status-only REFUNDED) |
| `COD_NOT_AUTO_POSTABLE` | COD path |
| `MISSING_PROVIDER_REFUND_ID` | Online refund without gateway id |
| `INCONSISTENT_PAYMENT_STATUS` | Fail closed |
| `REFUND_AMOUNT_EXCEEDS_TOTAL` | Fail closed |

---

## 4. Refund Authority

Primary evidence: **`Refund` row** after commerce commit.

**Not** authority alone: `Order.status = REFUNDED`, CANCELLED/RTO, Zoho CN id, DELIVERED.

Admin gateway refunds create `status: "processed"` + `providerRefundId`. Razorpay webhook may create `created` then `processed` — only `processed` is auto-postable.

---

## 5. Original Sale Dependency

Refund posting **requires** a POSTED `ORDER_PAID` event/journal first.

- Unique key sale: `order:{orderId}:paid`
- Unique key refund: `order:{orderId}:refunded_full`
- If sale missing → `SALE_JOURNAL_REQUIRED` (discovery may post sale first; never refund-before-sale)

Amounts come from the **posted sale journal lines** (payload diagnostics retained for audit), not PDF GST and not Zoho.

---

## 6. Journal Builder

`ORDER_REFUNDED_FULL_V1` inverts each posted sale line:

| Sale | Refund |
|------|--------|
| Dr Clearing / AR | Cr Clearing / AR |
| Dr 4200 Discounts | Cr 4200 Discounts |
| Cr 4000 Product Sales | Dr 4000 Product Sales |
| Cr Output GST | Dr Output GST |
| Cr 4100 Shipping | Dr 4100 Shipping |

Fail-closed if imbalance > 2 paise.

Accounting date: `Refund.createdAt` (successful refund record). Provider settlement date is not used (unavailable).

---

## 7. GST / Discount / Shipping Reversal

Exact reverse of original `ORDER_PAID_V1` components (intra CGST/SGST, inter IGST, discount contra taxable portion, shipping income). No recalculation with a newer algorithm.

---

## 8. Provider Clearing Mapping

| Provider | Account |
|----------|---------|
| RAZORPAY | 1020 |
| STRIPE | 1021 |
| PAYPAL | 1022 |

Clearing after sale+refund is labeled **`UNSETTLED_PROVISIONAL`** until settlement import exists. No Bank / fee journals.

---

## 9. Partial Refund Handling

Discovered for reconciliation only. **No GST/revenue journals.**

Statuses: `UNPOSTED_PARTIAL`, `MULTIPLE_REFUNDS_UNALLOCATED`, `CUMULATIVE_FULL_BUT_UNALLOCATED`, `DATA_GAP`.

No proportional GST allocation. No cash-only wash entries.

---

## 10. COD Handling

No automatic COD refund accounting. Phase 2B COD sale → Dr 1100 AR. Cancellation/REFUNDED without monetary Refund evidence → reconciliation only (`COD_NOT_AUTO_POSTABLE`).

---

## 11. Discovery Worker

`runOrderRefundedFullDiscovery`:

- Source: Refund table, ordered by `createdAt`, `id`
- Dedupes by order
- Default `dryRun=true` unless `ACCOUNTING_REFUND_POSTING_ENABLED=1`
- Limit ≤ 500
- Params: orderId / orderNumber / refundId / since / until / limit / dryRun
- Production bulk uses existing dual bulk guard (+ refundId as single-scope)

---

## 12. Idempotency

`eventType = ORDER_REFUNDED_FULL`  
`uniqueKey = order:{orderId}:refunded_full`

Hardened `postJournalFromEvent` path. Concurrent ×20 → **1 event + 1 journal**.

---

## 13. Feature / Production Guards

| Env | Role | Default |
|-----|------|---------|
| `NATIVE_ACCOUNTING_ENABLED` | Module gate | OFF |
| `ACCOUNTING_REFUND_POSTING_ENABLED` | Refund persistence | OFF |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | Required on production-like | OFF |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` | Bulk on production-like | OFF |

Staging/dev: refund flag alone for persistence. Production-like: refund flag **and** production posting override.

---

## 14. Admin Preview / Post

Under `/api/admin/accounting/` (admin auth):

- `POST /order-refunded-full/preview`
- `POST /order-refunded-full/post`
- `POST /order-refunded-full/discover`
- `GET /reconciliation/v2`

Preview shows eligibility, original sale, proposed reversal lines, imbalance, reason if unpostable. No commerce mutation.

---

## 15. Reconciliation V2

Per order: commerce totals, Refund rows, native sale, native refund, local Zoho invoice/CN ids, clearing provisional balance.

Statuses include: `MATCHED`, `EXPECTED_VARIANCE`, `UNSETTLED`, `UNPOSTED_PARTIAL`, `CUMULATIVE_FULL_BUT_UNALLOCATED`, `MULTIPLE_REFUNDS_UNALLOCATED`, `DATA_GAP`, `ERROR`, `SALE_JOURNAL_REQUIRED`, `PENDING_REFUND_POST`, `NO_REFUND`.

Posted sale + full refund → typically **`UNSETTLED`** (clearing provisional; no settlement data).

---

## 16. Tests

| Suite | Result |
|-------|--------|
| `order-refunded-full.test.ts` | **28/28** |
| `production-guard.test.ts` | **15/15** |
| `api-security.test.ts` | **3/3** |
| All `test/accounting` + `test/commerce` | **122/122** |

Covered: Razorpay/Stripe/PayPal full refund, intra/inter GST, discount, shipping, sale missing, concurrent ×20, partial, cumulative full blocked, amount >, status-only REFUNDED, CANCELLED, COD, missing providerRefundId, inconsistent payment, flags, production/bulk guards, commerce unchanged, recon V2, exact reverse.

---

## 17. Concurrency Results

20 concurrent `postOrderRefundedFull` → **1** POSTED event and **1** journal (others duplicate).

---

## 18. Commerce Integrity

Accounting discovers Refund rows after commit. No hooks in refund service, webhooks, checkout, afterPaid, inventory, PDF, Zoho.

Asserted in tests: Order / Payment / Refund rows unchanged after native refund post.

---

## 19. Known Limitations

- Partial refund GST posting deferred
- Cumulative full via partials deferred (period accuracy)
- COD collection / refund cash not modeled
- Gateway settlements / fees / bank matching not implemented
- Stripe webhook has no refund handler in commerce — native follows Refund table only
- Accounting date uses `Refund.createdAt` (provider settlement date unavailable)
- Clearing remains provisional without settlement importer

---

## 20. Staging / Local Validation

- Prisma validate: **pass**
- Backend `tsc` / `npm run build`: **pass**
- Frontend `npm run build`: **pass**
- Tests: local/test DB only; synthetic fixtures; no production data

---

## 21. Safety Audit

```
COMMERCE PRODUCTION FILES MODIFIED:
NONE

REFUND COMMERCE FILES MODIFIED:
NONE

PAYMENT FLOW FILES MODIFIED:
NONE

ZOHO FILES MODIFIED:
NONE

SCHEMA/MIGRATIONS CREATED:
NONE

PRODUCTION DATA TOUCHED:
NO

UNEXPECTED FILES MODIFIED:
NONE
```

Only accounting module, accounting tests/helpers, `.env.example` docs, and admin accounting UI/API client were changed.

---

## 22. Recommendation

Shadow-validate on non-production with:

1. `NATIVE_ACCOUNTING_ENABLED=1`
2. `ACCOUNTING_SALES_POSTING_ENABLED=1` (ensure sale journals exist)
3. `ACCOUNTING_REFUND_POSTING_ENABLED=1`
4. Keep `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` unset on production
5. Prefer single-order preview → dry-run discover → one post
6. Confirm recon V2 shows `UNSETTLED` for posted sale+full refund and `CUMULATIVE_FULL_BUT_UNALLOCATED` for multi-partial cases

Do **not** start settlement, partial GST, COD collection, or production backfill until architectural review.

---

**SAFE FOR PHASE 2C SHADOW VALIDATION**
