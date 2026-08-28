# SARVEDA ACCOUNTING UI REVAMP — STAGE 2E GST & TAX AUDIT

**Mode:** Read-only audit (no implementation)  
**Date:** 2026-08-28  
**Prior closed:** Stage 2A Purchases · 2B Banking · 2C Sales · 2D Inventory  

This document inventories what GST & Tax capabilities **actually exist** in the Sarveda Next.js + Express + Prisma stack. It does not propose fake statutory filing UI, invent missing backend, or modify accounting logic.

---

## 0. Executive summary

GST is a **real, flag-gated accounting subsystem** (Phases 5A–5D), not a stub:

| Layer | Reality |
|-------|---------|
| Posting | Output GST on `ORDER_PAID` journals; Input GST on vendor bills / expenses (provisional); full-refund GST reversal |
| Ledgers | COA **2100–2102** (Output CGST/SGST/IGST), **2200–2202** (Input CGST/SGST/IGST) — balances from **POSTED journal lines** |
| Reports | GSTR-**style management** APIs + XLSX export — **explicitly not GSTN filing** |
| ITC | Evidence/claimability workflow (verify/block) — **does not rewrite GL**; `CLAIMED` / filing locked **unavailable** |
| UI | Single mega-page `/admin/accounting/gst` (10 tabs) — engineer-facing; no settings UI |

**DATA GAPS (do not fake in UI):** buyer GSTIN capture → native B2B sales; shipping GST; partial-refund GST; RCM posting; GSTN/portal filing; statutory GSTR-1/3B JSON; registration-type config; company GSTIN settings UI.

---

## 1. Surface inventory

### 1.1 Frontend

| Path | Role |
|------|------|
| `/admin/accounting/gst` (`frontend/app/admin/accounting/gst/page.tsx`) | **Only** dedicated GST workspace — mega-page, 10 tabs |
| `frontend/lib/accounting-api.ts` | Client wrappers for `/api/admin/accounting/gst/*` |
| `frontend/lib/gst.ts` | Storefront display helpers — **not** accounting GST page |
| `frontend/lib/tax-classes.ts` | Product admin tax-class dropdown — **not** GST reports |
| Nav | `AdminAccountingNav` → section **GST & Tax** → **GST & ITC** |
| Adjacent | Dashboard KPI “GST Position”; Reports BS / integrity link; Purchases “GST data gaps”; Vendor bills ITC/jurisdiction diagnostics; Opening `gstLines`; Vendors GSTIN field |

### 1.2 Backend routes (`accounting.routes.ts`)

| Method | Path | Handler module |
|--------|------|----------------|
| GET | `/gst/status` | `gst.handlers` |
| GET | `/gst/overview` | `gst.handlers` |
| GET | `/gst/ledger` | `gst.handlers` |
| GET | `/gst/reconciliation` | `gst.handlers` |
| GET | `/gst/data-gaps` | `gst.handlers` |
| GET | `/gst/itc/summary`, `/gst/itc`, `/gst/itc/:id` | `itc.handlers` |
| POST | `/gst/itc/discover`, `…/verify`, `…/block`, `…/data-gap` | `itc.handlers` |
| GET | `/gst/reports/overview\|outward\|b2b\|b2c\|credit-notes\|hsn\|rates\|3b-summary\|integrity\|place-of-supply\|data-gaps` | `gst-reporting.handlers` |
| GET | `/gst/export` | XLSX download |

### 1.3 Core services / utils

- `gst.constants.ts`, `gst-ledger.service.ts`, `gst-reconciliation.service.ts`
- `gst-reporting.service.ts`, `gst-export.service.ts`
- `itc.service.ts`, `itc-discovery.service.ts`, `itc-eligibility.service.ts`
- `utils/gst.ts`, `utils/gst-state.ts`, `utils/tax-class.ts`
- Posting: `order-paid-journal.builder.ts`, `vendor-bill-journal.builder.ts`, `expense-gst.ts` / `expense-journal.builder.ts`, `order-refunded-full-journal.builder.ts`
- Prior docs: `SARVEDA_ACCOUNTING_PHASE5A_GST_TAX_ARCHITECTURE.md`, `PHASE5B_GST_FOUNDATION.md`, `PHASE5D_GST_REPORTING_FINAL.md`

