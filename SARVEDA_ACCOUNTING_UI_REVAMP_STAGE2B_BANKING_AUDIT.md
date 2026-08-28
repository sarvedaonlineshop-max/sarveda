# SARVEDA ACCOUNTING UI REVAMP — STAGE 2B BANKING AUDIT

**Domain:** Banking + Bank Statements + Reconciliation  
**Mode:** READ-ONLY architecture & UX capability discovery  
**Date:** 2026-08-28  
**Prerequisite stages:** 1 / 1.1 / 2A / 2A.1 (visually approved)

**Hard constraints observed for this audit:** no frontend/backend/API/schema/accounting/matching/reconciliation/flag changes; no migrations; no data resets.

**Capability legend used throughout:**

| Tag | Meaning |
|-----|---------|
| **IMPLEMENTED** | Backend + usable (or nearly usable) UI path exists |
| **PARTIALLY IMPLEMENTED** | Backend exists; UI incomplete, buried, or weakly gated |
| **DISPLAY ONLY** | Shown to user; no mutating action on this surface |
| **DATA GAP** | Explicitly marked or structurally incomplete data |
| **NOT IMPLEMENTED** | No product path (or permanently stubbed) |

---

## 1. Executive summary

Sarveda banking is a **file-import, GL-backed book banking** system — **not** a live bank feed.

**What works today (when flags are on):**

- Bank / cash / petty-cash **registry** bound to ASSET GL codes
- **Book balance** from posted journals
- **Transfers** (bank↔bank, cash→bank, bank→cash) with draft → preview → post (journal)
- **CSV/XLSX statement import** (evidence only — no GL from import)
- **Auto-matching** statement lines to existing journals (amount + direction + UTR/ref + date windows)
- Manual **confirm / unmatch**; charge & interest **create journals**; ignore (no journal)
- **Per-account, per-period reconciliation** with recompute → reconcile (lock) → reopen
- **Gateway clearing control board** (Razorpay real-ish; Stripe/PayPal/COD largely DATA_GAP)

**What does not exist:**

- Live ICICI / bank API balance or statement sync
- Cash → cash transfers
- Hard delete of bank accounts
- Opening balance posting from Banking UI (API exists; UI lives under Opening / cutover)
- Dedicated Banking sub-routes — everything is one crowded `/admin/accounting/banking` page

**Stage 2B UI revamp can proceed without backend changes** by reorganizing presentation around these real capabilities. Optional FUTURE items are listed separately and are **not** required for Stage 2B.

---

## 2. Current frontend

### 2.1 Routes

| Route | Page file | Notes |
|-------|-----------|--------|
| `/admin/accounting/banking` | `frontend/app/admin/accounting/banking/page.tsx` | **Only** Banking UI surface |
| Nav | `AdminAccountingNav.tsx` | Group `"Banking"` → item `"Banking"` |

**No** sub-routes for statements, matching, transfers, or reconciliation.

### 2.2 Related (same domain, different screens)

| Route | Relationship |
|-------|----------------|
| `/admin/accounting/settlements` | Posts gateway settlements into target bank account — not statement matching |
| `/admin/accounting` | Hub KPI “Bank & Cash” + quick action “Import Bank Statement” |
| `/admin/accounting/opening` | Cutover opening balances (includes bank GLs) |
| `/admin/accounting/reports` | Ledger integrity “reconciliation” — **not** bank statement recon |
| `/admin/accounting/vendor-payments` | Pays from bank/cash registry |

### 2.3 Page sections (vertical, no tabs)

1. Header — **Banking & Cash**
2. Flag / error / success banners
3. **Accounts — BOOK BALANCE** (table + Set Razorpay target / Deactivate)
4. **Create account (synthetic / test)** + **Transfer** (2-column)
5. **Bank statements** (gated by statement import flag)
6. **Payment gateway clearing** (display from dashboard)
7. **Bank reconciliation** (gated by recon flag)
8. **Recent transfers**

