# SARVEDA NATIVE ACCOUNTING — PHASE 2B STAGING VALIDATION

**Date:** 2026-08-22  
**Scope:** ORDER_PAID_V1 shadow validation against non-production commerce data  
**Phase 2C:** Not started

---

## 1. Environment Proof

| Check | Result |
|-------|--------|
| NODE_ENV | `development` |
| Database host | `localhost` |
| Database name | `sarveda_db` |
| Database port | `5432` |
| Production-like detection | **false** |
| NATIVE_ACCOUNTING_ENABLED | `1` (for validation run) |
| ACCOUNTING_SALES_POSTING_ENABLED | `0` → then `1` only for controlled local posts |
| ACCOUNTING_BULK_DISCOVERY_ALLOWED | unset / false |
| ACCOUNTING_PRODUCTION_POSTING_ALLOWED | unset / false |

**Verdict:** Active DB is **local/dev**, not production. No production credentials or hosts were used. No passwords/connection strings are recorded here.

**Important limitation:** This machine does not have a separate remote staging DB attached. Validation used the local non-production Postgres with existing paid test orders (`SRV-TEST-*`). Safety constraints for “not production” were satisfied; scenario richness is limited (see §3 / §18).

---

## 2. Production Guard Result

### Finding before change
`assertSalesPostingPersistenceAllowed()` previously required only `ACCOUNTING_SALES_POSTING_ENABLED=1`. On a production-like environment, that alone could persist even a **single** ORDER_PAID journal.

### Change implemented (accounting module only)
Production-like persistence now requires **both**:

1. `ACCOUNTING_SALES_POSTING_ENABLED=1`
2. `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` (default absent/false)

Rules verified by tests:

- Staging/dev: sales posting flag alone is enough
- Production-like + sales only → **blocked**
- Production-like + both flags → allowed
- Preview remains read-only (does not call persistence guard)
- Bulk discovery still requires `ACCOUNTING_BULK_DISCOVERY_ALLOWED=1` when production-like and limit > 1

Files:

- `backend/src/modules/accounting/production-guard.ts`
- `backend/test/accounting/production-guard.test.ts`
- `backend/.env.example` (documented; defaults remain off)

**Production posting override was NOT enabled during this validation.**

---

## 3. Staging/Dev Orders Selected

Maximum sample: **3** paid-pipeline orders (all available eligible rows ≤ 10).

| Order | Provider | Pattern coverage |
|-------|----------|------------------|
| SRV-TEST-d6c8b6bc | RAZORPAY | A no-discount, C intra-state (Karnataka), H qty=2 |
| SRV-TEST-05160154 | RAZORPAY | same shape |
| SRV-TEST-00a60b69 | RAZORPAY | same shape |

### Coverage matrix

| Case | Available? |
|------|------------|
| A Razorpay no discount | YES |
| B Razorpay with discount | NO |
| C Intra-state GST | YES |
| D Inter-state GST | NO |
| E Shipping charge | NO |
| F Multiple line items | NO |
| G Multiple GST rates | NO |
| H Quantity > 1 | YES |
| I COD | NO |

Orders were **not modified**.

---

## 4. Preview Results (no persistence)

All 3 orders:

| Metric | Value |
|--------|-------|
| Eligible | true |
| Jurisdiction | INTRA_STATE |
| Grand total | 236000 paise |
| Subtotal | 236000 |
| Discount | 0 |
| Shipping | 0 |
| Pre-discount taxable | 200000 |
| Post-discount taxable | 200000 |
| CGST / SGST / IGST | 18000 / 18000 / 0 |
| 4200 contra | 0 |
| Debit / Credit | 236000 / 236000 |
| Imbalance | **0** |
| PDF GST vs native GST | 36000 / 36000 (variance 0) |
| Zoho merchandise variance | 0 |
| calcVersion | `ORDER_PAID_V1` |

**All proposed journals balanced.** No order stopped for imbalance.

Proposed lines (each):

- Dr 1020 Razorpay Clearing 236000
- Cr 4000 Product Sales 200000
- Cr 2100 Output CGST 18000
- Cr 2101 Output SGST 18000

---

## 5. First Dry-Run

Target: `SRV-TEST-d6c8b6bc`  
Discovery: `dryRun=true`, single order

| Check | Result |
|-------|--------|
| AccountingPostingEvent created | **0** |
| AccountingJournalEntry created | **0** |
| Commerce fingerprint unchanged | **YES** |

---

## 6. First Real Shadow Post

Flags for post (local only):

- `NATIVE_ACCOUNTING_ENABLED=1`
- `ACCOUNTING_SALES_POSTING_ENABLED=1`
- `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` unset

| Check | Result |
|-------|--------|
| Events | **1** |
| eventType | `ORDER_PAID` |
| uniqueKey | `order:{orderId}:paid` |
| Journals | **1** |
| Entry | `JE-202608-00001` |
| Status | POSTED |
| Debit = Credit | 236000 = 236000 |
| Provider clearing | 1020 Razorpay Clearing |
| GST accounts | 2100 CGST + 2101 SGST |
| ORDER_PAID_V1 in memo/calcVersion | YES |
| Duplicate on first post | false |

