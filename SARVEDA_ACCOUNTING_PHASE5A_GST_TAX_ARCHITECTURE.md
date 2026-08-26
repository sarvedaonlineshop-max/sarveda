# SARVEDA Native Accounting — Phase 5A GST & Tax Architecture

**Status:** READ-ONLY ARCHITECTURE COMPLETE  
**Date:** 2026-08-25  
**Prerequisites:** Phase 1–4 accounting complete; Phase 4 Banking & Cash COMPLETE  
**Scope:** Design only — no schema, code, flags, or DB changes in this phase

---

## 1. Executive Summary

Sarveda already posts **output GST** (2100/2101/2102) on native `ORDER_PAID` and **provisional input GST** (2200/2201/2202) on vendor bills and expenses. Gateway fee tax is **expensed to 5100** with ITC status `UNVERIFIED_PENDING_TAX_INVOICE`. Full refunds reverse output GST by inverting the posted sale journal. There is **no** GSTR filing, GSTR-2B import, customer GSTIN, native credit-note entity, RCM journal, or claimable-ITC workflow.

Storefront prices are **GST-inclusive**. Checkout stores `Order.taxInPaise = 0` and `OrderItem.taxInPaise = 0`. Native accounting extracts GST with a **discount-first inclusive** algorithm (ORDER_PAID_V1). PDF invoices extract GST **without** allocating order discount into line tax — a known divergence from journals.

**Highest architectural risks for Phase 5:**

1. **Place-of-supply mismatch** — commerce addresses often store state **codes** (`KA`, `MH`); `isInterState()` compares to `SELLER_STATE` default **`Karnataka`** (full name). Untreated, real KA orders can be misclassified as inter-state.  
2. **No customer GSTIN** — B2B vs B2C cannot be proven from native data.  
3. **Shipping GST** — credited to 4100 with **no** GST split.  
4. **Partial refund GST** — fail-closed DATA_GAP (correct; do not invent).  
5. **ITC claimability** — recognition ≠ claim; only provisional markers exist.

Phase 5 should proceed in **3 implementation slices** (5B–5D) after this audit. Architecture is sufficient to implement; it is not blocked.

---

## 2. Existing GST Data Model

