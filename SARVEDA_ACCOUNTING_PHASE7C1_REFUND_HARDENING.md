# SARVEDA NATIVE ACCOUNTING — PHASE 7C.1
# REFUND PRODUCTION HARDENING

**Date:** 2026-08-26  
**Scope:** Commerce refund safety for Razorpay / Stripe / PayPal before accounts UAT  
**Not in scope:** Phase 7D · Zoho migration · accounting reset · permanent production flags · production openings  

---

## 1. Executive summary

| Area | Result |
|------|--------|
| Pre-provider idempotency | **Implemented** — `reserveGatewayRefund` (`SELECT FOR UPDATE` + pending `Refund`) before any gateway call |
| Razorpay webhook | **Fixed** — partial ≠ full order `REFUNDED`; cumulative processed drives status |
| Stripe webhook | **Added** — `charge.refunded` / `refund.*` → authoritative `Refund` |
| PayPal webhook | **Fixed** — creates/updates `Refund` (not status-only) |
| Partial refund accounting | **DATA_GAP** — left fail-closed (`UNPOSTED_PARTIAL`); no invented GST allocation |
| COD | **Manual only** — clearer “Manual refund required” copy |
| Admin UX | Busy guard; payment state label; partial refund allowed from UI |
| Restock after refund | **Fixed** — `orderStockWasConfirmed` treats REFUNDED/PARTIALLY_REFUNDED as prior capture |
| Tests | **10/10 PASS** (`refund-hardening` + legacy `refund.test`) |

---

## 2. Provider readiness matrix

| Provider | API refund | Webhook recovery | Full | Partial | Idempotency | Accounting | Admin UX | Final readiness |
|----------|------------|------------------|------|---------|-------------|------------|----------|-----------------|
| **Razorpay** | Yes | Yes (created/processed) | Yes | Yes | Pre-reserve + webhook by `providerRefundId` | Full auto-post when processed + id; partial = `UNPOSTED_PARTIAL` | Yes | **REFUND READY** |
| **Stripe** | Yes | Yes (charge.refunded / refund.*) | Yes | Yes | Same | Same | Yes | **REFUND READY** |
| **PayPal** | Yes | Yes (REFUND.COMPLETED + CAPTURE.REFUNDED) | Yes | Yes | Same | Same | Yes | **REFUND READY** |
| **COD** | No | N/A | Manual | Manual note | N/A | Fail-closed | Manual refund required | **MANUAL REFUND ONLY** |

---

## 3. What changed (files)

| File | Role |
|------|------|
| `backend/src/modules/payments/refund-sync.service.ts` | Reserve / finalize / fail / applyExternal webhook sync |
| `backend/src/modules/payments/refund.service.ts` | Reserve-first admin + service-request gateway refunds |
| `backend/src/modules/payments/razorpay.webhook.ts` | Partial-safe external apply |
| `backend/src/modules/payments/stripe.webhook.ts` | Refund event sync |
| `backend/src/modules/payments/paypal.webhook.ts` | Authoritative Refund creation |
| `backend/src/modules/orders/orders.service.ts` | Restock after payment already REFUNDED |
| `backend/src/modules/orders/order-service-request.service.ts` | COD “Manual refund required” message |
| `backend/src/modules/admin/admin.handlers.ts` | 409 on ALREADY_REFUNDED / AMOUNT_TOO_HIGH / DUPLICATE_REFUND |
| `backend/prisma/migrations/20260826140000_refund_provider_id_unique/` | Partial unique index on `providerRefundId` |
| `frontend/app/admin/orders/[id]/page.tsx` | PROCESSING state; partial-capable; no double submit |
| `frontend/components/admin/AdminOrderServiceRequests.tsx` | Busy guard; COD wording |
| `backend/test/commerce/refund-hardening.test.ts` | Focused hardening suite |
| `SARVEDA_ACCOUNTING_UAT_CHECKLIST.md` | §C2 commerce refund scenarios |

---

## 4. Priority outcomes

### P1 — Double refund / idempotency
- Pending `Refund` row created under payment row lock **before** provider call.
- Concurrent full refunds: one succeeds, one fails; **one** provider call proven in test.
- Failed provider call → reserved row `failed` → capacity released for retry.

### P2 — Razorpay
- Webhooks use `applyExternalProviderRefund`.
- Order `REFUNDED` only when **sum(processed) ≥ captured**.
- `refundedInPaise` recomputed from processed rows only.

### P3 — Stripe
- Webhook sync creates/updates `Refund` with provider id, amount, processed/failed.
- Supports recovery when API succeeded but local finalize was missed (webhook attaches / creates).

### P4 — PayPal
- No longer status-only `handlePaidOrderStatusChange`.
- Creates authoritative `Refund`; replay idempotent.

### P5 — Partial refund accounting
**DATA_GAP (intentional stop):** commerce `Refund` has no line/tax snapshot. Safe proportional GST reversal would require inventing allocation. Native accounting remains:

- Full: `ORDER_REFUNDED_FULL` when single processed refund = grand total + `providerRefundId`
- Partial: `UNPOSTED_PARTIAL` / `PARTIAL_REFUND_GST_DATA_GAP`

Inventory/COGS reversal remains tied to **restock events**, not gateway amount alone.

### P6 — Admin UX
- Disable while `busy` / PROCESSING label
- Allow refund when `PARTIALLY_REFUNDED`
- Success messaging prefers provider refund id when present

### P7 — COD
- No automatic payout
- Explicit “Manual refund required”
- Service-request still requires COD note

---

## 5. Tests run

```
test/commerce/refund-hardening.test.ts  — 9 passed
test/commerce/refund.test.ts            — 1 passed
Total: 10/10 PASS
```

Coverage includes: Razorpay full/partial/concurrent/webhook; Stripe webhook recovery + full-after-partial; PayPal webhook Refund; amount cap; provider failure release; stock restock on full refund.

---

## 6. Safety confirmations

| Action | Done? |
|--------|-------|
| Zoho data migrated | **NO** |
| Accounting reset execute | **NO** |
| Production opening posted | **NO** |
| Persistent production flags enabled | **NO** |
| Phase 7D started | **NO** |

---

## 7. Remaining non-blockers

| Item | Severity | Notes |
|------|----------|-------|
| Partial GST native journals | DATA_GAP / by design | Needs commerce line-level tax on Refund |
| Subscribe Stripe Dashboard to `charge.refunded` / `refund.*` | Ops | Code ready; webhook events must be enabled in Stripe |
| Subscribe PayPal `PAYMENT.REFUND.COMPLETED` | Ops | Prefer over capture-only |

No BLOCKER/HIGH refund correctness issues remain in code paths covered above.

---

## PHASE 7C.1 REFUND HARDENING VALIDATED
