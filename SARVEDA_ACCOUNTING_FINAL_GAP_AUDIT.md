# SARVEDA ACCOUNTING UI — FINAL GAP AUDIT AFTER STAGE 2F

**Mode:** READ-ONLY audit (no application, backend, schema, API, or accounting-logic changes)  
**Date:** 2026-08-28  
**Scope closed through:** Stage 2A → 2F.1 (foundation, Purchases/Banking, Sales, Inventory, GST & Tax, Accountant + polish)  
**Sources:** live nav (`AdminAccountingNav.tsx`), all `frontend/app/admin/accounting/**/page.tsx`, `accounting.routes.ts`, `accounting-api.ts`, production/cutover/period guards, Phase 6–7C docs

---

## Executive summary

The Accounting workspace **IA is structurally complete** for Sarveda’s event-sourced, read-mostly accountant model:

| Layer | Status |
|-------|--------|
| Operational domains (Sales, Purchases ops, Banking, Inventory, GST) | Present and navigable |
| Ledger inspection (Accountant: CoA + Journals) | Present (2F / 2F.1 closed) |
| Financial statements (Reports: TB / GL / P&L / BS + exports + integrity) | Backend real; UI usable; polish residual |
| Cutover tooling (Advanced: opening, recognition ops) | Present; correctly muted / Advanced |

**What remains before “product-complete” is mostly:**

1. **Reports + Advanced UI polish** (humanize integrity/GL event codes, drill-down UX, Advanced tone)  
2. **Process / cutover ops** (UAT checklist, opening post, flag activation) — not missing screens  
3. **Known accounting-logic deferrals** (cash flow, manual JE, period-close UI, TDS/RCM, partial-refund GST, filing) — ERP-level or post-go-live, not Stage 2F gaps  

**Recommended next engineering phase:** Final Reports / Advanced presentation pass → optional interaction polish → accounts UAT with flags still controlled.

---

## 1. Complete route inventory

### 1.1 Sidebar tree (production IA)

Built by `frontend/components/admin/accounting/AdminAccountingNav.tsx` → `buildAccountingNavGroups`.

| Route | Nav label | Classification |
|-------|-----------|----------------|
| `/admin/accounting` | Dashboard | **A. Production workspace** |
| `/admin/accounting/sales` | Sales → Overview | **A** |
| `/admin/accounting/order-paid` | Sales → Sales Entries | **A** |
| `/admin/accounting/order-refunded-full` | Sales → Refunds | **A** |
| `/admin/accounting/settlements` | Sales → Gateway Settlements | **A** |
| `/admin/purchases/vendors` | Purchases → Vendors* | **A** (ops; gated by purchases feature) |
| `/admin/purchases/purchase-orders` | Purchases → Purchase Orders* | **A** |
| `/admin/purchases/bills` | Purchases → Bills* | **A** |
| `/admin/purchases/expenses` | Purchases → Expenses* | **A** |
| `/admin/accounting/vendor-payments` | Purchases → Vendor Payments | **A** |
| `/admin/accounting/banking` | Banking → Overview | **A** |
| `/admin/accounting/banking/accounts` | Banking → Bank & Cash | **A** |
| `/admin/accounting/banking/accounts/[id]` | (detail; linked from list) | **A** |
| `/admin/accounting/banking/statements` | Banking → Statements | **A** |
| `/admin/accounting/banking/transfers` | Banking → Transfers | **A** |
| `/admin/accounting/banking/reconciliation` | Banking → Reconciliation | **A** |
| `/admin/accounting/banking/gateway` | Banking → Gateway Clearing | **A** |
| `/admin/accounting/inventory` | Inventory → Overview | **A** |
| `/admin/accounting/inventory/valuation` | Inventory → Valuation | **A** |
| `/admin/accounting/inventory/reconciliation` | Inventory → Reconciliation | **A** / **C** (diagnostic tone) |
| `/admin/accounting/inventory/capitalization` | Inventory → Purchase Capitalization | **A** |
| `/admin/accounting/inventory/cogs` | Inventory → Cost of Goods Sold | **A** |
| `/admin/accounting/inventory/reversals` | Inventory → Reversals | **A** |
| `/admin/accounting/gst` | GST & Tax → Overview | **A** |
| `/admin/accounting/gst/sales` | GST & Tax → Sales GST | **A** |
| `/admin/accounting/gst/itc` | GST & Tax → Purchase GST / ITC | **A** |
| `/admin/accounting/gst/ledger` | GST & Tax → GST Ledger | **A** / **B** |
| `/admin/accounting/gst/reconciliation` | GST & Tax → Reconciliation | **C** |
| `/admin/accounting/gst/reports` | GST & Tax → Reports & Export | **B** (management; not statutory filing) |
| `/admin/accounting/accountant` | Accountant → Overview | **A** |
| `/admin/accounting/accounts` | Accountant → Chart of Accounts | **A** (read-only) |
| `/admin/accounting/journals` | Accountant → Journal Entries | **A** (read-only) |
| `/admin/accounting/reports` | Reports → Financial Reports | **B** (+ integrity **C**) |
| `/admin/accounting/expense-mappings` | Advanced → Expense Account Rules | **D** |
| `/admin/accounting/vendor-bills` | Advanced → Bill Recognition | **D** / **F** (UUID/ops tooling) |
| `/admin/accounting/expenses` | Advanced → Expense Recognition | **D** / **F** |
| `/admin/accounting/purchases` | Advanced → Purchase Reconciliation | **C** / **D** |
| `/admin/accounting/opening` | Advanced → Opening Balances | **D** (cutover; high risk) |
| `/admin/accounting/inventory/opening` | Advanced → Inventory Opening | **D** (cutover; high risk) |

