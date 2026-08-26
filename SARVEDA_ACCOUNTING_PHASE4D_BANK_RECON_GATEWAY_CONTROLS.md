# SARVEDA Native Accounting — Phase 4D Bank Reconciliation + Gateway Controls

**Status:** IMPLEMENTED & LIGHTSAIL VALIDATED  
**Date:** 2026-08-25  
**Authority:** `SARVEDA_ACCOUNTING_PHASE4A_BANKING_ARCHITECTURE.md`  
**Builds on:** Phase 4B + Phase 4C reports

---

## 1. Executive Summary

Phase 4D adds formal **per-bank reconciliation**, **explicit BANK_CHARGE / BANK_INTEREST posting**, **IGNORE workflow**, and **gateway clearing controls** (Razorpay / Stripe / PayPal / COD).

Import and matching still create **zero GL**. Reconciliation itself creates **zero GL**. Only explicit admin categorization of bank charge/interest posts journals.

**TypeScript:** Pre-existing Phase 4B `tsc` errors were fixed at root cause. Backend `tsc --noEmit` **PASSES**.

Lightsail validation (pre-launch `13.204.112.165`) passed checks A–U with tagged fixtures `TEST-ACC-RECON-*`.

---

## 2. Schema / Migration

**Migration:** `backend/prisma/migrations/20260825160000_accounting_phase4d_bank_reconciliation/migration.sql`

| Addition | Purpose |
|----------|---------|
| `AccountingBankReconciliation` | Period recon with book/statement balances, difference, snapshot, reopen audit |
| Line `category` / `categoryNote` / `categorizedAt` / `categorizedByUserId` | Bounded categorization |
| Line `reconciliationId` | Link lines to a recon period |
| Match statuses `IGNORED`, `MATCHED_CATEGORIZED` | Resolution states |
| Match types `BANK_CHARGE`, `BANK_INTEREST` | Categorization matches |
| CoA `5390` Bank Charges Expense | Charge posting |
| CoA `4500` Interest Income | Interest posting |

Statuses: `OPEN` → `IN_PROGRESS` → `RECONCILED` ↔ `REOPENED`.

Unique: `(bankAccountId, periodStart, periodEnd)`. Overlapping **RECONCILED** periods blocked.

---

## 3. Reconciliation Model

`AccountingBankReconciliation` stores period bounds, optional statement import, statement balances (from import or admin), computed book balances, difference, status, immutable `snapshotJson` on close, reopen reason/user/time.

---

## 4. Book Balance Calculation

**CODE FACT:** Book balance is computed only from **POSTED** `AccountingJournalLine` rows for `AccountingBankAccount.glAccountCode`.

```
bookOpening = Σ(debits − credits) where entryDate < periodStart
bookDebits / bookCredits = period activity (entryDate in [start, end])
bookClosing = bookOpening + bookDebits − bookCredits
```

Operational entities are not balance authority.

---

## 5. Statement Balance

Uses Phase 4C committed import opening/closing when present. Admin may supply reviewed balances when statement lacks them. Values are never invented silently.

---

## 6. Difference Calculation

```
differenceInPaise = bookClosingBalanceInPaise − statementClosingBalanceInPaise
```

Never forced to zero. Reconcile requires `difference === 0`.

---

## 7. Reconciliation Workflow

Select bank → create period → attach statement → recompute → resolve lines (match / charge / interest / ignore) → difference 0 → **RECONCILE**.

Balances equal alone is insufficient — unresolved `UNMATCHED` / `REVIEW_REQUIRED` / problem `DUPLICATE` lines block close. `IGNORED` requires a reason.

---

## 8. Reconciliation Snapshot

On RECONCILED, `snapshotJson` records bank/GL/period, book activity, statement balances, difference, matched/ignored/unresolved counts & amounts, user/time. No raw narration dump.

---

## 9. Lock / Reopen

**RECONCILED** locks match/unmatch/categorize/ignore for covered lines. Journals are never mutated.

**REOPEN** requires reason + user/time → `REOPENED`, unlocks decisions, preserves audit, does not delete/edit journals or reopen accounting periods.

---

## 10. Bank Charge Posting

`BANK_CHARGE_V1` — explicit admin only:

```
Dr 5390 Bank Charges Expense
   Cr selected Bank GL
```

Unique key: `bank_charge:{statementLineId}`. Idempotent via posting event. Requires debit line, no prior confirmed match (except replay), open accounting period.

---

## 11. Gateway Fee Duplicate Protection

Before posting a charge, search POSTED Razorpay settlements on the same bank with matching fee/tax amount within date window. If found → categorize `POSSIBLE_DUPLICATE_GATEWAY_FEE`, set `REVIEW_REQUIRED`, **block** charge posting.

---

## 12. Bank Interest Posting

`BANK_INTEREST_V1` — explicit admin only:

```
Dr selected Bank GL
   Cr 4500 Interest Income
```

Unique key: `bank_interest:{statementLineId}`. Unknown credits never auto-post.

---

## 13. Unmatched Categorization

Bounded categories: `BANK_CHARGE` | `BANK_INTEREST` | `IGNORE` | `UNKNOWN` | `POSSIBLE_DUPLICATE_GATEWAY_FEE`.

No free-form GL picker on the statement screen.

---

## 14. Ignore Workflow

Requires reason (≥3 chars), user, timestamp. Evidence remains immutable. Ignored lines can allow reconcile when difference is zero.

---

## 15. Gateway Clearing Controls

Service: `gateway-clearing-control.service.ts`  
GL authority: POSTED activity on 1020 / 1021 / 1022 / 1100.

Statuses: `CLEAR` | `OUTSTANDING` | `DATA_GAP` | `SETTLEMENT_NOT_CONFIGURED` | `REVIEW_REQUIRED`.

