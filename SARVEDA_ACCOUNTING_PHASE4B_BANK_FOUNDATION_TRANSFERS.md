# SARVEDA Native Accounting — Phase 4B Bank Foundation & Transfers

**Status:** IMPLEMENTATION COMPLETE  
**Date:** 2026-08-25  
**Authority:** `SARVEDA_ACCOUNTING_PHASE4A_BANKING_ARCHITECTURE.md`

---

## 1. Executive Summary

Phase 4B implements the **bank/cash account registry**, **transfer engine**, and **safe wiring** of vendor payments, Razorpay settlements, and expense payment mappings to specific GL bank accounts — without rewriting historical **1010** journals.

**Delivered:**

- `AccountingBankAccount` + `AccountingBankTransfer` schema & migration
- `BANK_TRANSFER_V1` posting (internal transfer, cash deposit, cash withdrawal)
- `BANK_OPENING_BALANCE_V1` foundation (synthetic validation only)
- Vendor payment optional `bankAccountId`
- Settlement optional `targetBankAccountId` + `razorpaySettlementTarget` default
- Expense payment mapping optional `bankAccountId`
- Admin API + `/admin/accounting/banking` UI
- 16 new unit tests + full backend regression **313/313**
- **Lightsail remote validation:** PASS (2026-08-25, `13.204.112.165`)
- **Lightsail remote validation:** PASS (2026-08-25, `13.204.112.165`)

**Not in scope (Phase 4C+):** statement import, reconciliation, COD remittance, Stripe/PayPal settlement.

---

## 2. Schema / Migration

**Migration:** `backend/prisma/migrations/20260825120000_accounting_phase4b_banking/migration.sql`

| Model | Purpose |
|-------|---------|
| `AccountingBankAccount` | Registry: name, masked number, IFSC, `glAccountCode`, type, flags |
| `AccountingBankTransfer` | Transfer draft/post with journal link |

**Extensions:**

| Table | Field |
|-------|-------|
| `AccountingVendorPayment` | `bankAccountId` (optional FK) |
| `AccountingGatewaySettlement` | `targetBankAccountId` (optional FK) |
| `AccountingExpensePaymentMapping` | `bankAccountId` (optional FK) |

---

## 3. Bank Account Registry

**Service:** `bank-account.service.ts`

- Create links **one registry row per GL code** (unique constraint)
- GL must be **ASSET** (or `createGlIfMissing` for synthetic test accounts)
- Account numbers stored **masked only** (`****1234`)
- Deactivate (no hard delete) — clears default / Razorpay target
- **Book balance** = sum POSTED journal lines for linked GL (labeled BOOK BALANCE in UI)

---

## 4. CoA Strategy

Per Phase 4A:

- **1000 / 1010** remain legacy system accounts
- **1011+** (or test codes like `1011`, `1028`) for specific banks via registry
- Historical **1010 POSTED journals unchanged**
- New postings use `AccountingBankAccount.glAccountCode` when configured

---

## 5. Transfer Engine

**Service:** `bank-transfer.service.ts`, `bank-transfer-posting.service.ts`

| Kind | Journal |
|------|---------|
| `INTERNAL_TRANSFER` | Dr dest bank / Cr source bank |
| `CASH_DEPOSIT` | Dr bank / Cr cash |
| `CASH_WITHDRAWAL` | Dr cash / Cr bank |

Numbering: `BT-YYYYMM-#####` via `AccountingSequence`.

---

## 6. Journal Semantics

- Event: `BANK_TRANSFER` / calc `BANK_TRANSFER_V1`
- Unique key: `bank_transfer:{transferId}`
- Exact balance required (0 paise tolerance)
- No revenue, expense, GST, AP, AR
- `sourcePayloadHash` detects mutation after preview/post

---

## 7. Vendor Payment Integration

- Optional `bankAccountId` on create/update
- Journal credit uses `creditGlAccountCode` from registry
- Legacy: `paidAccountCode` **1000/1010** when `bankAccountId` null
- POSTED payments immutable — no journal rewrite

---

## 8. Razorpay Settlement Integration

**Resolution order:**

1. Request `targetBankAccountId` (preview/post body)
2. Settlement row `targetBankAccountId` if persisted
3. Active `razorpaySettlementTarget=true` bank account
4. Legacy **1010**

