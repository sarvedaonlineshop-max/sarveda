# SARVEDA ACCOUNTING — PHASE 7C DATA COLLECTION PLAN
# PREPARATION ONLY (no reset · no posting · no production flags)

**Date:** 2026-08-25  
**Prerequisite:** Phase 7B cutover infrastructure VALIDATED  
**Purpose:** Define the exact **verified cutover opening pack** the owner / accounts / backend must supply before 7C load  

**Out of scope for this document:** reset execute · real opening POST · 7D activation · Zoho writes · forensic repair of current TEST GL  

**Principle:** Current Zoho / Sarveda historical GL is **not** assumed correct. Openings are **explicit, reviewed evidence** as of a single cutover date — not reconstructed history.

**Admin templates (7B):** `GET /api/admin/accounting/opening/templates/{kind}`  
Kinds: `sku_mapping` | `inventory` | `bank` | `gateway` | `ap` | `ar` | `gst` | `equity`

**Global cutover inputs (required once):**

| Field | Who |
|-------|-----|
| Cutover **effective date** (YYYY-MM-DD) | Owner + accountant |
| Confirmation that books open **forward-only** after that date | Owner + accountant |

All money in templates = **integer paise** (₹1 = 100). No floats.

---

## Auto-extractable from Sarveda backend (assistive only)

These can **seed drafts** for review. They must **not** be posted as openings without owner/accountant approval.

| Category | What backend can list | Authority? |
|----------|----------------------|------------|
| SKU catalog | Active `ProductVariant.sku`, name, variant labels | Catalog truth for **NEW_SARVEDA_SKU** only |
| Ops stock qty | `Inventory.onHand` by SKU | **Quantity evidence** — not valuation; never overwritten by opening post |
| Bank registry (if any real rows remain after reset) | Name, masked account, IFSC, GL code | Identity draft only; balances from bank |
| Vendor master | Vendor names / ids | AP name assist |
| Native unpaid VendorBills (if used) | Bill #, dates, outstanding | **Draft only** — verify vs physical/Zoho AP |
| Gateway settlement evidence tables | Recent unsettled hints | **Not** opening authority |
| Current contaminated GL | TB nets | **Do not use** as opening source |

Everything else below is **owner / accounts / external** unless noted.

---

## 1. SKU mapping

| # | Answer |
|---|--------|
| **1. Fields** | `NEW_SARVEDA_SKU`, `LEGACY_SKU`, `PRODUCT_NAME`, `VARIANT_LABEL`, `MATCH_STATUS`, `OPENING_QTY`, `UNIT_COST_IN_PAISE`, `SOURCE`, `NOTES` (+ UI `REVIEW_STATUS` = APPROVED) |
| **2. Template** | kind `sku_mapping` |
| **3. Source** | Owner catalog + any legacy/Woo/Zoho item codes for opening stock |
| **4. Zoho required?** | Optional assist for legacy codes — **not** authority |
| **5. Sarveda required?** | Yes — every `NEW_SARVEDA_SKU` must exist as `ProductVariant` |
| **6. External preferred?** | No |
| **7. Validation** | `MATCH_STATUS` ∈ EXACT \| MANUAL_MATCH \| NEW_SKU \| LEGACY_ONLY \| UNKNOWN; UNKNOWN/LEGACY_ONLY + qty>0 → **block**; review APPROVED for qty>0; no fuzzy auto-match |
| **8. Recon after import** | Every inventory opening SKU has approved mapping |
| **9. Zero allowed?** | Rows with qty 0 OK; empty file OK if inventory also empty |
| **10. Approval?** | **Yes** — owner/ops per mapped line |

---

## 2. Inventory quantity