---

## 16. Razorpay Control

1020 balance from GL; settlement count/UTR/last settlement when posted. Does not rewrite Phase 2D settlement logic.

---

## 17. Stripe Control

**DATA_GAP / SETTLEMENT_NOT_CONFIGURED** — no fake settlement journals.

---

## 18. PayPal Control

Same as Stripe — no fabrication.

---

## 19. COD Control

**DATA_GAP**. `COD_REMITTANCE_V1` design stub only.  
**ARCHITECTURAL DECISION:** FULFILLED ≠ cash collected. `ACCOUNTING_COD_COLLECTION_ENABLED` remains effectively OFF.

---

## 20. Banking Dashboard

`/admin/accounting/banking` shows per account: BOOK BALANCE, LATEST STATEMENT BALANCE, recon difference/status, unmatched/review counts, last recon. Gateway clearing table included.

---

## 21. Admin API

| Path | Action |
|------|--------|
| `POST /bank-reconciliations` | Create |
| `GET /bank-reconciliations` | List |
| `GET /bank-reconciliations/:id` | Detail |
| `POST .../recompute` | Recompute |
| `POST .../reconcile` | Close |
| `POST .../reopen` | Reopen |
| `PATCH .../balances` | Admin statement balances |
| `POST /bank-statements/categorize/charge` | BANK_CHARGE |
| `POST .../interest` | BANK_INTEREST |
| `POST .../ignore` | IGNORE |
| `POST .../unknown` | UNKNOWN |
| `GET /gateway-clearing/controls` | Gateway dashboard |

Reuses Phase 4C match APIs with recon lock checks.

---

## 22. Admin UI

Extended banking page: recon create/recompute/reconcile/reopen, charge/interest/ignore actions on unmatched lines, gateway clearing section.

---

## 23. Audit

`BANK_RECONCILIATION_CREATED` / `RECONCILED` / `REOPENED`  
`BANK_STATEMENT_LINE_CATEGORIZED` / `IGNORED`  
`BANK_CHARGE_POSTED` / `BANK_INTEREST_POSTED`

---

## 24. Idempotency / Concurrency

Posting events unique on `(eventType, uniqueKey)`. Concurrent charge/interest → one event, one journal.

---

## 25. Accounting Period Safety

Charge/interest call `assertEntryDateInOpenPeriod`. Reopen does not reopen accounting periods.

---

## 26. Feature Flags

```
NATIVE_ACCOUNTING_ENABLED=1
ACCOUNTING_BANKING_ENABLED=1
ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1
ACCOUNTING_BANK_RECONCILIATION_ENABLED=1   # default OFF
ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1    # for prod-like GL posting
```

Lightsail persistent `.env`: flags **OFF/ABSENT** (check U).

---

## 27. TypeScript Build Fix

| Error | Root cause | Fix |
|-------|------------|-----|
| `BankTransferJournalImbalanceError` 4-arg `super` | `AccountingError` only accepts 2–3 args | Removed unused `meta` 4th arg |
| `vendor-payment-journal.builder` `creditGlAccountCode` | Diagnostics type omitted Phase 4B bank fields | Extended `VendorPaymentJournalProposal.diagnostics` |
| `postBankTransfer` duplicate return type | `PostBankTransferResult.event` required postJournal shape with `journalEntry.lines`, but duplicate path used `getPostingEvent` without lines | Typed `event` as `AccountingPostingEvent`, `journal` as journal+lines structural type |

**Why tests passed before:** Vitest/ts-node transpile does not enforce the same `tsc` project check; runtime shapes were fine.

**Proof:** `npx tsc -p tsconfig.json --noEmit` exits 0. Phase 4C/4D tests still pass.

---

## 28. Tests

**File:** `backend/test/accounting/bank-reconciliation.test.ts` — **9 passed**  
**Phase 4C regression:** `bank-statements.test.ts` — **14 passed**  
**Vendor payment isolation:** **25 passed**

**FULL backend suite:** **26 files / 336 tests PASSED**

**Backend build:** `tsc --noEmit` **PASS**  
**Frontend build:** `next build` **PASS**

Coverage includes: create/recompute, book math, unmatched blocks, charge+interest→reconcile→lock→reopen, ignore reason, direction blocks, gateway DATA_GAP, recon creates no GL, gateway fee duplicate block.

---

## 29. Lightsail Validation

**Script:** `backend/scripts/phase4d-lightsail-recon-validation.ts`

Scenario (₹): open 10,00,000; vendor −1,00,000; Razorpay +2,00,000; transfer −50,000 → book 10,50,000; then charge −500 + interest +1,000 → book & statement 10,50,500; RECONCILE; lock; REOPEN.

| Check | Result |
|-------|--------|
| A–U (import/no-GL, unmatched, difference, charge/interest, reconcile, lock, reopen, gateways, commerce, 1010, flags) | **ALL PASS** |

Tagged fixtures retained: `TEST-ACC-RECON-*` (e.g. GLs 3059/3159, reconciliationId on Lightsail).

---

## 30. Regression Safety

Phase 4B/4C behaviors preserved. Commerce fingerprints unchanged on Lightsail. Historical 1010 unchanged. Backend `tsc` green. Frontend build green.

---

## 31. Known Limitations

- No automatic bank API feeds  
- No COD remittance posting  
- No partial amount recon matches  
- No Stripe/PayPal settlement journals  
- INR V1  
- Formal multi-period cashbook deferred  

---

## 32. Phase 4E Readiness

Reconciliation lock/snapshot, charge/interest posting, and gateway visibility are in place. Phase 4E can add reporting polish / Stripe·PayPal settlement adapters / COD remittance when operational evidence exists — **not started here**.

---

**PHASE 4D BANK RECONCILIATION VALIDATED**