\*Purchases ops routes live under `/admin/purchases/*` but are linked inside Accounting → Purchases when purchases feature is enabled.

### 1.2 Related purchases routes (linked / detail)

| Route | Classification |
|-------|----------------|
| `/admin/purchases` | **A** / legacy hub (may overlap Accounting Purchases nav) |
| `/admin/purchases/purchase-orders/new` | **A** |
| `/admin/purchases/purchase-orders/[id]` | **A** |
| `/admin/purchases/bills/new` | **A** |

### 1.3 Orphan / unused / engineering-only

| Item | Classification | Notes |
|------|----------------|-------|
| Accounting page routes not in nav | **H. Unused / orphaned** — **none found** | All static accounting pages are in nav or Dashboard; `[id]` bank detail is list-linked |
| `GET /api/admin/accounting/health` | **F. Engineering-only** | Backend exists; no frontend client/UI |
| `GET /api/admin/accounting/reports/test-fixtures` | **F** | Backend exists; correctly **not** in UI |
| `accounting-reset.service` / CLI reset script | **F** / **SHOULD NOT BE EXPOSED** | No HTTP route; Opening UI shows CLI-only notice |
| Duplicate recon endpoints `reconciliation/v2`–`v5` | **C** / **F** | Used by Advanced recognition pages / ops; not first-class nav destinations |
| Cash Flow report route | **H** / N/A | Does not exist (FE or BE) |

### 1.4 Legacy / duplication notes (routes)

| Overlap | Classification | Canonical home |
|---------|----------------|----------------|
| TB / GL / P&L / BS linked from Accountant + full UI in Reports | Intentional | **Reports** = statements; **Accountant** = deep-link only |
| Gateway clearing (Banking) vs Settlements (Sales) | Complementary | Settlements = post payout; Gateway = clearing control/view |
| GST Reports vs Financial Reports | Complementary | GST = tax management; Reports = books |
| Purchase Reconciliation (Advanced) vs Inventory/Banking/GST recon | Diagnostic family | Keep Advanced for AP/ops DQ; domain recon stays in domain |
| Vendor bill/expense **ops** (`/admin/purchases/*`) vs **recognition** (Advanced) | Split by design | Day-to-day docs in Purchases; ledger recognition tools in Advanced |

---

## 2. Reports workspace audit

**UI:** `frontend/app/admin/accounting/reports/page.tsx`  
**APIs:** `GET /reports/trial-balance|general-ledger|profit-loss|balance-sheet|dashboard|integrity` + `export/xlsx|gl-xlsx|pdf`  
**Gate:** `ACCOUNTING_REPORTS_ENABLED`

