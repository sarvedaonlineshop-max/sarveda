# SARVEDA Cancellation / Refund / Return V2 — Final Certification

**Date:** 2026-09-01  
**Scope:** Certification / UAT only — no new features, no architecture changes, no production deploy  
**Reference:** [`docs/SARVEDA_RETURN_REPLACEMENT_V2_PHASE2.md`](SARVEDA_RETURN_REPLACEMENT_V2_PHASE2.md)

---

## Executive summary

Engineering phases 1A–1E and Phase 2 (Return/Replacement) are **implemented and covered by automated commerce regression**. This certification run confirms **local migration state**, **build health**, and **191/191 commerce tests passing**. Several **mandatory manual / external-system checks were not executed** in this run and block production sign-off.

**Final verdict:** **ENGINEERING READY — MANUAL UAT REQUIRED**

---

## 1. Migration / environment readiness

### Migrations present and ordered (V2 additive chain)

| Order | Migration | Phase |
|------:|-----------|-------|
| 1 | `20260901120000_rto_physical_receipt_workflow` | 1C RTO |
| 2 | `20260901140000_order_adjustment_phase1d` | 1D Adjustments |
| 3 | `20260901160000_phase1e_financial_settlement` | 1E Partial refund / supplementary |
| 4 | `20260901180000_return_replacement_phase2` | Phase 2 Return/Replacement |

**Local DB (docker `sarveda_db`):** `prisma migrate status` → **87 migrations, schema up to date** (includes all four above).

**Staging / production-bound DB:** **NOT VERIFIED in this run.** EC2/Lightsail `migrate deploy` status must be confirmed before cutover.

### Environment flags

