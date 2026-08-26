# SARVEDA NATIVE ACCOUNTING — PHASE 7A
# PRODUCTION CUTOVER & DATA CLEANUP ARCHITECTURE
# READ-ONLY INVESTIGATION

**Date:** 2026-08-25  
**Prerequisite:** PHASE 6 FINANCIAL STATEMENTS & REPORTING COMPLETE  
**Mode:** READ-ONLY — no deletes, posts, imports, repairs, or permanent flag enablement  

Investigation script (SELECT-only): `backend/scripts/phase7a-lightsail-cutover-investigation.ts`

---

## 1. Executive Summary

Lightsail native accounting is a **validated reporting engine** sitting on a **TEST-contaminated shadow ledger**. Of **113** POSTED journals, **99** carry TEST memos; **all 22** bank registry accounts are TEST; **all 19** vendor bills are TEST; inventory GL **1200** and FIFO layers are **100% synthetic**. Orphan Output GST (₹2,593.22) and Inventory↔FIFO variance (₹6,300) are **TEST**, not real production discrepancies.

**Recommended strategy:** do **not** reverse TEST journals into production books. Perform a **controlled accounting-domain reset** (preserve commerce + CoA; clear accounting-owned shadow tables) then load **verified opening balances as of a cutover date** (Option 2 historical strategy). Freeze Phase 7 into **three slices: 7B → 7C → 7D**.

READY FOR PHASE 7 IMPLEMENTATION

---

## 2. Environment Proof

| Field | Value |
|-------|--------|
| Host | `ip-172-26-7-99` / `13.204.112.165` |
| App path | `/home/ubuntu/sarveda/backend` |
| DB host | `ls-38d7…c9oiska8wm8k.ap-south-1.rds.amazonaws.com` |
| DB name | `sarveda_db` |
| Localhost? | **No** |
| `isProductionLikeEnvironment` | `true` |
| Accounting flags in `.env` | **0 lines / ABSENT** |
| Writes performed | **None** |

---

## 3. Current Accounting State

| Metric | Count / Amount |
|--------|----------------|
| POSTED journals | 113 |
| TEST-memo journals | 99 |
| Orphan POSTED journals (no posting event) | 17 (all TEST) |
| POSTED posting events | 96 |
| Orphan POSTED events | 0 |
| Bank accounts | 22 (**22 TEST**) |
| Cost layers / consumptions | 17 / 10 |
| Orders (commerce) | 4,396 |
| ORDER_PAID posted | 21 (almost all TEST-tagged orders) |
| Vendor bills | 19 (**19 TEST**) |
| Expenses | 4 (3 TEST-ish) |
| Lines on 3100 | 0 |
| TB / BS (Phase 6D) | Balanced (engine OK; data not production truth) |

**Interpretation:** Engine health ≠ production books. Current GL is a validation sandbox.

---

## 4. TEST Data Inventory

### Dependency graph (simplified)

```
TEST products/variants/inventory (acct-prod / TEST-ACC-*)
  → TEST orders / payments / refunds / restocks
  → AccountingPostingEvents (ORDER_PAID, COGS, …)
  → JournalEntries / Lines

TEST VendorBills / POs / Receipts / VendorPayments / Expenses
  → VENDOR_* / EXPENSE events → Journals

TEST BankAccounts (+ dynamic TEST GLs)
  → Transfers / StatementImports / Lines / Reconciliations
  → BANK_* events → Journals

TEST InventoryCostLayers / Consumptions
  ↔ COGS / capitalization journals

TEST ITC evidence / GST fixtures
  ↔ GST journals
```

### Inventory counts (Lightsail)