### 1.4 Feature flags (default OFF)

| Env | Gate |
|-----|------|
| `NATIVE_ACCOUNTING_ENABLED` | Root |
| `ACCOUNTING_GST_ENABLED` | GST ledger / status |
| `ACCOUNTING_GST_RECONCILIATION_ENABLED` | Source↔journal recon |
| `ACCOUNTING_ITC_VERIFICATION_ENABLED` | ITC evidence workflow |
| `ACCOUNTING_GST_REPORTING_ENABLED` | Management reports + XLSX |

Seller identity (env, not accounting UI settings): `SELLER_GSTIN`, `SELLER_STATE` (default Karnataka), `DEFAULT_HSN_CODE` (default `9205`).

---

## 2. GST configuration

| Capability | Status | Where |
|------------|--------|--------|
| Seller GSTIN | **Env only** | `SELLER_GSTIN` — also used by invoices/shipping; soft defaults elsewhere if unset |
| Seller state / POS base | **Env** | `SELLER_STATE` → `resolveSellerGstIdentity` / `sellerStateCode()` |
| Registration type (regular/composition) | **DATA GAP** | Not in DB or settings |
| Tax rates | **Implemented** | `GST_RATES`: standard/gst18→18, gst12→12, gst-5→5, gst-zero-rate→0; unknown → **default 18** + `TAX_CLASS_DEFAULTED` |
| Product tax class | **Implemented** | `Product.taxClass`; admin via `tax-classes.ts` |
| HSN | **Partial** | `Product.hsnCode`; else `DEFAULT_HSN_CODE` → `HSN_DEFAULTED` |
| SAC | **Not modeled** as separate field | HSN summary key is `hsnSac` from product HSN |
| CGST/SGST/IGST determination | **Implemented** | Sales: `splitOutputGstPaise` via shipping state vs seller; Purchases/expenses: vendor/source vs seller |
| Intra vs inter | **Implemented** | Same state code → CGST+SGST; else IGST; fail-closed when POS unresolved |
| Tax-inclusive sales | **Implemented** | `gstFromInclusiveLine` on ORDER_PAID (INR + IN only) |
| Tax-exclusive purchases | **Partial** | Vendor bill uses header `taxInPaise` (not re-derived from tax class) |
| GST settings UI | **Missing** | No admin screen to edit seller GSTIN/state/policy |

---

## 3. Output GST / sales tax

| Topic | Reality |
|-------|---------|
| Taxable sales | Posted on **ORDER_PAID_V1** when sales posting + GST flags allow; India INR only |
| Output CGST/SGST/IGST | Cr **2100 / 2101 / 2102** |
| Exemptions / zero-rated | Tax class `gst-zero-rate` → 0 tax; other classes per rate table |
| Shipping GST | **DATA GAP** — shipping credited gross to `4100`; policy `SHIPPING_GST_DATA_GAP` (no invented shipping tax) |
| Sales returns / refunds | **Full monetary refund only** — exact invert of ORDER_PAID including Output GST; **partial refunds** → `PARTIAL_REFUND_GST_DATA_GAP` (not posted) |
| Buyer GSTIN | Always `null` in order snapshot → permanent `BUYER_GSTIN_MISSING`; B2B report stays honestly empty / gap |
| Link to Sales Accounting | Same ORDER_PAID / full-refund journals; sales UI maps 210x labels on journal lines |

---

## 4. Input GST / purchases

| Topic | Reality |
|-------|---------|
| Input CGST/SGST/IGST | Dr **2200 / 2201 / 2202** on eligible vendor bills & expenses (memo: ITC unverified / provisional) |
| Vendor bill tax | From bill `taxInPaise` + GSTIN + jurisdiction; fail-closed `GST_DATA_GAP` |
| Expense GST | `resolveExpenseGst` + same input accounts when evidence OK |
| Input tax credit (claimability) | Separate **AccountingItcEvidence** workflow — ELIGIBLE/BLOCKED/etc. |
| ITC vs GL | Recognition in GL ≠ claim eligibility; gateway fee tax stays in **5100**, never auto-reclassed to 220x |
| Link to Purchase Accounting | Vendor-bill posting + capitalization clearing path; purchases dashboard surfaces GST gap counts |

