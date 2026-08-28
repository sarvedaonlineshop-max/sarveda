# SARVEDA ACCOUNTING UI REVAMP — STAGE 2F ACCOUNTANT AUDIT

**Mode:** Read-only audit (no implementation)  
**Date:** 2026-08-28  
**Prior closed:** Stage 2A–2E (Purchases · Banking · Sales · Inventory · GST & Tax)

This document inventories what the **Accountant** area actually provides today, what belongs elsewhere, and what Stage 2F can redesign using existing APIs only.

**No application code, schema, APIs, or accounting logic were modified.**

---

## 0. Executive summary

The sidebar group **Accountant** currently contains only two thin, pre-revamp screens:

| Route | Label | Reality |
|-------|--------|---------|
| `/admin/accounting/accounts` | Chart of Accounts | Read-only CoA list (`GET /accounts`) |
| `/admin/accounting/journals` | Journals | Read-only header list, first 50 (`GET /journals`) — **no line detail UI** |

Sarveda’s GL is **event-sourced**: journals are created by domain posting (Sales, Purchases, Banking, Inventory, Opening), not by a free-form accountant journal editor.

**Financial substance** (Trial Balance, General Ledger, P&L, Balance Sheet, integrity) lives under **Reports** (`/admin/accounting/reports`), not Accountant.

**Cutover / opening** lives under **Advanced** (`/admin/accounting/opening`, Inventory Opening).

**Missing (confirmed):** manual journals API, period close/lock UI/API, arbitrary journal void/reverse, CoA CRUD UI, audit-log browse API.

Stage 2F should polish **ledger inspection** (CoA + journals with detail) and clarify ownership vs Reports — **not** invent filing/period/manual JE workflows.

---

## 1. Surface inventory

### 1.1 Navigation (`AdminAccountingNav`)

| Group | Items | Role |
|-------|--------|------|
| **Accountant** | Chart of Accounts, Journals | Thin catalog screens |
| **Reports** | Financial Reports | TB, GL, P&L, BS, integrity, exports |
| **Advanced** | Opening Balances, Inventory Opening, expense mappings, bill/expense recognition, purchase recon | Cutover + ops tooling |

No dedicated `/admin/accounting/accountant` hub page.

### 1.2 Frontend pages in scope

| Path | File | Mutations |
|------|------|-----------|
| `/admin/accounting/accounts` | `accounts/page.tsx` | None |
| `/admin/accounting/journals` | `journals/page.tsx` | None |
| `/admin/accounting/reports` | `reports/page.tsx` | None (exports only) — adjacent |
| `/admin/accounting/opening` | `opening/page.tsx` | Staging save, validate, **Post Opening** — Advanced |

### 1.3 Backend routes (Accountant-relevant)

