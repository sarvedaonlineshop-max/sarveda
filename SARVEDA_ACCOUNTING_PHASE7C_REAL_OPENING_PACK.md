# SARVEDA NATIVE ACCOUNTING — PHASE 7C
# REAL CUTOVER OPENING PACK — STAGE + VALIDATE ONLY

**Date:** 2026-08-26  
**Cutover boundary:** `2026-08-25` (`2026-08-25T00:00:00.000Z`)  
**Batch:** `OPEN-202608-00001` (`61534b89-25f9-4c49-baa7-fcd595c04de4`)  
**Status:** **DRAFT** — validated / previewed — **NOT POSTED**  
**Source:** `PHASE7C_REAL_CUTOVER_2026-08-25`  
**Verdict:** **PHASE 7C OPENING PACK BLOCKED — OWNER REVIEW REQUIRED**

---

## 1. Objective & stop condition

Prepare **one** real opening batch on Phase 7B infrastructure using operational Sarveda truth + owner Zoho cutover evidence.

| Done | Not done |
|------|----------|
| Staged DRAFT batch on Lightsail | Post opening journal |
| Validate + preview | Accounting reset `--execute` |
| Review XLSX generated | Persistent `.env` accounting flags |
| This report | Phase 7D / historical Zoho rebuild |

---

## 2. Cutover boundary (Phase 7B — unchanged)

| Item | Value |
|------|--------|
| Owner cutover date | **25/08/2026** |
| Implemented instant | `ACCOUNTING_CUTOVER_DATE` → `2026-08-25T00:00:00.000Z` when set as `2026-08-25` |
| Semantics | `documentDate < cutover` → **PRE_CUTOVER**; `documentDate >= cutover` → **POST_CUTOVER** |
| Code | `backend/src/modules/accounting/accounting-cutover.ts` — **boundary logic not modified** |

Pre-boundary history is represented only via opening balances. Post-boundary activity is for native accounting after owner approval / 7D.

---

## 3. Environment & safety

| Check | Result |
|-------|--------|
| Lightsail touched | **YES** — stage / validate / preview / workbook only |
| Host | Pre-launch Lightsail `13.204.112.165` / DB `sarveda_db` |
| Reset `--execute` | **NO** |
| Opening journal posted for this pack | **NO** (`journalEntryId: null`, `postedAt: null`, status `DRAFT`) |
| Persistent `.env` `NATIVE_ACCOUNTING_*` / `ACCOUNTING_*` | **ABSENT** (0 matching lines); flags used **in-process only** during staging script |
| Commerce fingerprint | Unchanged — orders **4396**, payments **3520**, `inventoryOnHandSum` **93758** |
| Operational `Inventory.onHand` | **Unchanged** |
| Zoho Books writes | **NONE** |

Artifacts:

- Summary JSON: `backend/tmp/phase7c-opening-summary-2026-08-25.json` (local copy: `tmp-phase7c-opening-summary.json`)
- Review workbook: `/home/radha/Downloads/phase7c-opening-review-2026-08-25.xlsx`
- Staging script: `backend/scripts/phase7c-stage-real-opening-pack.ts`

---

## 4. Source authority by category

| Category | Authority | Staged? |
|----------|-----------|---------|
| Inventory **qty** | Sarveda `Inventory.onHand` (ACTIVE, non-TEST) | Qty used; valuation incomplete |
| Inventory **unit cost** | Prefer native FIFO layers → **empty**; Zoho Inventory Valuation as cost evidence only | **1 / 693** SKUs matched |
| Bank / cash | Zoho Trial Balance leaf balances | **YES** (ICICI + Petty Cash) |
| Gateway / marketplace control | Zoho TB — **classified**, not blindly migrated | **NO** (all excluded / DATA_GAP) |
| AP | Zoho Vendor Balance Summary (positive closing) | **YES** (22 vendors) |
| AR | Zoho Customer Balance Summary (positive closing) | **YES** (15 customers) |
| GST | Zoho TB leaf input/output GST lines → native 210x/220x | **YES** |
| Equity | Computed residual only — **not auto-approved** | **NO** (residual is negative → DATA_GAP) |

**Zoho historical rule followed:** no transaction-by-transaction recon, no undeposited/clearing dump import, no gateway settlement rebuild.

---

## 5. Exact staged values (paise / INR)

### 5.1 Opening assets (supported staged)

| Line | GL | Paise | INR |
|------|-----|------:|----:|
| Inventory (partial — 1 SKU) | 1200 | 80,000,000 | 800,000.00 |
| ICICI Bank | 1010 | 10,704,936 | 107,049.36 |
| Petty Cash | 1000 | 2,452,498 | 24,524.98 |
| AR (15 customers) | AR control / staging | 21,800,018 | 218,000.18 |
| Input CGST | 2200 | 8,405,603 | 84,056.03 |
| Input SGST | 2201 | 8,405,603 | 84,056.03 |
| Input IGST | 2202 | 54,634,785 | 546,347.85 |
| **TOTAL ASSETS (as staged)** | | **186,403,443** | **1,864,034.43** |

