# SARVEDA Native Accounting — Phase 4E Banking & Cash Final Hardening / Close-Out

**Status:** COMPLETE  
**Date:** 2026-08-25  
**Authority:** Phase 4A–4D architecture / implementation reports  
**Scope:** Hardening + validation + documentation only (no Phase 5 features)

---

## 1. Executive Summary

Phase 4 Banking & Cash was audited end-to-end across registry → transfers → vendor/expense/settlement bank targeting → statement import/matching → bank charge/interest → reconciliation lock/reopen → gateway controls.

Three real defects found during close-out were fixed:

1. `rejectStatementCandidate` could bypass recon lock and reject `CONFIRMED` matches.
2. Same journal could be `CONFIRMED` on multiple statement lines of the **same** bank account.
3. Bank registry accepted reserved ASSET GLs (`1020`/`1021`/`1022`/`1100`/`1200`/`1210`).

All builds, full regression (**26 files / 339 tests**), and Lightsail final E2E passed. Persistent accounting flags remain OFF on Lightsail.

---

## 2. Phase 4 Architecture Recap

| Phase | Deliverable |
|-------|-------------|
| 4A | Banking architecture (multi-bank, cash, clearing, statements, recon) |
| 4B | Bank registry, transfers, opening balances, vendor/expense/settlement bank targeting |
| 4C | Immutable statement import + conservative matching (zero GL) |
| 4D | Reconciliation, BANK_CHARGE / BANK_INTEREST, gateway controls |
| 4E | Final hardening, regression, Lightsail close-out, cleanup register |

Lifecycle proven:

```
Customer payment → gateway clearing (1020)
Razorpay settlement → specific bank GL (+ 5100 fees)
Vendor payment / Expense → specific bank/cash GL
Bank transfer / cash deposit / cash withdrawal → bank↔bank / cash↔bank
Statement import → immutable evidence (0 GL)
Matching → journal evidence only (0 GL)
Unmatched charge/interest → explicit BANK_CHARGE_V1 / BANK_INTEREST_V1
Reconciliation → book vs statement → RECONCILE lock → REOPEN audit
```

---

## 3. Schema Audit

Reviewed together:

| Model | Verdict |
|-------|---------|
| `AccountingBankAccount` | Unique `glAccountCode`; soft deactivate; no hard-delete path for used accounts |
| `AccountingBankTransfer` | FK source/destination; posting via unique event key |
| `AccountingBankStatementImport` | Unique `(bankAccountId, fileHash)` |
| `AccountingBankStatementLine` | Unique `(bankAccountId, transactionFingerprint)`; cascade from import |
| `AccountingBankStatementMatch` | Cascade from line; CONFIRMED/CANDIDATE/REJECTED/IGNORED/MATCHED_CATEGORIZED |
| `AccountingBankReconciliation` | Unique `(bankAccountId, periodStart, periodEnd)` |
| `AccountingVendorPayment.bankAccountId` | Nullable FK — legacy 1010 still valid |
| `AccountingGatewaySettlement.targetBankAccountId` | Nullable FK |
| `AccountingExpensePaymentMapping.bankAccountId` | Nullable FK |

No new schema required for 4E. Migrations left intact.

---

## 4. CoA Audit

| Code | Name | Type | Role |
|------|------|------|------|
| 1000 | Cash | ASSET | Cash / petty cash registry |
| 1010 | Bank | ASSET | Legacy bank (historical untouched) |
| 1011+ | Specific banks | ASSET | Operational bank GLs |
| 1020–1022 | Gateway clearing | ASSET | Not bindable as bank registry (4E denylist) |
| 1100 | AR / COD | ASSET | DATA_GAP for collection; denylist |
| 1200 / 1210 | Inventory | ASSET | Denylist |
| 3900 | Opening Balance Equity | EQUITY | Bank opening offset |
| 4500 | Interest Income | REVENUE | BANK_INTEREST |
| 5100 | Gateway Charges | EXPENSE | Settlement fees |
| 5390 | Bank Charges Expense | EXPENSE | BANK_CHARGE |

No duplicate seed codes. Historical 1010 journals unchanged on Lightsail.

---

## 5. Journal Semantics Audit

