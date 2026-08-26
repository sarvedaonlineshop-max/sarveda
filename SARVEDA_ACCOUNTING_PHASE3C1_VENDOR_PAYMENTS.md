# SARVEDA ACCOUNTING — PHASE 3C1 VENDOR PAYMENTS

**Date:** 2026-08-23  
**Scope:** Accounting-owned VendorPayment + bill allocations + `VENDOR_PAYMENT_MADE_V1` AP settlement shadow  
**Explicitly deferred:** Expense posting, Vendor Advances, purchase returns, COGS, Zoho AP, bank reconciliation, Phase 3C2 / 3D, fabricated historical payments  

---

## 1. Executive Summary

Phase 3C1 introduces **accounting-grade supplier payment evidence** separate from operational `VendorBill.paidInPaise` / Mark paid.

Lifecycle:

`VendorBill` → `VENDOR_BILL_POSTED_V1` → AP → **AccountingVendorPayment** → `VENDOR_PAYMENT_MADE_V1` → Bank/Cash

- Mark paid alone **never** creates `VENDOR_PAYMENT_MADE`.
- Native outstanding = AP journal − POSTED payment allocations (not ops `paidInPaise`).
- Feature flag `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED` defaults **OFF**; Lightsail `.env` left OFF after validation.
- Zoho remains authoritative.

**Local:** Prisma validate ✓ · migrate ✓ · **16 files / 193 tests** ✓ · backend `tsc` ✓ · frontend `tsc` + build ✓  
**Lightsail:** tagged fixtures · full bank payment · partial payment · replay idempotent · flags restored OFF ✓

---

## 2. Payment Models

| Model | Role |
|-------|------|
| `AccountingVendorPayment` | Payment header: number, vendor, date, amount (paise), method, paidAccountCode, UTR, notes, DRAFT/POSTED/VOID, hashes, event/journal FKs |
| `AccountingVendorPaymentAllocation` | Unique `(paymentId, vendorBillId)` with `amountInPaise` |

Enums: `AccountingVendorPaymentMethod` (`BANK_TRANSFER|UPI|CHEQUE|CASH`), `AccountingVendorPaymentStatus` (`DRAFT|POSTED|VOID`).

Existing purchase tables were **not** altered to store payment evidence.

---

## 3. Migration

`backend/prisma/migrations/20260823030000_accounting_phase3c1_vendor_payments/migration.sql`

Applied locally and on pre-launch Lightsail Postgres.

---

## 4. Numbering

Atomic via `AccountingSequence` (`VENDOR_PAYMENT` / year-month):

`VP-YYYYMM-00001`

20 concurrent creates → 20 unique numbers (tested).

---

## 5. Payment Methods / Account Mapping

| Method | Credit account |
|--------|----------------|
| BANK_TRANSFER | 1010 Bank |
| UPI | 1010 Bank |
| CHEQUE | 1010 Bank |
| CASH | 1000 Cash |

**UTR policy (V1):** non-cash methods require UTR/reference **min 3 characters**. Cash UTR optional. No free-text GL accounts.

---

## 6. Allocation Rules (POSTING / draft validation)

Fail-closed:

- `amountInPaise > 0`
- ≥1 allocation, each `> 0`
- all bills same `vendorId`
- each bill has POSTED `VENDOR_BILL_POSTED`
- no allocation > native outstanding
- **sum(allocations) === payment.amountInPaise** (no unallocated remainder, no Vendor Advance)
- no negative / duplicate bill lines

Native outstanding:

`VENDOR_BILL_POSTED AP − Σ POSTED VendorPayment allocations`

---

## 7. Journal Builder

Pure `buildVendorPaymentMadeJournal` · calc `VENDOR_PAYMENT_MADE_V1`

```
Dr 2000 Accounts Payable   payment amount
   Cr 1010 Bank  (or 1000 Cash)
```

**One journal per VendorPayment.** Allocation breakdown retained in payload/diagnostics/document links — not one journal per bill.

---

## 8. AP Settlement

After POSTED payment, native outstanding decreases. Multiple payments on one bill and one payment across multiple bills supported. Over/under allocation rejected.

---

## 9. Idempotency

- `eventType = VENDOR_PAYMENT_MADE`
- `uniqueKey = vendor_payment:{paymentId}`
- 20 concurrent posts → **1** posting event / **1** journal (tested)
- Replay returns `duplicate: true`

---

## 10. Document Links

`AccountingDocumentLink`:

- `VENDOR_PAYMENT` → payment journal
- each allocated `VENDOR_BILL` → same payment journal

Traceability: journal → payment → vendor → allocations → bill(s) → original AP journals.

---

## 11. Mark-Paid Compatibility

`markBillPaid` / purchases Mark paid API unchanged.

**Hard rule enforced:** Mark paid creates **zero** `AccountingVendorPayment` and **zero** `VENDOR_PAYMENT_MADE` events.

---

## 12. Ops Mirror Decision

**Not implemented.**

Reason: safe one-way mirror without a defined migration baseline for legacy `paidInPaise` could overwrite migrated PAID history. Native payments remain authoritative for AP; ops fields stay informational.

**UX consequence:** purchases UI may still show OPEN / unpaid while native AP is settled (and vice versa for `OPS_PAID_NATIVE_UNPAID`). Reconciliation V5 surfaces the variance.

