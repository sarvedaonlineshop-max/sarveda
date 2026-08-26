# Sarveda Native Accounting — Phase 1.5 Hardening Report

**Date:** 2026-08-22  
**Scope:** Isolated accounting foundation safety review — **no commerce ingestion**  
**Status:** Complete — awaiting architectural review before any discovery-worker activation

---

## Executive Summary

Phase 1.5 hardening validates that the native accounting module is **internally consistent, concurrency-safe, immutability-enforced, and deployable in shadow mode** without touching production commerce paths.

**Verdict:** **SAFE FOR STAGING — NO COMMERCE INGESTION**

Staging configuration:

```env
NATIVE_ACCOUNTING_ENABLED=1
ACCOUNTING_SALES_POSTING_ENABLED=0
ACCOUNTING_PURCHASES_POSTING_ENABLED=0
```

This enables accounting UI, Chart of Accounts, and synthetic/manual journals only. No order ingestion, no discovery worker, no `afterPaid` hooks.

---

## Findings

### 1. Unexpected `frontend/public/sw.js` change

| Item | Detail |
|------|--------|
| **Previous value** | Build revision ID `LomVDTwIuyfQK-L95X4O0` (precache manifest from prior Next.js PWA build) |
| **New value (accidental)** | Build revision ID `k7jZR4CPnlh84c7PJu0Qh` after `npm run build` added admin accounting/purchases routes to Workbox precache |
| **What generated it** | `next-pwa` / Workbox during frontend production build — not accounting code |
| **Required for accounting?** | **No** |
| **Action taken** | **Reverted** via `git checkout frontend/public/sw.js`. Working tree is clean for this file. |

### 2. POSTED journal immutability gaps (pre-hardening)

- Service layer blocked updates/deletes on POSTED entries, but direct Prisma bypass was possible.
- No DB-level enforcement existed before Phase 1.5 migration.

### 3. Journal atomicity gap (pre-hardening)

- Sequence allocation and journal creation were not guaranteed in a single transaction in all paths.

### 4. Posting-event race under concurrency

- `create()` + catch P2002 inside an open PostgreSQL transaction leaves the transaction **aborted** (`25P02`), causing concurrent `postJournalFromEvent` calls to fail.

### 5. Sequence allocation race

- Prisma `upsert` + `increment` under 20 concurrent journal posts caused PostgreSQL deadlocks (`40P01`) on the shared `AccountingSequence` row.

### 6. Test-suite deadlocks (not production)

- Multiple Vitest test files ran `TRUNCATE` on accounting tables in parallel `beforeEach` hooks while other tests held row-level locks → `AccessExclusiveLock` vs `RowExclusiveLock` deadlocks.

### 7. Test DB safety (pre-hardening)

- Tests could theoretically run against staging/production if `DATABASE_URL` was misconfigured.

### 8. Discount account classification

- Account **4200 — Discounts (Contra Revenue)** is modeled as **contra revenue** (`REVENUE` type), not expense. Documented in `seed-coa.ts`.

---

## Fixes Made

### Application layer (accounting module only)

| Area | Fix |
|------|-----|
| **Journal atomicity** | `createAndPostJournalInTx()` — sequence + header + lines + balance validation + POSTED in **one** DB transaction |
| **Posting-event atomicity** | `postJournalFromEvent()` — event lock (`SELECT FOR UPDATE`) + journal + event status in **one** transaction |
| **Posting-event idempotency** | `INSERT … ON CONFLICT DO NOTHING RETURNING` + `SELECT FOR UPDATE` — no P2002 catch inside aborted tx |
| **Sequence allocation** | Single-statement PostgreSQL `INSERT … ON CONFLICT DO UPDATE SET lastSeq = lastSeq + 1 RETURNING lastSeq` |
| **POSTED immutability** | Service guards + PostgreSQL BEFORE UPDATE/DELETE triggers on journal headers/lines |
| **Posting-event state machine** | `posting-event-state.ts` + DB trigger blocking POSTED → other status |
| **Closed period control** | `accounting-period.service.ts` rejects posting into CLOSED periods |
| **System account protection** | `account.service.ts` blocks delete/deactivate of `isSystem` accounts |
| **Audit logging** | `accounting-audit.service.ts` for journal posted, posting failed/retry |
| **Discovery worker** | Design documentation only — scope controls, example SQL, activation checklist; **not registered in server** |
| **Shadow UI labeling** | Dashboard/nav/handlers state "Shadow / Development" — Zoho remains authoritative |

