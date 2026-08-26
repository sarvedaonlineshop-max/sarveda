# SARVEDA NATIVE ACCOUNTING — PHASE 3C
# VENDOR PAYMENTS + STANDALONE EXPENSES ARCHITECTURE

**Date:** 2026-08-23  
**Mode:** READ-ONLY architecture / analysis — **no implementation**  
**Depends on:** Phase 3B `VENDOR_BILL_POSTED_V1` (validated)  
**Zoho Books:** remains authoritative during shadow mode  

---

## 1. Executive Summary

Phase 3B correctly posts **AP recognition** from VendorBill. It deliberately does **not** settle AP from Mark paid / `paidInPaise`.

Phase 3C must introduce **real money-movement documents**:

| Gap today | Phase 3C need |
|-----------|----------------|
| Mark paid = ops flag only | `VendorPayment` + allocations → `VENDOR_PAYMENT_MADE` |
| Expense free-text CoA / bank | Mapping + paid-account codes → `EXPENSE_RECORDED` |
| No payment UTR/date/method | Required on payment document |
| Double Bill+Expense risk | Detection / fail-closed policy |

**Recommended ownership:** Hybrid — Purchases UI for create/allocate; **accounting-owned** persistence + posting events/journals.

**Recommended slices:** 3C1 VendorPayment AP settlement → 3C2 Expense mapping+post → 3C3 Recon V5 + historical treatment.

**Verdict:** Architecture is clear enough to implement in bounded slices. Existing Mark paid and Expense UX must keep working with flags OFF.

---

## 2. Current Mark-Paid Reality

### Code path (traced)

| Layer | Behavior |
|-------|----------|
| UI | `bills/page.tsx` → `patchBill(id, { status: "PAID" })` for OPEN bills only |
| API | `PATCH /api/admin/purchases/bills/:id` |
| Handler | If `status === "PAID"` **or** `paidInPaise` set → `markBillPaid()` and return early |
| Service | `markBillPaid(billId, paidInPaise?)` |

```184:194:backend/src/modules/purchases/purchases.service.ts
export async function markBillPaid(billId: string, paidInPaise?: number): Promise<VendorBillStatus> {
  // ...
  const paid = paidInPaise ?? bill.totalInPaise;
  const status: VendorBillStatus = paid >= bill.totalInPaise ? "PAID" : "OPEN";
  await prisma.vendorBill.update({
    where: { id: billId },
    data: { paidInPaise: paid, status: status === "PAID" ? "PAID" : "OPEN" }
  });
```

### What is stored

| Field | Present? |
|-------|----------|
| `paidInPaise` | Yes (scalar overwrite) |
| `status` PAID / OPEN | Yes |
| Payment date | **No** (only `updatedAt`) |
| Bank / cash account | **No** |
| UTR / reference | **No** |
| Method (NEFT/UPI/cash) | **No** |
| Allocation history | **No** |
| Dedicated audit row | **No** (generic `updatedAt` only) |

### Partial pay

API **allows** `paidInPaise < total` → status stays `OPEN`.  
UI Mark paid always sends full PAID (defaults to `totalInPaise`).  
Partial is possible via API, not via primary UI.

### Business fact proven today

**Mark paid proves an admin operational assertion that the bill is considered paid (or partially paid via API), not that money left a bank/cash account.**

It is **not** accounting-grade payment evidence. Phase 3B correctly refuses to journal from it.

---

## 3. Vendor Payment Model Design

### New model required: yes

Recommend **`AccountingVendorPayment`** (or `VendorPayment` under purchases with accounting posting ownership — see §17). Conceptual fields:

| Field | Purpose |
|-------|---------|
| id | UUID |
| paymentNumber | Unique, sequence-generated |
| vendorId | FK Vendor |
| paymentDate | Authoritative accounting date |
| amountInPaise | Gross payment (integer) |
| currency | INR V1 |
| paymentMethod | Enum (not free-text) |
| bankAccountCode | CoA code `1010` / `1000` (or accountId FK) |
| utr / reference | Optional/required by policy |
| notes | Free text |
| status | DRAFT / POSTED / VOID |
| postingEventId / journalEntryId | Optional links |
| sourcePayloadHash | Change detection |
| createdAt / updatedAt | Audit |
| createdByUserId | If auth pattern available |

### Ownership recommendation: **Hybrid (C)**

| Option | Verdict |
|--------|---------|
| A. Purchases-only | Natural UX, weak money controls |
| B. Accounting-only | Strong controls, awkward vendor/bill UX |
| **C. Hybrid** | **Recommended:** Purchases admin UI + **accounting-owned tables + posting**; purchases Mark paid remains ops-only |