Commerce fingerprint after post: **unchanged**.

---

## 7. Idempotency Replay

5× direct `postOrderPaidJournal` + discovery re-run on same order:

| Attempt | Result |
|---------|--------|
| 1–5 direct | `duplicate: true`, same `JE-202608-00001` |
| Final counts | **1 event / 1 journal** |

No second journal created.

---

## 8. Discount / GST Validation

**Not available in DB** — no discounted paid order present.

Recorded as **DATA GAP** (not ERROR). Algorithm path for discount remains covered by unit tests from Phase 2B implementation, not by this live shadow sample.

---

## 9. Zoho Parity Validation

For available orders:

- Local Zoho invoice id/number: **missing** (`NOT_AVAILABLE_LOCALLY`)
- Merchandise parity variance (native vs Zoho construction helper): **0 paise**
- Category: **EXPECTED** / **DATA GAP** (no local Zoho invoice reference)

No Round Off used.

---

## 10. Multi-line / Multi-rate Validation

**Not available** in local paid sample (single line, single rate, qty=2 only).

**DATA GAP.**

---

## 11. COD Validation

**No COD paid orders** in local DB.

**DATA GAP.** Cannot live-verify Dr 1100 AR vs cash/clearing on this dataset. Unit/matrix tests from Phase 2B still cover COD mapping.

---

## 12. Bounded Discovery Results

| Step | dryRun | limit | scanned | posted | duplicates |
|------|--------|-------|---------|--------|------------|
| Dry batch | true | 10 | 3 | 0 | — |
| Persist batch | false | 10 | 3 | 2 (1 already posted) | 1 |
| Replay batch | false | 10 | 3 | 0 | **3** |

No duplicates beyond idempotent handling. Cap respected (≤10).

---

## 13. Reconciliation Results

For all 3 orders:

| Commerce | Native | PDF | Zoho |
|----------|--------|-----|------|
| 236000 / disc 0 / ship 0 / RAZORPAY | taxable 200000; CGST/SGST 18k/18k; net 200000; JE present after post | taxable 200000; GST 36000; variance **0** | local ref missing; merchandise variance **0** |

### Variance categories

| Order | PDF variance | Zoho merch variance | Category |
|-------|--------------|---------------------|----------|
| all 3 | 0 | 0 | **EXPECTED** |
| gaps | — | — | **DATA GAP**: Zoho local ref, discount, COD, interstate, shipping, multi-rate |

**No unexplained ERROR variances.**

---

## 14. Commerce Integrity Proof

SHA-256 fingerprints (order, payments, items, inventory, invoice, Zoho fields) compared before/after:

- dry-run
- first post
- replay
- bounded discovery

**Result:** commerce rows unchanged for all 3 orders. Only `Accounting*` tables received writes.

---

## 15. Test / Build Results

| Check | Result |
|-------|--------|
| Prisma validate | PASS |
| Backend tests | **94 / 94 PASS** (12 files) |
| Includes production-guard dual-flag tests | PASS |
| Backend build (`tsc`) | PASS |
| Frontend build | PASS |

---

## 16. Files Modified (this validation task)

| File | Why |
|------|-----|
| `backend/src/modules/accounting/production-guard.ts` | Dual production persistence guard |
| `backend/test/accounting/production-guard.test.ts` | Guard tests |
| `backend/.env.example` | Document new flag (defaults off) |
| `backend/scripts/phase2b-staging-validation.ts` | Repeatable local validation runner |
| `SARVEDA_ACCOUNTING_PHASE2B_STAGING_VALIDATION.md` | This report |

---

## 17. Unexpected Modifications

**NONE** to:

- checkout / payment success / afterPaid / refunds
- Zoho sync
- PDF GST
- production env configuration
- commerce schema for this validation

`frontend/public/sw.js` remains an unrelated prior dirty file; **not modified for this task**.

---

## 18. Remaining Discrepancies / Gaps

| Item | Type | Notes |
|------|------|-------|
| No remote staging cluster used | DATA GAP / ENV LIMIT | Only localhost non-prod DB available here |
| No discount / COD / interstate / shipping / multi-rate live orders | DATA GAP | Re-run validation when richer staging orders exist |
| Zoho invoice ids absent locally | DATA GAP | Marked NOT_AVAILABLE_LOCALLY; no Zoho API mutation |
| Live COD AR debit path | DATA GAP | Covered by unit tests, not this live sample |

No live journal imbalance. No commerce mutation. No production touch.

---

## 19. Recommendation

1. Keep `ACCOUNTING_SALES_POSTING_ENABLED=0` and `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` unset on production.
2. When a real remote staging DB with discount/COD/interstate orders is available, re-run `scripts/phase2b-staging-validation.ts` (or admin preview/post) against that host only after repeating environment proof.
3. Phase 2C design may proceed for architecture discussion; **do not implement Phase 2C yet** until product owners accept the live coverage gaps above.

---

## Final Verdict

**PHASE 2B STAGING VALIDATED — READY FOR PHASE 2C DESIGN**