### 2.1 Report matrix

| Report | Backend data | Journal-based | UI readiness | Tech residue | Notes |
|--------|--------------|---------------|--------------|--------------|-------|
| **Trial Balance** | Real (Phase 6B) | Yes (posted journals) | Production-usable | Account codes (expected) | As-of or period; include zeros; PDF |
| **General Ledger** | Real | Yes | Production-usable | Raw `eventType` in Event column | Account + date range; pagination; GL XLSX; journal # → journals **list** (not detail deep-link) |
| **Profit & Loss** | Real (Phase 6C) | Yes (mapped accounts) | Production-usable | Minor “OpEx” shorthand | Prior period + YTD **net** text; line → GL |
| **Balance Sheet** | Real | Yes | Production-usable | — | Comparison requested; **UI does not render** `bs.comparison` |
| **Cash Flow** | **Absent** | — | **Not implemented** | — | Explicitly out of Phase 6D scope |
| **Overview dashboard** | Real | Aggregates | Usable | “Gateway Clearing”, AR/AP labels | FY filters; KPI drill into P&L/BS |
| **Reconciliation & Checks** | Real integrity service | Cross-checks | Usable / diagnostic | Raw check **codes**, severity enums | Integrity tab; not statutory audit trail |
| **Account ledger drill-down** | Via GL | Yes | Partial | — | From TB/P&L/BS → GL by account |
| **Opening/closing balances** | In TB/GL services | Yes | Present in TB/GL semantics | — | No separate “opening balance report” UI |
| **Comparative periods** | Partial APIs | — | Partial | — | P&L/dashboard nets; BS comparison unused in UI |
| **Journal drill-down** | Partial | — | Partial | — | GL → `/journals` list only |
| **Source-document drill-down** | Links exist on journal detail | — | **Weak from Reports** | — | Order/bill/settlement not from report rows |
| **Export** | XLSX pack, statement PDF, GL XLSX | Same services as UI | Present | — | Integrity export not a separate product export |

### 2.2 APIs present but under-exposed

| API | UI exposure |
|-----|-------------|
| `/reports/integrity` | Exposed as “Reconciliation & Checks” |
| `/reports/financial-year` | Used for FY selector |
| `/reports/accounts` | GL account picker |
| `/reports/test-fixtures` | **Not** in UI (correct) |
| `/health` (discovery health) | **Not** in UI |

### 2.3 Overlap with Accountant

| Function | Canonical home |
|----------|----------------|
| Chart of Accounts browse | **Accountant** |
| Journal list + detail | **Accountant** |
| Trial Balance / GL / P&L / BS / exports / integrity | **Reports** |
| Quick links to TB/GL | Accountant Overview → Reports deep-links (`?tab=` / `&account=`) |

### 2.4 Minimum final Reports UI structure (recommendation only — do not implement here)

Keep **one** Financial Reports page with tabs:

1. Overview  
2. Trial Balance  
3. General Ledger  
4. Profit & Loss  
5. Balance Sheet  
6. Reconciliation & Checks (integrity — keep, but humanize codes in a later polish pass)

Do **not** add Cash Flow until a backend engine exists.  
Do **not** move Journals into Reports.  
Polish-only targets later: humanize GL events / integrity codes; GL → journal detail; optional BS comparison display; avoid inventing new metrics.

---

## 3. Advanced workspace audit