---

## 5. GST ledgers & accounting

### Chart of accounts (authoritative)

| Code | Name | Type |
|------|------|------|
| 2100 | Output CGST | LIABILITY |
| 2101 | Output SGST | LIABILITY |
| 2102 | Output IGST | LIABILITY |
| 2200 | Input CGST | LIABILITY (debit → tax asset in FS mapping) |
| 2201 | Input SGST | same |
| 2202 | Input IGST | same |

**No** dedicated GST clearing / net-payable control account. Net position is **computed** in reporting (estimated).

### Balance authority

| UI / API | Source |
|----------|--------|
| GST Ledger | **POSTED** `AccountingJournalLine` aggregates only (`buildGstLedger`) |
| Report overview / 3B-style | Mix: ledger **periodMovement** + ITC evidence buckets + outward tax snapshots |
| Outward / HSN / rates / POS | Immutable **posting-event tax snapshots** (not live order recompute) |
| Dashboard “GST Position” | Accounting dashboard financials (GL-derived) |

**Conclusion:** Liability/input balances shown as ledger are real journals. “Estimated net GST” and ITC eligible amounts are **management composites**, not a filed payable.

Opening cutover: `AccountingOpeningGstLine` on opening batches (codes 2100–2202).

---

## 6. GST reports — what each actually produces

All report endpoints require `ACCOUNTING_GST_REPORTING_ENABLED`. Repeated disclaimer:

> **GSTR-STYLE MANAGEMENT REPORT — NOT A FILED GST RETURN / NOT GSTN SUBMISSION**

| API / UI tab | Produces | Statutory? |
|--------------|----------|------------|
| `/gst/reports/overview` | Period rollup: output, input recognized, ITC buckets, estimated net | No |
| `/gst/reports/outward` | Per ORDER_PAID tax snapshot rows | No |
| `/gst/reports/b2b` | Rows with FORMAT_VALID buyer GSTIN only (honest empty today) | No — not GSTR-1 B2B |
| `/gst/reports/b2c` | Management aggregates by POS/rate — **not** B2CL/B2CS | No |
| `/gst/reports/credit-notes` | Full-refund GST reversals | No |
| `/gst/reports/hsn` | HSN × rate from line allocations | Management HSN summary only |
| `/gst/reports/rates` | Rate buckets | No |
| `/gst/reports/3b-summary` | Ledger period movement + ITC buckets + estimated net | **3B-style management view only** |
| `/gst/reports/integrity` | Snapshot vs GL checks | Diagnostic |
| `/gst/reports/place-of-supply` | POS from snapshots | No |
| `/gst/reports/data-gaps` | Gap codes / exposure | Diagnostic |
| `/gst/export` | **XLSX** workbook (Overview, Outward, B2B, B2C, Credit Notes, HSN, Rate Summary, ITC, Ledger, Gaps, Integrity) | Management export — **not** GST portal JSON |

**UI gap:** page **fetches** 3B summary but **does not render** it.

Naming like “GSTR” / “3B” in code means **style**, not filing readiness.

---

## 7. GST filing

| Capability | Status |
|------------|--------|
| Return preparation (statutory) | **DATA GAP** — management summaries only |
| JSON / GSTN schema export | **DATA GAP** |
| Excel/CSV management export | **Implemented** — XLSX management workbook |
| GST portal-compatible files | **DATA GAP** |
| Direct filing / GSTN API | **DATA GAP** |
| Filing status / history | **DATA GAP** |
| ITC `CLAIMED` / period lock | Explicitly throws `FILING_WORKFLOW_UNAVAILABLE` |

**Do not** build Stage 2E screens that imply filing readiness.

---

## 8. Current UI audit (`/admin/accounting/gst`)

### Structure (mega-page)

Tabs: Overview · Outward · B2B · B2C · Credit Notes · HSN · ITC · GST Ledger · Reconciliation · Data Gaps

### Problems