| Variable | Purpose | Local cert run |
|----------|---------|----------------|
| `RETURN_WINDOW_DAYS` | Post-delivery return window (default **7**) | Not set locally → default 7 applies |
| `NATIVE_ACCOUNTING_ENABLED` | Master accounting gate | **Not set → OFF** |
| `ACCOUNTING_REFUND_POSTING_ENABLED` | `ORDER_REFUNDED_FULL` / **`ORDER_REFUNDED_PARTIAL`** persistence | **Not set → OFF** (requires `NATIVE_ACCOUNTING_ENABLED=1`) |
| `ACCOUNTING_SALES_POSTING_ENABLED` | Original sale journals | **Not set → OFF** |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` | Gateway settlement journals | **Not set → OFF** |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | Production-like DB posting override | **Not set → OFF** |

**Finding:** Phase 1E **partial refund accounting** uses `postOrderRefundedPartial()` → `assertRefundPostingPersistenceAllowed()`. With flags off, gateway refund **still executes**; accounting/Zoho stages are **skipped or left pending** (`settlementStage: GATEWAY_SUCCEEDED`, error logged). This is **fail-closed for accounting**, not for money.

**Staging recommendation:** Enable `NATIVE_ACCOUNTING_ENABLED=1` + `ACCOUNTING_REFUND_POSTING_ENABLED=1` on staging only after Zoho UAT; never enable production posting without dual-flag review (`production-guard.test.ts`).

---

## 2. Cancellation certification

| Case | Result | Evidence |
|------|--------|----------|
| A. COD before dispatch cancel | **PASS** | `cancellation-phase1a.test.ts` |
| B. COD after dispatch blocked | **PASS** | Same |
| C. Online paid pre-dispatch full refund | **PASS** | Same |
| D. Online paid after dispatch blocked | **PASS** | Same |
| E. Duplicate cancel request | **PASS** | Submit rejects pending request (`REQUEST_PENDING`) |
| F. Duplicate admin approval | **PASS** | Idempotent review / gateway idempotency |
| G. Direct PATCH REFUNDED blocked | **PASS** | `patchOrderStatus REFUNDED guard` test |
| H. Failed/abandoned payment not selected | **PASS** | `pickCapturedPaymentForRefund` tests |
| I. Multiple captured payments fail-closed | **PASS** | Payment selection + calculator |

**Coherence:** Money, inventory restock on COD cancel, request status, order status — covered in 1A tests. Accounting/credit note on full cancel — mocked Zoho in commerce suite. Notifications — mocked `notifyOrderEmail` / service-request emails (generic templates only).

---

## 3. RTO certification

| Case | Result | Evidence |
|------|--------|----------|
| A. Carrier RTO no restock | **PASS** | `rto-phase1c.test.ts` |
| B. Carrier RTO no refund | **PASS** | Same |
| C. Physical receipt | **PASS** | Same + idempotent receive |
| D. RESTOCKABLE | **PASS** | Restock exactly once |
| E. DAMAGED_NON_RESTOCKABLE | **PASS** | No sellable increment |
| F. NEEDS_REVIEW | **PASS** | No restock |
| G. COD RTO | **PASS** | No gateway refund |
| H. Online paid RTO | **PASS** | Preview + Phase 1E execute path |
| I. Shipping retained | **PASS** | `RTO_SHIPPING_RETAINED` calculator |
| J. Refund after physical receipt only | **PASS** | Execute blocked until disposition |
| K. Damaged RTO refund without restock | **PASS** | Disposition + preview tests |
| L. Duplicate receipt/disposition/refund | **PASS** | Idempotency tests |

Inventory ledger: `OrderInventoryRestockSourceType.RTO_PHYSICAL_RECEIPT`. Refund settlement: `sourceType: RTO`, stages tracked on `Refund.settlementStage`.

---

## 4. Adjustment certification

| Case | Result | Evidence |
|------|--------|----------|
| A. Address same-postal | **PASS** | `adjustment-phase1d.test.ts` |
| B. Postal/country change fail-closed | **PASS** | `COMMERCIAL_REVIEW_REQUIRED` |
| C. Same-price variant swap | **PASS** | Inventory movement |
| D. Cheaper variant | **PASS** | Partial refund via 1E |
| E. More-expensive variant | **PASS** | `ADDITIONAL_PAYMENT_REQUIRED` block |
| F. Quantity decrease | **PASS** | Executes partial refund |
| G. Quantity increase | **PASS** | Supplementary payment required path |
| H. Dispatch race | **PASS** | Blocked after shipment in transit |
| I. Zoho/accounting gate | **PASS** | Production guard + posting flags |
| J. Convert to cancellation | **PASS** | Routes Phase 1A |
| K. Duplicate execute | **PASS** | Idempotent execute |

Financial deltas, execution status, and inventory — covered in 1D/1E tests. Live Zoho invoice adjustment — **NOT RUN** (mocked).

---

## 5. Partial refund financial certification

| Case | Result | Evidence |
|------|--------|----------|
| A. One partial merchandise refund | **PASS** | `adjustment-phase1e`, `refund-hardening` |
| B. Multiple sequential partials | **PASS** | `refund-hardening.test.ts` |
| C. Shipping retained | **PASS** | Calculator + RTO + return (changed_mind) |
| D. Shipping refunded (policy) | **PARTIAL** | Policy coded per reason; **no automated per-reason amount assertion** |
| E. Coupon allocation | **PASS** | `order-refund-calculator.test.ts` |
| F. GST-inclusive reversal | **PASS** | Calculator + `buildOrderRefundedPartialJournal` |
| G. CGST/SGST | **PARTIAL** | Intra-state default in tests |
| H. IGST | **NOT RUN** | No dedicated inter-state partial refund E2E |
| I. Odd-paise rounding | **PASS** | Calculator test Q |
| J. Cumulative → full captured | **PASS** | `refund-hardening` |
| K. Duplicate providerRefundId | **PASS** | Idempotent finalize |
| L. Gateway success + accounting retry | **NOT RUN** | `retryPartialRefundSettlementStages` exists; **no automated retry test** |
| M. Accounting success + Zoho retry | **NOT RUN** | Zoho mocked in commerce suite |

**Inventory:** `order-inventory-restock.test.ts` — **partial monetary refund does not restock** (**PASS**).

**Gateway not repeated / journal not duplicated:** Idempotency on `Refund` source + posting event unique keys — **PASS** in automated paths. **Live Zoho duplicate prevention — NOT RUN.**

---

## 6. Supplementary payment certification

| Case | Result | Evidence |
|------|--------|----------|
| A. Upgrade requires payment | **PASS** | 1D blocks auto-execute; 1E session API |
| B. Original order unchanged before capture | **PASS** | Architecture (separate `OrderSupplementaryPayment`) |
| C–G. Success/cancel/failure/duplicate/race | **PARTIAL** | Razorpay session idempotent test only |
| H–J. Dispatch race / stock / inventory once | **PARTIAL** | 1D dispatch race; full E2E **NOT RUN** |

| Provider | Automated | Real sandbox |
|----------|-----------|--------------|
| Razorpay | Session + verify unit path | **MANUAL REAL-WORLD UAT REQUIRED** |
| Stripe | Mocked in `setup-mocks.ts` | **MANUAL REAL-WORLD UAT REQUIRED** |
| PayPal | Mocked | **MANUAL REAL-WORLD UAT REQUIRED** |

---

## 7. Return request certification

| Case | Result | Evidence |
|------|--------|----------|
| A. Delivered eligible | **PASS** | `return-replacement-phase2.test.ts` |
| B. Not delivered rejected | **PASS** | Same |
| C. Return window | **PASS** | Same |
| D. RTO order rejected | **PASS (code)** | `getReturnEligibility` `RTO_ACTIVE` — **no dedicated automated test** |
| E. Partial quantity | **PASS** | Same |
| F. Duplicate request | **PASS (code)** | Pending request block — **no dedicated automated test** |
| G. Evidence required | **PASS (code)** | Server rejects missing photos — **manual upload NOT RUN** |
| H. Evidence optional | **PASS (code)** | e.g. `changed_mind` — **manual NOT RUN** |
| I. Qty exceeds available | **PASS (code)** | Eligibility service |
| J. Already refunded qty | **PASS (code)** | Aggregate in eligibility |
| K. Already replaced qty | **PASS (code)** | `OrderReplacementFulfillment` aggregate |

**Request creation side effects:** Submit creates `OrderServiceRequest` + items only — **no money, no stock, no order line mutation** (**PASS** via 1D pattern + Phase 2 service).

---

## 8. Physical return certification

| Step | Restocks? | Result |
|------|-----------|--------|
| Request approved | No | **PASS** |
| Return received | No | **PASS** |
| RESTOCKABLE disposition | Once | **PASS** |
| DAMAGED | No sellable | **PASS** |
| NEEDS_REVIEW | No movement | **PASS (code)** |
| Double-click receive/disposition | Idempotent | **PASS** |

---

## 9. Refund-after-return certification

| Scenario | Automated | Manual staging |
|----------|-----------|----------------|
| wrong_item (shipping refundable) | **NOT RUN** | **REQUIRED** |
| damaged_delivery | **NOT RUN** | **REQUIRED** |
| defective | **NOT RUN** | **REQUIRED** |
| changed_mind (shipping retained) | **PASS** | Via Phase 2 test N path |
| quality_issue | **PASS** | Disposition + refund test |
| partial qty | **PASS** | Test N (qty 2, return 1) |

**Compare calculated vs Refund vs Payment.refundedInPaise vs journal vs Zoho:** Automated gateway + Refund row (**PASS**). Native journal when flags on — **NOT RUN locally**. Zoho partial CN — **mocked only**.

---

## 10. Mixed multi-item order

**Mandatory scenario:** Item A return / Item B replacement / Item C untouched.

| Result | **NOT RUN** |
|--------|-------------|
| Classification | **P1 — MANUAL BLOCKER for production sign-off** |

No automated test exists. Phase 2 claims line-level operation but **this certification cannot PASS without staging UAT**.

---

## 11. Replacement certification

| Case | Result |
|------|--------|
| A–D Same/different variant / price delta | **NOT RUN** (architecture present) |
| E. Replacement OOS | **PARTIAL** — sets `FAILED`; see §12 |
| F. Qty > eligible | **PASS (code)** — eligibility caps |
| G. Duplicate replacement | **PASS (code)** — unique `requestItemId` |
| H–J. Reserve / ship / deliver | **NOT RUN** automated |

Original `OrderItem` not overwritten — **PASS (design)**.

---

## 12. Replacement OOS fallback

When replacement variant unavailable, `reserveReplacementStock()` sets fulfillment **`FAILED`**.

| Expected | Actual |
|----------|--------|
| Admin fallback REFUND or NEEDS DISCUSSION | **Not implemented as guided workflow** |

**Severity: P1** — Admin can manually process refund via separate path, but **no safe, documented fallback** from OOS replacement state. Risk of partial order state if admin unsure.

---

## 13. COD return certification

| Check | Result |
|-------|--------|
| No gateway refund call | **PASS (code)** — `executeReturnReplacementRefund` COD branch |
| Manual note required | **PASS (code)** — `COD_NOTE_REQUIRED` |
| Audit trail | **PASS (code)** — `codRefundNote` on request |
| Delivered COD E2E | **NOT RUN** |

**Schema note:** COD orders use `Payment.provider=COD`, `status=PENDING` until collection; delivered COD scenario depends on ops marking payment captured. **Represent collected COD clearly in UAT script.**

---

## 14. Zoho partial credit note — mandatory

| Check | Result |
|-------|--------|
| Staging Zoho org execution | **NOT RUN** |
| Commerce tests | **Mock** `createZohoPartialCreditNoteForRefund` |

**Severity: P1 — MANUAL BLOCKER** per certification spec. Idempotency on `Refund.zohoCreditNoteId` is **coded** but **unproven** against live Zoho.

---

## 15. Document certification

| Document | Behavior |
|----------|----------|
| Original tax invoice | Immutable snapshot on order |
| Partial credit note | Phase 1E Zoho path (when enabled) |
| Replacement shipment doc | Manual `Shipment` row only |
| Delivery challan | Exists for B2B; **not wired to replacement workflow** |
| Return shipment refs | `OrderReturnShipment` AWB fields |

**Phase 2 deferral:** Replacement Zoho delivery challan / zero-value tax docs.

**Launch classification:** **ACCEPTED P2** if operations accept manual challan/CN process for replacements until automated; **P1** if statutory replacement documentation is required at launch (business decision).

---

## 16. Notification certification

Currently emitted (generic):

- Service request submitted → customer + admin care email
- Service request reviewed (approve/reject)
- `notifyOrderEmail` on refund initiated (gateway path)

**Not emitted:** Return received, replacement shipped, lifecycle-specific WhatsApp.

**Classification:** **ACCEPTED P2 for launch** (per Phase 2 report) **if** stakeholders accept generic emails; **P1** if customer comms SLA requires step-specific templates.

---

## 17. Evidence / security

| Control | Result |
|---------|--------|
| Customer owns order | **PASS (code)** — auth + order ownership on submit |
| Image types only | **PASS (code)** — multer `image/*` filter |
| 12MB / 48 files limit | **PASS (code)** |
| S3 private upload path | **PASS (code)** — `order-requests/{requestId}/` |
| Admin view authorized | **PASS (code)** — admin routes + orderId scope |
| Cross-customer access | **PASS (code)** — ownership checks |
| Path traversal via filename | **PASS (code)** — UUID key, not user filename |

**Manual photo upload UAT:** **NOT RUN**

---

## 18. Idempotency / concurrency

| Domain | Automated coverage |
|--------|-------------------|
| Cancel approval / refund | **PASS** 1A + refund-hardening |
| Partial refund | **PASS** |
| RTO receipt / disposition | **PASS** 1C |
| Return receipt / disposition | **PASS** Phase 2 |
| Replacement create | **PASS (code)** — unique constraints |
| Supplementary payment | **PASS** session idempotency |
| Accounting posting | **PASS** unique posting events |
| Zoho CN | **Mock only** |

---

## 19. Full accounting trace

Representative journals exercised in **unit/builder tests** (balanced `ORDER_REFUNDED_PARTIAL` proposal). End-to-end trace with **flags enabled** on staging:

| Scenario | Automated E2E with posting |
|----------|----------------------------|
| Original sale | Partial (`order-paid.test.ts` when enabled) |
| Full pre-dispatch refund | Mock Zoho |
| RTO merchandise refund | Builder balanced |
| Customer partial return | Gateway yes; journal **flag-dependent** |
| Cheaper adjustment | 1E test |
| Supplementary payment | Journal path exists |

**Full staging trace with TB reconciliation:** **MANUAL UAT REQUIRED**

---

## 20. Automated regression

| Suite | This certification run |
|-------|------------------------|
| Backend `tsc` | **PASS** |
| Frontend `tsc` | **PASS** |
| Frontend production `build` | **PASS** |
| Commerce (`test/commerce`) | **191 / 191 PASS** |
| Accounting (`test/accounting`) | **NOT COMPLETED** — parallel runs caused Postgres deadlocks; suite is long-running. Subset `production-guard.test.ts` **31/31 PASS**. Prior engineering runs expected green (~393 tests). **Re-run serially:** `npx vitest run test/accounting --maxWorkers=1 --fileParallelism=false` before deploy. |
| Phase 1A | Included in commerce |
| Phase 1B | `order-refund-calculator.test.ts` |
| Phase 1C | `rto-phase1c.test.ts` |
| Phase 1D | `adjustment-phase1d.test.ts` |
| Phase 1E | `adjustment-phase1e.test.ts` |
| Phase 2 | `return-replacement-phase2.test.ts` (8 tests) |

---

## 21. Manual UAT matrix

| # | Scenario | Status |
|---|----------|--------|
| 1 | Photo evidence return (customer upload → admin view) | **NOT RUN** |
| 2 | Mixed multi-item: A return / B replace / C keep | **BLOCKER — NOT RUN** |
| 3 | Wrong-item shipping-refundable refund amount | **NOT RUN** |
| 4 | Replacement OOS → admin fallback | **FAIL (no guided fallback)** |
| 5 | COD delivered manual refund | **NOT RUN** |
| 6 | Zoho partial credit note on staging org | **BLOCKER — NOT RUN** |
| 7 | Razorpay supplementary payment (real sandbox) | **NOT RUN** |
| 8 | Stripe supplementary payment | **NOT RUN** |
| 9 | PayPal supplementary payment | **NOT RUN** |
| 10 | Real replacement shipment + AWB | **NOT RUN** |
| 11 | Staging DB `migrate deploy` all V2 migrations | **NOT RUN** |
| 12 | IGST inter-state partial refund | **NOT RUN** |
| 13 | Return lifecycle emails (customer expectations) | **WAIVED P2** (generic emails only) |
| 14 | Replacement delivery challan (if legally required) | **WAIVED P2** (pending business sign-off) |

---

## 22. Finding severity summary

| Severity | Count | Notes |
|----------|------:|-------|
| **P0** | **0** | No data/security/money corruption found in automated run |
| **P1** | **5** | See below |
| **P2** | **6** | Acceptable with explicit waiver |
| **P3** | **2** | Cert infra / test hygiene |

### Outstanding P1 (must fix or complete UAT before launch)

1. **Zoho partial credit note not verified on staging org** — mandatory manual blocker.
2. **Mixed multi-item return + replacement order not UAT'd** — mandatory per spec.
3. **Replacement OOS — no safe admin fallback workflow** (only `FAILED` status).
4. **Staging/production DB migration apply not verified** in this run (local only).
5. **Per-reason return shipping refund amounts not validated** against calculator in staging (wrong_item, damaged, etc.).

### P2 (acceptable temporary limitations — document for ops)

1. Replacement Zoho delivery challan / zero-value tax docs not automated.
2. Dedicated return/replacement notification templates deferred.
3. Customer supplementary payment UI for upgrade replacements incomplete.
4. Manual return AWB only (no reverse pickup API).
5. Generic service-request emails instead of lifecycle-specific.
6. Accounting/Zoho settlement **retry paths** not covered by automated tests.

### P3

1. Full accounting suite deadlock when run with multiple workers in cert environment.
2. Phase 2 automated test matrix narrower than spec checklist (8 tests vs full A–AD matrix).

---

## Domain summaries

| Domain | Certification status |
|--------|---------------------|
| **CANCELLATION** | **PASS** automated |
| **RTO** | **PASS** automated |
| **ADJUSTMENTS** | **PASS** automated |
| **FULL REFUNDS** | **PASS** automated (mock Zoho) |
| **PARTIAL REFUNDS** | **PASS** gateway + calculator; **accounting/Zoho live NOT RUN** |
| **SUPPLEMENTARY PAYMENTS** | **PARTIAL** — architecture + Razorpay idempotency; **real providers NOT RUN** |
| **RETURNS** | **PASS** core path automated; **gaps in manual/multi-reason UAT** |
| **REPLACEMENTS** | **NOT RUN** E2E; **OOS P1** |
| **COD** | **PASS** code paths; **delivered COD NOT RUN** |
| **INVENTORY** | **PASS** — physical receipt drives stock; refund does not |
| **ACCOUNTING** | **FLAG-OFF locally**; staging enablement + trace **MANUAL** |
| **GST** | **PASS** calculator/builder; **IGST E2E NOT RUN** |
| **ZOHO** | **P1 BLOCKER** — live partial CN not executed |
| **DOCUMENTS** | **P2 waiver** pending business decision on replacement docs |
| **NOTIFICATIONS** | **P2 waiver** — generic templates only |
| **EVIDENCE/SECURITY** | **PASS** code review; **upload UAT NOT RUN** |
| **IDEMPOTENCY** | **PASS** automated (except live Zoho) |

---

## FINAL VERDICT

**ENGINEERING READY — MANUAL UAT REQUIRED**

Not **PRODUCTION READY** — mandatory external checks (Zoho partial CN, mixed multi-item order, real payment sandboxes, staging migration confirm) are incomplete.

Not **NOT READY FOR LAUNCH** — automated regression and core fail-closed gates are green.

Not **READY AFTER P0/P1 FIXES** alone — some P1 items are **UAT completion**, not code defects (except replacement OOS fallback workflow).

---

SARVEDA CANCELLATION / REFUND / RETURN FINAL CERTIFICATION COMPLETE — READY FOR REVIEW