### Database layer (accounting-only migration `20260822210000_accounting_phase1_5_hardening`)

- `AccountingPeriod`: `CHECK (endDate >= startDate)`
- Triggers: immutable POSTED `AccountingJournalEntry` and lines
- Trigger: prevent POSTED `AccountingPostingEvent` status downgrade

### Test infrastructure

- **Test DB guard** (`test/helpers/test-db-guard.ts`) — aborts unless positively identified as test
- **Destructive cleanup gate** — `assertDestructiveTestCleanupAllowed()` before any `TRUNCATE`
- **Test-only TRUNCATE** — bypasses immutability triggers for isolation; **no application escape hatch**
- **Vitest serialization** — `fileParallelism: false`, `maxWorkers: 1` for integration tests
- **Concurrency preserved inside tests** — `Promise.all` with 20 parallel operations in `hardening.test.ts`

---

## Test Database Safety Guard

**Implementation:** `backend/test/helpers/test-db-guard.ts`

### Boot-time checks (`assertSafeTestDatabase` in `test/setup.ts`)

1. `NODE_ENV === "test"` — **required**
2. `DATABASE_URL` or `TEST_DATABASE_URL` must be set
3. **Forbidden markers** (always abort): production RDS hostname, Lightsail IP `13.204.112.165`, EC2 staging IP, `sarveda.com`, `sarveda-demo.xyz`, `lightsail`, `production`, `railway.app`
4. **Positive test identification** (required unless remote override):
   - `SARVEDA_TEST_DATABASE=1` (set automatically in `test/setup.ts`), **or**
   - `TEST_DATABASE_URL` explicitly set
5. Remote non-local DB without `_test` in database name requires `SARVEDA_TEST_DB_ALLOW=1` **in addition** to explicit test flag

### Pre-TRUNCATE checks (`assertDestructiveTestCleanupAllowed`)

Called from `cleanupAccountingTestData()` before any destructive SQL. Re-validates all guards. **Aborts test run** if proof fails.

### No application bypass

- No service/API to delete POSTED journals
- No production trigger disabling
- TRUNCATE exists **only** in `test/helpers/commerce.ts` behind the guard

---

## Accounting Write-Path Audit

| Model | Write location | Operation | Safe? | Reason |
|-------|----------------|-----------|-------|--------|
| `AccountingAccount` | `seed-coa.ts` | `.create` | ✅ | Idempotent seed; codes unique at DB |
| `AccountingAccount` | `account.service.ts` | `.update` (deactivate) | ✅ | Blocks `isSystem` accounts |
| `AccountingAccount` | `account.service.ts` | `.delete` | ✅ | Blocks `isSystem`; blocks if journal lines exist |
| `AccountingJournalEntry` | `journal.service.ts` `createAndPostJournalInTx` | `.create` (POSTED) | ✅ | Single tx with validation |
| `AccountingJournalEntry` | `journal.service.ts` | `.update` | ✅ | `assertJournalMutable` — POSTED/VOID rejected |
| `AccountingJournalEntry` | `journal.service.ts` | `.delete` | ✅ | `assertJournalMutable` — POSTED rejected; DB trigger backup |
| `AccountingJournalLine` | `journal.service.ts` `createAndPostJournalInTx` | `.createMany` | ✅ | Created inside same tx as header |
| `AccountingJournalLine` | `journal.service.ts` | `.update` / `.delete` | ✅ | Parent status checked; DB triggers on POSTED |
| `AccountingPostingEvent` | `posting-event.service.ts` | raw INSERT ON CONFLICT | ✅ | Idempotent; unique `(eventType, uniqueKey)` at DB |
| `AccountingPostingEvent` | `posting-event.service.ts` | `.update` | ✅ | State machine + FOR UPDATE lock; POSTED downgrade blocked by trigger |
| `AccountingPostingEvent` | `posting-event.service.ts` `createPostingEventPending` | `.create` | ✅ | P2002 → `DuplicatePostingEventError` (standalone, no tx abort issue) |
| `AccountingDocumentLink` | — | — | ✅ | No writes yet (future phase) |
| `AccountingPeriod` | — (service read-only) | — | ✅ | No posting-period mutations in Phase 1.5 |
| `AccountingSequence` | `accounting-sequence.ts` | raw INSERT ON CONFLICT | ✅ | Atomic increment; transaction-scoped |
| `AccountingAuditLog` | `accounting-audit.service.ts` | `.create` | ✅ | Append-only audit trail |
| `Accounting*` (tests) | `test/helpers/commerce.ts` | `TRUNCATE` | ✅ | Test-only; guard-enforced |