| Feature | Route | Audience classification | Danger |
|---------|-------|------------------------|--------|
| Expense Account Rules | `/expense-mappings` | **ACCOUNTANT-ONLY** / config | Mis-mapping can mis-post expenses; not destructive to history by itself |
| Bill Recognition | `/vendor-bills` | **SUPER-ADMIN / ops** (UUID tooling) | Preview/post/discover can create journals when flags ON |
| Expense Recognition | `/expenses` | **SUPER-ADMIN / ops** | Same — posting when flags ON |
| Purchase Reconciliation | `/purchases` | **ACCOUNTANT-ONLY** (read DQ) | Low danger (read dashboard) |
| Opening Balances | `/opening` | **SUPER-ADMIN ONLY** cutover | **HIGH** — post is “irreversible for cutover”; templates include GST/equity/AP/AR/bank; gated by `ACCOUNTING_OPENING_BALANCE_ENABLED` + production dual-flag |
| Inventory Opening | `/inventory/opening` | **SUPER-ADMIN ONLY** cutover | **HIGH** — posts opening inventory layers/journals |
| GST Opening (dedicated page) | — | N/A | GST opening lines live **inside** Opening Balances staging (`gst` template) — not daily GST nav |
| Accounting reset | CLI only | **DEVELOPER / ENGINEERING ONLY** | **SHOULD NOT BE EXPOSED IN PRODUCTION UI** |
| Test fixtures API | Backend only | **DEVELOPER ONLY** | Keep out of UI |
| Feature flags / posting controls | Env + status banner | **DEVELOPER / SUPER-ADMIN** | Changing `ACCOUNTING_*` / `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` can enable live posting |
| Period close / reopen UI | **Absent** | — | Backend `assertEntryDateInOpenPeriod` only; no admin UI |
| Bank recon lock/reopen | Banking (not Advanced) | **ACCOUNTANT-ONLY** | Reopen unlocked periods — operational, controlled |

### Dangerous actions inventory (do not change — awareness)

| Action | Where | Risk |
|--------|-------|------|
| Post opening batch | Advanced → Opening | Cutover journal; irreversible intent |
| Post inventory opening | Advanced → Inventory Opening | Layers + journals |
| Post / discover recognition tools | Advanced vendor-bills / expenses; also Sales/Inventory/Banking post buttons | Creates immutable posted journals when flags allow |
| Bank statement categorize charge/interest | Banking | Posts bank journals |
| Bank reconciliation reconcile/reopen | Banking | Locks/unlocks statement mutation |
| Expense mapping upsert | Advanced | Changes future posting destinations |
| CLI accounting reset | Ops only | Wipes accounting shadow data — commerce preserved by design |

---

## 4. Duplication audit — canonical homes

| Function | Canonical home | Elsewhere |
|----------|----------------|-----------|
| Company financial statements (TB/GL/P&L/BS) | **Reports** | Accountant links only |
| Chart of Accounts | **Accountant** | — |
| Journal inspection | **Accountant** | Dashboard “recent”; GL event column |
| Sales recognition (order paid / refund / settlement) | **Sales** | — |
| Purchase documents (vendor/PO/bill/expense ops) | **Purchases** (`/admin/purchases`) | Advanced recognition for ledger post |
| Vendor payment posting | **Purchases → Vendor Payments** | — |
| Bank accounts / statements / transfers / recon | **Banking** | — |
| Gateway clearing balance/control | **Banking → Gateway Clearing** | Sales settlements for payout posting |
| Inventory valuation / COGS / capitalization | **Inventory** | Opening in Advanced |
| GST position / ITC / GST reports | **GST & Tax** | GST opening via Advanced Opening |
| Opening balances (books) | **Advanced → Opening Balances** | — |
| Integrity / books health | **Reports → Reconciliation & Checks** | Dashboard Needs Attention |
| Cutover / training banner | Global `AccountingUatBanner` | — |

**Do not implement redirects in this audit.** Prefer documentation + later polish to reinforce ownership rather than collapsing domains.

---

## 5. Accounting workflow completeness

Verified against posting services / eligibility / UI screens (not marketing copy alone).

### 5.1 Sales → cash cycle

| Step | Status | Evidence |
|------|--------|----------|
| Customer order (commerce) | IMPLEMENTED | Orders module (outside accounting UI) |
| Payment captured | IMPLEMENTED | Payments / Razorpay |
| Sales journal `ORDER_PAID` | IMPLEMENTED | Sales Entries + posting APIs |
| GST Output on sale | IMPLEMENTED | Embedded in order-paid journals; GST Sales views |
| Inventory COGS | IMPLEMENTED | Inventory → COGS (FIFO) when flags ON |
| Gateway clearing | IMPLEMENTED | Settlement posts clearing; Banking gateway view |
| Gateway settlement → bank | IMPLEMENTED | Sales → Settlements |
| Bank statement match | IMPLEMENTED | Banking → Statements |
| Bank period reconciliation | IMPLEMENTED | Banking → Reconciliation |