### 5.2 Opening liabilities (supported staged)

| Line | GL | Paise | INR |
|------|-----|------:|----:|
| AP (22 vendors) | AP | 368,365,156 | 3,683,651.56 |
| Output CGST | 2100 | 38,861,011 | 388,610.11 |
| Output SGST | 2101 | 38,861,011 | 388,610.11 |
| Output IGST | 2102 | 10,414,810 | 104,148.10 |
| **TOTAL LIABILITIES (as staged)** | | **456,501,988** | **4,565,019.88** |

### 5.3 Category totals (requested)

| # | Item | Paise | INR |
|---|------|------:|----:|
| 1 | Exact opening assets | 186,403,443 | 1,864,034.43 |
| 2 | Exact opening liabilities | 456,501,988 | 4,565,019.88 |
| 3 | **PROPOSED_OPENING_EQUITY** | **−270,098,545** | **−2,700,985.45** |
| 4 | Inventory valuation (staged) | 80,000,000 | 800,000.00 |
| 5 | Bank + cash total | 13,157,434 | 131,574.34 |
| 6 | Gateway / control staged | 0 | 0.00 |
| 7 | AP total | 368,365,156 | 3,683,651.56 |
| 8 | AR total | 21,800,018 | 218,000.18 |
| 9 | GST — see §5.4 | | |
| 10 | Total debits (preview) | 186,403,443 | 1,864,034.43 |
| 11 | Total credits (preview) | 456,501,988 | 4,565,019.88 |
| 12 | Difference (Dr − Cr) | **−270,098,545** | **−2,700,985.45** |

Negative proposed equity means **credits exceed debits** — missing assets and/or overstated liabilities. **Not plugged into 3900/3000.** Equity lines staged: **0**.

### 5.4 GST balances (carry-forward only)

| Account | Role | Paise | INR |
|---------|------|------:|----:|
| 2200 | Input CGST | 8,405,603 | 84,056.03 |
| 2201 | Input SGST | 8,405,603 | 84,056.03 |
| 2202 | Input IGST | 54,634,785 | 546,347.85 |
| 2100 | Output CGST | 38,861,011 | 388,610.11 |
| 2101 | Output SGST | 38,861,011 | 388,610.11 |
| 2102 | Output IGST | 10,414,810 | 104,148.10 |

ITC claimability **not** inferred from Zoho; Phase 5C rules remain authoritative for future claims. These are BS carry-forward openings only.

---

## 6. Inventory detail

| Metric | Value |
|--------|--------|
| Qty authority | Sarveda `Inventory.onHand` |
| Stocked ACTIVE non-TEST SKUs | **693** |
| Staged with unit cost | **1** (`MI-BT` only — Zoho valuation SKU overlap) |
| Missing cost SKUs / units | **692** / **68,235** units |
| Native `AccountingInventoryCostLayer` (non-TEST) | **Empty** for stocked SKUs |
| Staged valuation | ₹800,000.00 → GL **1200** |
| Arithmetic | `qty × unitCostPaise` for staged line(s) only |
| Ops qty mutated | **No** |

**Root cause:** Zoho Inventory Valuation SKUs and current Sarveda catalog SKUs are almost entirely **unaligned**. FIFO Cost Lot Tracking last-purchase costs also cover only a thin slice of backend SKUs (~14 matches on an Aug-09 backend stock sample) — still a material DATA_GAP. No invented unit costs.

---

## 7. Bank / cash

| Account | Classification | GL | Balance INR | Evidence |
|---------|----------------|-----|------------:|----------|
| ICICI Bank — Sarveda Life Pvt Ltd | BANK | 1010 | 107,049.36 | Zoho TB |
| Petty Cash | CASH | 1000 | 24,524.98 | Zoho TB |

No historical bank transactions imported.

---

## 8. Gateway / control classification

| Zoho account | Classification | Staged | Reason |
|--------------|----------------|--------|--------|
| ICICI Bank | BANK | Yes | Cutover book balance |
| Petty Cash | CASH | Yes | Cutover book balance |
| Razorpay Account | DATA_GAP | No | TB **credit** ₹385,295.09 — not clean unsettled receivable |
| Stripe Control | DATA_GAP | No | TB credit ₹4,190.59 |
| PayPal | ZERO | No | No TB control balance |
| Amazon / Flipkart / Firstcry / Tata 1Mg | NOT_MIGRATING | No | Marketplace recon controls |
| Amala Earth (Dr ₹7,707.20) | DATA_GAP | No | Needs owner confirm as marketplace receivable |
| Etsy (Dr ₹43,230.46) | DATA_GAP | No | Needs owner confirm |
| Delhivery | LOGISTICS_CONTROL | No | Not gateway clearing / AP |
| Undeposited Funds (Dr ₹30,01,976.63) | NOT_MIGRATING | No | Historical recon dump |
| Clearining A/c (Dr ₹12,24,327) | NOT_MIGRATING | No | Legacy clearing |
| AR TB control (Cr) | DATA_GAP | No | Prefer customer schedule |
| AP TB control | DATA_GAP | No | Prefer vendor schedule; TB ≠ schedule |