| Model / field | Meaning | Writer | Mutable? | Owner | Invoice? | Zoho? | Journal? | Tax reporting ready? |
|---------------|---------|--------|----------|-------|----------|-------|----------|----------------------|
| `Product.taxClass` | Rate slug (`standard`, `gst-5`, …) | Admin / import | Yes | Commerce | Yes (via product) | Yes (`tax_percentage`) | Yes (ORDER_PAID snapshot) | Partial — mutable after post unless snapshotted |
| `Product.hsnCode` | HSN | Admin / Zoho import | Yes | Commerce | Yes (+ default `9205`) | Historical `hsnSac` | Not on journal lines | Partial — 44 products null on Lightsail |
| `ProductVariant` tax/HSN | — | — | — | — | Uses product | — | Uses product | **DATA_GAP** — no variant override |
| `Order.taxInPaise` | Order-level tax total | Checkout **always 0**; some migrated/history >0 | Yes until paid | Commerce | Override if >0 | Separate | Not journal authority | Unreliable |
| `OrderItem.taxInPaise` | Line tax | Checkout **0** | Snapshot at order | Commerce | No (PDF recomputes) | No | No | Empty on Lightsail (0 rows >0) |
| `OrderAddress.state` | Billing/shipping state | Checkout | Snapshot | Commerce | POS display | Address sync | ORDER_PAID uses **shipping** state | Codes vs names issue |
| `User.gstin` | — | — | — | — | — | — | — | **ABSENT** |
| `Invoice.invoiceNo` / `pdfUrl` | Tax invoice artifact | Invoice service | Mostly immutable | Commerce | Yes | Parallel Zoho invoice | Linked via order | Document exists; fields incomplete for B2B |
| `Vendor.gstin` | Supplier GSTIN | Admin | Yes | Purchases | N/A | Not AP authority | Bill GST gate | Good population on Lightsail (14/14) |
| `Vendor.billingState` | Vendor POS | Admin | Yes | Purchases | N/A | — | Intra/inter for input GST | Required for recognition |
| `PurchaseOrder.reverseCharge` / `taxInPaise` / line `hsnCode`/`taxClass` | PO tax flags | Purchases | Yes | Purchases | — | — | Not posted until bill | Evidence only |
| `VendorBill.reverseCharge` / `taxInPaise` / line `taxClass`/`taxInPaise` | Bill tax | Purchases | Soft after post | Purchases | Supplier invoice ref | — | Input GST if evidence OK | Line HSN **absent** |
| `Expense.hsnSac` / `taxInPaise` / `taxInclusive` / `sourceOfSupply` / `destinationOfSupply` / `reverseCharge` | Expense GST | Admin | Soft after post | Accounting/ops | — | — | Input GST; RCM blocked | Provisional ITC |
| `AccountingGatewaySettlement.taxInPaise` / `gstItcStatus` | Fee GST portion | Settlement import | Status mutable by design later | Accounting | — | — | **Not** Input GST; 5100 | ITC string only |
| `ZohoHistoricalInvoice` / lines `tax*` / `hsnSac` | Historical Zoho tax | Sync/import | Immutable archive | Zoho mirror | Historical | **Authoritative historically** | Not native GL | Useful for cutover recon |
| `AccountingPeriod` | GL open/close | Admin | Status | Accounting | — | — | Blocks posting | **Not** tax filing period |
| Credit note model | — | Zoho API only | — | Zoho | Zoho CN | Yes | Native full refund invert only | **DATA_GAP** for partial CN |
| Cess / SAC product field / GSTR tables | — | — | — | — | — | — | — | **NOT IMPLEMENTED** |

---

## 3. Sales GST Flow

```
Product.taxClass + inclusive variant price
  → Cart / Checkout (Order.taxInPaise = 0, OrderItem.taxInPaise = 0)
  → Order PAID
  → PDF invoice: gstFromInclusiveLine(lineTotal) WITHOUT discount allocation
  → Zoho invoice: inclusive tax, discount baked into line rate, tax_id/percentage
  → Native ORDER_PAID_V1: allocate discount → extract GST on net inclusive → Output GST GL
```

**CODE FACT — checkout** (`checkout.service.ts`): `taxInPaise = 0`; grand total = subtotal − discount + shipping.

**CODE FACT — GST applicable** (`order-paid-journal.builder.ts`): shipping country `IN` **and** currency `INR`. Else non-GST path (sales/discount without Output GST).

**Tax basis for native GL:** post-discount inclusive extraction per line (Zoho-aligned discount-first policy). PDF basis is tracked in diagnostics for recon only — **not** the GL tax amount.

---

## 4. Inclusive Tax Math

**Authority:** `gstFromInclusiveLine` in `backend/src/utils/gst.ts` (ORDER_PAID / PDF).

For inclusive rate \(R\):

```
taxMinor     = round(lineTotal × R / (100 + R))
taxableMinor = lineTotal − taxMinor
```

Equivalent intent: Taxable = Gross / (1+R), GST = Gross − Taxable, with paise rounding on the tax component.

**Discount policy (native, CODE FACT):**

1. Pro-rata allocate `Order.discountInPaise` across lines by `lineTotalInPaise` (remainder on last line).  
2. `netInclusive = lineTotal − lineDiscount`.  
3. Extract GST on **gross** and **net** separately.  
4. `Dr 4200` = Σ(pre.taxable) − Σ(post.taxable) — **taxable-basis** contra revenue.  
5. `Cr 4000` = Σ(pre.taxable) — gross taxable sales.  
6. `Cr Output GST` = Σ(post.tax) only — **GST after discount**.

### Worked example (CODE FACT algorithm)