Mounted under `/api/admin/accounting` (requires native accounting):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/accounts` | List CoA |
| GET | `/journals` | Paginated journal headers (+ lines in payload) |
| GET | `/journals/:id` | Journal detail + lines + postingEvent + documentLinks |
| GET | `/reports/trial-balance` | Trial Balance |
| GET | `/reports/general-ledger` | General Ledger |
| GET | `/reports/accounts` | Report account picker |
| GET | `/reports/profit-loss`, `/balance-sheet`, `/dashboard`, `/integrity`, exports | Financial statements |

**Not present:** `POST /journals`, reverse/void journal, period close/lock, CoA create/update, audit log list.

### 1.4 Core services / models

- `journal.service.ts` — `createAndPostJournal` / `createAndPostJournalInTx` (internal; POSTED immutable)
- `posting-event.service.ts` — idempotent `postJournalFromEvent`
- `accounting-period.service.ts` — `assertEntryDateInOpenPeriod` (gate only)
- `trial-balance.service.ts`, `general-ledger.service.ts`, P&L / BS builders
- Prisma: `AccountingAccount`, `AccountingJournalEntry`, `AccountingJournalLine`, `AccountingPostingEvent`, `AccountingPeriod`, `AccountingAuditLog`, `AccountingDocumentLink`

### 1.5 Frontend API clients (`accounting-api.ts`)

| Present | Absent |
|---------|--------|
| `fetchAccountingAccounts` | Journal detail by id |
| `fetchAccountingJournals(limit, offset)` | Manual journal create/post |
| Full financial report fetchers + exports | Period close/lock |
| Opening batch APIs | Audit log browse |

---

## 2. Feature inventory & maturity

| Feature | Where | Maturity | Why |
|---------|--------|----------|-----|
| Chart of Accounts list | Accountant UI + GET `/accounts` | **B** Functional but incomplete | Works; no search/filter/active flag; bare UI; no create/edit |
| Journal list | Accountant UI + GET `/journals` | **B** | Headers only; fixed 50; no filters; lines unused; status raw |
| Journal detail | Backend GET `/journals/:id` | **E** Backend exists, UI weak/missing | Detail API unused by frontend |
| Trial Balance | Reports | **A** Fully functional | As-of / period; balanced check; drill to GL |
| General Ledger | Reports | **A** | Account picker, running balance, pagination, XLSX |
| Profit & Loss / Balance Sheet | Reports | **A** | Statements + PDF + integrity |
| Financial dashboard KPIs | Reports Overview | **A** | From `fetchFinancialDashboard` |
| Integrity / recon checks | Reports tab | **C** Diagnostic | Check codes, severity enums |
| Event-driven journal posting | Sales / Purchases / Banking / Inventory / Advanced | **A** (domain) | Not Accountant UI |
| Opening balances post | Advanced | **A** with safety caveats | Preview + confirm; cutover |
| Period open check on post | Backend | **A** (gate) | Blocks closed periods if seeded |
| Period close / lock workflow | — | **F** Not implemented | Model exists; no close API/UI |
| Manual / adjustment journals | — | **F** | No API/UI |
| Arbitrary journal reverse/void | — | **F** | Enum `VOID` unused; only domain reverse events |
| CoA CRUD (accountant) | — | **F** | Seed + optional bank GL create only |
| Audit trail browse | — | **F** | Writes exist; no list API/UI |
| Repair / rebuild / repost tools | CLI reset only | **C** / **F** | `accounting-reset` not an admin UI |

---

## 3. Accounting safety audit

### 3.1 Actions reachable from **Accountant** UI today

| Action | Changes GL? | Endpoint | Preview | Confirm | Idempotent | Flags | Notes |
|--------|-------------|----------|---------|---------|------------|-------|-------|
| View CoA | No | GET `/accounts` | — | — | — | Native | Safe |
| View journals list | No | GET `/journals` | — | — | — | Native | Safe |

**There are currently no dangerous mutations on Accountant screens.**

### 3.2 Dangerous actions elsewhere (ownership for awareness)

| Action | Does | Endpoint / service | Preview | Confirm | Idempotency | Period / flags |
|--------|------|-------------------|---------|---------|-------------|----------------|
| Domain posts (ORDER_PAID, vendor bill, expense, settlement, bank transfer, capitalization, COGS, COGS reversal, …) | Create POSTED journals | Various `*/post` | Usually yes | Domain UIs (Stages 2A–2D) | Posting events | Domain flags + `assertEntryDateInOpenPeriod` + production guard |
| Post Opening batch | Cutover journals | `POST /opening/batches/:id/post` | Yes | `window.confirm` (weak vs Stage 2 polish) | Batch / event | Opening flag + period |
| Inventory Opening post | Cost layers + journals | Inventory opening post | Yes | Modal | Batch | Inventory + opening flags |
| Accounting reset | Wipe domain | CLI `accounting-reset` | — | Ops only | N/A | **Not** in admin UI |

### 3.3 Immutability

Posted journals cannot be edited/deleted in place (`PostedJournalImmutableError`). Corrections are new opposing domain events (e.g. full refund, COGS reversal), not void-in-place.

---

## 4. Engineering-style UI (Accountant)

| Issue | Where |
|-------|--------|
| Pre-revamp bare tables (`border-neutral-*`) | CoA, Journals — not on `accounting-ui` system |
| Raw status enums (`POSTED`) | Journals |
| Raw account `type` enums | CoA |
| No empty/skeleton polish | Both |
| Journal lines in API unused | Journals |
| No detail / deep-link | Journals; Reports GL links to journals list without entry focus |
| Fixed `limit=50`, no pagination controls | Journals |
| Reports integrity check codes | Reports (adjacent) |
| Opening JSON staging | Advanced (not Accountant, but easy to confuse) |

---

## 5. Duplication & ownership

| Capability | Correct owner | Do not duplicate under Accountant |
|------------|---------------|-----------------------------------|
| Daily sales / refunds posting | **Sales** | — |
| Vendor bills / payments / expenses | **Purchases** (+ Advanced recognition) | — |
| Bank accounts / statements / recon | **Banking** | — |
| Inventory valuation / COGS / capitalisation | **Inventory** | — |
| GST ledgers / ITC / GST reports | **GST & Tax** | — |
| Trial Balance / GL / P&L / BS | **Reports** | Do not rebuild identical statement hub |
| Opening / cutover | **Advanced** | Keep out of daily Accountant |
| Chart of Accounts catalog | **Accountant** | Banking has bank registry only |
| Journal register + line inspection | **Accountant** | Reports GL is movement by account; Journals is entry register |

**Overlap note:** Reports GL already shows journal numbers and event types. Accountant Journals should become the **entry-centric** complement (browse/filter/open entry), not a second statement suite.

---

## 6. What “Accountant” should mean (based on what exists)

**Purpose:** Professional **ledger control & inspection** — understand the chart of accounts and posted journal entries that underlie operational modules.

**Not:** Daily posting ops, GST returns, bank matching, inventory capitalization, or cutover (already owned elsewhere).

**Not yet (DATA GAP):** Manual journals, period close, approval workflows, audit browser — do not fake these screens in Stage 2F.

---

## 7. Gaps

### UI / presentation gaps

1. CoA / Journals look unfinished vs Sales–GST workspaces  
2. No journal detail drawer/page despite GET `/journals/:id`  
3. No date/status/source filters or real pagination on journals  
4. No account search / type grouping on CoA  
5. Humanize statuses and account types  
6. Deep-link from Reports GL → specific journal  
7. Optional Accountant Overview (counts / recent journals / link to Reports) using existing list + dashboard APIs only  

### Backend / accounting capability gaps

1. **Manual / adjustment journals** — not implemented  
2. **Period close / lock management** — model + assert only; no close API/UI  
3. **Arbitrary reverse/void journal** — not implemented  
4. **CoA CRUD** — seed-only (+ bank GL helper)  
5. **Audit log browse API** — write-only today  
6. **Frontend client for journal detail** — backend ready; client wrapper missing (UI-only fix can add fetch helper without changing contracts)

---

## 8. Proposed Stage 2F information architecture

Prefer a **small** workspace justified by existing data:

| Screen | Purpose | Primary user | Shown | Actions | Dangerous | APIs | Backend changes? |
|--------|---------|--------------|-------|---------|-----------|------|------------------|
| **Accountant Overview** (optional) | Orient to ledger health | Accountant | CoA count, recent journals, link to Financial Reports / integrity | Navigate only | None | `GET /accounts`, `GET /journals`, optional dashboard/integrity | **NO** |
| **Chart of Accounts** | Browse GL structure | Accountant | Code, name, type, system | Search/filter presentation | None | `GET /accounts` | **NO** |
| **Journal Entries** | Entry register + detail | Accountant | List + line Dr/Cr, memo, status, source/event when present | View detail; filters/pagination if API supports | None | `GET /journals`, `GET /journals/:id` | **NO** (add FE client for `:id` only) |

**Keep under Reports (do not move blindly):** Trial Balance, General Ledger, P&L, Balance Sheet, statement exports.

**Keep under Advanced:** Opening Balances, Inventory Opening, recognition/repair-style tools.

**Do not add in Stage 2F:** Manual Journal, Accounting Periods, Adjustments, Audit Trail (as fake shells), Filing.

If Overview is skipped, nav can remain: Chart of Accounts · Journal Entries — polished to Stage 2E quality.

---

## 9. Stage 2F design principles (for later implementation)

- Frontend presentation only; zero GST/sales/banking logic changes  
- No fake period close / manual JE  
- No mutations on CoA/Journals unless a real safe API already exists (today: none)  
- Match Sales / Banking / Inventory / GST visual language  
- Opening stays Advanced  

---

## 10. Closure checklist answers

### A. Accountant backend maturity

**Strong for read/event GL; thin for classic accountant controls.** List/detail journals + CoA + full financial reports exist. Manual JE, period close, void, audit browse do not.

### B. Accountant accounting maturity

**Event-sourced production GL is mature** (immutable posted journals, period date gate, idempotent posting events). **Classic ledger maintenance maturity is low** (no adjustments/period close).

### C. Current UI maturity

**Low.** Two bare tables; far behind Stages 2A–2E polish. Reports UI is comparatively stronger but lives outside Accountant.

### D. Existing major workflows

1. Browse Chart of Accounts  
2. Browse journal headers  
3. (Reports) Run TB / GL / P&L / BS / integrity / export  
4. (Advanced) Opening cutover post  
5. (Domains) Event-driven posting that creates journals  

### E. Fully functional features

Financial Reports (TB/GL/P&L/BS/dashboard/exports); domain posting pipelines; opening batch post; period-open assertion on post; CoA list; journal list (basic).

### F. Diagnostic/internal features

Reports integrity checks; domain recon pages; GST recon; accounting reset CLI.

### G. Dangerous accounting actions

Domain `*/post` paths; Opening Post; Inventory Opening Post. **None currently on Accountant CoA/Journals pages.**

### H. Main UI/presentation gaps

Bare CoA/Journals; unused journal lines/detail API; no filters/pagination UX; engineering enums; no design-system alignment; weak deep-linking from Reports.

### I. Main backend/accounting gaps

Manual journals; period close/lock; arbitrary reverse/void; CoA CRUD; audit browse API.

### J. Duplicate features found

TB/GL/statements owned by Reports — do not rebuild under Accountant. Domain recon owned by Sales/Purchases/Banking/Inventory/GST. Opening owned by Advanced.

### K. Recommended final Accountant purpose

**Ledger inspection & control surfaces** for CoA and posted journal entries — complement to operational modules and Financial Reports, not a duplicate ops desk.

### L. Proposed Stage 2F screens

1. Chart of Accounts (polish)  
2. Journal Entries (list + detail)  
3. Optional Accountant Overview  

(Not: Manual Journal, Periods, fake Audit Trail.)

### M. Backend changes required for UI revamp

**NO** — for presentation/IA over existing GET accounts/journals/(optional `:id`) and optional links to Reports.

### N. Accounting logic changes required for UI revamp

**NO**

### O. Stage 2E closure

**CLOSED**

### P. Ready for Stage 2F design

**YES**

---

*Audit only — no application code, database, or accounting logic modified.*

---

## SARVEDA ACCOUNTING UI STAGE 2F ACCOUNTANT AUDIT COMPLETE — READY FOR DESIGN