Fee/tax/clearing semantics **unchanged** (`5100`, `1020`).

---

## 9. Expense Integration

- `AccountingExpensePaymentMapping.bankAccountId` optional
- Snapshot resolves `resolvedPaymentGlAccountCode` via registry
- Legacy **1000/1010** mapping still works
- Fail closed if mapping missing or bank account inactive

---

## 10. Opening Balance Foundation

- Event: `BANK_OPENING_BALANCE_V1`
- Dr Bank/Cash / Cr **3900** Opening Balance Equity
- One post per bank account (idempotent replay returns duplicate)
- **No real cutover amounts loaded**

---

## 11. Feature Flags

| Flag | Default |
|------|---------|
| `ACCOUNTING_BANKING_ENABLED` | OFF |

Requires `NATIVE_ACCOUNTING_ENABLED=1` and production dual-gate via `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1`.

Added to `backend/.env.example`.

---

## 12. Admin API

| Method | Path |
|--------|------|
| GET | `/api/admin/accounting/banking/dashboard` |
| GET/POST | `/api/admin/accounting/bank-accounts` |
| GET/PATCH | `/api/admin/accounting/bank-accounts/:id` |
| POST | `/api/admin/accounting/bank-accounts/:id/deactivate` |
| GET/POST | `/api/admin/accounting/bank-transfers` |
| POST | `/api/admin/accounting/bank-transfers/preview` |
| POST | `/api/admin/accounting/bank-transfers/post` |
| POST | `/api/admin/accounting/bank-opening/preview` |
| POST | `/api/admin/accounting/bank-opening/post` |

---

## 13. Admin UI

- **`/admin/accounting/banking`** — accounts list (BOOK BALANCE), create account, transfer preview/post
- **Vendor Payments** — bank/cash account picker
- **Settlements** — target bank account picker
- **Expense Mappings** — API supports `bankAccountId` (UI can extend paidThrough mapping)

Nav: **Banking** added to `AdminAccountingNav`.

---

## 14. Security

- Admin-only (`requireAdmin`)
- Masked account numbers in registry + API responses
- Audit log: `BANK_ACCOUNT_CREATED`, `BANK_ACCOUNT_MODIFIED`, `BANK_ACCOUNT_DEACTIVATED`, `BANK_TRANSFER_POSTED`
- No full account numbers or credentials in logs

---

## 15. Immutability / Idempotency

- POSTED transfer journals immutable (existing `PostedJournalImmutableError`)
- POSTED transfers cannot be edited/deleted
- `bank_transfer:{transferId}` unique posting event
- PostgreSQL transaction + posting event constraints (no JS mutex)

---

## 16. Tests

**New:** `backend/test/accounting/banking.test.ts` — 16 cases

**Regression:** `npm test` — **313/313 passed**

Coverage includes: registry CRUD rules, transfer kinds, idempotent replay, settlement GL target, vendor/expense GL resolution, opening balance.

---

## 17. Lightsail Validation

**Executed:** 2026-08-25 on verified pre-launch Lightsail (`13.204.112.165`)

**Deploy:** Phase 4B backend rsynced to `/home/ubuntu/sarveda/backend` (code not yet on `origin/main`; deploy via rsync, not git pull).

**Migration:** `20260825120000_accounting_phase4b_banking` — pending before run, applied successfully via `npx prisma migrate deploy`. Commerce tables unchanged before/after migrate.

### Environment proof

```json
{
  "hostname": "ip-172-26-7-99",
  "appCwd": "/home/ubuntu/sarveda/backend",
  "dbHostRedacted": "ls-***.c9oiska8wm8k.ap-south-1.rds.amazonaws.com",
  "dbName": "sarveda_db",
  "intendedPrelaunchSarvedaDb": "YES",
  "localhost": "NO",
  "productionLikeEnvironment": "true"
}
```

### Primary script (`phase4b-lightsail-banking-validation.ts`)

Process-scoped flags only:

```bash
PHASE4B_LIGHTSAIL_BANKING_OK=1 \
NATIVE_ACCOUNTING_ENABLED=1 \
ACCOUNTING_BANKING_ENABLED=1 \
ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
npx tsx scripts/phase4b-lightsail-banking-validation.ts
```

