# SARVEDA Native Accounting — Phase 4C Bank Statement Import & Matching

**Status:** IMPLEMENTED & LIGHTSAIL VALIDATED  
**Date:** 2026-08-25  
**Authority:** `SARVEDA_ACCOUNTING_PHASE4A_BANKING_ARCHITECTURE.md`  
**Builds on:** Phase 4B (`SARVEDA_ACCOUNTING_PHASE4B_BANK_FOUNDATION_TRANSFERS.md`)

---

## 1. Executive Summary

Phase 4C delivers **bank statement ingestion as immutable evidence** plus a **conservative matching engine** against existing POSTED accounting journals. Import and matching **never create GL journals**.

V1 supports CSV/XLSX upload → preview/validate → commit → auto-match only deterministic EXACT candidates → admin review for everything else.

Lightsail validation (pre-launch `13.204.112.165`) passed all checks A–M with tagged fixtures `TEST-ACC-STMT-*`.

---

## 2. Schema / Migration

**Migration:** `backend/prisma/migrations/20260825140000_accounting_phase4c_bank_statements/migration.sql`

| Model | Purpose |
|-------|---------|
| `AccountingBankStatementImport` | Committed import metadata (file hash, date range, totals, status) |
| `AccountingBankStatementLine` | Normalized statement line + fingerprint + match status |
| `AccountingBankStatementMatch` | Auditable match rows (CANDIDATE / CONFIRMED / REJECTED) |

**Enums:** import status (`IMPORTED` / `FAILED`), line match status, match confidence (`EXACT` / `HIGH` / `POSSIBLE`), match type, match status.

**Constraints:**
- Unique `(bankAccountId, fileHash)` — duplicate file protection
- Unique `(bankAccountId, transactionFingerprint)` — duplicate line protection

---

## 3. Normalized Statement Architecture

```
BankStatementSource (CSV / XLSX today; API feed future)
        ↓
NormalizedBankTransaction[]
        ↓
Validation + fingerprint
        ↓
Statement evidence (import + lines)
        ↓
Matching engine
```

Future HDFC/ICICI/account-aggregator feeds submit the same normalized shape — matching does not care about source.

---

## 4. CSV/XLSX Parsing

**Files:** `bank-statement-parser.service.ts`, `bank-statement.constants.ts`

- Column alias map (not bank-specific): transaction date, value date, description, reference/UTR, debit, credit, balance
- Money parsing: rupee strings with decimals (`965.00` → 96500 paise); strips `₹`, commas, `Rs.` prefix — **does not strip decimal points**
- Dependencies: `csv-parse` (production dep), `exceljs`

---

## 5. Preview / Validation

**Service:** `bank-statement-import.service.ts` → `previewBankStatementImport`

Preview returns: detected columns, row counts, date range, debit/credit totals, opening/closing balance if present, invalid rows, in-file duplicates, sample lines, `canCommit`.

Fail-closed: inactive account, CASH/PETTY_CASH, unsupported file, missing columns, invalid dates, both/neither debit+credit, bad amounts, unsupported currency, impossible date range.

**No persistence on preview.**

---

## 6. Duplicate Protection

| Layer | Mechanism |
|-------|-----------|
| File | SHA-256 `fileHash` + `bankAccountId` → `DUPLICATE_FILE` error |
| Line | Deterministic `transactionFingerprint` (account, dates, amounts, normalized ref/desc, balance) → line marked `DUPLICATE` |

---

## 7. Statement Evidence Model

Committed imports are **immutable**. Lines store normalized evidence only (no raw file blob in DB). Original row numbers retained for audit.

Import lifecycle: preview (ephemeral) → commit (`IMPORTED`, `committedAt` set).

---

## 8. Matching Engine

**Service:** `bank-statement-matching.service.ts`

Entity-first search (POSTED only):
1. Razorpay settlements (`AccountingGatewaySettlement` + journal)
2. Vendor payments (`AccountingVendorPayment` + journal)
3. Bank transfers (`AccountingBankTransfer` — both legs)
4. Journal leg scan for expenses, opening balance, other bank GL lines

One statement line → multiple match candidates; one journal → multiple statement lines (transfer legs). V1 conservative: auto-confirm only when **exactly one EXACT** candidate.

---

## 9. Confidence Rules (V1 Auto-Match)

| Level | Criteria | Auto-confirm? |
|-------|----------|---------------|
| **EXACT** | Amount + direction + normalized UTR/ref (≥6 chars) + date within ±3 days + correct bank account | **Yes, only if sole EXACT candidate** |
| **HIGH** | Partial ref / strong description + amount + account + date within ±3 days | No — admin confirm |
| **POSSIBLE** | Amount + account + direction + date within ±7 days, weak/no ref | No — show candidates |
| **NO_MATCH** | No credible candidate | Stays UNMATCHED |

**Critical:** Equal amounts alone **never** auto-match.

**Direction:** Statement CREDIT ↔ bank GL debit; statement DEBIT ↔ bank GL credit.

**Date windows:** EXACT ±3 days; HIGH ±3 days; POSSIBLE ±7 days; journal fallback scan ±90 days.

---

## 10. Razorpay Matching

Match statement **credit** to POSTED `AccountingGatewaySettlement` where:
- `targetBankAccountId` = import account
- `netInPaise` = line amount
- UTR matches normalized reference
- Settlement journal POSTED