Safer for Sarveda: money movement and journals stay in accounting domain; bill UX stays in purchases.

The document represents **actual money movement**, not bill status.

---

## 4. Payment Allocation Design

### `AccountingVendorPaymentAllocation` (conceptual)

| Field | Rule |
|-------|------|
| paymentId | FK payment |
| vendorBillId | FK bill |
| amountInPaise | > 0 |
| Unique (paymentId, vendorBillId) | One row per bill per payment |

### Invariants

1. `sum(allocations) ≤ payment.amountInPaise`  
2. Each allocation ≤ bill outstanding  
   `outstanding = totalInPaise − sum(posted native payment allocations)`  
   (**not** ops `paidInPaise` as authority)  
3. Bill.vendorId === Payment.vendorId  
4. No negatives; integer paise  
5. Persist payment + allocations in **one DB transaction**  
6. Overpayment / unallocated remainder: fail-closed or Vendor Advance (§6) — V1 prefer **fail-closed** unless advance explicitly enabled  

### Outstanding (native)

```
nativeOutstanding = VENDOR_BILL_POSTED AP credit
                  − sum(VENDOR_PAYMENT_MADE allocations to bill)
```

Ops `paidInPaise` remains informational variance in Recon V5.

---

## 5. AP Payment Journal

### Canonical journal

```
Dr 2000 Accounts Payable     allocatedTotal
    Cr 1010 Bank / 1000 Cash   allocatedTotal
```

(If payment amount > allocated and advance deferred: do not post remainder to Bank incorrectly — either allocate fully or fail.)

### Granularity: **A — one journal per payment document**

| Option | Note |
|--------|------|
| **A. One journal per payment** | Matches one bank UTR / one cash outlay; preferred |
| B. One journal per bill allocation | Splits one bank txn into many journals; harder bank recon |

**Prefer A.** Preserve allocation traceability via:

- journal memo / payload JSON with allocation breakdown  
- `AccountingDocumentLink` to payment **and** each bill  
- optional multiple AP debit lines (same account, different memos) if clearer for audit  

---

## 6. Vendor Advance Design

### Need?

No advance / prepayment workflow exists in current purchases code. Overpay is not a first-class UX.

### Recommendation for V1

**Defer Vendor Advances.** Fail closed if:

`sum(allocations) < payment.amountInPaise` without explicit `allowAdvance=true` feature  

or require full allocation before POSTED.

Later (optional CoA):

```
Dr 1220 Vendor Advances (ASSET)
    Cr 1010 Bank
…
Dr 2000 AP
    Cr 1220 Vendor Advances
```

Do **not** add 1220 until a real advance workflow ships.

---

## 7. Bank / Cash Mapping

### Current CoA

- `1000` Cash  
- `1010` Bank  

Sufficient for Phase 3C V1 **if** payment method maps deterministically.

### Do not use free-text for GL

`Expense.paidThrough` is free-text (`"ICICI Bank"`). Unsafe as sole Cr account selector.

### Recommended V1 mapping

| Mechanism | Use |
|-----------|-----|
| **Enum `paymentMethod`** | `BANK_TRANSFER \| UPI \| CHEQUE \| CASH \| CARD` |
| **Fixed map** | BANK_* → `1010`; CASH → `1000`; CARD → `1010` (or defer CARD) |
| Optional later | Admin picks `AccountingAccount` id |

### Legacy Expense.paidThrough

Keep column for UX/display. For posting:

1. Prefer new optional `paidAccountCode` / `paymentMethod` fields (additive)  
2. Else mapping table free-text → CoA (admin-maintained)  
3. Else **`PAYMENT_ACCOUNT_UNMAPPED`** — preview OK, post blocked  

Never invent Cr Bank from nonempty free-text alone without map.

---

## 8. Current Expense Flow

### Schema (`Expense`)

| Field | Notes |
|-------|-------|
| status | `DRAFT` \| `RECORDED` (default **RECORDED**) |
| expenseAccount | **Free-text** |
| amountInPaise | Required |
| taxInPaise, taxInclusive | Present |
| paidThrough | Free-text optional |
| vendorId | Optional |
| invoiceNumber, referenceNumber | Optional |
| expenseType | GOODS \| SERVICES |
| hsnSac, gstTreatment, source/destination, reverseCharge | Present; lightly used |
| No void/delete API | Update only; no VOID status |

### Create path

`POST /expenses` → defaults `status: RECORDED`.  
UI (`expenses/page.tsx`) records amount, account text, paidThrough, optional vendor/invoice — no DRAFT workflow in UI.

### Authoritative event