| Entity | Total | TEST / TEST-ish |
|--------|------:|----------------:|
| JournalEntries (POSTED, TEST memo) | 113 | 99 |
| Orphan journals | 17 | 17 |
| BankAccounts | 22 | 22 |
| Bank transfers (TEST memo/ref) | — | 10 |
| Statement imports on TEST banks | — | 14 |
| Recons on TEST banks | — | 4 |
| Cost layers | 17 | 11+ by source/SKU tag (remaining layers all TEST SKUs) |
| Orders with TEST in number | 4,396 | 22 |
| Products testish | 201 | 25 |
| VendorBills | 19 | 19 |
| VendorPayments | 11 | (linked to TEST bills) |
| Expenses testish | 4 | 3 |
| PurchaseOrders TEST | — | 1 |
| PurchaseReceipts via TEST PO | — | 2 |
| Payments testish provider ids | — | 22 |
| ITC evidence | 12 | (validation set) |

**Prefix note:** Most journals match `TEST-ACC` / `SRV-TEST-ACC` inside memos (e.g. `ORDER_PAID_V1 … SRV-TEST-ACC-…`) rather than a single literal prefix — prefix-only cleanup is insufficient; use memo + source + bank name + SKU + bill number rules.

---

## 5. TEST GL Impact

TEST journal line totals: **Dr 58,085,450 = Cr 58,085,450** (balanced internally).

Selected accounts (paise):

| Code | Name | TEST Net | All Net | Preliminary Non-TEST Net |
|------|------|---------:|--------:|-------------------------:|
| 1010 | Bank | -48,750 | 158,846 | 207,596 |
| 1020 | Razorpay Clearing | 7,757,900 | 7,545,700 | -212,200 |
| 1200 | Inventory Asset | 4,100,000 | 4,100,000 | **0** |
| 1210 | Purchases Clearing | -3,600,000 | -3,600,000 | **0** |
| 2000 | AP | -637,200 | -637,200 | **0** |
| 2100/2101/2102 | Output GST | (see GST) | … | ~0 / -76 |
| 2200/2201 | Input GST | 51,975 each | same | **0** |
| 3900 | Opening Balance Equity | -26,800,000 | -26,800,000 | **0** |
| 4000 | Product Sales | -7,754,915 | -7,755,339 | -424 |
| 5000 | COGS | 3,300,000 | 3,300,000 | **0** |
| Dynamic TEST banks | many | ≈ full balance | ≈ full | ~0–500 crumbs |

**Conclusion:** BS/P&L on Lightsail are dominated by TEST. Tiny non-TEST residues on 1010/1020/4000 must not be treated as approved openings — they are contamination edges / partial real shadow posts.

---

## 6. Cleanup Strategy

### Options compared

| Option | Pros | Cons | Fit |
|--------|------|------|-----|
| **A. Destructive deletion of POSTED journals** | Clean GL | Violates immutability policy; FK risk; runtime path must never allow this | Reject for app; only as ops reset under E |
| **B. Reversal journals** | Respects immutability | Permanently pollutes reports; doubles noise; hard to audit forever | Reject as primary |
| **C. Full environment reset** | Clean | Destroys commerce / catalog — unacceptable | Reject |
| **D. Opening journals that supersede history** | Keeps history | TEST history still in TB forever unless filtered; false “books” | Secondary only |
| **E. Rebuild accounting-owned tables; preserve commerce + CoA** | Clean production GL; commerce safe; matches pre-launch reality | Requires backup + disciplined truncate order | **RECOMMENDED** |

### Recommended: **E — Accounting-domain rebuild + opening load**

**Rationale**

1. This Lightsail ledger is a **pre-launch shadow**, not statutory books already relied upon.  
2. Application immutability remains: **no runtime delete of POSTED journals**. Cutover uses a **one-time ops procedure** with backup.  
3. Reversals (B) would leave TEST forever in every TB/P&L/BS.  
4. Evidence shows **near-total TEST ownership** of GL — rebuilding is cheaper and safer than surgical reverse.

**Preserve**

- Commerce: Order, Payment, Refund, Product, Inventory (ops qty), Vendor, VendorBill ops rows as needed for business (or soft-archive TEST commerce rows separately if desired)  
- `AccountingAccount` CoA (system codes)  
- Non-accounting CMS/content  

**Clear / rebuild (accounting-owned)**