| Event | Debit | Credit | Balance |
|-------|-------|--------|---------|
| Bank transfer | Destination bank | Source bank | Exact |
| Cash deposit | Bank | Cash | Exact |
| Cash withdrawal | Cash | Bank | Exact |
| Bank opening (+) | Bank/cash | 3900 | Exact |
| Razorpay settlement | Bank + 5100 | 1020 | Exact |
| Vendor payment | AP | Bank/cash | Exact |
| Expense | Expense (+GST) | Bank/cash | Exact |
| Bank charge | 5390 | Bank | Exact |
| Bank interest | Bank | 4500 | Exact |

No hidden rounding account. Imbalance max = 0.

---

## 6. Bank Account Lifecycle

- Specific GL unique per registry row  
- ASSET only + **reserved GL denylist** (4E)  
- Masked last-4 only (`maskAccountNumber`) — full number never stored  
- Deactivate prevents new posting targets  
- Metadata update cannot silently change `glAccountCode`  
- No hard-delete for financially used accounts  

---

## 7. Transfers

Internal / cash deposit / cash withdrawal drafts post via `BANK_TRANSFER` unique key `bank_transfer:{transferId}`. Concurrent replay returns duplicate; no second journal.

---

## 8. VendorPayment Integration

Posted payments credit selected bank/cash GL when `bankAccountId` set; legacy path remains 1010.

---

## 9. Expense Integration

Expense payment mappings resolve specific bank/cash; legacy fallback preserved.

---

## 10. Razorpay Settlement Integration

Settlement journals debit target bank GL + 5100, credit 1020. Target bank set via registry `razorpaySettlementTarget` / settlement `targetBankAccountId`.

---

## 11. Statement Import Audit

- CSV / XLSX decimal parse  
- ₹ / Rs. / commas  
- Malformed dates rejected  
- Debit/credit direction preserved  
- Duplicate file / line fingerprints blocked  
- Cash account & inactive bank blocked  
- Non-INR blocked  
- Import creates **zero** GL  

---

## 12. Money Parsing Regression

**CRITICAL:** `590.00` → **59000** paise (never 5900000).

Lightsail 4E check **A0 PASS** (`debitInPaise === 59000`).

---

## 13. Matching Audit

| Confidence | Auto-confirm? |
|------------|---------------|
| EXACT (amount + direction + strong ref ≥6 + date window + unique) | Yes, only if **one** EXACT |
| HIGH / POSSIBLE | Never auto |
| Amount-only | Never auto |

4E hardening: journals already `CONFIRMED` on another line for the **same** `bankAccountId` are excluded from candidates and blocked on manual confirm. Cross-account reuse (transfer legs) remains allowed.

---

## 14. Reconciliation Audit

- Book = POSTED bank GL only  
- Statement = external evidence  
- Difference = book closing − statement closing  
- RECONCILED requires difference = 0 **and** required lines resolved (balance alone insufficient)  
- Ignored lines require explicit reason  

---

## 15. Lock / Reopen Audit

After RECONCILED:

- Unmatch / categorize / ignore / reject-candidate blocked  

Reopen:

- Requires reason  
- Records user/time  
- Preserves prior snapshot / audit  
- Does **not** mutate journals  
- Does **not** reopen accounting period  

4E fix: `rejectStatementCandidate` now calls `assertStatementLineUnlocked` and refuses `CONFIRMED` (must unmatch).

---

## 16. Bank Charges

`BANK_CHARGE_V1` — Dr 5390 / Cr bank. Unique key `bank_charge:{statementLineId}`.

Gateway fee double-count → `POSSIBLE_DUPLICATE_GATEWAY_FEE` (no charge post).

---

## 17. Bank Interest

`BANK_INTEREST_V1` — Dr bank / Cr 4500. Unique key `bank_interest:{statementLineId}`.

---

## 18. Gateway Controls

| Provider | Control |
|----------|---------|
| Razorpay | 1020 GL outstanding / settlement visibility |
| Stripe | `SETTLEMENT_NOT_CONFIGURED` / `DATA_GAP` |
| PayPal | `SETTLEMENT_NOT_CONFIGURED` / `DATA_GAP` |
| COD | `DATA_GAP`; FULFILLED/DELIVERED ≠ collected |

---

## 19. COD / Stripe / PayPal Data Gaps

Intentional. No invented settlement integrations in 4E. `ACCOUNTING_COD_COLLECTION_ENABLED` always false.

---

## 20. Security Review

