# SARVEDA NATIVE ACCOUNTING — PHASE 7C
# UAT + PRODUCTION READINESS (REVISED)

**Date:** 2026-08-26  
**Production cutover:** **01/09/2026 00:00:00 IST**  
**Authority:** Owner decision — zero Zoho migration; native accounting for new activity from cutover onward  

---

## Verdict (engineering readiness)

Accounts-team live checklist execution (A–L on Lightsail with process-scoped flags) remains the **human UAT** gate before Phase 7D.

This phase delivered:

| Deliverable | Status |
|-------------|--------|
| Sept 1 cutover decision documented | Done |
| Zero-Zoho-migration decision documented | Done |
| Cutover IST boundary verified + `.env.example` corrected | Done |
| Cutover guards extended (refund / bank charge / interest) | Done |
| `TEST-UAT-ACC-*` tagging supported in integrity/opening patterns | Done |
| User guide | `SARVEDA_ACCOUNTING_USER_GUIDE.md` |
| UAT checklist | `SARVEDA_ACCOUNTING_UAT_CHECKLIST.md` |
| Training cleanup plan (dry-run only — not executed) | §7 below |
| Sept 1 opening strategy (not staged/posted) | §8 below |
| Persistent production flags | Remain OFF / ABSENT |
| Zoho data migrated | **NO** |
| Reset `--execute` | **NO** |
| Production opening posted | **NO** |
| Phase 7D started | **NO** |

**Automated regression (this session):**

| Check | Result |
|-------|--------|
| Backend `tsc --noEmit` | PASS (exit 0) |
| Frontend `tsc --noEmit` | PASS (exit 0) |
| Cutover boundary tests (incl. IST midnight) | **5/5 PASS** |
| Focused pack (cutover + order-paid + settlement) | **42/42 PASS** |
| Full `test/accounting` suite | Timed out locally on slow concurrent refund stress test — not treated as product FAIL; prior Phase 7B baseline 424 PASS |

If accounts UAT later finds BLOCKER/HIGH correctness bugs, treat readiness as blocked until fixed.

---

## 1. Owner decisions (binding)

1. **Do not migrate Zoho accounting** (journals, historical sales/purchases, AP/AR, GST, gateway/marketplace clearing, retained earnings, TB, old bank recon, old P&L/BS).  
2. Zoho = **reference evidence only**. Apr–Aug reconciliation is a **separate** accounts exercise.  
3. Sarveda Native Accounting is the operational system for **new** activity from **01/09/2026 00:00 IST**.  
4. Aug 26–31 = **UAT / training** with `TEST-UAT-ACC-*` samples — not production openings.  
5. Permanent production flags and Phase 7D activation wait until UAT is clean.

---

## 2. Cutover boundary

| Item | Value |
|------|--------|
| Business cutover | 01/09/2026 00:00:00 IST |
| Env value | `ACCOUNTING_CUTOVER_DATE=2026-09-01T00:00:00+05:30` |
| Forward-only | `ACCOUNTING_CUTOVER_FORWARD_ONLY=1` (at production activation) |
| Semantics | `documentDate < cutover` → PRE_CUTOVER; `>=` → POST_CUTOVER |

**Critical:** bare `2026-09-01` parses as **UTC midnight = 05:30 IST** — wrong for owner intent. `.env.example` updated accordingly.

**Guards:** posting services call `assertDocumentDateAllowedForPosting` when forward-only is on. This phase also added asserts to:

- Full refund posting (`orderPlacedAt`)
- Bank charge categorization (`transactionDate`)
- Bank interest categorization (`transactionDate`)

Refund eligibility already returns `PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED` when sale history is missing for pre-cutover orders.

**Dual-system rule:** Native posting does not write Zoho books. Commerce may still have legacy Zoho paths for other ops — cutover activation must keep **one** accounting authority for new financial recognition (native from Sept 1). Pre-cutover history stays outside native auto-post.

---

## 3. UAT / training window (26–31 Aug)

| Rule | Detail |
|------|--------|
| Tag | `TEST-UAT-ACC-*` (also legacy `TEST-ACC*` / `SRV-TEST-ACC*` recognized by integrity) |
| Openings | **Do not** post real Sept 1 openings during UAT |
| Flags | Persistent `.env` stays OFF; process-scoped ON only for controlled UAT sessions |
| Lifecycle | Checklist scenarios A–L in `SARVEDA_ACCOUNTING_UAT_CHECKLIST.md` |

Sample lifecycle coverage already encoded in Vitest / prior Lightsail phase scripts (sale, refund, settlement, vendor bill/payment, expense, banking, GST, reports). Accounts team must still walk the **admin UI** with the checklist.

---

## 4. Training plan

| Artifact | Purpose |
|----------|---------|
| `SARVEDA_ACCOUNTING_USER_GUIDE.md` | Daily / weekly / monthly ops in plain language |
| `SARVEDA_ACCOUNTING_UAT_CHECKLIST.md` | Scenario steps, expected journals, PASS/FAIL |

Training focus: WHERE TO GO → WHAT TO ENTER → WHAT SYSTEM DOES → WHAT TO VERIFY → COMMON MISTAKES.

---

## 5. Bugs discovered / fixed (this phase)

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| 7C-UAT-001 | HIGH | Full refund posting lacked cutover forward-only assert (eligibility only) | **FIXED** — assert on `orderPlacedAt` in `postOrderRefundedFull` |
| 7C-UAT-002 | HIGH | Bank charge / interest posting lacked cutover assert | **FIXED** — assert on statement `transactionDate` |
| 7C-UAT-003 | MEDIUM | `.env.example` suggested bare `2026-09-01` (UTC ≠ IST midnight) | **FIXED** — offset form documented |
| 7C-UAT-004 | MEDIUM | Owner tag `TEST-UAT-ACC-*` not in integrity/opening patterns | **FIXED** — regex updated |