**Result:** ALL PASS

| Check | Result |
|-------|--------|
| A — two bank accounts, unique GL | PASS |
| B — ₹10,00,000 bank→bank transfer | PASS (`JE-202608-00045`) |
| C — replay duplicate | PASS |
| D — cash deposit Dr bank / Cr cash | PASS (`JE-202608-00046`) |
| F — settlement targets configured bank GL | PASS |
| I — new transfer not on legacy 1010 | PASS |

### Supplementary remote proofs (same session, process-scoped flags)

| Check | Result | Detail |
|-------|--------|--------|
| D — cash withdrawal | PASS | `BT-202608-00003` → `JE-202608-00047` (Dr cash **1293** / Cr bank **1093** ₹25,000) |
| E — vendor payment bank target | PASS | Journal builder credits **1193**, not **1010**, when `bankAccountId` set |
| F — Razorpay settlement semantics | PASS | Dr selected bank + **5100** fees unchanged vs legacy; **1020** clearing unchanged; UTR preserved |
| G — expense payment mapping | PASS | Mapping `TEST-ACC-BANK-SUPP-NEFT` → credits **1193** |
| H — opening balance foundation | PASS | `JE-202608-00048`: Dr **1193** ₹5,00,000 / Cr **3900** ₹5,00,000; `BANK_OPENING_BALANCE` events = **1** (idempotent) |
| I — commerce integrity | PASS | Orders **4384**, Payments **3508**, Refunds **2**, Inventory **844**, PurchaseOrders **1** (unchanged) |
| J — legacy 1010 fingerprint | PASS | 5 historical POSTED journals unchanged (`JE-202608-00004` … `00011`; amounts identical) |

### Tagged fixtures retained (pre-production cleanup)

| Entity | ID / Number | GL |
|--------|-------------|-----|
| TEST HDFC bank | `4cbc17ac-a7ae-422e-81a7-c948255a8dcb` | **1093** |
| TEST ICICI bank | `aebdc7d4-be65-4ac0-bafc-b19b1a941066` | **1193** |
| TEST CASH | `279dc3fb-4a59-4cde-888c-d3446fabba52` | **1293** |
| Internal transfer | `BT-202608-00001` → `JE-202608-00045` | Dr **1193** / Cr **1093** ₹10,00,000 |
| Cash deposit | `BT-202608-00002` → `JE-202608-00046` | Dr **1093** / Cr **1293** ₹50,000 |
| Cash withdrawal | `BT-202608-00003` → `JE-202608-00047` | Dr **1293** / Cr **1093** ₹25,000 |
| Opening balance | `JE-202608-00048` | Dr **1193** / Cr **3900** ₹5,00,000 |

**BOOK BALANCE (posted journal lines only):** **1093** −₹99,75,000 · **1193** +₹1,05,00,000 · **1293** −₹25,000

Prefix for cleanup: `TEST-ACC-BANK-*` (accounts, transfers, journals **JE-202608-00045** … **00048**).

### Persistent flags after validation

Verified absent in `~/sarveda/backend/.env`:

- `NATIVE_ACCOUNTING_ENABLED` — **ABSENT**
- `ACCOUNTING_BANKING_ENABLED` — **ABSENT**
- `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` — **ABSENT**

Process-scoped validation values only; not persisted.

---

## 18. Regression Safety

- Commerce / payment webhooks untouched
- Existing settlement fee math unchanged
- Legacy vendor payments on **1010** remain valid
- Test cleanup extended for `AccountingBankTransfer` / `AccountingBankAccount`

---

## 19. Known Limitations

- No bank statement import or reconciliation (Phase 4C/4D)
- INR only for transfers V1
- No COD remittance posting
- Stripe/PayPal settlement still future work
- Expense mapping UI still shows legacy 1000/1010 option (API supports bank account id)

---

## 20. Phase 4C Readiness

Foundation is in place for:

- Statement import → match to journals (UTR, settlement, vendor payment)
- Per-account reconciliation periods
- Gateway clearing dashboard extensions

**Recommended next slice:** Phase 4C — `AccountingBankStatementImport` + conservative matching.

---

**PHASE 4B BANK FOUNDATION VALIDATED**