- JournalEntry / JournalLine / DocumentLink / AuditLog (accounting)  
- PostingEvent  
- InventoryCostLayer / CostConsumption / Opening batches  
- BankAccount registry + transfers + statement imports/lines/matches + reconciliations (all currently TEST)  
- GatewaySettlement accounting rows  
- VendorPayment accounting + ITC evidence validation rows  
- Dynamic TEST GL accounts created for banks (codes outside standard CoA) — deactivate or remove after backup  

**Then:** load openings (7C) → activate flags forward-only (7D).

Do **not** implement in 7A.

---

## 7. Orphan Journals

**17** orphan POSTED journals — **all TEST** (`is_test = true`). Examples:

| Entry | Memo | Pattern |
|-------|------|---------|
| JE-202608-00015..00020, 00025–26, 00031–34, 00038–39 | Phase 3D3/3D4 OPENING / PURCHASE_RECEIPT | Direct createAndPost without event |
| JE-202608-00021, 00024 | ORDER_PAID SRV-TEST-ACC-* | Event link missing / orphaned |
| JE-202608-00022 | COGS SRV-TEST-ACC-* | Orphan |
| JE-202608-00023, 00029 | TEST-ACC negative OPENING | Synthetic |

**Treatment (Phase 7):** covered by accounting-domain rebuild (**RESET_REQUIRED**). Do not individual-delete in app.

---

## 8. Orphan Output GST

| Item | Value |
|------|------:|
| Orphan Output GST (Phase 5/6) | **259,322** paise (₹2,593.22) |
| Classification | **TEST** |
| Source | Output GST credits on orphan journals with **no posting event** — all TEST memos (notably JE-202608-00021 / 00024 CGST/SGST) |
| Non-TEST orphan Output GST | **0** found |

**Treatment:** eliminated by ledger rebuild; do not “repair” GST journals. Real GST openings come from accountant/Zoho/GST returns at cutover.

---

## 9. Inventory / FIFO Variance

| | Paise | ₹ |
|--|------:|--:|
| 1200 GL net | 4,100,000 | 41,000 |
| FIFO remaining value | 3,470,000 | 34,700 |
| Variance | **630,000** | **6,300** |

- All 1200 journals are TEST (`preliminaryNonTestNet = 0`).  
- Remaining layers inspected are TEST SKUs / TEST sourceIds.  
- Variance = **TEST / POSTING_GAP** (orphan opening GL without matching remaining layers; COGS/reversal synthetic paths).  

**Not** MISSING_OPENING_COST for production — production openings will replace this entirely.

---

## 10. AP

| | |
|--|--|
| GL 2000 liability | 637,200 paise |
| Posted VENDOR_BILL / PAYMENT events | 15 / 11 |
| Vendor bills in DB | 19 — **all TEST** |
| Phase 6D GL vs native outstanding | variance 0 (on TEST data) |

**Real opening AP required at cutover:** vendor-level file from Zoho/accountant (see §16). Current GL AP must **not** be used.

---

## 11. AR

| | |
|--|--|
| GL 1100 | **0** |
| Customer subledger | **DATA_GAP** (architecture) |

Sarveda is primarily prepaid gateway / COD at delivery — material trade AR is unlikely.  

**Recommendation:** opening AR = **0** unless owner provides evidence of unpaid customer invoices. Do **not** fabricate AR from historical Woo/orders. If COD cash-in-transit is needed, model under gateway/COD clearing — not customer AR — unless accountant directs otherwise.

---

## 12. Inventory Opening

Required input (authoritative):

| Field | Rule |
|-------|------|
| NEW_SARVEDA_SKU | Current Lightsail variant SKU |
| Physical qty at cutover | Ops count / warehouse |
| Unit cost INR (paise) | Trusted cost — **not** sale/MRP/USD/AED |
| Total value | qty × unit cost |
| Effective date | = cutover date |
| Source | Zoho stock valuation / physical + cost sheet |

Creates: FIFO `OPENING` layers + balanced opening journal (Dr 1200 / Cr equity or clearing per design).