### 2.4 Feature flags surfaced in UI

| Flag | Env | UI effect |
|------|-----|-----------|
| Banking | `ACCOUNTING_BANKING_ENABLED` | Amber banner if off (transfer **post** needs it) |
| Statement import | `ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED` | Gates statements section |
| Reconciliation | `ACCOUNTING_BANK_RECONCILIATION_ENABLED` | Gates recon section + Charge/Interest/Ignore on lines |

Also requires `NATIVE_ACCOUNTING_ENABLED=1` at API router level.

### 2.5 Actions → APIs (UI-wired)

| Action | API |
|--------|-----|
| Load | `GET /banking/dashboard`, `GET /bank-transfers`, imports, reconciliations |
| Create account | `POST /bank-accounts` |
| Set Razorpay target | `PATCH /bank-accounts/:id` |
| Deactivate | `POST /bank-accounts/:id/deactivate` |
| Transfer draft+preview+post | `POST /bank-transfers`, `/preview`, `/post` |
| Statement preview/commit | `POST /bank-statements/preview`, `/commit` |
| Lines / rerun match | `GET /lines`, `POST .../rerun-matching` |
| Confirm / unmatch | `POST .../match/confirm`, `/unmatch` |
| Charge / interest / ignore | `POST .../categorize/charge|interest|ignore` |
| Recon create/recompute/reconcile/reopen | `POST /bank-reconciliations...` |

### 2.6 APIs available but unused (or underused) on Banking page

- `GET /bank-accounts`, `GET /bank-accounts/:id`
- `GET /bank-statements/imports/:id`, `/lines/:id/candidates`
- `POST /bank-statements/match/reject`
- `POST /bank-statements/categorize/unknown`
- `GET /bank-reconciliations/:id`, `PATCH .../balances`
- `POST /bank-opening/preview|post`
- Transfer `PATCH` / `DELETE` draft
- Standalone `GET /gateway-clearing/controls` (dashboard already embeds controls)

### 2.7 Empty / error / terminology notes

- Errors: red banners; successes: green banners
- Flag-off: amber instructional copy with **env var names** (engineering tone)
- No dedicated empty states for zero accounts / lines / transfers
- Previews dump **raw JSON** in `<pre>`
- Ignore may use `window.prompt`
- Shared `stmtBankId` state couples statement bank picker and recon create

---

## 3. Current backend APIs

Mount: `/api/admin/accounting/*` (admin + accounting access).  
Global: `NATIVE_ACCOUNTING_ENABLED`.

### 3.1 Nested feature flags

```
NATIVE_ACCOUNTING_ENABLED
  └─ ACCOUNTING_BANKING_ENABLED          (transfer/opening journal post)
       └─ ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED
            └─ ACCOUNTING_BANK_RECONCILIATION_ENABLED
                 (+ assertBankReconciliationPostingAllowed for charge/interest)
```

Production posting also respects `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` where production-guard applies.

### 3.2 Endpoint summary

| METHOD | ROUTE | R/W | Flag | Accounting effect |
|--------|-------|-----|------|-------------------|
| GET | `/banking/dashboard` | R | Native | None |
| GET | `/bank-accounts` | R | Native | None (book bal = GL) |
| GET | `/bank-accounts/:id` | R | Native | None |
| POST | `/bank-accounts` | W | Native only | Registry (+ optional CoA); **no journal** |
| PATCH | `/bank-accounts/:id` | W | Native | Metadata only; **GL immutable** |
| POST | `/bank-accounts/:id/deactivate` | W | Native | Soft deactivate |
| GET/POST/PATCH/DELETE | `/bank-transfers`… | R/W | Native (post needs Banking) | Draft; **post → journal** |
| POST | `/bank-opening/preview\|post` | R/W | Banking on post | **Opening journal** |
| POST | `/bank-statements/preview\|commit` | R*/W | Statement import | Evidence + auto-match; **no GL** |
| GET | `/bank-statements/imports`, `.../:id`, `/lines` | R | Native | None |
| POST | `.../rerun-matching` | W | Native† | Match rows only |
| POST | `/match/confirm\|unmatch\|reject` | W | Native† | Link/unlink journals |
| GET/POST | `/bank-reconciliations`… | R/W | Recon on writes | Snapshot/lock; **no GL** |
| POST | `/categorize/charge\|interest` | W | Recon posting | **Creates journal** |
| POST | `/categorize/ignore\|unknown` | W | Recon | Status only; **no journal** |
| GET | `/gateway-clearing/controls` | R | Native | None |