| Input | Value |
|-------|-------|
| Item gross | ₹1,180 = 118000 paise |
| GST | 18% |
| Discount | ₹118 = 11800 paise |
| Shipping | 0 |
| Place | Intra-state |

```
pre:  tax = round(118000×18/118) = 18000; taxable = 100000
post: netInclusive = 106200
      tax = round(106200×18/118) = 16200; taxable = 90000
discountContra = 100000 − 90000 = 10000
split (intra): cgst = round(16200/2) = 8100; sgst = 8100
```

**Native journal:**

| Account | Dr | Cr |
|---------|----|----|
| Clearing (1020/…) | 106200 | |
| 4200 Discounts | 10000 | |
| 4000 Product Sales | | 100000 |
| 2100 Output CGST | | 8100 |
| 2101 Output SGST | | 8100 |

Balances exactly. **Do not invent** alternate policies in Phase 5 without calc-version bump.

Note: `extractGst()` uses `round(gross/(1+r))` and can differ by 1 paise from `gstFromInclusiveLine`; ORDER_PAID uses the latter.

---

## 5. Intra / Inter-State

| Signal | Sales authority today | Purchase / Expense |
|--------|----------------------|--------------------|
| Seller state | `process.env.SELLER_STATE ?? "Karnataka"` | Same |
| Seller GSTIN | `SELLER_GSTIN` default `29ABFCS0538N1ZV` (PDF) | Not used for split |
| Buyer / place | **Shipping** `OrderAddress.state` + country | Vendor billing state; expense source/destination |
| Inter rule | Non-`IN` → inter; else string equality vs seller state | Same pattern |

**Authoritative for sales journals today:** shipping state (not billing, not GSTIN).

**LIGHTSAIL FACT:** Captured INR shipping states are mostly **codes** (`MH` 825, `KA` 578, `TN` 265, …). Comparing `"KA"` to `"Karnataka"` yields **inter-state**.

**ARCHITECTURAL DECISION (Phase 5B must implement):** Normalize to GST state codes (or names) before `isInterState`. Fail-closed (`PLACE_OF_SUPPLY_MISMATCH` / `GST_DATA_GAP`) if unresolvable — do not guess. Commerce checkout may continue; accounting posting/reporting flags.

Temple pickup / COD: no special POS logic found; still shipping address state. Document as **DATA_GAP** if operational pickup uses seller premises without address update.

---

## 6. Output GST Accounts

| Code | Name | Type |
|------|------|------|
| 2100 | Output CGST | LIABILITY |
| 2101 | Output SGST | LIABILITY |
| 2102 | Output IGST | LIABILITY |

Used by ORDER_PAID (credit) and ORDER_REFUNDED_FULL (debit invert). Reports should show period debit/credit/closing — liability credit balance = outstanding output tax.

**Recommend (do not create now):** optional Round Off GL only if tax rounding residual remains within existing ≤2 paise journal rule; otherwise keep fail-closed. No new output accounts required for V1.

---

## 7. HSN / SAC

| Source | Status |
|--------|--------|
| `Product.hsnCode` | Present; Lightsail 142/186 non-empty, 44 null |
| Variant override | **None** |
| PDF | Product HSN or `DEFAULT_HSN_CODE` / `9205` |
| ORDER_PAID journal lines | Do not store HSN on GL lines; snapshot may lack HSN today |
| PO line `hsnCode` | Present |
| VendorBillLine | **No HSN** |
| Expense `hsnSac` | Free string |
| Digital/course | Same product taxClass path; no separate SAC model |

Tax rate is **not** derived from HSN — from `taxClass` map. Missing HSN does **not** block invoice (defaults).

**DATA_GAP:** HSN quality + bill-line HSN for purchase reporting.

---

## 8. Multiple Rates

Backend `GST_RATES`: 0 / 5 / 12 / 18. Unknown → **18**. No `gst28` / 28% slug.

Lightsail product mix: `gst-5` 86, `gst18` 40, `standard` 28, `gst-zero-rate` 22, `gst12` 10.