**No write path outside `journal.service.ts` can modify or delete a POSTED journal** except test TRUNCATE (guarded) or direct DB admin access (triggers enforce immutability).

---

## Sequence Allocation — Database-Atomic Implementation

**File:** `backend/src/modules/accounting/accounting-sequence.ts`

```sql
INSERT INTO "AccountingSequence" (...)
VALUES (..., 1, ...)
ON CONFLICT ("sequenceType", "yearMonth")
DO UPDATE SET "lastSeq" = "AccountingSequence"."lastSeq" + 1
RETURNING "lastSeq"
```

- **Single PostgreSQL statement** — atomic across all backend processes
- **No** JavaScript mutexes, process-local locks, or read-then-write
- Called via `nextJournalEntryNumberInTx(tx, date)` inside the journal posting transaction
- Format: `JE-YYYYMM-00001`

---

## Deadlock Analysis

### Observed deadlocks during Phase 1.5 development

| # | Conflicting operations | Source | Production risk? |
|---|------------------------|--------|------------------|
| 1 | Test file A `TRUNCATE AccountingJournal*` (AccessExclusiveLock) vs test file B active journal tx (RowExclusiveLock) | **Test cleanup only** | **No** — TRUNCATE is test-only |
| 2 | 20× concurrent Prisma `upsert` on same `AccountingSequence` row (ShareLock cycle) | **Old sequence implementation** | **Was possible** — fixed with atomic SQL |
| 3 | 20× concurrent `postJournalFromEvent` — P2002 abort left tx in `25P02` | **Race handling bug** | **Was possible** — fixed with ON CONFLICT DO NOTHING |

### Resolution

1. **Test deadlocks:** Vitest `fileParallelism: false` + mutex on accounting cleanup queue. Deadlocks were **not** from production accounting logic — they came from parallel test files truncating shared tables.

2. **Sequence deadlocks:** Replaced Prisma upsert with atomic `INSERT ON CONFLICT DO UPDATE … RETURNING`. Journal posting itself **does not deadlock** under concurrent load in verification (20/20 success).

3. **Posting-event deadlocks/errors:** Replaced create+catch-P2002 with `ON CONFLICT DO NOTHING` inside the transaction, then `SELECT FOR UPDATE`. Concurrent idempotency test: **20/20 resolve to 1 event + 1 journal**.

**Production accounting:** With fixes applied, normal concurrent journal posting from multiple API workers is safe. No test TRUNCATE runs in production.

---

## New Tests

| File | Tests | Purpose |
|------|-------|---------|
| `test/accounting/hardening.test.ts` | 16 | Immutability, concurrency, idempotency, state machine, periods, system accounts, DB constraints |
| `test/accounting/api-security.test.ts` | 3 | Admin auth mount, feature flag enforcement, no public routes |
| `test/helpers/test-db-guard.test.ts` | 5 | Guard aborts for prod/staging/missing flags |
| `test/accounting/journal.test.ts` | 10 | Phase 1 journal engine (existing, still passing) |