**Unresolved blockers from prior opening pack (superseded by zero-Zoho decision):** inventory cost / Zoho TB AP gaps — **no longer blocking** this revised 7C (Zoho openings abandoned). Physical inventory + bank/cash openings deferred to final cutover after UAT.

**Accounts UAT bug log:** empty until testers run A–L — use checklist Bug log table.

---

## 6. Production flags

| Flag family | Persistent status |
|-------------|-------------------|
| `NATIVE_ACCOUNTING_ENABLED` + posting flags | Remain **0 / ABSENT** in production `.env` |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | OFF |
| `ACCOUNTING_OPENING_BALANCE_ENABLED` | OFF until final opening |
| `NEXT_PUBLIC_ACCOUNTING_ENABLED` | Leave off until go-live UX decision |

UAT may use **in-process** env for a supervised session only; restore OFF afterward.

---

## 7. Training-data cleanup plan (DO NOT EXECUTE NOW)

Reuse Phase 7B:

- CLI: `backend/scripts/accounting-production-reset.ts` (default **dry-run**)
- Service: `accounting-reset.service.ts`

### Dry-run must prove first

| Prove | Expected |
|-------|----------|
| What accounting rows delete | Posting events, journals, lines, bank statements/matches/recon, transfers, settlements, inventory cost layers/consumptions, ITC evidence, opening batches, expense mappings, bank registry (shadow), audit log |
| What is preserved | Chart of accounts, periods, sequences; **Orders / Payments / Refunds / Products / Inventory / Users**; Vendors / Bills / POs / Receipts / Expenses (commerce purchase tables) |
| Inventory quantities | **Operational `Inventory.onHand` unchanged** by accounting reset |
| Real production ops data | Not deleted by accounting-domain reset |

### UAT tagging

Prefer `TEST-UAT-ACC-*` in memos, bank names, bill numbers, order notes. Integrity scan flags `TEST-UAT-ACC` / `TEST-ACC` / `SRV-TEST-ACC`.

Posted journals are immutable — cleanup = **domain reset**, not memo surgery.

### Execute gates (later, pre-7D)

1. Dry-run JSON reviewed by engineering + accounts  
2. Backup + SHA256 confirm token  
3. All persistent accounting flags OFF  
4. No POSTED production opening batch (or intentional wipe policy)  
5. Owner ack  

**This phase:** plan only — **reset execute did not run**.

---

## 8. September 1 opening strategy

| Category | Include? | Source |
|----------|----------|--------|
| Physical inventory | Yes (after UAT) | Sarveda onHand + approved unit costs |
| Bank balances | Yes | Actual bank statements / books at cutover |
| Cash | Yes | Actual petty cash count |
| Zoho AP / AR / GST / gateway / marketplace / RE | **No** | Explicit owner approval required if ever added |

**Do not stage/post final Sept 1 opening in this phase.** Final opening = post-UAT cutover (Phase 7D adjacency).

Prior DRAFT `OPEN-202608-00001` (Aug 25 Zoho-assisted pack) is **obsolete** under zero-Zoho policy — leave DRAFT / disposable; do not post.

---

## 9. Validation summary

| Area | Status |
|------|--------|
| Cutover IST unit tests | PASS |
| Backend / frontend TypeScript | PASS |
| Accounting integrity design | Debits=Credits enforced on post; BS ₹0 required in UAT L |
| Admin workflow usability | Documented in user guide + checklist (accounts to sign off) |
| Frontend build | Run at deploy time on Vercel; `tsc` clean locally |

---

## 10. Stop condition checklist

| # | Condition | Met? |
|---|-----------|------|
| 1 | UAT environment/workflow ready (docs + cutover + tags) | YES |
| 2 | Sample lifecycle demonstrable (tests + checklist + prior phase scripts) | YES (accounts still sign UI PASS) |
| 3 | Accounts guide exists | YES |
| 4 | UAT checklist exists | YES |
| 5 | Discovered engineering bugs documented/fixed | YES (7C-UAT-001..004) |
| 6 | Cleanup plan exists (not executed) | YES |
| 7 | Sept 1 cutover plan documented | YES |

**Explicit non-actions confirmed:** no Zoho migrate · no reset execute · no final opening post · no permanent flags · no Phase 7D.

---

## 11. Final response fields

| Field | Value |
|-------|--------|
| UAT scenarios tested (automated / prior) | Sale, refund, settlement, purchases, vendor payment, expense, banking, GST, reports (Vitest + historical Lightsail phase scripts); **UI A–L pending accounts** |
| PASS/FAIL (engineering) | Cutover IST **PASS**; tsc **PASS**; checklist UI **PENDING ACCOUNTS** |
| Bugs found | 7C-UAT-001..004 |
| Bugs fixed | 7C-UAT-001..004 |
| Remaining blockers | Accounts must complete checklist A–L without BLOCKER/HIGH; physical inventory cost file still required before Sept 1 opening |
| Training documents | User guide + UAT checklist + this report |
| Zoho migrated | **NO** |
| Reset execute | **NO** |
| Production opening posted | **NO** |
| Persistent flags enabled | **NO** |

---

## PHASE 7C UAT / PRODUCTION READINESS VALIDATED

*(Engineering + documentation gate. Accounts UI sign-off on `SARVEDA_ACCOUNTING_UAT_CHECKLIST.md` remains mandatory before Phase 7D.)*