Direction remains one-way only if mirror is added later: native → ops, never ops → accounting.

---

## 13. Historical Paid Bills

`status=PAID` / `paidInPaise > 0` with no AccountingVendorPayment:

- **No** fabricated bank/cash journals
- Recon: `OPS_PAID_NATIVE_UNPAID`
- Opening-balance / cutover deferred

---

## 14. Edit / Void Policy

| Status | Allowed |
|--------|---------|
| DRAFT | edit allocations/date/method/UTR; delete |
| POSTED | immutable amount/date/mapping/vendor/allocations; delete forbidden |
| Corrections | REVERSAL_REQUIRED (reversal UI deferred) |

Silent edit of POSTED journals is blocked.

---

## 15. Feature / Production Guards

| Flag | Default |
|------|---------|
| `NATIVE_ACCOUNTING_ENABLED` | OFF |
| `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED` | OFF |
| Production-like also needs `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` | OFF |

Bulk discovery guard accepts single `paymentId` scope. Lightsail `.env` left without these flags after validation.

---

## 16. Admin UI / API

**UI:** `/admin/accounting/vendor-payments`  
**APIs (admin + `NATIVE_ACCOUNTING_ENABLED`):**

- `GET/POST /vendor-payments`
- `GET /vendor-payments/open-bills?vendorId=`
- `GET/PATCH/DELETE /vendor-payments/:id`
- `POST /vendor-payments/preview`
- `POST /vendor-payments/post`
- `GET /reconciliation/v5` (alias of extended V4)

Purchases Mark paid UI/API remain available.

---

## 17. Reconciliation V5

Per bill: totals, AP journal, native payments allocated, outstanding, ops paid/status, payment numbers/dates/UTRs/accounts, variance.

Statuses include: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `OPS_PAID_NATIVE_UNPAID`, `NATIVE_PAID_OPS_MISMATCH`, `OVERPAID`, `DATA_GAP`, `ERROR` (+ prior V4 GST/dup flags).

Native allocation is financial truth; ops `paidInPaise` informational.

---

## 18. Tests

`backend/test/accounting/vendor-payment.test.ts` covers matrix items 1–35 (allocations, methods, numbering concurrency, idempotency, closed period, immutability, Mark paid, historical PAID, recon V5, no stock/cost mutation, flags).

Production-guard + API security extended for vendor payments.

**Full suite:** **16 files / 193 tests PASS**

---

## 19. Concurrency

- 20 concurrent payment creates → unique `VP-…` numbers
- 20 concurrent posts of same payment → one event/journal

---

## 20. Lightsail Validation

Controlled run with env-only flags (not persisted in `.env`):

| Check | Result |
|-------|--------|
| Tagged fixtures `TEST-ACC-VPAY-*` / `TEST-ACC-BILL-*` | Created |
| Full bank payment | `VP-202608-00001` → `JE-202608-00008`, Cr **1010**, outstanding **0**, recon **PAID** |
| Partial UPI | `VP-202608-00002` → `JE-202608-00009`, recon **PARTIALLY_PAID** |
| Replay | `duplicate: true` |
| Ops `paidInPaise` unchanged | true |
| Purchases/stock fingerprint | unchanged |
| `.env` flags | absent / OFF |

---

## 21. Purchase / Stock Integrity

Vendor payment posting does **not** touch Inventory, `ProductVariant.costInPaise`, receipt logic, PO, Expense CRUD, or sales/refund/settlement accounting paths.

---

## 22. Known Limitations

- No Expense accounting (Phase 3C2+)
- No Vendor Advances / overpayments
- No payment reversal UI (detect immutability only)
- No ops mirror of `paidInPaise`
- No multi-bank GL
- Historical ops-paid bills remain `OPS_PAID_NATIVE_UNPAID` until cutover

---

## 23. Safety Audit

**COMMERCE PRODUCTION FILES MODIFIED:** NONE  

**PURCHASES OPERATIONAL FILES MODIFIED:** NONE (Mark paid path untouched)  

**MARK-PAID BEHAVIOR CHANGED:** NO — still ops-only `paidInPaise` / status update; no accounting journal  

**INVENTORY/STOCK LOGIC MODIFIED:** NONE  

**ZOHO FILES MODIFIED:** NONE  

**EXISTING PURCHASE TABLES ALTERED:** NONE  

**ACCOUNTING TABLES/MIGRATIONS ADDED:**

- `AccountingVendorPayment`
- `AccountingVendorPaymentAllocation`
- enums `AccountingVendorPaymentMethod`, `AccountingVendorPaymentStatus`
- migration `20260823030000_accounting_phase3c1_vendor_payments`

**UNEXPECTED FILES MODIFIED:** NONE intentional outside accounting admin UI/API, flags, recon V5, tests, Lightsail script, this report  

**COMMERCE REGRESSION:** PASS  

**PURCHASES REGRESSION:** PASS (suite includes purchases helpers; Mark paid regression covered)

---

## 24. Recommendation

Proceed to **Phase 3C2 (Expense posting)** only after product sign-off on payment UX + recon statuses. Keep vendor-payment posting flags **OFF** on Lightsail until a controlled shadow window is scheduled. Do not fabricate payments for historical PAID bills.

---

PHASE 3C1 VENDOR PAYMENT SHADOW VALIDATED
