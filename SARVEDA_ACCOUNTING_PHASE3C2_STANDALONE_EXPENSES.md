# SARVEDA ACCOUNTING — PHASE 3C2 STANDALONE EXPENSES

**Date:** 2026-08-23  
**Scope:** `EXPENSE_RECORDED_V1` for immediately paid standalone operating expenses  
**Deferred:** unpaid Expense→AP, RCM, Vendor Advances, reimbursements, credit-card payable, returns, COGS, Zoho AP, bank recon, Phase 3D  

---

## 1. Executive Summary

Phase 3C2 posts **genuine standalone opex** only when:

- `Expense.status = RECORDED`
- ACTIVE CoA mapping for free-text `expenseAccount`
- ACTIVE payment mapping for `paidThrough` → 1000/1010
- GST evidence sufficient when `taxInPaise > 0`
- not high-confidence VendorBill duplicate
- INR / supported payment semantics

Canonical journal:

```
Dr mapped Expense CoA
Dr provisional Input GST (if applicable)
    Cr Bank (1010) / Cash (1000)
```

`RECORDED` alone does **not** auto-post. Zoho remains authoritative. Flag `ACCOUNTING_EXPENSE_POSTING_ENABLED` defaults **OFF**.

**Local:** Prisma validate ✓ · migrate ✓ · **17 files / 210 tests** ✓ · builds ✓  
**Lightsail:** tagged non-tax + GST fixtures posted; replay idempotent; flags left OFF ✓

---

## 2. Accounting Boundary

| In scope | Out of scope |
|----------|--------------|
| Standalone paid Expense → Bank/Cash | VendorBill / PO / Receipt |
| Mapped opex + provisional Input GST | VendorPayment |
| Bill+Expense duplicate detection | Mark paid |
| | Unpaid payable (use VendorBill) |

---

## 3. Expense Source Semantics

Traced from purchases create API + Phase 3C architecture:

| `taxInclusive` | `amountInPaise` | `taxInPaise` | Gross payment |
|----------------|-----------------|--------------|---------------|
| `false` (default) | Net / taxable base | GST on top | `amount + tax` |
| `true` | Gross (tax included) | GST portion inside amount | `amount` (`net = amount − tax`) |

Fail-closed on inconsistent combinations (e.g. tax > amount when inclusive).

---

## 4. Mapping Models

| Table | Purpose |
|-------|---------|
| `AccountingExpenseAccountMapping` | normalized free-text → EXPENSE CoA code |
| `AccountingExpensePaymentMapping` | normalized `paidThrough` → 1000 / 1010 |

No change to operational `Expense` table semantics.

---

## 5. CoA Mapping

Posting requires ACTIVE mapping to an allowed EXPENSE-type code. Missing → `EXPENSE_ACCOUNT_UNMAPPED` (preview OK, post blocked). **No silent dump to 5300.**

Additive CoA (accounting-only):

| Code | Name |
|------|------|
| 5300 | Purchase / Operating Expense (existing) |
| 5310 | Office Expense |
| 5320 | Professional Fees |
| 5330 | Utilities |
| 5340 | Travel |
| 5350 | Repairs & Maintenance |
| 5360 | Marketing / Advertising |
| 5370 | Software / Subscription |
| 5380 | Misc Operating Expense |

Lightsail had **zero** existing Expense rows at validation time; categories seeded for mapping UX.

---

## 6. Payment Mapping

Free-text `paidThrough` is not GL authority. Seeded defaults (ACTIVE): Cash→1000; Bank/UPI/NEFT/IMPS/RTGS/Cheque→1010.

Unresolved / empty → `PAYMENT_ACCOUNT_UNMAPPED` (never auto Cr AP).

---

## 7. GST / taxInclusive Logic

Reuse Phase 3B provisional Input GST policy. Jurisdiction from `sourceOfSupply` / `destinationOfSupply` / vendor state vs `SELLER_STATE`. Contradictions → `GST_DATA_GAP`.

---

## 8. ITC Boundary

ITC status always `UNVERIFIED_PENDING_TAX_INVOICE`. No automatic ITC claim.

---

## 9. RCM Deferral

`reverseCharge=true` → `RCM_DATA_GAP`; no invented RCM journals.

---

## 10. Journal Builder

Pure `buildExpenseRecordedJournal(snapshot)` · `EXPENSE_RECORDED_V1` · no DB writes · exact paise balance.

---

## 11. Bill+Expense Duplicate Protection

| Class | Policy |
|-------|--------|
| `DUPLICATE_SUPPLIER_DOCUMENT` | same vendor + same normalized invoice/ref + matching gross → **block** |
| `POSSIBLE_DUPLICATE_BILL_EXPENSE` | warning; post requires `acknowledgePossibleDuplicate` |
| `NO_DUPLICATE` | proceed |