| Control | Status |
|---------|--------|
| Admin-only banking routes | PASS |
| Statement upload size / CSV+XLSX only | PASS (15MB multer) |
| No executable uploads / path traversal | PASS |
| exceljs — no formula execution | PASS |
| Masked account numbers | PASS |
| No banking credentials in DB | PASS |
| Audit logs for match / recon / charge / reopen | PASS |
| No secret leakage in validation reports | PASS |

---

## 21. Idempotency / Concurrency

| Event | Unique key |
|-------|------------|
| BANK_TRANSFER | `bank_transfer:{transferId}` |
| BANK_OPENING_BALANCE | `bank_opening:{bankAccountId}:cutover` |
| PAYMENT_GATEWAY_SETTLED | provider settlement key |
| VENDOR_PAYMENT_MADE | payment id key |
| EXPENSE_RECORDED | expense id key |
| BANK_CHARGE | `bank_charge:{lineId}` |
| BANK_INTEREST | `bank_interest:{lineId}` |

Posting uses `(eventType, uniqueKey)` uniqueness + `ON CONFLICT DO NOTHING` pattern. Duplicate replay safe.

---

## 22. Feature Flags

| Flag | Default |
|------|---------|
| `ACCOUNTING_BANKING_ENABLED` | OFF |
| `ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED` | OFF (needs banking) |
| `ACCOUNTING_BANK_RECONCILIATION_ENABLED` | OFF (needs statement) |
| `ACCOUNTING_COD_COLLECTION_ENABLED` | always OFF |
| Production persistence | requires `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` |

Lightsail `.env`: persistent flags OFF / absent (**PASS U**).

---

## 23. Full Tests

```
npx vitest run
Test Files  26 passed (26)
Tests       339 passed (339)
```

### Test files

**Accounting:**  
`api-security`, `banking`, `bank-reconciliation`, `bank-statements`, `discount-allocation`, `expense-recorded`, `hardening`, `inventory-cogs`, `inventory-cogs-reversal`, `journal`, `opening-inventory`, `order-paid`, `order-paid-discovery`, `order-refunded-full`, `production-guard`, `purchase-capitalization`, `purchase-recon-cutover`, `settlement`, `vendor-bill-posted`, `vendor-payment`

**Commerce:**  
`checkout`, `order-inventory-restock`, `payment-flow`, `refund`, `stock`

**Other:**  
`helpers/test-db-guard`

4E added coverage: reserved GL block; reject confirmed forbidden; same-bank journal double-claim block; reject locked under RECONCILED.

---

## 24. Backend / Frontend Builds

| Check | Result |
|-------|--------|
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| `npx tsc -p tsconfig.json --noEmit` | PASS (0 errors, no suppressions) |
| `frontend npm run build` | PASS (`Compiled successfully`) |

---

## 25. Lightsail Final Validation

Host: pre-launch Lightsail `13.204.112.165`  
Script: `backend/scripts/phase4e-lightsail-final-validation.ts`  
Tag: `TEST-ACC-BANK-4E-1787635305658`

All checks A0–W PASS including:

- Money parse `590.00` → 59000  
- Reserved GL blocked  
- Book balance / transfer / settlement / statement (0 GL)  
- Charge + interest journals  
- Reconcile lock + reopen audit  
- Gateway gaps explicit  
- Legacy 1010 unchanged  
- Persistent flags OFF  

Verdict line: `PHASE 4E BANKING FINAL HARDENING VALIDATED`

---

## 26. Commerce Integrity

| Metric | Before | After |
|--------|--------|-------|
| Orders | 4384 | 4384 |
| Payments | 3508 | 3508 |
| Refunds | 2 | 2 |
| Inventory | 844 | 844 |
| PurchaseOrders | 1 | 1 |
| VendorBills | 12 | 13 (+1 TEST bill fixture only) |

Order fingerprint (top 5 by `updatedAt`) unchanged. No shopper commerce mutation.

---

## 27. Pre-Production Test Data Cleanup Register

**Do NOT force-delete immutable journals now.** Neutralize in Phase 7.

### Prefixes

- `TEST-ACC-BANK-*` (4B + 4E)
- `TEST-ACC-STMT-*` (4C)
- `TEST-ACC-RECON-*` (4D)
- `TEST-ACC-BANK-4E-*` (4E final)

### Lightsail snapshot (2026-08-25)