### 5.2 Purchases → pay cycle

| Step | Status | Evidence |
|------|--------|----------|
| Vendor / PO / receipt / bill ops | IMPLEMENTED | `/admin/purchases/*` |
| Vendor bill AP journal | IMPLEMENTED | Advanced Bill Recognition + purchases posting |
| Input GST / ITC evidence | IMPLEMENTED / PARTIAL | GST ITC workflow; claim ≠ filing |
| Inventory capitalization | IMPLEMENTED | Inventory → Purchase Capitalization |
| Standalone expense journal | IMPLEMENTED | Advanced Expense Recognition + mappings |
| Vendor payment → bank/cash | IMPLEMENTED | Vendor Payments |
| RCM on purchases/expenses | NOT IMPLEMENTED | Explicit `RCM_DATA_GAP` |

### 5.3 Refund cycle

| Step | Status | Evidence |
|------|--------|----------|
| Full refund accounting | IMPLEMENTED | Sales → Refunds |
| GST credit note (full) | IMPLEMENTED / PARTIAL | GST reports credit-notes; management not filing |
| COGS reversal on sellable restock | IMPLEMENTED | Inventory → Reversals |
| Partial refund accounting | NOT IMPLEMENTED | Eligibility / GST `PARTIAL_REFUND_GST_DATA_GAP` |
| Multiple partials → full | NOT IMPLEMENTED | Deferred (`MULTIPLE_REFUNDS_UNALLOCATED`) |

### 5.4 Cutover / opening

| Step | Status |
|------|--------|
| Opening balance batch stage/validate/preview/post | IMPLEMENTED (Advanced; flags OFF by default) |
| Inventory opening layers | IMPLEMENTED (Advanced) |
| Production reset | DIAGNOSTIC / ENGINEERING ONLY (CLI) |
| Period close workflow | NOT IMPLEMENTED (assert only) |

---

## 6. Accounting control gap audit

| Capability | Status | Bucket |
|------------|--------|--------|
| Manual Journal Entries | Not in product (by design) | **POST-GO-LIVE IMPORTANT** (ops escape hatch) / may stay deferred if event-only policy holds |
| Journal reversal / void | Not in UI; event reverse paths only where built (e.g. COGS reversal) | **POST-GO-LIVE IMPORTANT** |
| Period close / lock UI | Backend assert only | **POST-GO-LIVE IMPORTANT** |
| Chart of Accounts CRUD | Read-only CoA | **POST-GO-LIVE IMPORTANT** (seeded CoA may suffice at go-live) |
| Account disable/archive | Not in Accountant UI | **FUTURE / ERP-LEVEL** |
| Audit trail browsing | No dedicated browser (journals + integrity only) | **POST-GO-LIVE IMPORTANT** |
| Fiscal year configuration UI | FY read via reports API; no admin editor | **POST-GO-LIVE IMPORTANT** |
| Opening balance controls | Advanced Opening (exists) | **GO-LIVE BLOCKER** if cutover requires openings and they are not posted — **process**, not missing UI |
| Bank reconciliation controls | Implemented in Banking | OK for go-live |
| GST filing integration (GSTR-1/3B portal) | Management reports only | **FUTURE / ERP-LEVEL** (honest Stage 2E stance) |
| TDS | Not implemented | **FUTURE / ERP-LEVEL** |
| RCM | Data-gap / deferred | **POST-GO-LIVE IMPORTANT** if vendors use RCM |
| Partial refund accounting | Deferred | **POST-GO-LIVE IMPORTANT** |
| Shipping GST completeness | Partial / gap called out in GST | **POST-GO-LIVE IMPORTANT** |
| Buyer GSTIN completeness | Partial / gap | **POST-GO-LIVE IMPORTANT** for B2B filing quality |
| Warehouse-level inventory costing | Not implemented | **FUTURE / ERP-LEVEL** |
| Cost adjustments | Not implemented | **FUTURE / ERP-LEVEL** |
| Bad debt / write-off | Not implemented | **FUTURE / ERP-LEVEL** |
| Credit/debit notes beyond full-refund flow | Limited | **POST-GO-LIVE IMPORTANT** |
| Cash Flow statement | Not implemented | **FUTURE / ERP-LEVEL** |
| COD collection accounting | Hard-coded OFF | **FUTURE / ERP-LEVEL** |