**Total backend tests:** **50 passed, 0 failed**

---

## Concurrency Test Results

### Journal sequence (20 concurrent `createAndPostJournal`)

| Metric | Result |
|--------|--------|
| Journals created | **20/20** successful |
| Unique `entryNumber` | **20/20** unique (`JE-202608-00001` … `JE-202608-00020`) |
| Duplicates | **0** |
| Sequence `lastSeq` | **20** (no lost increments) |
| All balanced | **Yes** — `totalDebitInPaise === totalCreditInPaise` for each |
| All POSTED | **Yes** |

### Posting-event idempotency (20 concurrent, same `eventType + uniqueKey`)

**Pending event creation (`createPostingEventPending`):**

| Metric | Result |
|--------|--------|
| Successful creates | **1** |
| Duplicate rejections (P2002) | **19** |
| Rows in DB | **1** |

**Full post (`postJournalFromEvent`):**

| Metric | Result |
|--------|--------|
| Primary post (`duplicate: false`) | **1** |
| Idempotent returns (`duplicate: true`) | **19** |
| Unique journals | **1** |
| Unique posting events | **1** |
| PostgreSQL uniqueness | Enforced via `@@unique([eventType, uniqueKey])` |

---

## Test Results

| Check | Result |
|-------|--------|
| `npx prisma validate` | ✅ Pass |
| Migration `20260822210000_accounting_phase1_5_hardening` | ✅ Applied on local dev DB |
| Backend TypeScript build | ✅ Pass |
| Backend tests (`npm test`) | ✅ **50/50 pass** |
| Commerce regression | ✅ 27/27 pass (stock, checkout, payment-flow, refund) |
| Accounting tests | ✅ 29/29 pass (journal + hardening + api-security + guard) |
| Frontend build (`npm run build`) | ✅ Pass |
| Backend lint script | ⬜ Not configured in `package.json` |

### Test DB safety guard result

| Check | Result |
|-------|--------|
| Guard unit tests | ✅ 5/5 pass |
| Boot refuses non-test NODE_ENV | ✅ Verified |
| Boot refuses production RDS URL | ✅ Verified |
| Boot refuses staging Lightsail IP | ✅ Verified |
| Boot refuses missing `SARVEDA_TEST_DATABASE` | ✅ Verified |
| TRUNCATE blocked without guard | ✅ `assertDestructiveTestCleanupAllowed()` enforced |

---

## Security Review

| Control | Status |
|---------|--------|
| Routes under `/api/admin/accounting/*` | ✅ Mounted on admin router after `requireAdmin` |
| Public `/accounting` routes | ✅ None in `app.ts` |
| Feature flag backend enforcement | ✅ `isNativeAccountingEnabled()` on mutating/list routes (503 when off) |
| Financial data exposure | ✅ Admin-only; no public journals/CoA/totals |
| Discovery worker | ✅ Not activated; not registered in `server.ts` |
| Secrets in audit log | ✅ Error messages truncated; no raw payment payloads |

---

## Chart of Accounts Review (23 accounts)

| Type | Codes | Verified |
|------|-------|----------|
| ASSET | 1000 Cash, 1010 Bank, 1020–1022 Clearing, 1100 AR, 1200 Inventory | ✅ |
| LIABILITY | 2000 AP, 2100–2102 Output GST, 2200–2202 Input GST | ✅ |
| EQUITY | 3000 Capital, 3100 Retained Earnings | ✅ |
| REVENUE | 4000 Product Sales, 4100 Shipping Income, **4200 Discounts (contra revenue)** | ✅ |
| EXPENSE | 5000 COGS, 5100 Gateway, 5200 Shipping, 5300 Operating | ✅ |