† Match mutations blocked when line’s period is **RECONCILED**.

---

## 4. Data models

### 4.1 `AccountingBankAccount` — bank/cash registry

**Represents:** Operational bank/cash identity bound to one ASSET GL.  
**User meaning:** “Our HDFC account / Petty cash drawer.”  
**Status:** `isActive`; flags `isDefault`, `razorpaySettlementTarget`, `statementImportEnabled`.  
**Stored:** name, bankName?, maskedAccountNumber?, ifsc?, currency (INR), glAccountCode (unique), accountType BANK|CASH|PETTY_CASH.  
**Journals:** Indirect via GL code — book balance = posted Dr−Cr.  
**Immutability:** Soft deactivate; GL/type not editable after create.

### 4.2 `AccountingBankTransfer`

**Represents:** Movement between two registry accounts.  
**Kinds:** INTERNAL_TRANSFER, CASH_DEPOSIT, CASH_WITHDRAWAL.  
**Status:** DRAFT | POSTED | VOID.  
**Links:** `journalEntryId`, `postingEventId` when posted; reference/memo stored.  
**Idempotency:** unique posting key `bank_transfer:{id}`.

### 4.3 `AccountingBankStatementImport`

**Represents:** One committed CSV/XLSX file for a bank account.  
**Status:** IMPORTED | FAILED.  
**Dedup:** unique `(bankAccountId, fileHash)`.  
**Balances:** optional opening/closing derived from file.  
**Effect:** Evidence only.

### 4.4 `AccountingBankStatementLine`

**Represents:** One bank statement transaction.  
**Match statuses:** UNMATCHED, MATCHED_EXACT, MATCHED_MANUAL, MATCHED_CATEGORIZED, POSSIBLE, DUPLICATE, REVIEW_REQUIRED, IGNORED.  
**Categories:** BANK_CHARGE, BANK_INTEREST, IGNORE, UNKNOWN, POSSIBLE_DUPLICATE_GATEWAY_FEE.  
**Dedup:** unique `(bankAccountId, transactionFingerprint)`.  
**Recon link:** optional `reconciliationId`.

### 4.5 `AccountingBankStatementMatch`

**Represents:** Candidate or confirmed link line ↔ journal.  
**Confidence:** EXACT | HIGH | POSSIBLE.  
**Status:** CANDIDATE | CONFIRMED | REJECTED.  
**Types:** RAZORPAY_SETTLEMENT, VENDOR_PAYMENT, EXPENSE, BANK_TRANSFER, BANK_OPENING, BANK_CHARGE, BANK_INTEREST, JOURNAL_OTHER.  
**Important:** Confirming a match **does not create** a journal (except charge/interest categorize paths which create then link).

### 4.6 `AccountingBankReconciliation`

**Represents:** Formal **per bank account × period** (periodStart–periodEnd).  
**Status:** OPEN | IN_PROGRESS | RECONCILED | REOPENED.  
**Balances:** statement opening/closing; book opening/closing; period Dr/Cr; difference.  
**Lock:** RECONCILED stores `snapshotJson`; blocks match/categorize on covered lines.  
**Unique:** `(bankAccountId, periodStart, periodEnd)`.  
**Optional:** linked `statementImportId`.

### 4.7 Gateway clearing

Not a separate persistent “clearing row” model for the control board — computed from GL activity (1020/1021/1022/1100) + `AccountingGatewaySettlement` + commerce `Payment` counts. Settlements themselves are a separate accounting document posted under Settlements UI.