**`EXPENSE_RECORDED`** when `status === RECORDED` **and** mappings exist for expense CoA + payment account **and** paid semantics confirmed.

### Paid vs unpaid

**Model cannot distinguish unpaid payable expense vs paid expense.**  
`paidThrough` empty ≠ unpaid; filled ≠ proven bank movement.

**Phase 3C scope boundary:**

- V1: treat RECORDED + mapped payment account as **immediately paid** expense (cash/bank out)  
- Unpaid / AP-from-expense: **defer** (use VendorBill for payables)  
- If `paymentMethod` / account missing → block post (`PAYMENT_ACCOUNT_UNMAPPED`)

---

## 9. Expense Double-Count Protection

### Risk

Same supplier invoice as `VendorBill` **and** `Expense` → expense + AP for one economic event.

### Detection (preview / recon)

Same vendor (or expense.vendorId matches bill.vendorId) **and** normalized invoice/ref (`invoiceNumber` / `referenceNumber` / bill `referenceNumber`) **and** amount within tolerance **and** dates within ±N days.

Statuses:

- `POSSIBLE_DUPLICATE_BILL_EXPENSE` (warn)  
- `DUPLICATE_SUPPLIER_DOCUMENT` (block auto-post when high confidence)

### Hard rule

One economic supplier invoice must **not** create both:

- `VENDOR_BILL_POSTED` and  
- `EXPENSE_RECORDED`  

unless explicitly documented as **separate** transactions (manual override flag — rare).

Prefer: trade/inventory → Bill; opex without bill → Expense.

---

## 10. Expense CoA Mapping

Free-text `expenseAccount` is **not** safe for GL.

### Recommended V1: **D + C hybrid**

1. Additive optional `expenseAccountCode` (CoA code) on Expense **or**  
2. Mapping table: normalized free-text → CoA code (admin curated)  
3. Posting requires resolved CoA  

If unresolved:

- Preview allowed  
- Post blocked: **`EXPENSE_ACCOUNT_UNMAPPED`**  
- **Do not** silently dump all to `5300`

Hard-coded A alone is too rigid; B (selector) is best UX long-term; ship selector + optional map for legacy rows.

---

## 11. Expense Journal Design

### Immediately paid (V1 only)

```
Dr {mapped expense CoA}     net expense (policy for taxInclusive)
Dr Input GST                provisional if permitted
    Cr 1010/1000            gross cash/bank out
```

Must balance in paise.

### Unpaid

Do **not** Cr Bank because `paidThrough` has text.  
Defer unpaid expense-as-AP (use VendorBill).

### taxInclusive

If `taxInclusive=true`: extract tax from `amountInPaise` using rate/taxInPaise consistency checks; fail closed on inconsistency.

---

## 12. Input GST

Reuse Phase 3B principles:

| Need | Expense |
|------|---------|
| Tax > 0 | Require evidence |
| Vendor GSTIN (if vendor set) | Prefer |
| Invoice/reference | Prefer |
| Jurisdiction | source/destination or vendor state vs `SELLER_STATE` |
| ITC status | `UNVERIFIED_PENDING_TAX_INVOICE` |

Insufficient → `GST_DATA_GAP` fail-closed for tax-bearing posts (same as bills), or explicit gross-to-expense policy documented — **prefer fail-closed**.

---

## 13. Reverse Charge

`Expense.reverseCharge` / PO/Bill flags exist; **no RCM journal logic** in purchases or accounting code today.

**Defer RCM.** If `reverseCharge=true` on candidate post → `RCM_DATA_GAP` / skip auto-post until designed (Output RCM liability + Input with eligibility rules).

Do not invent RCM journals from a boolean alone.

---

## 14. Accounting Event Catalogue

### `VENDOR_PAYMENT_MADE`

| Attribute | Definition |
|-----------|------------|
| Source | AccountingVendorPayment status POSTED |
| Trigger | Explicit post after DRAFT save + allocations |
| Date | `paymentDate` |
| Unique key | `vendor_payment:{paymentId}` |
| Money | amountInPaise; allocation rows |
| Credit | Mapped bank/cash CoA |
| Debit | 2000 AP (= sum allocations) |
| Idempotency | DB unique (eventType, uniqueKey) |
| **Not** sourced from | VendorBill.status=PAID |

### `EXPENSE_RECORDED`

| Attribute | Definition |
|-----------|------------|
| Source | Expense RECORDED |
| Trigger | Discovery/post when mappings complete |
| Date | `expenseDate` |
| Unique key | `expense:{expenseId}` |
| Debit | Mapped expense CoA (+ Input GST) |
| Credit | Mapped bank/cash |
| Block if | unmapped account, unmapped payment, duplicate bill, RCM, GST gap |