| Issue | Evidence |
|-------|----------|
| Engineering terminology | Env banners (`ACCOUNTING_GST_*=1`), “POSTED”, “Discover ITC”, “ESTIMATED NET GST”, “Gateway provisional”, raw `integrity.status` |
| Raw JSON | ITC detail = `JSON.stringify` of evidence |
| UUIDs / internal IDs | Recon/gaps fall back to `sourceId`; ITC JSON exposes ids / actorUserId |
| Account-code-first | Less severe than inventory; ledger still shows codes |
| Unsafe posting actions | **No journal post** on this page; **Verify / Block / Discover ITC** mutate evidence via `window.prompt` (no confirm modal) |
| Mega-page | Eager-loads nearly all report APIs on every month change |
| Duplication | Integrity on Overview + Recon + Reports; gaps on GST + Purchases + Dashboard |
| Dead / incomplete UI | `markItcDataGap` wired but no button; 3B fetched unused; `ledger.aggregates` unused |
| Settings | None — belongs as Advanced or out of scope until backend settings exist |
| Design system | Pre-revamp plain tables — not aligned with inventory/banking shells |

### Belong under Advanced (eventual IA)

- Discover ITC, Verify/Block (or strong confirm + role)
- Raw recon / source gaps with enums
- Env-flag troubleshooting
- Opening GST lines (already under Opening / Advanced cutover)
- XLSX export can stay secondary, not primary CTA

---

## 9. Backend boundaries for Stage 2E UI (zero accounting-logic change)

### Safe with **existing APIs only** (frontend presentation / IA)

- Split mega-page into overview + sales GST + purchase ITC + reports + recon
- Humanize labels, statuses, gap codes; hide UUIDs
- Structured ITC detail (no raw JSON)
- Confirm modals for Verify / Block / Discover
- Surface 3B-**style** summary already returned by API (clearly labeled management)
- Lazy-load tabs; align chrome with accounting UI kit
- De-emphasize Advanced actions; keep Opening GST under Advanced cutover
- Prefer business account names over code-first labels

### Requires **new backend / data** (out of Stage 2E “UI only” — label as DATA GAP)

- Company GSTIN / registration settings UI backed by DB
- Buyer GSTIN capture on orders → real B2B
- Shipping GST calculation
- Partial refund GST allocation
- RCM journals
- Statutory GSTR JSON / portal filing / CLAIMED ITC period lock
- Editing tax rates as a product settings screen (rates are code constants today)

---

## 10. Proposed Stage 2E information architecture

Based **only** on capabilities that exist:

| Proposed screen | Route (suggested) | Backed by |
|-----------------|-------------------|-----------|
| **GST Overview** | `/admin/accounting/gst` | status, report overview, ledger aggregates, estimated net (labeled), integrity high-level |
| **Sales GST (Output)** | `/admin/accounting/gst/sales` | outward, b2b, b2c, credit notes, rates |
| **Purchase GST / ITC** | `/admin/accounting/gst/itc` | ITC summary/list, discover/verify/block (guarded) |
| **GST Ledger** | `/admin/accounting/gst/ledger` | `/gst/ledger` |
| **GST Reconciliation** | `/admin/accounting/gst/reconciliation` | recon + data gaps (diagnostic) |
| **GST Reports & Export** | `/admin/accounting/gst/reports` | hsn, 3b-style, integrity, place-of-supply, XLSX |
| **GST Settings** | — | **Do not invent** — DATA GAP (env-only today); link to docs/env or Advanced “read-only identity” if desired |

Optional: keep HSN under Reports; keep Opening GST under existing Advanced Opening.

Nav: expand **GST & Tax** secondary items mirroring Inventory pattern; do **not** add Filing.

---

## 11. Safety — dangerous / sensitive actions