### Go-live blockers (honest)

Primarily **operational**, not missing Stage 2 screens:

1. Accounts UAT checklist (Phase 7C A–L) clean  
2. Correct cutover env (`ACCOUNTING_CUTOVER_DATE` IST, forward-only when activating)  
3. Opening strategy executed if required (books + inventory)  
4. Domain posting flags + `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` only after UAT  
5. No accidental bulk discovery / reset on production-like DB  

Missing ERP features (cash flow, TDS, filing, manual JE) are **not** listed as UI-revamp blockers for declaring the **workspace structurally complete**.

---

## 7. UI consistency audit (no polish yet)

### Consistent (post 2A–2F.1)

- Shared cream/green accounting visual language (`accounting-ui`, domain shells)  
- Page titles + short subtitles on most domains  
- UAT banner on accounting layout  
- KPI cards / section cards pattern in Sales, Banking, Inventory, GST, Accountant  
- Status badges with humanized labels in polished domains  
- Accountant 2F.1: humanized journal descriptions; Technical details collapsed  

### Remaining inconsistencies (presentation debt)

| Area | Issue |
|------|-------|
| Reports | Integrity **raw codes**; GL **raw eventType**; engineering “Reconciliation & Checks” density |
| Advanced | Expense-mappings subtitle still CoA-code / engineering tone; recognition pages UUID-centric |
| Dashboard vs Accountant | Overlapping “health / recent journals” storytelling |
| Purchases | Mix of `/admin/purchases` ops chrome vs Accounting sidebar embedding |
| Filters | Domain-specific chips vs Reports date bar vs journals page-scoped filters — works but not identical |
| Destructive confirms | Opening uses `window.confirm`; Banking/Inventory may use modals — uneven |
| Empty states | Present in redesigned domains; older Advanced pages thinner |
| Account presentation | Name-primary/code-secondary strong in Accountant; still code-first in mappings / some reports |
| Raw UUID | Still primary input on Bill/Expense Recognition Advanced tools |
| Raw enums | Integrity statuses / some recon diagnostics |

**Do not polish in this task** — feed into final Reports/Advanced UI pass + optional global interaction pass.

---

## 8. UAT / production safety

### Controls present

| Control | Behavior |
|---------|----------|
| `NATIVE_ACCOUNTING_ENABLED` | Master off by default |
| Per-domain `ACCOUNTING_*_ENABLED` flags | Default OFF |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | Required on production-like hosts for persistence |
| `isProductionLikeEnvironment()` | NODE_ENV=production **or** DATABASE_URL markers (incl. Lightsail/RDS) |
| Bulk discovery guard | Blocks bulk on prod-like unless `ACCOUNTING_BULK_DISCOVERY_ALLOWED` |
| Cutover date + forward-only | Blocks pre-cutover document posting when configured |
| Closed period assert | Blocks posting into CLOSED `AccountingPeriod` |
| Idempotent posting / duplicate guards | Domain-specific (order, settlement, bill, expense, etc.) |
| Opening flag | Separate `ACCOUNTING_OPENING_BALANCE_ENABLED` |
| UAT banner | `NEXT_PUBLIC_ACCOUNTING_UAT_MODE`; shows posting ON/OFF + go-live date |
| Reset | CLI with confirm token — not in UI |

### Residual accident vectors (awareness only)

| Risk | Mitigation already / gap |
|------|--------------------------|
| Admin enables production posting too early | Process + banner; no extra UI lock |
| Advanced recognition “Discover/Post” with flags ON | Dual-flag + bulk guard |
| Opening post without validated staging | Confirm dialog only — operator discipline |
| Bank recon reopen | Intentional ops control |
| Staging pointing at production-like DB URL | Marker list treats as production-like — good |
| Period never closed | Assert useless until periods seeded/closed out-of-band |

**No configuration changed by this audit.**