| # | Answer |
|---|--------|
| **1. Fields** | `SKU`, `QUANTITY`, `UNIT_COST_IN_PAISE`, `SOURCE` (qty is this pack’s count) |
| **2. Template** | kind `inventory` |
| **3. Source** | Physical stocktake / warehouse count **as of cutover date** |
| **4. Zoho required?** | No |
| **5. Sarveda required?** | Compare to `Inventory.onHand` (warning if mismatch; **do not** auto-overwrite ops qty) |
| **6. External preferred?** | **Yes** — physical count beats system |
| **7. Validation** | SKU exists; qty ≥ 0; integer; no duplicate SKU in batch |
| **8. Recon** | Opening qty vs ops onHand → WARNING on mismatch; ops qty independently verified before 7D |
| **9. Zero allowed?** | Yes (SKU with 0 stock) |
| **10. Approval?** | **Yes** — warehouse/owner sign-off on count |

---

## 3. Inventory unit cost / FIFO opening

| # | Answer |
|---|--------|
| **1. Fields** | Same inventory row: `UNIT_COST_IN_PAISE` (≥ 0); batch creates FIFO `sourceType=OPENING` |
| **2. Template** | kind `inventory` (with SKU mapping) |
| **3. Source** | Accountant-approved unit cost (last purchase / weighted / declared opening cost) |
| **4. Zoho required?** | Optional cost hint only |
| **5. Sarveda required?** | No authoritative cost today for production openings |
| **6. External preferred?** | **Yes** — purchase invoices / costing sheet |
| **7. Validation** | Exact integer paise; qty×cost = line total; no TEST SKUs in production pack |
| **8. Recon** | **Σ FIFO opening value = GL 1200** proposal |
| **9. Zero allowed?** | Cost 0 only if qty 0 or explicit free stock (rare — flag for review) |
| **10. Approval?** | **Yes** — accountant |

---

## 4. Bank accounts and balances

| # | Answer |
|---|--------|
| **1. Fields** | `NAME`, `BANK_NAME`, `MASKED_ACCOUNT_NUMBER`, `IFSC`, `ACCOUNT_TYPE` (BANK), `GL_ACCOUNT_CODE`, `OPENING_BOOK_BALANCE_IN_PAISE`, `STATEMENT_BALANCE_IN_PAISE` (evidence), `SOURCE` |
| **2. Template** | kind `bank` |
| **3. Source** | Bank statement / passbook **book balance** as of cutover |
| **4. Zoho required?** | No (chart mapping assist only) |
| **5. Sarveda required?** | Optional GL code from CoA; no full account numbers stored |
| **6. External preferred?** | **Yes** — bank statement |
| **7. Validation** | Unique GL; ASSET bank GL; **not** reserved clearing (1020/1021/1022/1210); no TEST names; approved review |
| **8. Recon** | Each bank GL opening = staged book balance; statement ≠ BS authority |
| **9. Zero allowed?** | Yes if account exists with 0 book balance |
| **10. Approval?** | **Yes** — accounts + owner |

---

## 5. Cash balance

| # | Answer |
|---|--------|
| **1. Fields** | Same as bank; `ACCOUNT_TYPE=CASH` (or PETTY_CASH if used); dedicated cash GL |
| **2. Template** | kind `bank` |
| **3. Source** | Cash count / petty cash register as of cutover |
| **4. Zoho required?** | No |
| **5. Sarveda required?** | No |
| **6. External preferred?** | **Yes** — physical cash count |
| **7. Validation** | Same as bank; positive/zero typical |
| **8. Recon** | Cash GL = staged cash opening |
| **9. Zero allowed?** | Yes |
| **10. Approval?** | **Yes** |

---

## 6. Razorpay unsettled (1020)

| # | Answer |
|---|--------|
| **1. Fields** | `PROVIDER=RAZORPAY`, `GL_ACCOUNT_CODE=1020`, `UNSETTLED_AMOUNT_IN_PAISE`, `DIRECTION` (ASSET\|LIABILITY), `SOURCE_REFERENCE` |
| **2. Template** | kind `gateway` |
| **3. Source** | Razorpay dashboard unsettled / pending settlement as of cutover |
| **4. Zoho required?** | No |
| **5. Sarveda required?** | No — do **not** use contaminated GL 1020 |
| **6. External preferred?** | **Yes** — Razorpay |
| **7. Validation** | Provider/code match; amount integer; review APPROVED |
| **8. Recon** | GL **1020** proposal = staged unsettled |
| **9. Zero allowed?** | **Yes** if dashboard shows nothing unsettled (document source) |
| **10. Approval?** | **Yes** — accounts |