**Gateway staged total: ₹0.**

---

## 9. AP / AR

| | Source | Rows | Total INR | Notes |
|--|--------|-----:|----------:|-------|
| AP | Vendor Balance Summary (+closing) | 22 | 3,683,651.56 | TB AP ₹4,031,538.66 → variance **₹347,887.10** DATA_GAP |
| AR | Customer Balance Summary (+closing) | 15 | 218,000.18 | Positive closings only; TB AR control is credit — schedule preferred |

No manufactured AP/AR totals for balancing.

---

## 10. Equity

| Field | Value |
|-------|--------|
| Label | `PROPOSED_OPENING_EQUITY` |
| Residual (Dr − Cr) | **−₹2,700,985.45** |
| Auto-posted / staged equity line | **No** |
| Interpretation | Missing inventory/other assets and/or liability overstatement — **DATA_GAP**, not a dump to 3900 |

---

## 11. Validation results (Phase 7B)

| Check | Result |
|-------|--------|
| Validation status | **FAIL** |
| Fail codes | `OPENING_DR_EQ_CR` |
| Preview balanced | **No** |
| Total Dr = Total Cr | **No** (diff −₹2,700,985.45) |
| Production opening posted | **No** |
| Commerce unchanged | **Yes** |
| `Inventory.onHand` unchanged | **Yes** |
| Persistent flags | **Still ABSENT** |
| Reset execute | **No** |

Inventory / bank / GST account restrictions and reserved-GL checks did not invent balancing figures; imbalance is explicit.

---

## 12. DATA_GAP / REVIEW_REQUIRED register

1. **INVENTORY_COST_DATA_GAP** — 692 stocked SKUs (68,235 units) lack mappable positive unit cost; catalogs unaligned Zoho↔Sarveda.  
2. **INVENTORY_BACKEND_FIFO_EMPTY** — no native non-TEST cost layers for stocked SKUs.  
3. **AP_SCHEDULE_VS_TB** — vendor schedule ₹3,683,651.56 ≠ TB AP ₹4,031,538.66 (Δ ₹347,887.10).  
4. **Razorpay Account** — TB credit ₹385,295.09 excluded.  
5. **Stripe Control Account** — TB credit ₹4,190.59 excluded.  
6. **Amala Earth Control** — Dr ₹7,707.20 — owner confirm.  
7. **Etsy Control** — Dr ₹43,230.46 — owner confirm.  
8. **Accounts Receivable (TB control)** — TB credit; schedule used instead.  
9. **Accounts Payable (TB control)** — TB total vs schedule conflict.  
10. **PROPOSED_OPENING_EQUITY** — residual −₹2,700,985.45 — do not plug; fix underlying openings first.

**Excluded legacy (NOT_MIGRATING / LOGISTICS / ZERO):** Amazon, Flipkart, Firstcry, Tata 1Mg, Delhivery, Undeposited Funds, Clearining A/c, PayPal (zero).

---

## 13. Owner actions required before re-approval

1. Provide **approved unit-cost file keyed to current Sarveda SKUs** (or explicit SKU map Zoho → `NEW_SARVEDA_SKU` + costs), **or** signed decision that inventory opening remains incomplete.  
2. Resolve AP schedule vs TB (₹3.48L).  
3. Confirm/reject Amala Earth + Etsy as opening receivables; confirm Razorpay/Stripe treatment.  
4. Re-run stage → validate → preview only after evidence; keep DRAFT until Dr = Cr with sufficient mandatory evidence.  
5. Do **not** plug equity to force balance.

---

## 14. Final answers (required checklist)

1. **Opening assets:** ₹1,864,034.43 (186,403,443 paise)  
2. **Opening liabilities:** ₹4,565,019.88 (456,501,988 paise)  
3. **Proposed equity:** −₹2,700,985.45 (−270,098,545 paise) — **not staged**  
4. **Inventory valuation:** ₹800,000.00 (partial; 1/693 SKUs)  
5. **Bank/cash total:** ₹131,574.34  
6. **Gateway/control total:** ₹0.00  
7. **AP total:** ₹3,683,651.56  
8. **AR total:** ₹218,000.18  
9. **GST:** Input 2200/2201/2202 ₹84,056.03 / ₹84,056.03 / ₹546,347.85; Output 2100/2101/2102 ₹388,610.11 / ₹388,610.11 / ₹104,148.10  
10. **Total debits:** ₹1,864,034.43  
11. **Total credits:** ₹4,565,019.88  
12. **Difference:** −₹2,700,985.45 (**not ₹0**)  
13. **DATA_GAP / REVIEW_REQUIRED:** §12  
14. **Lightsail touched:** YES (stage/validate/preview only)  
15. **Reset execute:** NO  
16. **Opening journal posted:** NO  
17. **Persistent flags changed:** NO  

---

## PHASE 7C OPENING PACK BLOCKED — OWNER REVIEW REQUIRED