---

## 5. Bank accounts

| Capability | Status |
|------------|--------|
| Create bank account | **YES** (IMPLEMENTED) |
| Edit bank account | **PARTIAL** — metadata PATCH; UI only uses Razorpay-target toggle |
| Deactivate | **YES** |
| Delete | **NO** |
| Set opening balance (from Banking UI) | **NO** (API IMPLEMENTED; UI under Opening) |
| View book balance | **YES** |
| View statement balance | **YES** (`latestStatementBalanceInPaise`) |
| View reconciled balance | **PARTIAL** — recon Δ / status on row; not a dedicated “last reconciled balance” field prominently labeled |
| View latest reconciliation | **PARTIAL** — status + U/R counts; `lastReconciliationAt` on type but lightly used |
| Associate bank GL | **YES** at create |
| Associate bank name / account number | **PARTIAL** — schema has bankName/IFSC; create UI only name, GL, type, masked number |
| Cash account support | **YES** |
| Dynamic bank GL | **YES** (createGlIfMissing option server-side) |
| Reserved GL protection | **YES** — blocks 1020, 1021, 1022, 1100, 1200, 1210 |

**Displayed today:** Name, GL, Type, Masked, Book balance, Stmt balance, Recon Δ, Recon status, Flags.

**Not inventable / not live:** full account number, live bank balance, IFSC in table.

---

## 6. Transfers

| Direction | Supported? | UI? |
|-----------|------------|-----|
| Bank → Bank | YES (`INTERNAL_TRANSFER`) | YES |
| Cash → Bank | YES (`CASH_DEPOSIT`) | YES |
| Bank → Cash | YES (`CASH_WITHDRAWAL`) | YES |
| Cash → Cash | **NO** | — |

| Aspect | Status |
|--------|--------|
| Preview | YES |
| Post | YES (needs banking flag + prod guard) |
| Journal | Dr destination GL / Cr source GL (`BANK_TRANSFER_V1`) |
| Reference/UTR | Stored on transfer |
| Idempotency | Posting event unique key |
| Cutover / production guard | YES on post |
| Draft edit/delete API | YES — **not in Banking UI** |

---

## 7. Statement import

| Aspect | Finding |
|--------|---------|
| Formats | **CSV**, **XLSX** (first sheet); max ~15MB |
| Column mapping | **Automatic** via header aliases — **no user column mapper** |
| Required | `transactionDate` + debit and/or credit |
| Optional | valueDate, description/narration, reference/UTR, running balance |
| Steps | Upload → Preview → Commit |
| Duplicate file | Prevented by `(bankAccountId, fileHash)` when IMPORTED |
| Duplicate lines | Fingerprint unique; prior → status **DUPLICATE** (still stored) |
| Malformed rows | Block commit if parse errors / in-file duplicates / zero valid rows |
| Account type | **BANK only** for import |
| GL from import | **None** — evidence only |
| Opening/closing | Derived from running balances when present |

**Limitations:** No OFX/QIF/bank API; no interactive column map; rejected rows reviewed only via preview payload (JSON today).

---

## 8. Statement line / match statuses

### Line `matchStatus`

| Status | Meaning | Created by | User change? | Affects recon? | Creates accounting? | Reversible? |
|--------|---------|------------|--------------|----------------|---------------------|-------------|
| UNMATCHED | No usable candidate | Import / rematch | Confirm / categorize / ignore | Blocks reconcile if unresolved | No | N/A |
| POSSIBLE | Amount+dir candidates only | Auto-match | Confirm / unmatch / categorize | Blocks | No | Yes via unmatch |
| REVIEW_REQUIRED | Ambiguous EXACT/HIGH or UNKNOWN/gateway-fee warning | Auto / UNKNOWN / fee guard | Confirm / reject path / categorize | Blocks | No | Yes |
| MATCHED_EXACT | Auto-confirmed single EXACT | Auto | Unmatch | Resolved | Link only | Yes |
| MATCHED_MANUAL | User confirmed candidate | Confirm | Unmatch | Resolved | Link only | Yes |
| MATCHED_CATEGORIZED | Charge/interest posted | Categorize | Unmatch (then rematch) | Resolved | **Yes** (journal already posted) | Unmatch unlinks; journal remains |
| DUPLICATE | Fingerprint seen before | Import | Treat carefully | Blocks if unresolved | No | Not a “match” undo |
| IGNORED | Manually ignored | Ignore | Unmatch first to change | Resolved (with reason) | No | Unmatch + rematch |