| Action | Creates journals? | Changes GST GL balances? | Changes config? | Statutory output? | Notes |
|--------|-------------------|--------------------------|-----------------|-------------------|-------|
| ORDER_PAID / vendor bill / expense / full-refund posting | **Yes** (other modules) | **Yes** | No | No | Existing sales/purchase/expense flows — already Stage 2C/2A territory |
| Opening GST lines post | **Yes** | **Yes** | Opening batch | No | Advanced cutover |
| ITC Discover | No GL | No | Evidence rows | No | Batch upsert evidence |
| ITC Verify / Block / Mark data-gap | No GL (`glUnchanged: true`) | No | Evidence status | No | Needs confirmations |
| ITC CLAIMED | N/A | N/A | Blocked | Would imply filing | **Unavailable** |
| GST XLSX export | No | No | No | Management only | Must keep disclaimer |
| Period lock / filing finalize | — | — | — | — | **Not implemented** |

Stage 2E UI must add confirmations for ITC mutations and never imply filing or GL rewrite from Verify.

---

## 12. Maturity by area (detail)

### Implemented workflows

1. Tax-inclusive sales GST split → Output GL  
2. Vendor bill / expense Input GST (provisional)  
3. Full-refund Output GST reverse  
4. GST ledger from POSTED lines  
5. Source↔journal reconciliation (diagnostic)  
6. ITC evidence discover / verify / block  
7. Management reports + XLSX export  
8. Opening GST balances on cutover batches  

### Not implemented (DATA GAPS)

1. Buyer GSTIN → B2B sales  
2. Shipping GST  
3. Partial-refund GST  
4. RCM posting  
5. Gateway tax reclass 5100 → 220x  
6. Statutory GSTR-1 / GSTR-3B / portal  
7. Filing status / CLAIMED / period lock  
8. Registration-type / GST settings UI  
9. SAC as separate taxonomy  

---

## 13. Closure checklist answers

### A. GST backend maturity

**Strong for management accounting.** Flag-gated services for ledger, recon, ITC evidence, and GSTR-style reports are real and tested (unit + lightsail validation scripts). Not a filing product.

### B. GST accounting maturity

**Solid core posting model** (210x/220x, inclusive sales, provisional input, full-refund invert). Material policy gaps: shipping, partial refunds, buyer GSTIN, RCM.

### C. Current GST UI maturity

**Low / engineer-ops.** One mega-page, env banners, raw JSON, incomplete 3B display, weak confirmations — far behind Stage 2B–2D polish.

### D. Actual GST calculation/posting model

- Sales: tax-inclusive extract by tax class; POS from shipping state vs `SELLER_STATE`; Cr Output 210x  
- Purchases/expenses: bill/expense tax + jurisdiction; Dr Input 220x (provisional)  
- Refunds: full invert only  
- Authority: POSTED journals + immutable tax snapshots + ITC evidence (claimability)

### E. Implemented GST workflows

Ledger · recon · ITC evidence · management reports/export · opening GST · sales/purchase/expense/refund posting paths (flag-dependent).

### F. Implemented GST reports/returns

Management overview, outward, B2B/B2C (honest), credit notes (full refund), HSN, rates, 3B-**style**, POS, integrity, data gaps, XLSX. **No statutory returns.**

### G. GST filing capability

**None.** Explicit filing workflow unavailable.

### H. Main UI gaps

Mega-page; engineering copy; raw JSON/UUIDs; missing 3B surface; weak ITC confirmations; no IA split; no settings; design-system lag.

### I. Main backend/data/accounting gaps

Buyer GSTIN; shipping GST; partial refunds; RCM; portal/filing; CLAIMED/period lock; DB-backed seller registration settings.

### J. Proposed Stage 2E screens

GST Overview · Sales GST · Purchase GST / ITC · GST Ledger · GST Reconciliation · GST Reports & Export  
(**Not:** Filing · fake Settings backed by nothing)

### K. Dangerous actions

Sales/purchase/expense/refund/opening **journal posts** (other modules); ITC **Discover / Verify / Block**; export must stay clearly non-statutory.

### L. Backend changes required for UI revamp

**NO** — for presentation/IA over existing endpoints.

### M. Accounting logic changes required

**NO**

### N. Stage 2D closure

**CLOSED** (Inventory + 2D.1 polish completed per prior stages; user-declared closed entering 2E)

### O. Ready for Stage 2E design

**YES**

---

*Audit only — no application code, schema, migrations, accounting logic, or configuration modified.*