---

## 13. SKU Mapping

Because SKUs changed vs Zoho/legacy:

| Column | |
|--------|--|
| NEW_SARVEDA_SKU | |
| LEGACY_SKU | |
| PRODUCT_NAME / VARIANT | |
| MATCH_STATUS | `EXACT` \| `MANUAL_MATCH` \| `NEW_SKU` \| `LEGACY_ONLY` \| `UNKNOWN` |
| OPENING_QTY / UNIT_COST_INR / SOURCE / REVIEW_STATUS | |

**No automatic fuzzy posting.** Unmatched rows block capitalization of that SKU’s opening.

---

## 14. Bank / Cash Opening

**Current registry:** 22/22 accounts are `TEST-ACC-*` — discard in rebuild.

For each **real** account after cutover:

| Field | |
|-------|--|
| name, bank, masked number, IFSC | |
| GL code (stable CoA 1010+ or approved new) | |
| opening date (= cutover) | |
| **opening book balance** (GL authority) | |
| statement balance (recon evidence only) | |
| source document + review status | |

Statement ≠ BS.

---

## 15. Gateway Clearing

| Provider | Current GL note | Cutover need |
|----------|-----------------|--------------|
| Razorpay 1020 | Dominated by TEST; tiny non-TEST residue | Unsettled captured-not-settled from Razorpay dashboard as of cutover |
| Stripe 1021 | Settlement not configured | Unsettled Stripe payouts if any IN sales |
| PayPal 1022 | Same | Same |
| COD / 1100 | AR/COD gap | COD collected not deposited, if material |

**Do not** use current contaminated GL. Owner provides gateway unsettled reports for cutover morning.

Boundary: captured before cutover / settled after → opening clearing liability/asset; settlement post-cutover clears opening + posts bank.

---

## 16. AP Opening

File columns:

Vendor · Bill Number · Bill Date · Due Date · Outstanding · GST component · TDS · Currency · Reference · Source  

Posting design (7B/7C):

1. Create opening AP **subledger** rows (or VendorBill OPEN with `opening` flag / document link)  
2. **One** balanced opening journal: Dr Opening Equity (or Clearing) / Cr 2000 (and GST lines if required by accountant)  
3. Future VendorPayment settles subledger **without** double-counting opening  

No Zoho AP mirror into GL without this file.

---

## 17. AR Opening

Conditional. Default **zero**. If required, same subledger+GL pattern as AP. Never invent from order history.

---

## 18. GST Opening

Required balances (accountant-approved):

| Account | |
|---------|--|
| 2100/2101/2102 Output | Liability opening |
| 2200/2201/2202 Input recognized | Asset opening |

Distinguish:

- **GL recognized** (books)  
- **ITC eligibility evidence** (claimability workflow)  
- **Filed/claimed** (GSTR — do **not** invent CLAIMED)

Sources: last filed GSTR-3B / Zoho tax summary / CA confirmation as of cutover−1.

---

## 19. Equity Opening

After verified assets − liabilities:

| Account | Use |
|---------|-----|
| 3000 Owner Capital | Explicit capital introductions |
| 3100 Retained Earnings | Only if accountant assigns prior earnings |
| 3900 Opening Balance Equity | **Temporary** plug for unexplained — **must be reviewed to zero** before acceptance |

Unexplained difference → **MANUAL_REVIEW** blocker, not silent dump to 3900.

---

## 20. Historical Migration Strategy

| Option | Verdict |
|--------|---------|
| 1. Rebuild all historical transactions | **Reject** — SKU remap, incomplete events, Zoho/Woo gap, 4k+ orders vs 21 ORDER_PAID |
| **2. Cutover date + verified openings only** | **RECOMMENDED** |
| 3. Hybrid limited history | Optional later; not required for go-live |

Native posts **from cutover forward** with `ACCOUNTING_CUTOVER_DATE` + `ACCOUNTING_CUTOVER_FORWARD_ONLY=1`.

---

## 21. Cutover Date Strategy