---

## 7. Stripe unsettled (1021)

Same pattern as Razorpay with `PROVIDER=STRIPE`, `GL=1021`, source = Stripe balance/payout pending.  
Zero allowed with evidence. External preferred. Accountant approval required. Do not use current GL.

---

## 8. PayPal unsettled (1022)

Same pattern with `PROVIDER=PAYPAL`, `GL=1022`, source = PayPal available/pending.  
Zero allowed with evidence. External preferred. Accountant approval required. Do not use current GL.

---

## 9. Accounts Payable (2000)

| # | Answer |
|---|--------|
| **1. Fields** | `VENDOR_NAME`, `VENDOR_ID` (optional), `BILL_NUMBER`, `BILL_DATE`, `DUE_DATE`, `OUTSTANDING_IN_PAISE`, `GST_COMPONENT_IN_PAISE`, `TDS_IN_PAISE`, `CURRENCY`, `REFERENCE`, `SOURCE` |
| **2. Template** | kind `ap` |
| **3. Source** | Aged creditors schedule from accountant (vendor statements) |
| **4. Zoho required?** | Optional draft — **verify**, do not trust auto |
| **5. Sarveda required?** | Optional VendorBill draft — **verify** |
| **6. External preferred?** | **Yes** — vendor statements / AP schedule |
| **7. Validation** | Outstanding ≥ 0; unique vendor+bill in batch; review APPROVED |
| **8. Recon** | **Σ AP outstanding = GL 2000** credit proposal |
| **9. Zero allowed?** | **Yes** — empty AP + GL 2000 = 0 (explicit) |
| **10. Approval?** | **Yes** — accountant |

---

## 10. Accounts Receivable (1100)

| # | Answer |
|---|--------|
| **1. Fields** | `CUSTOMER_NAME`, `CUSTOMER_ID`, `INVOICE_REFERENCE`, `INVOICE_DATE`, `DUE_DATE`, `OUTSTANDING_IN_PAISE`, `CURRENCY`, `SOURCE` **or** batch flag `arApprovedZero=true` |
| **2. Template** | kind `ar` |
| **3. Source** | Aged debtors / marketplace receivables if any **true** AR |
| **4. Zoho required?** | Optional draft only |
| **5. Sarveda required?** | Do **not** derive from old orders |
| **6. External preferred?** | Yes if AR exists; else signed **zero AR** |
| **7. Validation** | Empty AR requires `arApprovedZero`; else Σ AR = 1100 |
| **8. Recon** | **1100 = staged AR** or approved zero |
| **9. Zero allowed?** | **Yes** — expected for many ecommerce cutovers |
| **10. Approval?** | **Yes** — explicit zero or schedule |

---

## 11. GST output 2100 / 2101 / 2102

| # | Answer |
|---|--------|
| **1. Fields** | `ACCOUNT_CODE` (2100 CGST / 2101 SGST / 2102 IGST), `BALANCE_IN_PAISE` (**negative = credit/liability**), `SOURCE` |
| **2. Template** | kind `gst` |
| **3. Source** | GST portal / accountant GST payable worksheet as of cutover |
| **4. Zoho required?** | No as authority |
| **5. Sarveda required?** | No — do not infer from contaminated GST journals |
| **6. External preferred?** | **Yes** — GST returns / portal |
| **7. Validation** | Code ∈ {2100,2101,2102}; integer; approved |
| **8. Recon** | Staged balances = opening GL proposal for those codes |
| **9. Zero allowed?** | **Yes** per code if truly nil |
| **10. Approval?** | **Yes** — accountant |

---

## 12. GST input 2200 / 2201 / 2202