### Match row status

CANDIDATE → CONFIRMED or REJECTED.  
Confidence: EXACT / HIGH / POSSIBLE.

---

## 9. Matching (verified against code)

**Auto-match rules (actual):**

1. **Amount** exact (statement debit XOR credit = journal bank leg amount)
2. **Direction:** statement credit → bank GL **debit**; statement debit → bank GL **credit**
3. **Normalized UTR/ref** (alphanumeric upper); exact if both ≥6 chars; partial containment → HIGH
4. **Date windows:** EXACT/HIGH ±**3** days; POSSIBLE ±**7** days; journal search ±**90** days
5. **Correct bank account** (settlement/vendor/transfer targeting that registry GL)
6. **Auto-confirm** only if exactly **one EXACT** candidate → `MATCHED_EXACT`
7. Multiple EXACT/HIGH → `REVIEW_REQUIRED`; POSSIBLE-only → `POSSIBLE`

**Also:**

- Amount-only within ±7 → POSSIBLE candidates
- Same journal **CONFIRMED** on only one line **per bank account** (cross-account transfer legs allowed)
- Manual confirm / unmatch; reject-candidate API exists (**UI not wired**)
- Matching **does not post** GL

---

## 10. Reconciliation

**Model:** Per **bank account** × **calendar period** (not per import alone; import optional).

```
Create (OPEN) → Recompute → IN_PROGRESS / REOPENED
  → optional balance patch → Recompute
  → Reconcile → RECONCILED (lock + snapshot)
  → Reopen(reason ≥3) → REOPENED → …
```

| Item | Source |
|------|--------|
| Book balances | Posted journals on bank GL for period |
| Statement closing | User entry and/or import-derived |
| Difference | `bookClosing − statementClosing` (must be **0** to reconcile) |
| Unresolved lines | UNMATCHED / POSSIBLE / REVIEW_REQUIRED / DUPLICATE block |
| IGNORED | Allowed if `categoryNote` present |

**Reconcile does not create journals.** It locks matching/categorization for lines in that period.

**UI gap:** Create/recompute/reconcile/reopen controls exist, but **selected recon detail KPIs** (`fetchBankReconciliation`) are **not** shown — dangerous opacity for accountants.

---

## 11. Bank charge / interest

| | Bank Charge | Bank Interest |
|--|-------------|---------------|
| From unmatched line | YES (when recon flag on) | YES |
| Direction | Debit only | Credit only |
| Journal | Dr **5390** / Cr bank GL | Dr bank / Cr **4500** |
| Duplicate protection | Posting unique key per line | Same |
| Gateway fee guard | If settlement fee ≈ amount ±7d → REVIEW + 409 | — |
| UI wording today | “Charge” / “Interest” | Same |

---

## 12. Ignore / UNKNOWN / COD

| Action | Journal? | Recon effect | UI |
|--------|----------|--------------|-----|
| IGNORE | No | Counts resolved (reason required) | YES (`Ignore`) |
| UNKNOWN | No | May set REVIEW_REQUIRED — **still unresolved** | API only — **not in UI** |
| COD remittance categorize | — | — | **NOT IMPLEMENTED** (`isAccountingCodCollectionEnabled` always false; COD control always DATA_GAP) |

Ignore retains audit via category + note + user/timestamp fields.