**Discount decision:** Code 4200 is **contra revenue** (REVENUE type, credit-normal). Discounts reduce gross sales; not classified as expense.

All seeded accounts have `isSystem: true` and are protected from deletion/deactivation via `account.service.ts`.

---

## Discovery Worker — Design Review (NOT ACTIVATED)

**File:** `backend/src/modules/accounting/discovery-worker.ts`

- Returns `skipped: true` when `NATIVE_ACCOUNTING_ENABLED=0`
- Default `dryRun: true`
- Scope controls documented: `orderId`, `since`/`until`, `limit` (max 500)
- Example read-only SQL for future `ORDER_PAID` gap detection
- **Not imported by commerce code**
- **Not registered as BullMQ worker**

---

## Staging Readiness

| Mode | Safe? | Notes |
|------|-------|-------|
| `NATIVE_ACCOUNTING_ENABLED=1`, sales posting **off** | ✅ **Yes** | UI + CoA + manual/synthetic journals |
| `ACCOUNTING_SALES_POSTING_ENABLED=1` | ❌ **No** | Not approved — requires discovery worker + architectural sign-off |
| Discovery worker | ❌ **No** | Stub only |

Apply migration on staging DB before enabling flag:

```bash
cd backend && npx prisma migrate deploy
# Optional CoA seed:
npx ts-node scripts/seed-accounting-coa.ts
```

---

## Accounting Files Modified

### Backend — accounting module (new/updated)

- `backend/src/modules/accounting/account.service.ts`
- `backend/src/modules/accounting/accounting-audit.service.ts`
- `backend/src/modules/accounting/accounting-errors.ts`
- `backend/src/modules/accounting/accounting-period.service.ts`
- `backend/src/modules/accounting/accounting-sequence.ts`
- `backend/src/modules/accounting/accounting.handlers.ts`
- `backend/src/modules/accounting/accounting.routes.ts`
- `backend/src/modules/accounting/discovery-worker.ts`
- `backend/src/modules/accounting/journal.service.ts`
- `backend/src/modules/accounting/posting-event.service.ts`
- `backend/src/modules/accounting/posting-event-state.ts`
- `backend/src/modules/accounting/seed-coa.ts`
- `backend/prisma/migrations/20260822210000_accounting_phase1_5_hardening/migration.sql`

### Backend — tests

- `backend/test/accounting/hardening.test.ts`
- `backend/test/accounting/api-security.test.ts`
- `backend/test/helpers/test-db-guard.ts`
- `backend/test/helpers/test-db-guard.test.ts`
- `backend/test/helpers/commerce.ts` (test-only TRUNCATE + guard)
- `backend/test/setup.ts`
- `backend/vitest.config.ts`
- `backend/package.json` (test:hardening script)

### Frontend — accounting UI

- `frontend/app/admin/accounting/*`
- `frontend/components/admin/accounting/AdminAccountingNav.tsx`
- `frontend/lib/accounting-api.ts`

### Admin mount (non-commerce)

- `backend/src/modules/admin/admin.routes.ts` — mounts `/accounting` routes only

---

## Commerce Production Files Modified

**NONE**

Verified unchanged in this phase:

- Checkout, payment code, webhooks, `afterPaid.ts`, refunds, stock logic, invoice generation, GST commerce utilities, Zoho integration

---

## Unexpected/Unrelated Files Modified

**NONE** (after revert)

- `frontend/public/sw.js` — accidental PWA build artifact; **reverted**; git clean

---

## Staging Readiness Verdict

# **SAFE FOR STAGING — NO COMMERCE INGESTION**

The isolated accounting foundation is internally consistent, immutability-enforced at service and database layers, concurrency-safe for journal numbering and posting-event idempotency, and protected by test-database guards. Deploy to staging with `NATIVE_ACCOUNTING_ENABLED=1` and all posting flags **off** for shadow UI and manual journal work only.

**STOP.** Do not activate discovery worker or connect to real commerce data until architectural review approves the next phase.