ORDER_PAID computes **per line** rate then aggregates tax — mixed-rate orders supported in journals. Reporting must keep **line-level rate buckets** (never average).

Frontend lists 28% display option without backend taxClass — **DATA_GAP** if 28% goods exist.

---

## 9. Shipping GST

| Layer | Treatment |
|-------|-----------|
| Checkout | Shipping added gross; tax field 0 |
| ORDER_PAID | Full `shippingInPaise` → **Cr 4100**; **no** GST extraction |
| Zoho | `shipping_charge` on inclusive-tax invoice |
| PDF | Shipping after tax buckets; not in line taxable sum |

**DATA_GAP:** Whether shipping is taxable at goods rate / fixed rate / exempt is undefined in native GL. Phase 5 must choose an explicit policy (likely: extract GST from shipping if IN/INR, or document as out-of-scope with REPORT_WARNING). Do not invent silently in reporting.

---

## 10. Discounts

| Type | Storage | Native allocation |
|------|---------|-------------------|
| Coupon / order discount | `Order.discountInPaise` | Pro-rata on line totals |
| Line discount | `OrderItem.discountInPaise` (checkout often 0) | Not separately used in ORDER_PAID_V1 beyond lineTotal |
| Manual | Via order totals | Same |

**4200** = taxable discount component only (pre.taxable − post.taxable).  
GST reduction = pre.tax − post.tax (implicit; reduces Output GST credit).  
Gross coupon rupees ≠ 4200 when GST applies.

Zoho parity helper exists for merchandise net variance; GL does not force Zoho rounding.

---

## 11. Refunds / Credit Notes

| Path | GST behavior |
|------|----------------|
| Native `ORDER_REFUNDED_FULL` | Invert **exact** posted ORDER_PAID lines (incl. Output GST) |
| Partial refund | **Not auto-postable** — DATA_GAP / fail-closed |
| Zoho credit note | Created in Zoho financials; **not** native CN entity |
| COD refund | Not auto-postable |

**ARCHITECTURAL DECISION:** Retain fail-closed for partial GST until item/tax allocation evidence exists. Do not invent proportional GST.

---

## 12. Sales Tax Documents

PDF tax invoice fields (when GST applicable): invoice no (`INV/FY/seq` display), date, seller GSTIN (env), buyer address, HSN (product/default), taxable/tax per line, CGST/SGST or IGST buckets, shipping, discount, grand total, place of supply label (partial state map), round-off **display** row.

**Missing for strong B2B compliance:** buyer GSTIN, reverse charge flag, full state-code POS, discount-aligned tax (PDF ≠ journal when discount > 0).

**Do not claim legal GSTR readiness** from current PDF alone.

Native `Invoice` rows on Lightsail: **8** (vs 3493 captured payments) — most sales lack native PDF row; Zoho historical invoices with tax: **11377**.

---

## 13. Purchase GST

Purchases compute tax **exclusive**: `tax = round(qty × rate × R/100)`; bill `taxInPaise` sum.

Recognition requires INR/IN, plausible vendor GSTIN, supplier reference, vendor state, seller state. Else `GST_DATA_GAP` — fail-closed (no invented Input GST).

Split: `floor(tax/2)` CGST + remainder SGST (differs from sales `round`).

ITC diagnostic always `UNVERIFIED_PENDING_TAX_INVOICE`.

`VendorBill.reverseCharge` stored but **not** eligibility-gated (unlike expenses) — **risk**.

Lightsail: 13 bills, 4 with tax>0, 0 RCM; 13 `VENDOR_BILL_POSTED` events.

---

## 14. Expense GST

Inclusive or exclusive amount semantics via `taxInclusive`. Journal: Dr expense CoA + Input GST; Cr bank/cash.

`reverseCharge=true` → `RCM_DATA_GAP` (blocked). Contradictory supply states → `GST_DATA_GAP`.

Lightsail: 2 expenses, 1 with tax; 2 posted events.

Claimability needs: valid tax invoice ref, GSTIN, jurisdiction, later GSTR-2B match — not stored as workflow today.