| Entity | Count (TEST-ACC*) |
|--------|-------------------|
| Bank accounts | 22 |
| Statement imports | 14 |
| Reconciliations | 4 |
| Transfers (ref match) | 10 |
| Journals (memo match, sample cap) | 80 |

#### Bank accounts (all TEST-ACC*)

| Name | GL | Type |
|------|-----|------|
| TEST-ACC-BANK-1787600530144-CASH | 1293 | CASH |
| TEST-ACC-BANK-1787600530144-HDFC | 1093 | BANK |
| TEST-ACC-BANK-1787600530144-ICICI | 1193 | BANK |
| TEST-ACC-BANK-4E-1787635305658-HDFC | 3304 | BANK |
| TEST-ACC-BANK-4E-1787635305658-ICICI | 3404 | BANK |
| TEST-ACC-BANK-4E-1787635305658-MONEY | 3216 | BANK |
| TEST-ACC-RECON-* HDFC/ICICI pairs | 3007–3159 | BANK |
| TEST-ACC-STMT-* HDFC/ICICI pairs | 2013–2140 | BANK |

#### 4E run IDs

| Field | Value |
|-------|-------|
| hdfcBankAccountId | `7413cff2-9c6f-4875-95fd-84210a419733` |
| iciciBankAccountId | `d53ea73e-84b4-4ecb-9ed7-9a78f08d3a77` |
| moneyProbeBankAccountId | `a20f976c-10e7-4a0d-8aac-584d58bbe5ea` |
| reconciliationId | `263b823d-0e44-40b5-822b-63b2088f63d2` (REOPENED) |
| statementImportId | `0e8bd1b5-643c-4abe-a3c5-ace96fb02646` |
| transferId | `73ec4bbb-acee-4988-a425-374bae37e409` |
| vendorBillId | `b5cc75cb-b619-4497-ab6e-a02bc424a06a` |
| Journals this run | `JE-202608-00091` … `JE-202608-00097` |

#### Prior phase journal ranges (from 4B–4D reports)

- 4B: `JE-202608-00045` … `00048`  
- 4C: `JE-202608-00049` … `00052`  
- 4D: GLs 3059/3159 + recon fixtures  

#### Phase 7 cleanup guidance

1. Soft-deactivate all `TEST-ACC*` bank accounts.  
2. Leave POSTED journals immutable; optionally mark memos / add exclusion filters in reports.  
3. Soft-close or archive TEST reconciliations / statement imports.  
4. Delete or quarantine TEST vendor bills / vendors with `TEST-ACC*` names only when safe FK order allows.  
5. Never rewrite historical 1010 commerce journals.

Full JSON dump: local `/tmp/phase4e-fixture-register.json` from Lightsail query (session artifact).

---

## 28. Migration-Day Banking Data Requirements

**Do not load real values now.** Before production:

### A. Real bank accounts

- Display name, bank name, masked/last-4, currency (INR), GL mapping, default settlement bank

### B. Opening bank balances

- Cutover date  
- Verified statement balance per bank  
- Cash-on-hand count  

### C. Bank statements

- Agreed cutover / first reconciliation statement period  

### D. Gateway data

- Unsettled Razorpay balances / settlements  
- Stripe/PayPal status if used  
- COD outstanding / remittance evidence where available  

### E. Mapping

- Vendor payment bank mapping  
- Expense payment account mapping  
- Razorpay target bank  

---

## 29. Remaining Known Limitations

1. No automatic bank feeds  
2. Stripe / PayPal settlement posting not implemented (explicit DATA_GAP)  
3. COD remittance / collection not implemented (flag always OFF)  
4. Non-INR deferred  
5. EU-style `1.234,56` amounts not supported (India decimal assumed)  
6. TEST-ACC fixtures retained until Phase 7 cleanup  
7. Some incomplete 4D recon rows may remain `IN_PROGRESS` from aborted validation runs — deactivate with TEST banks  

---

## 30. Phase 4 Final Recommendation

All Phase 4 completion criteria (registry, multi-bank, transfers, vendor/expense/settlement targeting, statements, matching, charges, interest, recon lock/reopen, gateway gaps, builds, regression, Lightsail, flags OFF, cleanup register, migration checklist) are met.

Safe to hand off to **Phase 5**. Do not enable persistent banking flags on Lightsail until cutover readiness.

---

PHASE 4 BANKING & CASH COMPLETE