Statement match is reconciliation evidence only — settlement journal unchanged.

---

## 11. VendorPayment Matching

Match statement **debit** to POSTED `AccountingVendorPayment`:
- `bankAccountId` + `amountInPaise` + UTR + payment date window

Legacy payments without `bankAccountId` do not guess physical bank.

---

## 12. Expense Matching

Journal leg scan for `EXPENSE_RECORDED` posting events. EXACT requires reference; otherwise HIGH/POSSIBLE.

---

## 13. Transfer Matching

Internal transfer: HDFC debit leg and ICICI credit leg may both match the **same** `BANK_TRANSFER` journal. Each match records which bank GL side it reconciles.

---

## 14. Manual Match / Unmatch

Admin API: confirm candidate, reject candidate, unmatch (re-runs matching). Manual confirm sets `MATCHED_MANUAL`. Matched amount must equal statement line amount (V1: no partial match).

---

## 15. No-Auto-GL Safety

- Import: **zero** journals
- Matching: **zero** journals
- Unmatched bank charges / unknown credits stay UNMATCHED — Phase 4D categorization

Verified in unit tests and Lightsail check J.

---

## 16. Future Bank Feed Boundary

Normalized ingestion contract: `NormalizedBankTransaction[]` → same validation/fingerprint/import/matching pipeline. Phase 4C implements CSV/XLSX adapter only.

---

## 17. Admin API

Routes under `/api/admin/accounting/bank-statements/` (admin-only, multer upload):

| Method | Path | Action |
|--------|------|--------|
| GET | `/status` | Feature flag status |
| POST | `/preview` | Preview file |
| POST | `/commit` | Commit import + run matching |
| GET | `/imports` | List imports |
| GET | `/imports/:id` | Import detail + lines |
| POST | `/imports/:id/rerun-matching` | Re-run matching |
| GET | `/lines` | Filter lines |
| GET | `/lines/:id/candidates` | Line + candidates |
| POST | `/match/confirm` | Manual confirm |
| POST | `/match/unmatch` | Unmatch |
| POST | `/match/reject` | Reject candidate |

---

## 18. Admin UI

Extended `/admin/accounting/banking`:
- Bank account select + CSV/XLSX upload
- Preview → commit workflow
- Import list, line table with filters (ALL / MATCHED / POSSIBLE / UNMATCHED / DUPLICATE / REVIEW REQUIRED)
- Confirm / unmatch actions
- Book balance vs latest imported statement balance (not labeled reconciled)

---

## 19. Security / Audit

- Admin-only routes
- No raw file logging
- Masked account display in registry
- Audit: `STATEMENT_IMPORTED`, `STATEMENT_MATCHED`, `STATEMENT_UNMATCHED`

---

## 20. Feature Flags

```
NATIVE_ACCOUNTING_ENABLED=1
ACCOUNTING_BANKING_ENABLED=1
ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1   # default OFF
```

Lightsail persistent `.env`: flags **OFF or absent** (verified check M).

---

## 21. Tests

**File:** `backend/test/accounting/bank-statements.test.ts` — **14 cases passing**

Coverage: CSV/XLSX preview, invalid file/type, cash blocked, malformed rows, duplicate file, no GL on import, Razorpay EXACT auto-match, amount-only no auto-match, transfer both legs, unmatched charge, manual confirm/unmatch, rerun idempotent, flags OFF.

---

## 22. Lightsail Validation

**Script:** `backend/scripts/phase4c-lightsail-statement-validation.ts`

```bash
PHASE4C_LIGHTSAIL_STATEMENT_OK=1 \
NATIVE_ACCOUNTING_ENABLED=1 \
ACCOUNTING_BANKING_ENABLED=1 \
ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1 \
ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 \
ACCOUNTING_PURCHASES_POSTING_ENABLED=1 \
ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=1 \
npx tsx scripts/phase4c-lightsail-statement-validation.ts
```

| Check | Result |
|-------|--------|
| A CSV import | PASS |
| B XLSX import | PASS |
| C duplicate file blocked | PASS |
| D exact Razorpay match | PASS |
| E exact VendorPayment match | PASS |
| F transfer HDFC debit leg | PASS |
| G transfer ICICI credit leg | PASS |
| H amount-only not auto-matched | PASS |
| I bank charge unmatched | PASS |
| J zero GL from import/match | PASS |
| K commerce unchanged | PASS |
| L legacy 1010 unchanged | PASS |
| M flags OFF/absent | PASS |

Tagged fixtures retained: `TEST-ACC-STMT-*` (GLs 2034/2134, journals JE-202608-00049…00052).

---

## 23. Regression Safety

Phase 4B bank accounts, transfers, vendor payments, expenses, Razorpay settlements, checkout, inventory, COGS, purchases unchanged. Matching reads POSTED evidence only.

---

## 24. Known Limitations

- INR only in V1
- No automatic bank API feeds
- No partial amount matching
- No formal reconciliation lock (Phase 4D)
- No auto-GL for unmatched lines (by design)
- Backend `tsc` build has pre-existing Phase 4B type errors unrelated to 4C runtime (tests pass via vitest)

---

## 25. Phase 4D Readiness

Statement evidence + match decisions are in place. Phase 4D can add: reconciliation periods, lock/unlock, categorization workflows for UNMATCHED lines, book vs statement formal sign-off.

---

**PHASE 4C BANK STATEMENTS & MATCHING VALIDATED**