---

## 15. Gateway GST

Settlement stores `feeInPaise` + `taxInPaise` separately. Journal: **both** to **5100** Gateway Charges. Never Input GST.

`gstItcStatus` default `UNVERIFIED_PENDING_TAX_INVOICE` (all 11 Lightsail settlements).

**GST report treatment:** show as provisional / non-claimable gateway cost until tax invoice + eligibility rules; do not mix into eligible ITC totals.

---

## 16. ITC Model

**CODE FACT today:** recognition on 2200–2202 ≠ claimable ITC. Gateway uses string status only.

**Recommended accounting-owned statuses:**

| Status | Meaning |
|--------|---------|
| `UNVERIFIED_PENDING_TAX_INVOICE` | Recognized / fee-tax seen; no verified tax invoice |
| `ELIGIBLE` | Documentary + (future) 2B match policy passed |
| `BLOCKED` | Explicitly non-claimable |
| `REVERSED` | Credit note / return |
| `CLAIMED` | Included in filed period (after Phase 5+ ops) |
| `DATA_GAP` | Insufficient evidence |

**Minimal future model (do not implement in 5A):**  
`AccountingItcEvidence` (or columns on bill/expense/settlement) linking `sourceType`/`sourceId`, tax components, status, verifiedAt, verifiedBy, documentRef — without rewriting GL.

---

## 17. Purchase Tax Document Evidence

| Needed | VendorBill today | Expense today |
|--------|------------------|---------------|
| Vendor GSTIN | Via Vendor | Via Vendor optional |
| Invoice number | `referenceNumber` / supplier ref | `invoiceNumber` / reference |
| Invoice date | Bill date | Expense date |
| Taxable / CGST / SGST / IGST | Computed at post; not stored as immutable tax doc columns | Diagnostics |
| Place of supply | Vendor state vs seller | source/destination |
| Attachment | **DATA_GAP** | **DATA_GAP** |
| RCM flag | Boolean (ungated) | Boolean (blocks) |
| GSTR-2B link | **Absent** | **Absent** |

---

## 18. Reverse Charge

**NOT IMPLEMENTED** as journals.

Expense: blocked (`RCM_DATA_GAP`).  
Vendor bill: flag only — **should** block or DATA_GAP in Phase 5B eligibility hardening.

No current Lightsail RCM bills/expenses (`billsRcm=0`, `expensesRcm=0`). Defer full RCM design unless business evidence appears; keep fail-closed.

---

## 19. GST Ledger

Financial authority remains **POSTED** journals:

| Side | Accounts |
|------|----------|
| Output | 2100, 2101, 2102 |
| Input | 2200, 2201, 2202 |

Period report: opening, debit, credit, closing per account. Drill-down via posting event `payloadJson.diagnostics` / document links — not mutable Product fields.

Lightsail GL (includes TEST fixtures — **not** production liability):

| Code | Net (credit − debit) paise |
|------|----------------------------|
| 2100 | +602546 |
| 2101 | +602539 |
| 2102 | +76 |
| 2200 | −49500 (debit balance) |
| 2201 | −49500 |
| 2202 | 0 |
| 5100 | −23404 |

Only **8** ORDER_PAID + **1** full refund posted events — balances are mostly synthetic/test.

---

## 20. Tax Period

`AccountingPeriod` today: `OPEN`/`CLOSED`, unique date range, blocks journal dates. Lightsail: **0** periods.

**Recommendation:** Reuse `AccountingPeriod` for **GL close**. Add optional tax-filing metadata later (`taxReturnStatus`: OPEN | REVIEW | FILED | LOCKED) **or** thin `AccountingTaxPeriod` 1:1 with calendar months if filing ops must diverge from GL close.

Do **not** overbuild a parallel calendar in 5B unless filing ops demand it. Start with monthly report windows over OPEN periods + explicit “report month” parameter.

---

## 21. GST Reconciliation

Proposed statuses (reporting/recon layer):