---

## 13. Gateway clearing

| Provider | GL | Data quality | UI actions on Banking |
|----------|-----|--------------|------------------------|
| Razorpay | 1020 | GL + posted settlements — clearest | **DISPLAY ONLY** (settle elsewhere) |
| Stripe | 1021 | Often **DATA_GAP** / SETTLEMENT_NOT_CONFIGURED | Display only |
| PayPal | 1022 | Same as Stripe | Display only |
| COD | 1100 AR | Always **DATA_GAP** (fulfillment ≠ remittance) | Display only |

**Distinction:** Commerce payment capture ≠ accounting clearing settlement. Settlement **posting** is on Gateway Settlements; Banking shows control balances + last UTR/date when available.

---

## 14. Balance semantics

| Balance | Source | Real-time bank? | User meaning |
|---------|--------|-----------------|--------------|
| Book balance | Posted GL Dr−Cr | **No** — books | What ledger says we have |
| Statement balance | Latest import closing | **No** — file | What last statement said |
| Recon difference | Book vs statement closing | No | Out-of-balance until matched |
| Opening (cutover) | Opening batch / bank-opening post | No | Starting books |
| Gateway clearing | GL 1020/21/22 | No | Uncleared gateway money |
| Cash book | Same as book for CASH GLs | No | Cash drawer books |
| Live ICICI/bank API | — | **DOES NOT EXIST** | — |
| Available / float | — | **NOT IMPLEMENTED** | — |

**Critical UX rule for Stage 2B:** Never label book balance as “live bank balance.”

---

## 15. Journals / accounting effects

| Workflow | Creates journal? |
|----------|------------------|
| Create bank account | No |
| Statement import | No |
| Auto/manual match confirm | **No** — links existing |
| Unmatch / reject | No |
| Reconciliation / reopen | No |
| Ignore / UNKNOWN | No |
| Bank transfer post | **Yes** |
| Bank opening post | **Yes** |
| Bank charge | **Yes** |
| Bank interest | **Yes** |
| Vendor payment / expense / settlement | **Yes** (other modules; appear as match targets) |

---

## 16. Terminology audit

| Current term | Flag | Suggested accountant label (do not implement yet) |
|--------------|------|---------------------------------------------------|
| Banking & Cash | GOOD | Keep |
| Accounts — BOOK BALANCE | AMBIGUOUS / technical | Bank & Cash Accounts |
| Create account (synthetic / test) | TOO TECHNICAL | Add Bank / Cash Account |
| GL | TOO TECHNICAL in primary UI | Ledger account (code secondary) |
| Stmt balance | AMBIGUOUS | Statement balance |
| Recon Δ / U{n} R{n} | TOO TECHNICAL | Difference / Unmatched / Needs review |
| razorpay-target | TOO TECHNICAL | Settlement destination |
| Confirm / Unmatch | GOOD | Keep; confirm dialog |
| Charge / Interest | AMBIGUOUS | Record bank charge / Record interest |
| Gateway clearing / DATA_GAP | TOO TECHNICAL | Outstanding clearing / Data incomplete |
| POSSIBLE / EXACT / REVIEW_REQUIRED | AMBIGUOUS | Suggested match / Exact match / Needs review |
| Recompute | TOO TECHNICAL | Refresh balances |
| ACCOUNTING_*_ENABLED=1 in banners | TOO TECHNICAL | Soften to “Banking posting is off” |
| AccountingBankStatementLine (if ever shown) | MISLEADING | Never show model names |

---

## 17. UX problems (current structure)

1. **One mega-page** mixes registry, transfers, import, matching, gateway, recon, recent transfers.
2. **Engineering copy** (env vars, synthetic/test, JSON dumps, enum flags).
3. **Dangerous actions** adjacent to read-only tables with weak confirmation (Charge/Interest/Reconcile/Deactivate).
4. **Recon without visible KPIs** after select — user can lock blind.
5. **Shared bank picker** between statements and recon.
6. **Unused APIs** leave matching depth (candidates, reject, UNKNOWN) buried.
7. **Gateway clearing** competes for attention with operational banking.
8. **No account detail view** — everything is flat tables.
9. **Crowding:** create+transfer beside accounts; statements before recon explanation.