---

## 15. Numbering / Identity

Prefer **`AccountingSequence`** (DB-atomic, yearMonth) already used for journals:

Example: prefix `VP`, type `VENDOR_PAYMENT` → `VP-202608-00001`

Alternative: purchases-number style (`VP-#####`) — weaker month partitioning.

**Requirements:** DB-atomic, unique, auditable, no in-memory counters.

Expense already has UUID; optional `EXP-` display number later — not required for event key.

---

## 16. Edit / Void / Reversal Policy

### After POSTED payment or expense journal

| Action | Allowed? |
|--------|----------|
| Edit amount / bank / allocations | **No** silent |
| Delete | **No** |
| Void | Status VOID + **reversal journal** (follow-up) |
| Correction | Reverse then new document |

Statuses: `DRAFT` → `POSTED` → `VOID` (with reversal).

Detect `SOURCE_CHANGED_AFTER_POST` via fingerprint (mirror Phase 3B bills).

Reversal implementation may be Phase 3C1.1 / 3C2.1 if needed; architecture requires the policy now.

---

## 17. Domain Ownership

**Hybrid (recommended):**

| Concern | Owner |
|---------|--------|
| List open bills, allocate UI | Purchases admin |
| VendorPayment + Allocation tables | Accounting module / Accounting* models |
| Posting events / journals / recon | Accounting |
| Mark paid | Purchases ops (unchanged; flags OFF ignore) |
| Expense CRUD | Purchases; posting in accounting |

Keeps stock/PO/receipt free of payment GL side effects.

---

## 18. Historical Paid Bills

Many bills may be `PAID` / `paidInPaise > 0` with **no** payment document.

| Option | Assessment |
|--------|------------|
| A. Opening AP/payment adjustment | Good at cutover |
| B. Synthetic VendorPayment | **Only** if bank statement/UTR exists — rare |
| **C. Leave native AP outstanding** until opening-balance / 3C3 | **Safest default** |

Recon continues: `OPS_MARKED_PAID_NO_ACCOUNTING_PAYMENT` / `OPS_PAID_NATIVE_UNPAID`.

**Do not fabricate bank history** from Mark paid.

---

## 19. Historical Expense Migration

Classify before any backfill:

| Class | Meaning |
|-------|---------|
| POSTABLE | CoA + payment account mapped; GST OK or zero |
| NEEDS_ACCOUNT_MAPPING | free-text only |
| NEEDS_PAYMENT_MAPPING | no bank/cash map |
| GST_DATA_GAP | tax without evidence |
| DUPLICATE_RISK | matches VendorBill |

**Do not auto-post all historical expenses.** Forward-only + curated mapping first.

---

## 20. Document / Audit Requirements

| Document | Phase 3C minimum | Later (3E) |
|----------|------------------|------------|
| VendorPayment | UTR/reference **recommended**; optional for cash small amounts by policy | Payment advice PDF |
| Expense | Invoice # preferred for GST | S3 attachment for ITC |
| Links | `AccountingDocumentLink` PAYMENT / EXPENSE / BILL | — |

Attachments **not required to start 3C1**; required before ITC claim workflows.

---

## 21. CoA Gap Review

### Already sufficient for V1

1000, 1010, 2000, 2200–2202, 5300 (+ other expense codes as mapped).

### Do not add yet unless workflow exists

| Account | When |
|---------|------|
| Vendor Advances | Advance payments enabled |
| Credit Card Payable | Card clearing workflow |
| Employee Reimbursements Payable | Reimburse module |
| Bank Charges | Separate fee bills |
| RCM liability/input | RCM implementation |

---

## 22. Reconciliation V5 Design

Lifecycle:

```
VendorBill → VENDOR_BILL_POSTED (AP)
          → VendorPayment allocations → VENDOR_PAYMENT_MADE
          → Bank/Cash
```

### Per bill

Bill total, native AP, payments allocated, outstanding, ops `paidInPaise`, native payment total, variance, payment refs/UTR, bank/cash, status.

**Statuses:** `UNPAID` | `PARTIALLY_PAID` | `PAID` | `OPS_PAID_NATIVE_UNPAID` | `NATIVE_PAID_OPS_MISMATCH` | `OVERPAID` | `DATA_GAP` | `ERROR`

### Per expense

Document, mapped CoA, tax, payment account, journal, duplicate-bill risk, status (`POSTED` / `UNMAPPED` / `DUPLICATE_RISK` / …).

---

## 23. Admin UX Design

### Vendor Payments