| Status | Meaning |
|--------|---------|
| `MATCHED` | Source doc ↔ journal tax components within tolerance |
| `MISSING_JOURNAL` | Invoice/bill without POSTED tax journal |
| `MISSING_TAX_DOCUMENT` | Journal without documentary invoice |
| `GST_DATA_GAP` | Evidence insufficient by policy |
| `AMOUNT_MISMATCH` | Tax totals differ |
| `RATE_MISMATCH` | Rate bucket differs |
| `PLACE_OF_SUPPLY_MISMATCH` | Intra/inter / state inconsistent |
| `ITC_UNVERIFIED` | Input recognized, not eligible |
| `PDF_JOURNAL_TAX_DIVERGENCE` | Discount PDF vs ORDER_PAID (expected until PDF aligned) |

Scopes: sales invoices, refunds/CN, vendor bills, expenses, gateway fees.

---

## 22. GSTR-1 Style Reporting

Outward categories (management export — **not** government API filing in Phase 5):

- B2B / B2C  
- Credit notes (full native refunds; Zoho CN recon later)  
- Rate buckets (0/5/12/18/…)  
- HSN summary  
- Taxable value, CGST, SGST, IGST  

**DATA_GAP:** Customer GSTIN absent → cannot reliably classify B2B. Until collected: treat as B2C with `DATA_GAP` flag for potential B2B, or require admin GSTIN on order/invoice before B2B bucket.

---

## 23. GSTR-3B Style Summary

Management summary only:

- Outward taxable + output CGST/SGST/IGST  
- Input recognized vs eligible vs blocked/unverified  
- Gateway provisional  
- Net GST position (output − eligible input)

No filing/API submission in Phase 5 unless separately ordered.

---

## 24. GSTR-2B Future Boundary

**CODE FACT:** No GSTR-2B import/storage in repo.

Future boundary:

```
GSTR-2B CSV/XLSX/JSON → normalize → match VendorBill/Expense
  → ITC status ELIGIBLE / BLOCKED / MISMATCH
```

Do not implement in 5A–5D unless sliced later as optional 5E+/Phase 6. Design ITC statuses now so 2B can attach later.

---

## 25. Zoho GST Role

| Fact type | Finding |
|-----------|---------|
| **CODE FACT** | Zoho sales invoices: inclusive tax, discount in line rate, `tax_percentage` from taxClass, shipping_charge; credit notes via Zoho API; no native purchase GST sync authority |
| **LIGHTSAIL FACT** | 11377 Zoho historical invoices with tax>0 vs 8 native Invoice rows / 8 ORDER_PAID events |
| **ARCHITECTURAL DECISION** | Zoho remains historical/ops sales tax document system until native cutover; native GL is financial authority when posted; do not assume Zoho AP/purchase GST is complete |
| **DATA_GAP** | Zoho vs native discount/tax parity; purchase-side Zoho; GSTR from Zoho not wired into native |

---

## 26. Lightsail Read-Only Findings

Host: pre-launch `13.204.112.165`. **Read-only.** Includes TEST-ACC fixtures — **not** production tax liability.

| Metric | Value |
|--------|-------|
| Products | 186 (HSN non-empty 142; null 44) |
| Tax classes | gst-5 86, gst18 40, standard 28, gst-zero-rate 22, gst12 10 |
| Captured payments | 3493 |
| Orders taxInPaise>0 | 2382 (legacy/migrated; checkout writes 0) |
| OrderItem tax>0 | **0** |
| Native Invoice rows | 8 |
| ORDER_PAID posted | 8 |
| ORDER_REFUNDED_FULL posted | 1 |
| Vendors / with GSTIN | 14 / 14 |
| VendorBills / tax>0 | 13 / 4 |
| Expenses / tax>0 | 2 / 1 |
| Settlements / tax>0 / ITC status | 11 / 2 / all UNVERIFIED |
| Zoho historical tax>0 | 11377 |
| AccountingPeriod rows | 0 |
| Top shipping states | MH, KA, TN, GJ, DL (codes) |