---

## 9. Final Accounting information architecture

**Verdict:** Preferred structure remains correct after inspection. Keep it.

```
Accounting
  Dashboard          — Company-wide financial pulse and items needing attention.
  Sales              — Recognize customer payments, full refunds, and gateway settlements.
  Purchases          — Run vendor/PO/bill/expense ops and record vendor payments.
  Banking            — Manage bank/cash, statements, transfers, reconciliation, and gateway clearing.
  Inventory          — Inspect valuation and post capitalization, COGS, and reversals.
  GST & Tax          — Review output/input GST, ITC, ledger, recon, and management exports.
  Accountant         — Inspect chart of accounts and posted journals (read-only).
  Reports            — Run TB, GL, P&L, BS, exports, and books integrity checks.
  Advanced           — Cutover openings and low-frequency recognition/mapping tools.
```

Optional later (not required for structural completeness): demote Advanced recognition further or add role gating — **out of scope** here.

---

## 10. Final verdict matrix

| ID | Topic | Rating / answer |
|----|--------|-----------------|
| **A** | Sales maturity | **High** — order paid, full refund, settlements UI + APIs; partial refunds absent |
| **B** | Purchases maturity | **High** — ops + vendor payments + bill/expense recognition; RCM deferred |
| **C** | Banking maturity | **High** — accounts, statements, transfers, recon, gateway; COD collection OFF |
| **D** | Inventory maturity | **High** — valuation, capitalization, COGS, reversals; opening in Advanced |
| **E** | GST maturity | **Medium–High** — ledger/ITC/management reports; **not** filing; known data gaps |
| **F** | Accountant maturity | **High** (for read-only inspection) — 2F.1 closed |
| **G** | Reports maturity | **Medium–High** — real TB/GL/P&L/BS/exports; polish + no cash flow |
| **H** | Advanced maturity | **Adequate** — cutover tools exist; UX still ops/engineering |
| **I** | Remaining frontend UI gaps | Reports integrity/GL copy; Advanced tone; BS comparison unused; journal deep-link from GL; minor cross-domain consistency |
| **J** | Remaining backend gaps (for UI cleanup) | Mostly none for polish; Cash Flow / period admin / CoA CRUD / health UI would need new or unused APIs |
| **K** | Remaining accounting-logic gaps | Cash flow; manual JE; period close UX; TDS; RCM; partial refunds; filing; warehouse costing; write-offs |
| **L** | Go-live blockers | **Process/UAT/cutover/flags/openings** — not missing Stage 2 workspace screens |
| **M** | Post-go-live items | Period close UI; audit browser; CoA CRUD; partial refunds; RCM; shipping/buyer GSTIN; manual JE policy |
| **N** | Legacy/orphan routes | **No orphan accounting pages**; unused: health + test-fixtures APIs; CLI reset |
| **O** | Dangerous actions found | Opening post; inventory opening post; domain post/discover; bank categorize/recon; CLI reset; production posting flag |
| **P** | Backend changes required for remaining **UI cleanup** | **NO** (presentation polish can proceed on existing APIs) |
| **Q** | Accounting logic changes required for remaining **UI cleanup** | **NO** |
| **R** | Ready for final Reports/Advanced UI pass | **YES** |
| **S** | Ready for interaction/motion polish | **YES** (after or parallel to Reports/Advanced copy polish; not blocking structure) |
| **T** | Ready for production accounting UAT | **YES** — with flags controlled, UAT banner on, cutover/opening process followed (Phase 7C checklist still the human gate) |

---

## Recommended sequence after this audit

1. **Final Reports UI polish** (humanize integrity/GL; preserve calcs; optional deep-links)  
2. **Final Advanced UI polish** (accountant-facing copy; keep dangerous actions gated and labeled)  
3. Optional **interaction/motion polish** across Accounting  
4. Execute **accounts UAT** + cutover activation checklist (ops)  

Do **not** expand into Cash Flow / Manual JE / Period Close / Filing in the UI-revamp track unless explicitly scoped as a new phase.

---

SARVEDA ACCOUNTING FINAL GAP AUDIT COMPLETE — READY FOR REVIEW