**Logical split for Stage 2B (tabs/subpages):** Overview | Accounts | Statements & Matching | Transfers | Reconciliation | Gateway Clearing.

---

## 18. Proposed Stage 2B information architecture

**No new backend required for IA.** Reuse existing APIs.

| Proposed screen | Purpose | Primary APIs | Primary KPIs | Primary actions | Main list | Dangerous |
|-----------------|---------|--------------|--------------|-----------------|-----------|-----------|
| **Banking Overview** | Situation board | dashboard, transfers, recon list | Book total, unmatched, recon status, gateway outstanding | Jump to import / recon / transfer | Attention + recent transfers | None |
| **Bank Accounts** | Registry | accounts CRUD subset | Per-account book/stmt/Δ | Create, deactivate, set settlement target | Accounts table | Deactivate |
| **Account detail** (optional soft panel) | Single account focus | account get, lines, recon | Book/stmt/last recon/unmatched | Import, start recon | Recent lines | Charge/interest if shown |
| **Statements & Matching** | Import + work queue | preview/commit/lines/match | Unmatched / review counts | Import, confirm, unmatch, charge, interest, ignore | Statement lines | Charge/Interest/Ignore |
| **Transfers** | Move money | transfers create/preview/post | Recent posted | Create → Preview → Post | Transfers | Post |
| **Reconciliation** | Period close | recon CRUD lifecycle | Book vs statement vs difference | Create, recompute, reconcile, reopen | Recons + unresolved lines | Reconcile / Reopen |
| **Gateway Clearing** | Clearing control | dashboard / gateway controls | Outstanding by provider | Link to Settlements | Provider rows | None on this screen |

**Why combine Statements + Matching:** Same import-centric workflow; matching is line work on imported evidence.  
**Why separate Gateway:** Different job (clearing health vs bank books); avoids DATA_GAP noise on daily bank work.

---

## 19. Banking Overview — KPI availability

| Metric | Available now? | Source |
|--------|----------------|--------|
| Bank & Cash book balance | **YES** | Sum `bookBalanceInPaise` from dashboard accounts |
| Number of bank accounts | **YES** | `accounts.length` (filter active) |
| Unmatched statement transactions | **YES** | Sum `unmatchedCount` on accounts / or lines filter |
| Items needing review | **YES** | `reviewRequiredCount` |
| Unreconciled accounts | **PARTIAL** | Infer from `reconciliationStatus` ≠ RECONCILED / null — no dedicated API field |
| Gateway clearing outstanding | **YES** | `gatewayControls[].balanceInPaise` |
| Recent transfers | **YES** | `listBankTransfers` |
| Latest reconciliation status | **YES** | Account fields + `listBankReconciliations` |

Do **not** invent live bank balance or FY cash-flow KPIs without new APIs.

---

## 20. Account page — supportability

| Element | Supportable now? |
|---------|------------------|
| Account name | YES |
| Masked account number | YES |
| Book balance | YES |
| Statement balance | YES |
| Last reconciled balance/date | **PARTIAL** — status/Δ/lastReconciliationAt; full snapshot via recon detail API |
| Unmatched count | YES |
| Recent statement lines | YES (`listBankStatementLines?bankAccountId=`) |
| Recent journals/transfers | **PARTIAL** — transfers list filter by account not first-class in UI; journals via match/GL reports |
| Import statement | YES |
| Start reconciliation | YES |

---

## 21. Risk controls (UX recommendations — not implemented)