| # | Answer |
|---|--------|
| **1. Fields** | `ACCOUNT_CODE` (2200/2201/2202), `BALANCE_IN_PAISE` (**positive = debit/asset**), `SOURCE` |
| **2. Template** | kind `gst` |
| **3. Source** | ITC available / GST portal input credit as of cutover (GL opening only) |
| **4. Zoho required?** | No |
| **5. Sarveda required?** | No CLAIMED ITC inference; Phase 5 ITC workflow stays separate |
| **6. External preferred?** | **Yes** |
| **7. Validation** | Code ∈ {2200,2201,2202}; approved |
| **8. Recon** | Staged = opening GL for input GST |
| **9. Zero allowed?** | **Yes** |
| **10. Approval?** | **Yes** — accountant (claimability ≠ opening GL) |

---

## 13. Equity / capital / retained earnings

| # | Answer |
|---|--------|
| **1. Fields** | `ACCOUNT_CODE` (3000 Owner Capital / 3100 Retained Earnings / 3900 Opening Balance Equity), `AMOUNT_IN_PAISE` (**credit positive**), `REASON` |
| **2. Template** | kind `equity` |
| **3. Source** | Owner capital contribution + accountant equity allocation so **opening Dr = Cr** |
| **4. Zoho required?** | Optional historical hint only |
| **5. Sarveda required?** | No |
| **6. External preferred?** | Owner/accountant schedule |
| **7. Validation** | Codes only 3000/3100/3900; if **3900 ≠ 0** → reason + reviewer + **explicit approval** (WARNING); unexplained 3900 blocked for later 7D acceptance |
| **8. Recon** | Whole opening batch **Dr = Cr**; equity plugs residual by design when reviewed |
| **9. Zero allowed?** | 3100/3900 may be 0; 3000 may be 0 only if other credits balance (unusual) |
| **10. Approval?** | **Yes** — owner + accountant; 3900 always dual-approved if nonzero |

---

## Pack assembly order (7C later)

1. Agree cutover date  
2. SKU mapping approved  
3. Inventory qty + costs  
4. Banks + cash  
5. Gateways (Razorpay / Stripe / PayPal)  
6. AP + AR (or AR zero)  
7. GST 210x / 220x  
8. Equity to balance  
9. Run 7B **Validate** + export review workbook → owner sign-off  
10. Only then: authorized reset execute (ops) → load pack → post (future steps — **not now**)

---

## DATA I NEED TO ASK THE OWNER / BACKEND / ACCOUNTS TEAM FOR

**Owner**
- [ ] Final cutover **effective date**
- [ ] Sign-off that historical Zoho/Sarveda GL will **not** be treated as opening truth
- [ ] Owner capital / equity intent (3000 / 3100; prefer **3900 = 0**)
- [ ] Approval to run accounting-domain **reset** later (after backup) — decision only, not execute now

**Backend / ops**
- [ ] Export active SKU list (draft for mapping)
- [ ] Export `Inventory.onHand` by SKU (qty compare only)
- [ ] Confirm CoA bank/cash GL codes available for real accounts
- [ ] Confirm Razorpay / Stripe / PayPal dashboard access for unsettled snapshots on cutover date

**Accounts / accountant**
- [ ] Approved **SKU mapping** workbook (`MATCH_STATUS` + REVIEW)
- [ ] Physical **inventory count** + **unit costs** (paise)
- [ ] Bank & cash **book balances** (masked accounts + IFSC + statement copies)
- [ ] Razorpay / Stripe / PayPal **unsettled** amounts (or certified zero)
- [ ] **AP** aged schedule (or certified zero)
- [ ] **AR** aged schedule **or** signed **zero AR**
- [ ] GST **2100/2101/2102** and **2200/2201/2202** opening balances (or certified zero)
- [ ] Equity allocation so opening trial balances
- [ ] Signed review of 7B **opening review XLSX** before any 7C post

**Not required for opening pack**
- Reconstructing TEST journals  
- Mapping Flipkart B2C “customers” as AR  
- Using current contaminated TB nets as openings  

---

**STOP** — Phase 7C preparation document only. No reset, no posting, no flag enablement, no 7D.