**Prefer:** start of calendar month, **00:00 IST** (e.g. `2026-09-01` or `2026-10-01`) after openings signed off.

Reasons: bank statements, GST period, Zoho month close, cleaner gateway settlement cycles.

Owner must confirm exact date in writing.

---

## 22. Boundary Transactions

| Case | Treatment |
|------|-----------|
| Order created before / paid after | Post ORDER_PAID if payment date ≥ cutover (forward-only on payment/document date per existing cutover helpers) |
| Captured before / settled after | Opening clearing; settlement post-cutover |
| Vendor bill before / paid after | Opening AP; payment posts post-cutover |
| Inventory received before / sold after | In opening qty/cost; COGS when sale posts post-cutover |
| Refund after for pre-cutover sale | Policy: post refund + COGS reversal only if native sale/COGS exists; else **manual journal** / exclude from auto path — document in 7B |
| Return after for pre-cutover sale | Same — restock ops OK; accounting COGS reversal requires native COGS history or opening adjustment |

---

## 23. Opening Journal Design

Minimum balanced batch (illustrative):

| Dr | Cr |
|----|----|
| Banks / Cash | |
| Gateway clearing (if debit) | Gateway clearing (if credit) |
| AR (if any) | AP |
| Inventory 1200 | Output GST |
| Input GST | Other liabilities |
| | Capital / RE / Opening Equity |

Dr total = Cr total. No 7A posting.

---

## 24. Opening Subledgers

| Subledger | Reconciles to |
|-----------|---------------|
| Bank registry book | Bank GL |
| FIFO OPENING layers | 1200 |
| Vendor opening outstanding | 2000 |
| Customer opening (if any) | 1100 |
| Gateway unsettled schedule | 102x |
| GST opening schedule | 210x / 220x |

Every subledger Σ must equal opening GL line.

---

## 25. Real Data Source Matrix

| DATA | Authoritative | Fallback | Owner | Format | Required? |
|------|---------------|----------|-------|--------|-----------|
| Inventory qty | Physical / WMS | Zoho stock | Ops | XLSX mapping file | **MANDATORY** |
| Inventory cost | Zoho valuation / CA | Purchase invoices | Finance | Paise/INR unit cost | **MANDATORY** |
| Bank book | Bank statement + cash book | Zoho bank | Finance | Per account | **MANDATORY** |
| Cash | Petty cash count | Zoho | Finance | Amount | **MANDATORY** if used |
| AR | Aged receivables | — | Finance | Opening AR file | **CONDITIONAL** |
| AP | Aged payables | Zoho AP | Finance | Opening AP file | **MANDATORY** if vendors unpaid |
| Gateway clearing | Razorpay/Stripe/PayPal unsettled | — | Finance | Portal export | **MANDATORY** |
| GST | GSTR-3B / CA | Zoho tax | CA/Finance | Per tax account | **MANDATORY** |
| Capital / equity | CA | Share docs | CA | Narrative + amounts | **MANDATORY** |
| SKU map | Catalog owner | Manual | Ops+Finance | Mapping XLSX | **MANDATORY** |

---

## 26. Owner / Team Required Files

### MANDATORY

1. Signed **cutover date** (IST)  
2. **SKU mapping** workbook (statuses above)  
3. **Opening inventory** qty + unit cost  
4. **Bank/cash opening** book balances + latest statements  
5. **Gateway unsettled** reports (Razorpay required; Stripe/PayPal if used)  
6. **GST opening** balances (CA-approved)  
7. **Equity / capital** assignment (what is capital vs RE vs temporary plug)  
8. Confirmation: **no material customer AR** OR AR file  

### CONDITIONAL

9. Opening **AP** aged file (if any unpaid vendor bills)  
10. TDS / other liability openings  
11. COD cash-in-transit schedule  

### OPTIONAL

12. Zoho TB as of cutover−1 (reference only — not auto-import)  
13. Prior year P&L for comparative disclosure  

---

## 27. Pre-Cutover Reconciliation Gates

Before flags on:

- [ ] Opening Dr = Opening Cr  
- [ ] Inventory GL = FIFO opening layers  
- [ ] AP GL = vendor opening Σ  
- [ ] AR GL = customer opening Σ or approved zero  
- [ ] Bank GL = approved book openings  
- [ ] Gateway GL = unsettled schedule  
- [ ] GST GL = CA schedule  
- [ ] TB balanced; BS balanced  
- [ ] No unexplained 3900 plug (or plug ≤ approved tolerance with documented plan)  
- [ ] Zero TEST bank accounts active  
- [ ] Zero TEST-memo journals in production ledger (post-rebuild)  

---

## 28. TEST Data Treatment Matrix

| Artifact | Treatment |
|----------|-----------|
| TEST journals / lines / events | **RESET_REQUIRED** (accounting rebuild) |
| Orphan TEST journals | **RESET_REQUIRED** |
| TEST bank accounts / statements / recons | **RESET_REQUIRED** |
| TEST inventory layers / consumptions | **RESET_REQUIRED** |
| TEST vendor bills / payments / expenses | **RESET_REQUIRED** for accounting links; ops TEST rows **DELETE_SAFE** or retain offline |
| TEST orders / payments | **RETAIN_BUT_EXCLUDE** from production posting (or delete if safe); never post forward |
| TEST products / SKUs | **MANUAL_REVIEW** — remove from sellable if fake |
| ITC/GST TEST evidence | **RESET_REQUIRED** |
| Real commerce orders (4k) | **RETAIN** — no historical GL rebuild |

---

## 29. Feature Flag Activation

| FLAG | Purpose | Default | Cutover | Order | Rollback |
|------|---------|---------|---------|------:|----------|
| `NATIVE_ACCOUNTING_ENABLED` | Module gate | 0 | 1 | 1 | 0 |
| `ACCOUNTING_CUTOVER_DATE` | Boundary | unset | agreed ISO date | 2 | unset / prior |
| `ACCOUNTING_CUTOVER_FORWARD_ONLY` | Block pre-cutover posts | unset | 1 | 3 | 0 |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | Prod-like persist | unset | 1 | 4 | 0 |
| `ACCOUNTING_SALES_POSTING_ENABLED` | ORDER_PAID | 0 | 1 | 5 | 0 |
| `ACCOUNTING_REFUND_POSTING_ENABLED` | Full refund | 0 | 1 | 6 | 0 |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` | Gateway settle | 0 | 1 | 7 | 0 |
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | Vendor bill | 0 | 1 | 8 | 0 |
| `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED` | Vendor pay | 0 | 1 | 9 | 0 |
| `ACCOUNTING_EXPENSE_POSTING_ENABLED` | Expenses | 0 | 1 | 10 | 0 |
| `ACCOUNTING_INVENTORY_VALUATION_ENABLED` | Layers | 0 | 1 | 11 | 0 |
| `ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED` | Capex layers | 0 | 1 | 12 | 0 |
| `ACCOUNTING_COGS_POSTING_ENABLED` | COGS | 0 | 1 | 13 | 0 |
| `ACCOUNTING_COGS_REVERSAL_ENABLED` | COGS reverse | 0 | 1 | 14 | 0 |
| `ACCOUNTING_BANKING_ENABLED` | Banks | 0 | 1 | 15 | 0 |
| `ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED` | Statements | 0 | 1 | 16 | 0 |
| `ACCOUNTING_BANK_RECONCILIATION_ENABLED` | Recon | 0 | 1 | 17 | 0 |
| `ACCOUNTING_GST_ENABLED` | GST module | 0 | 1 | 18 | 0 |
| `ACCOUNTING_GST_RECONCILIATION_ENABLED` | GST recon | 0 | 1 | 19 | 0 |
| `ACCOUNTING_ITC_VERIFICATION_ENABLED` | ITC | 0 | 1 | 20 | 0 |
| `ACCOUNTING_GST_REPORTING_ENABLED` | GST reports | 0 | 1 | 21 | 0 |
| `ACCOUNTING_REPORTS_ENABLED` | FS reports | 0 | 1 | 22 | 0 |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` | Bulk discover | 0 | 0→1 only after smoke | last | 0 |
| `ACCOUNTING_COD_COLLECTION_ENABLED` | COD | 0 | per need | with banking | 0 |
| `ACCOUNTING_FY_START_MONTH` | FY | 4 | 4 (confirm) | with reports | prior |