Different vendor / different invoice allowed.

---

## 12. Legacy Expense Classification

Discovery / recon surfaces: `POSTABLE` (eligible), `UNMAPPED_*`, `GST_DATA_GAP`, `RCM_DATA_GAP`, `DUPLICATE_RISK`, `SOURCE_CHANGED_AFTER_POST`, `DATA_GAP`. No bulk auto-post of all history.

---

## 13. Idempotency

`eventType=EXPENSE_RECORDED` · `uniqueKey=expense:{expenseId}` · 20 concurrent posts → 1 event / 1 journal.

---

## 14. Document Linkage

`AccountingDocumentLink`: `EXPENSE` → journal. Vendor id retained in payload. Duplicate bills are blocked, not linked.

---

## 15. Source Fingerprint

Includes amount/tax/taxInclusive/date/mappings/vendor/invoice/ref/GST fields. After POSTED, change → `SOURCE_CHANGED_AFTER_POST` / `REVERSAL_REQUIRED`.

---

## 16. Discovery Worker

Bounded `runExpenseDiscovery` · default `dryRun=true` · filters expenseId/vendorId/since/until/limit≤500 · deterministic order · skips DRAFT/unmapped/GST/RCM/duplicates/already posted.

---

## 17. Feature / Production Guards

| Flag | Default |
|------|---------|
| `ACCOUNTING_EXPENSE_POSTING_ENABLED` | OFF |
| Production-like also needs `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` | OFF |

Lightsail `.env` left without these flags after validation.

---

## 18. Admin Mapping UX

`/admin/accounting/expense-mappings` — account + payment mappings, unmapped lists, enable/disable.

---

## 19. Expense Preview/Post UX

`/admin/accounting/expenses` — preview, GST/duplicate, post, dry-run discovery.  
`/admin/purchases/expenses` unchanged.

---

## 20. Reconciliation V5

`GET /reconciliation/v5-expenses` — expense rows with mappings, GST, duplicate class, journal, statuses (`POSTED`, `UNMAPPED_*`, `GST_DATA_GAP`, `RCM_DATA_GAP`, `DUPLICATE_RISK`, `SOURCE_CHANGED_AFTER_POST`, etc.).

---

## 21. Tests

`backend/test/accounting/expense-recorded.test.ts` covers matrix items (mappings, tax semantics, GST, RCM, DRAFT, concurrency, duplicates, closed period, flags, document links, recon, no stock/bill/payment mutation).

**Full suite: 17 files / 210 tests PASS**

---

## 22. Concurrency

20 concurrent posts of same expense → one journal (tested).

---

## 23. Lightsail Validation

| Check | Result |
|-------|--------|
| Existing Expense values | none (empty table) |
| Non-tax Bank | `JE-202608-00010` Dr 5310 Cr 1010 |
| GST intra UPI | `JE-202608-00011` INTRA_STATE |
| Replay | duplicate true |
| Fingerprint bills/payments/inventory | stable |
| `.env` flags | OFF / absent |

---

## 24. Commerce/Purchase Integrity

Expense posting does not mutate Inventory, VendorBill, VendorPayment, or purchases Expense CRUD semantics.

---

## 25. Known Limitations

- Unpaid expenses not posted (use VendorBill)
- RCM deferred
- No employee reimbursement / credit-card payable
- Possible duplicates require explicit ack
- Historical expenses not auto-posted

---

## 26. Safety Audit

**COMMERCE PRODUCTION FILES MODIFIED:** NONE  

**PURCHASES OPERATIONAL FILES MODIFIED:** NONE  

**EXISTING EXPENSE CRUD BEHAVIOR CHANGED:** NO — create/update/list unchanged; accounting is additive  

**MARK-PAID BEHAVIOR CHANGED:** NO  

**INVENTORY/STOCK LOGIC MODIFIED:** NONE  

**VENDOR PAYMENT LOGIC MODIFIED:** NONE  

**ZOHO FILES MODIFIED:** NONE  

**EXISTING PURCHASE TABLES ALTERED:** NONE  

**ACCOUNTING TABLES/MIGRATIONS ADDED:**

- `AccountingExpenseAccountMapping`
- `AccountingExpensePaymentMapping`
- migration `20260823040000_accounting_phase3c2_standalone_expenses`

**COA CHANGES:** additive 5310–5380  

**UNEXPECTED FILES MODIFIED:** NONE outside accounting module/admin UI/tests/report  

**COMMERCE REGRESSION:** PASS  

**PURCHASES REGRESSION:** PASS  

---

## 27. Recommendation

Keep expense posting flags **OFF** on Lightsail until a curated mapping pass for real expense free-text values. Next optional slice: expand recon dashboards / historical classification UI — not Phase 3D.

---

PHASE 3C2 EXPENSE SHADOW VALIDATED