Seller GST configuration is env-based (not a DB row). Customer GSTIN population: **N/A (no field)**.

---

## 27. Rounding

| Context | Rule |
|---------|------|
| Inclusive extract | `Math.round` on tax component |
| Sales CGST/SGST split | `cgst = round(tax/2)`; sgst = remainder |
| Purchase/expense split | `floor(tax/2)` + remainder |
| Journal imbalance | Fail if \|Δ\| > **2** paise; **no** Round Off CoA |
| PDF | Display round-off to reconcile grand total vs recomputed sum |

**Phase 5:** Align sales/purchase half-split policy (document calc version). No large balancing entries.

---

## 28. Tax Source Snapshot

ORDER_PAID already persists `payloadJson.diagnostics` (line allocations, rates, CGST/SGST/IGST, interState, pdfBasis, zohoParity).

**Recommend immutable snapshot fields at post time (5B):**

- gross / discount / net inclusive / taxable / tax / rate per line  
- HSN/SAC  
- place of supply (normalized code + raw)  
- seller + buyer GSTIN (buyer when available)  
- calcVersion (`ORDER_PAID_V1` …)  

Reports must not re-read mutable `Product.taxClass` / `hsnCode` for historical periods.

---

## 29. Fail-Closed Policy

| Condition | Policy |
|-----------|--------|
| Missing/unnormalizable state for GST post | `BLOCK_POSTING` or `GST_DATA_GAP` (commerce OK) |
| Missing taxClass → defaults 18% | `REPORT_WARNING` (consider harden to explicit class) |
| Missing HSN | `REPORT_WARNING` (default HSN) |
| Invalid vendor GSTIN on taxable bill | `BLOCK_POSTING` GST recognition (existing) |
| Mixed-rate OK | Post line-level; never average |
| Partial refund GST | `DATA_GAP` / no auto post |
| Purchase tax split unavailable | `GST_DATA_GAP` |
| Vendor tax invoice missing | `ITC_UNVERIFIED` / no ELIGIBLE |
| RCM true | `BLOCK_POSTING` (expense today; extend to bills) |
| Shipping tax ambiguous | `REPORT_WARNING` / explicit policy in 5B |
| Gateway fee tax | `POST` to 5100 + `ITC_UNVERIFIED` |

Commerce remains operational; accounting/tax may fail separately.

---

## 30. Feature Flags

Recommend (default OFF; do not implement in 5A):

| Flag | Role |
|------|------|
| `ACCOUNTING_GST_ENABLED` | GST ledger/reports + snapshot enrichment |
| `ACCOUNTING_GST_RECONCILIATION_ENABLED` | Doc↔journal recon jobs/UI |
| `ACCOUNTING_ITC_VERIFICATION_ENABLED` | ELIGIBLE/BLOCKED transitions |

Still require existing production persistence guard for any posting changes.

---

## 31. Admin UI Architecture

Route: `/admin/accounting/gst`

Suggested sections (read-heavy V1):

1. GST Overview (period net position)  
2. Output GST  
3. Input GST  
4. ITC Status  
5. Sales Reconciliation  
6. Purchase Reconciliation  
7. HSN Summary  
8. Tax Periods / report month  
9. Data Gaps  

Show: period, taxable, CGST, SGST, IGST, provisional input, eligible input, net position. No filing wizard in Phase 5.

---

## 32. Testing Strategy

Synthetic fixtures (local):

| ID | Scenario |
|----|----------|
| A | Intra-state 18% |
| B | Inter-state 18% (normalized codes) |
| C | Discounted inclusive tax (worked example) |
| D | Mixed 5% + 18% |
| E | Shipping policy case |
| F | Full refund GST invert |
| G | Partial refund DATA_GAP |
| H | Vendor bill input GST |
| I | Expense input GST |
| J | Gateway GST provisional |
| K | Missing/invalid state |
| L | Rounding / half-split edges |
| M | State code `KA` vs seller `Karnataka` normalization |