Do **not** enable in 7A.

---

## 30. Dual-Run Strategy

**Recommend:** 2–4 weeks dual-run after cutover.

- Native GL posts in Sarveda  
- Zoho remains external reference (no auto sync unless already safe)  
- Weekly: sales revenue, GST output/input, bank, AP payments, inventory value vs Zoho  
- Exit dual-run when acceptance gates hold for 2 consecutive weeks  

---

## 31. Rollback Plan

| Action | |
|--------|--|
| Disable posting flags | Commerce continues; orders/payments unaffected |
| Keep `NATIVE_ACCOUNTING_ENABLED=0` or leave reports-only | |
| Posted journals after cutover | **Remain immutable** — do not delete |
| If reopen needed | New correcting journals; or restore DB snapshot **only if** cutover window had no commerce dependence on accounting |

**No destructive rollback** of commerce. Accounting rollback = flags off + optional snapshot restore of accounting tables only if pre-agreed.

---

## 32. Final Acceptance Gates

- Full backend suite clean; backend + frontend build  
- No unbalanced POSTED journals  
- TB / BS balanced; P&L integrity PASS  
- Inventory GL = FIFO; AP = subledger; AR = subledger or approved zero  
- Bank / gateway / GST openings approved  
- No active TEST accounting contamination  
- Opening journal balanced; 3900 unexplained = 0 or approved  
- Persistent flags intentional  
- Commerce + accounting smoke tests; exports = services  

---

## 33. Proposed Phase 7 Slices (FROZEN)

| Slice | Scope |
|-------|--------|
| **7B** | Accounting-domain reset procedure (backup + truncate order) · opening import infrastructure · SKU mapping admin/import · opening file validators · dry-run recon reports |
| **7C** | Load **real** owner files · create opening journals + subledgers · pass pre-cutover gates · document residual risks |
| **7D** | Set cutover date · activate flag sequence · dual-run checklist · final acceptance · production readiness sign-off |

**Why not fewer:** reset/import infra is dangerous to combine with live data load and flag flip in one shot.  
**Why not more:** no separate GST/AP engines needed — openings reuse existing posting patterns.

**Frozen at 3 slices. No 7E.**

---

## 34. Risk Matrix

| Risk | Rating |
|------|--------|
| TEST cleanup | **HIGH** (volume) — mitigated by E |
| Journal immutability vs reset | **MEDIUM** — ops procedure, not app delete |
| Inventory opening | **HIGH** / **BLOCKER** without cost+qty |
| SKU mapping | **HIGH** / **BLOCKER** if incomplete |
| Bank openings | **HIGH** |
| Gateway clearing | **HIGH** (Razorpay) |
| AP | **MEDIUM** (may be small) |
| AR | **LOW** (likely zero) |
| GST | **HIGH** |
| Historical migration | **BLOCKER** if Option 1 attempted — avoid |
| Opening equity plug | **HIGH** if unexplained |
| Cutover boundary | **MEDIUM** |
| Feature flags | **MEDIUM** |
| Rollback | **MEDIUM** |
| Zoho comparison | **MEDIUM** |

---

## 35. Recommendation

1. Treat current Lightsail GL as **non-authoritative**.  
2. Execute **Option E** rebuild of accounting-owned data; preserve commerce.  
3. Use **Option 2** cutover openings — do not rebuild Woo/Zoho history into native GL.  
4. Collect **mandatory owner files** before 7C.  
5. Proceed **7B → 7C → 7D** only.  

Do not begin 7B in this phase.

---

READY FOR PHASE 7 IMPLEMENTATION