| Action | Risk | Suggested safety |
|--------|------|------------------|
| Confirm match | Wrong journal linked | Preview candidate amount/date/ref; confirm dialog |
| Unmatch | Breaks recon readiness | Confirm; show if period open |
| Reconcile lock | Premature close | Show difference + unresolved count; disable until zero; explicit “Lock period” |
| Reopen | Allows edits after close | Require reason (already); show who locked when |
| Bank charge / interest | Wrong expense/income | Preview journal lines; amount/direction check; gateway-fee warning |
| Transfer post | Wrong accounts | Preview Dr/Cr; disable same-account |
| Wrong bank on import | Contaminates matching | Confirm account name before commit |
| Duplicate import | Noise / DUPLICATE lines | Surface “already imported” clearly |
| Deactivate account | Breaks payment targets | Confirm; warn if Razorpay target / balances |

---

## 22. Future integrations (EXCLUDED FROM STAGE 2B)

**NOT REQUIRED FOR CURRENT LAUNCH**

- ICICI (or any bank) direct feed
- Live bank balance API
- Automatic daily statement fetch
- Payment initiation / payout APIs
- Webhook bank events
- Interactive column mapping UI (nice-to-have; aliases work today)
- COD remittance posting (stub only)
- Stripe/PayPal settlement posting parity with Razorpay
- Cash → cash transfers
- Hard delete bank accounts

Do not mix these into Stage 2B UI redesign scope.

---

## 23. UAT / test-data observations

**Local backend `DATABASE_URL` queried read-only (2026-08-28):**

| Entity | Count |
|--------|------:|
| Bank accounts | 0 |
| Statement imports | 0 |
| Statement lines | 0 |
| Matches | 0 |
| Transfers | 0 |
| Reconciliations | 0 |
| Bank charge / interest categorizations | 0 |
| Gateway settlements | 0 |

**Interpretation:** Local DB has **no** banking UAT seed. Staging/Lightsail UAT counts were **not** queried in this audit (no remote DB session opened). Staging visual review may still have accounts created via UI under enabled flags — treat local zeros as **local-only**.

---

## 24. Stage 2B implementation recommendation

### Do in Stage 2B (frontend presentation)

1. Split mega-page into Overview + Accounts + Statements/Matching + Transfers + Reconciliation + Gateway Clearing (tabs or sub-routes).
2. Replace engineering terminology; hide env var names behind soft copy.
3. Surface recon KPIs before lock; soft confirmations on dangerous posts.
4. Keep all handlers/APIs/matching/recon rules unchanged.
5. Prefer accountant language for match statuses.
6. Clarify book vs statement vs clearing balances (never “live bank”).

### Do **not** in Stage 2B

- Backend matching rule changes
- Live bank integrations
- New posting types
- Schema migrations
- Claiming Stripe/PayPal/COD clearing completeness

### Backend changes required for UI revamp?

**NO** (for presentation IA). Optional later: wire reject/UNKNOWN/recon detail panels already served by existing APIs.

### Accounting logic changes required?

**NO**

### Ready for Stage 2B UI implementation?

**YES** — capabilities are documented and sufficient for a presentation-only redesign.

---

## Capability matrix (compact)

| Area | Verdict |
|------|---------|
| Bank/cash registry | IMPLEMENTED |
| Book / statement balances | IMPLEMENTED |
| Transfers (3 directions) | IMPLEMENTED |
| Statement CSV/XLSX import | IMPLEMENTED |
| Auto + manual matching | IMPLEMENTED |
| Charge / interest posting | IMPLEMENTED |
| Ignore | IMPLEMENTED |
| Period reconciliation lock/reopen | IMPLEMENTED |
| Opening from Banking UI | PARTIALLY (API yes, Banking UI no) |
| Edit account metadata UI | PARTIALLY |
| Reject candidate / UNKNOWN UI | PARTIALLY (API yes) |
| Gateway Razorpay view | DISPLAY ONLY (+ settle elsewhere) |
| Stripe/PayPal/COD clearing | DATA GAP |
| Live bank feed | NOT IMPLEMENTED |
| Cash→cash | NOT IMPLEMENTED |

---

*End of audit document. No application code was modified.*