Lightsail: integration safety only. Real tax masters in Phase 7/cutover.

---

## 33. Proposed Phase 5 Implementation Slices

**Phase 5 shall have exactly 3 implementation slices after 5A:**

### 5B — Place-of-supply + tax snapshot + GST ledger/recon foundation
- Normalize state codes/names; fail-closed POS  
- Harden bill RCM gating; snapshot HSN/POS/GSTIN into posting payloads  
- GST ledger from POSTED GL; sales/purchase recon statuses  
- Explicit shipping GST policy decision (implement or document-exempt)  
- Flags scaffold (OFF)

### 5C — Input GST / ITC verification
- ITC status model on bill/expense/settlement evidence  
- Admin verify/block flows; gateway remains provisional unless invoice evidence  
- Purchase tax evidence checklist UI

### 5D — GSTR-1/3B style reports + HSN + admin UI + hardening
- Rate/HSN summaries; B2C default + B2B when GSTIN present  
- `/admin/accounting/gst`  
- Full regression + Lightsail read-mostly validation  
- PDF discount alignment **optional** if low-risk; else keep recon divergence status

Do **not** add GSTR-2B import or government filing APIs inside 5B–5D unless a new blocker forces a fourth slice.

---

## 34. Risk Matrix

| Risk | Rating |
|------|--------|
| Tax-inclusive math | **LOW** (stable ORDER_PAID_V1) |
| Discount allocation | **LOW–MEDIUM** (PDF divergence) |
| Place-of-supply (code vs name) | **HIGH** (blocker for correct production posting) |
| Mixed rates | **LOW** (per-line works) |
| Shipping tax | **MEDIUM** |
| HSN/SAC quality | **MEDIUM** |
| Customer GSTIN | **HIGH** (B2B reporting) |
| Vendor GSTIN | **LOW** on Lightsail sample |
| Partial refund GST | **MEDIUM** (correct DATA_GAP) |
| ITC claimability | **HIGH** (compliance ops) |
| Gateway GST | **MEDIUM** |
| GSTR-2B absence | **MEDIUM** (defer) |
| Historical migrated taxInPaise | **MEDIUM** |
| Rounding half-split inconsistency | **LOW–MEDIUM** |
| Zoho parity | **MEDIUM** |

---

## 35. Files Future Implementation May Touch

**Do not modify in 5A.** Likely later:

| Area | Paths |
|------|-------|
| Schema | `backend/prisma/schema.prisma`, new migration(s) for ITC/tax period metadata if needed |
| Core GST utils | `backend/src/utils/gst.ts`, `backend/src/utils/invoice.ts` |
| Sales | `order-paid-journal.builder.ts`, `order-snapshot.service.ts`, `order-paid-posting.service.ts`, `order-refunded-full-*` |
| Purchases | `vendor-bill-journal.builder.ts`, `vendor-bill-eligibility.ts`, `expense-gst.ts`, `expense-eligibility.ts` |
| Settlement | `settlement-journal.builder.ts`, settlement types/constants |
| New module | `backend/src/modules/accounting/gst-*.ts` (ledger, recon, reports, itc) |
| Routes/handlers | `accounting.routes.ts`, `accounting.handlers.ts` |
| Flags/guards | `accounting-flag.ts`, `production-guard.ts` |
| Frontend | `frontend/app/admin/accounting/gst/`, `frontend/lib/accounting-api.ts` |
| Tests | `backend/test/accounting/gst-*.test.ts`, extend order-paid / vendor-bill / expense tests |
| Scripts | Lightsail GST validation (read-only / tagged fixtures) |

---

## 36. Recommendation

Proceed to Phase 5 implementation starting with **5B** (place-of-supply normalization is the first production-critical fix). Architecture, CoA, and posting foundations are adequate; remaining work is evidence, reporting, ITC, and UI — not a redesign of inclusive tax math.

Do **not** start Phase 6 operational reports or Phase 7 cutover from this document alone.

---

READY FOR PHASE 5 IMPLEMENTATION