1. New Payment → Vendor  
2. Open bills (native outstanding)  
3. Allocate amounts  
4. Method → Bank/Cash  
5. Date, UTR/reference  
6. Preview journal  
7. Save DRAFT / Post  

Mark paid UI **remains** for ops; show banner: “does not create native payment.”

### Expenses

1. Existing create/edit  
2. Select CoA (or map free-text)  
3. Select payment account / method  
4. Preview → Post shadow  

Flags OFF: UX identical to today.

---

## 24. Feature Flags

| Flag | Default |
|------|---------|
| `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED` | OFF |
| `ACCOUNTING_EXPENSE_POSTING_ENABLED` | OFF |
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | Existing (bills) |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | Dual gate |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` | Bulk history |

Keep payment and expense flags **separate**.

---

## 25. Safety Risks

| Risk | Mitigation |
|------|------------|
| Journal from Mark paid | Forbidden; events only from VendorPayment |
| Free-text bank Cr | Mapping required |
| Free-text expense Dr | Mapping required |
| Bill+Expense double | Detection + block |
| Regress stock/PO/receipt | No hooks in receive path |
| Regress Mark paid UX | Keep API; accounting ignores |
| Fabricated historical payments | Opening balance / leave AP |
| Concurrent double pay | Unique event key + allocation tx |

**Core rule:** Existing purchases/commerce keep working with accounting payment/expense flags OFF.

---

## 26. Recommended Implementation Slices

### Phase 3C1 — VendorPayment + AP settlement shadow

- AccountingVendorPayment + Allocation models (additive)  
- Numbering via AccountingSequence  
- `VENDOR_PAYMENT_MADE` builder/post/discovery  
- Admin payment UI  
- Do **not** remove Mark paid  

### Phase 3C2 — Expense mapping + EXPENSE_RECORDED

- CoA + payment account mapping  
- Double-count checks vs bills  
- Expense preview/post  
- RCM defer  

### Phase 3C3 — Recon V5 + historical policy

- Bill payment aging vs ops paid  
- Expense classification  
- Opening AP guidance (no fake UTRs)  

---

## 27. Required Tests (future)

### Vendor payments

1. Full one bill  
2. Partial  
3. One payment → many bills  
4. Many payments → one bill  
5. Over-allocation blocked  
6. Wrong vendor blocked  
7. Duplicate post  
8. 20 concurrent → 1 journal  
9. Bank Cr 1010  
10. Cash Cr 1000  
11. Missing UTR policy  
12. paymentDate  
13. Closed period  
14. Void/reversal required  
15. Mark paid alone → **no** journal  
16. Historical PAID → no fabricated payment  
17. AP outstanding recon  
18. Production dual guard  
19. No commerce/stock mutation  

### Expenses

20. Mapped opex  
21. Unmapped free-text blocked  
22–23. Bank/cash  
24–26. GST cases  
27. taxInclusive  
28. reverseCharge deferred  
29. Duplicate bill/expense warning  
30. DRAFT no post  
31. RECORDED post  
32. Source changed after post  
33. Duplicate discovery  
34. Feature flag  
35. Existing Expense CRUD unchanged with flag OFF  

---

## 28. Explicit Files Inspected

- `backend/prisma/schema.prisma` — VendorBill, Expense, AccountingSequence, CoA  
- `backend/src/modules/purchases/purchases.service.ts` — `markBillPaid`, receive (unchanged for 3C)  
- `backend/src/modules/purchases/purchases.handlers.ts` — bill update / expense CRUD  
- `backend/src/modules/purchases/purchases.routes.ts`  
- `backend/src/modules/purchases/purchases-number.ts`  
- `backend/src/modules/accounting/accounting-sequence.ts`  
- `backend/src/modules/accounting/seed-coa.ts`  
- `backend/src/modules/accounting/vendor-bill-*.ts` / Phase 3B recon (AP unpaid semantics)  
- `frontend/app/admin/purchases/bills/page.tsx` — Mark paid  
- `frontend/app/admin/purchases/expenses/page.tsx`  
- `frontend/lib/purchases-api.ts`  
- `SARVEDA_ACCOUNTING_PHASE3A_PURCHASES_ARCHITECTURE.md` / `PHASE3B_VENDOR_BILL_AP_SHADOW.md` (context)

---

## 29. Code Modification Statement

```
CODE MODIFICATIONS: NONE
SCHEMA CHANGES: NONE
MIGRATIONS: NONE
DB WRITES: NONE
VENDOR PAYMENTS: NONE
EXPENSE POSTING: NONE
STOCK CHANGES: NONE
ZOHO WRITES: NONE
PHASE 3D: NONE
```

This document is architecture / analysis only.

---

READY FOR PHASE 3C IMPLEMENTATION
