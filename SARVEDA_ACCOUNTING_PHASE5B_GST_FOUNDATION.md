# SARVEDA Native Accounting — Phase 5B GST Foundation

**Status:** COMPLETE  
**Date:** 2026-08-25  
**Architecture authority:** `SARVEDA_ACCOUNTING_PHASE5A_GST_TAX_ARCHITECTURE.md`  
**Scope:** Place-of-supply normalization, immutable tax snapshot, shipping GST policy, RCM fail-closed, GST ledger + source↔journal reconciliation foundation, flags, admin API/UI  
**Out of scope:** ITC ELIGIBLE (5C), GSTR-1/3B final reports (5D), GSTR-2B import, filing APIs, Phase 6/7

---

## 1. Executive Summary

Phase 5B implements the production-critical GST foundation **without redesigning** `ORDER_PAID_V1` inclusive-tax mathematics.

Delivered:

1. **Canonical Indian GST state normalization** (`backend/src/utils/gst-state.ts`) — codes, names, aliases → GST state code identity.
2. **Seller / place-of-supply resolution** with fail-closed mismatch (`SELLER_STATE_CONFIGURATION_MISMATCH`, `GST_PLACE_OF_SUPPLY_DATA_GAP`).
3. **Intra/inter classification** after normalization only (`KA` vs `Karnataka` → INTRA).
4. **Immutable tax snapshot** on ORDER_PAID posting payload (JSON diagnostics + per-line tax lines) — no new tax table.
5. **Shipping policy:** `SHIPPING_GST_DATA_GAP` — retain Cr 4100; do not invent shipping GST rate.
6. **VendorBill RCM** fail-closed (`RCM_DATA_GAP`); expense RCM already blocked.
7. **GST ledger** from POSTED journals only (2100–2102 / 2200–2202).
8. **GST reconciliation foundation** (sales, full refunds, vendor bills, expenses, gateway fees).
9. **Flags** `ACCOUNTING_GST_ENABLED` / `ACCOUNTING_GST_RECONCILIATION_ENABLED` default OFF.
10. **Admin API + `/admin/accounting/gst` foundation UI.**

Lightsail validation script `phase5b-lightsail-gst-validation.ts` passed A–M. Full backend suite **27 files / 355 tests**. Frontend build includes `/admin/accounting/gst`. Persistent Lightsail accounting flags remain **absent/OFF**.

---

## 2. POS Normalization

**Authority:** `backend/src/utils/gst-state.ts` — single map; other modules must import, not re-copy.

Canonical identity = **GST state code** (e.g. Karnataka / KA / 29 / `karnataka` → `29`).

Supports Indian states/UTs needed for catalog and customer address data (aliases for common abbreviations and spaced names).

`normalizeGstState(raw)` → `{ ok, state: { raw, code, name } }` or unrecognized/missing codes.

---

## 3. Seller State Validation

`resolveSellerGstIdentity({ sellerState, sellerGstin })`:

- Normalizes `SELLER_STATE` (name / abbreviation / code).
- If `SELLER_GSTIN` is present and prefix (first two digits) is a known state code that **contradicts** normalized seller state → **`SELLER_STATE_CONFIGURATION_MISMATCH`** (fail closed for tax posting).
- Prefer GSTIN prefix when consistent; never silently override contradictory config.

Policy: tax posting fails independently; commerce order/payment remains valid.

---

## 4. Buyer / Place-of-Supply

Sales POS authority unchanged: **shipping `OrderAddress.state`**.

Normalized via `resolvePlaceOfSupply`. Missing/unrecognized → **`GST_PLACE_OF_SUPPLY_DATA_GAP`** (no guess; no automatic seller-state fallback for temple pickup / special delivery).

`buyerGstin` remains **nullable** (`null` on snapshot — no customer GSTIN field). Warning `BUYER_GSTIN_MISSING` only; B2C sales still post.

---

## 5. Intra / Inter Classification

After successful normalization:

| Condition | Result |
|-----------|--------|
| `sellerStateCode == placeOfSupplyStateCode` | `INTRA_STATE` → Output CGST + SGST |
| else | `INTER_STATE` → Output IGST |

Diagnostics on snapshot/proposal:

- `sellerStateRaw` / `sellerStateCode`
- `placeOfSupplyRaw` / `placeOfSupplyCode`
- `supplyType`

Display strings are never used after normalization.

---

## 6. Tax Snapshot

Extended ORDER_PAID posting `payloadJson` / proposal diagnostics (no new Prisma table).

Per line (immutable evidence):

- orderItemId, productId, variantId, SKU  
- grossInclusive / allocatedDiscount / netInclusive  
- taxableValue, gstRate, totalTax, cgst/sgst/igst  
- hsnSac, hsnSource (`PRODUCT` \| `DEFAULT`)  
- sellerStateCode, placeOfSupplyStateCode, supplyType  
- sellerGstin, buyerGstin (nullable), calcVersion  

Order-level warnings include POS block, shipping policy, PDF divergence, tax-class/HSN defaults, buyer GSTIN missing.

`taxPostingBlock` prevents journal post when POS/seller identity fails; commerce unaffected.

---

## 7. HSN/SAC Snapshot

Product `hsnCode` snapshotted at post. Default HSN (legacy fallback) records:

- `hsnSacResolved`
- `hsnSource = DEFAULT` → recon / UI warning **`HSN_DEFAULTED`**

No HSN inference from product name. Does not block commerce.

---

## 8. GST Rate Handling

Backend `GST_RATES`: `0`, `5`, `12`, `18` (`standard` / `gst18` / `gst12` / `gst-5` / `gst-zero-rate`).

Unknown / empty taxClass still defaults to **18** for ORDER_PAID_V1 compatibility, but surfaces **`TAX_CLASS_DEFAULTED`**.

Admin frontend `TAX_CLASS_OPTIONS` = 0 / 5 / 12 / 18 only — **no 28% option in production admin**. Phase 5A “frontend 28%” concern: **DATA_GAP closed as not reachable** via current admin catalog; unknown classes warn via `TAX_CLASS_DEFAULTED` if present in data.

---

## 9. Mixed Rate Orders

Per-line rate buckets preserved (e.g. 5% + 18%). No averaging. Snapshot + recon can aggregate by rate / component; ledger aggregates by GL account for period.

---

## 10. Rounding

| Path | Intra split |
|------|-------------|
| Sales / ORDER_PAID snapshot (`splitOutputGstPaise`) | CGST = `Math.round(tax/2)`, SGST = remainder |
| Purchases / expenses (existing builders) | CGST = `Math.floor(tax/2)`, SGST = remainder |

**Policy for 5B:** do **not** rewrite historical purchase journals to match sales rounding. Snapshot/reporting follows **posted** line amounts. New sales snapshot uses sales-style `round`. Journal imbalance fail threshold remains **≤2 paise**. Calc-version bump deferred unless a semantic change is approved.

---

## 11. Shipping GST Policy

**Chosen: `SHIPPING_GST_POLICY = SHIPPING_GST_DATA_GAP`**

Evidence:

- Native accounting credits shipping to **4100** with **no** GST split.
- No reliable shipping tax-rate policy in native checkout/order tax fields (`taxInPaise` often 0).
- Inventing 18% (or any rate) would be unsafe.

Behavior: retain current posting; surface warning on snapshot + recon status `SHIPPING_GST_DATA_GAP`. Owner may later approve `SHIPPING_GST_IMPLEMENTED` with explicit rate evidence.

---

## 12. PDF vs Journal Divergence

Invoice PDF tax extraction still does **not** allocate order discount the same way as ORDER_PAID_V1.

**5B action:** recon status **`PDF_JOURNAL_TAX_DIVERGENCE`** with variance in diagnostics.  
**Not changed:** invoice PDF / commerce invoice artifacts (explicit review required before alignment).

---

## 13. Purchase GST Hardening

Vendor bill journal continues provisional Input GST (2200–2202) when eligible. Diagnostics include vendor GSTIN/state, seller state, invoice ref, bill date, taxable, rate, CGST/SGST/IGST, reverseCharge, calcVersion. POS uses shared `resolvePlaceOfSupply` (vendor state vs seller).

**ITC remains unverified** — recon tags `ITC_UNVERIFIED` (Phase 5C).

---

## 14. RCM Fail-Closed

| Source | Behavior |
|--------|----------|
| Expense `reverseCharge=true` | Already blocked (`RCM_DATA_GAP`) |
| VendorBill `reverseCharge=true` | **Fixed** — eligibility returns `RCM_DATA_GAP`; no normal Input GST post |

No RCM liability/input journal in 5B.

---

## 15. Expense GST

Existing expense GST posting preserved. Recon compares posted Input GST to posting evidence; statuses include `MATCHED` + `ITC_UNVERIFIED` / `RCM_DATA_GAP` as applicable. No ELIGIBLE claim.

---

## 16. Gateway GST

Razorpay settlement: fee + tax → **5100**; ITC string `UNVERIFIED_PENDING_TAX_INVOICE` unchanged.

GST foundation surfaces **`GATEWAY_GST_PROVISIONAL`**. No posting to 2200–2202 in 5B.

---

## 17. GST Ledger

`buildGstLedger({ from, to } | { month })` — POSTED journal lines only.

Per account (2100, 2101, 2102, 2200, 2201, 2202):

- opening balance  
- period debit / credit  
- closing balance  

Aggregates: output CGST/SGST/IGST + input CGST/SGST/IGST recognized (closing).

Authority is GL, not Order/VendorBill/Expense tables.

---

## 18. GST Reconciliation

Read-only `buildGstReconciliation` / `buildGstDataGaps`.

Scopes: `SALES`, `FULL_REFUNDS`, `VENDOR_BILLS`, `EXPENSES`, `GATEWAY_FEES`.

Statuses include: `MATCHED`, `MISSING_JOURNAL`, `MISSING_TAX_DOCUMENT`, `GST_DATA_GAP`, `AMOUNT_MISMATCH`, `RATE_MISMATCH`, `PLACE_OF_SUPPLY_MISMATCH`, `ITC_UNVERIFIED`, `PDF_JOURNAL_TAX_DIVERGENCE`, `SHIPPING_GST_DATA_GAP`, `PARTIAL_REFUND_GST_DATA_GAP`, `RCM_DATA_GAP`, `BUYER_GSTIN_MISSING`, `GATEWAY_GST_PROVISIONAL`, `TAX_CLASS_DEFAULTED`, `HSN_DEFAULTED`.

Does not mutate source records.

---

## 19. Sales Reconciliation

Compares tax snapshot diagnostics vs POSTED Output GST lines (≤2 paise tolerance). Full refunds: inversion path retained; recon scope `FULL_REFUNDS`. Partial refund: **`PARTIAL_REFUND_GST_DATA_GAP`** / eligibility fail-closed — no fabricated reversal.

---

## 20. Purchase Reconciliation

Vendor bill / expense: posted Input GST vs evidence → typically **`MATCHED` + `ITC_UNVERIFIED`** until 5C. RCM → `RCM_DATA_GAP`.

---

## 21. Data Gaps (surfaced in UI)

Exposed on `/admin/accounting/gst` Data Gaps panel (when recon flag ON):

`PLACE_OF_SUPPLY_MISMATCH`, `BUYER_GSTIN_MISSING`, `HSN_DEFAULTED`, `TAX_CLASS_DEFAULTED`, `SHIPPING_GST_DATA_GAP`, `PDF_JOURNAL_TAX_DIVERGENCE`, `PARTIAL_REFUND_GST_DATA_GAP`, `RCM_DATA_GAP`, `ITC_UNVERIFIED`, plus amount/POS/missing journal statuses.

Temple pickup without reliable POS → `GST_PLACE_OF_SUPPLY_DATA_GAP` (no invented seller POS).

---

## 22. Feature Flags

| Flag | Default | Role |
|------|---------|------|
| `ACCOUNTING_GST_ENABLED` | OFF | GST ledger / overview reads |
| `ACCOUNTING_GST_RECONCILIATION_ENABLED` | OFF | Recon + data-gaps (requires GST enabled) |

Documented in `backend/.env.example`. Production mutation remains dual-gated via existing native accounting / production posting guards. GST flags were **not** left ON in Lightsail persistent `.env`.

---

## 23. Admin API

Admin-only (existing accounting admin auth):

- `GET /api/admin/accounting/gst/status`
- `GET /api/admin/accounting/gst/overview`
- `GET /api/admin/accounting/gst/ledger`
- `GET /api/admin/accounting/gst/reconciliation`
- `GET /api/admin/accounting/gst/data-gaps`

Query: `from`/`to` or `month=YYYY-MM`; recon `scope` / `status` / `limit`. No filing/submission endpoints.

---

## 24. Admin UI

`/admin/accounting/gst` — foundation only:

- GST Overview (output/input aggregates)  
- GST Ledger table  
- Sales / Purchase reconciliation tables  
- Data Gaps  

Nav entry in `AdminAccountingNav`. No GSTR-1/3B final reports (Phase 5D).

---

## 25. Tests

| Suite | Result |
|-------|--------|
| `gst-foundation.test.ts` | Included in full suite |
| Focused GST + order-paid (+ discovery) | **3 files / 46 passed** |
| Full backend `vitest run` | **27 files / 355 passed** |
| `prisma validate` | OK |
| `prisma generate` + `tsc` / `npm run build` (backend) | OK |
| Frontend `npm run build` | OK (`/admin/accounting/gst` route present) |

Synthetic coverage includes POS KA/MH, intra/inter journals, mixed rates, RCM block, shipping warning, ledger POSTED-only semantics, recon MATCHED / DATA_GAP paths (see test matrix §29 in phase brief — implemented in unit + Lightsail script).

---

## 26. Lightsail Validation

**Host:** verified pre-launch Lightsail (`13.204.112.165`).  
**Script:** `backend/scripts/phase5b-lightsail-gst-validation.ts` with process-local flags only.

| Check | Result |
|-------|--------|
| A KA → INTRA | PASS |
| B MH → INTER | PASS |
| C intra CGST+SGST | PASS |
| D inter IGST | PASS |
| E mixed-rate snapshot | PASS |
| F RCM vendor bill blocked | PASS |
| G/G2 synthetic post + GST ledger POSTED | PASS |
| H sale recon runs | PASS |
| I partial refund DATA_GAP | PASS |
| J gateway provisional | PASS |
| K shipping policy warning | PASS |
| L commerce counts unchanged | PASS (orders/payments fingerprint stable) |
| M persistent flags OFF/absent | PASS |

Tagged fixtures: `TEST-ACC-GST-*` (register for Phase 7 cleanup). Shipping policy confirmed `SHIPPING_GST_DATA_GAP`.

---

## 27. Commerce Safety

| Area | Verdict |
|------|---------|
| COMMERCE FILES MODIFIED | **None for GST.** No checkout/payment/refund redesign. (Unrelated dirty `orders.service.ts` restock provenance from prior inventory work may exist in working tree — not a 5B GST change.) |
| PAYMENT FILES MODIFIED | None |
| REFUND FILES MODIFIED | None |
| INVOICE/PDF FILES MODIFIED | None (divergence status only) |
| ZOHO FILES MODIFIED | None |
| PURCHASES FILES MODIFIED | Eligibility + vendor bill journal POS only (accounting module) |
| GST ACCOUNTING FILES ADDED/MODIFIED | `gst-state.ts`, `gst.ts`, `gst.*.ts`, order-paid snapshot/builder/posting, vendor-bill eligibility/journal, flags, routes, handlers, frontend GST page + API client |
| SCHEMA/MIGRATIONS | **None** for 5B (JSON snapshot on posting payload) |
| TEST DATA CREATED | Lightsail `TEST-ACC-GST-*` journals/events |
| UNEXPECTED FILES | None material |
| COMMERCE REGRESSION | Full suite green; Lightsail commerce counts unchanged |
| ACCOUNTING REGRESSION | Full accounting + commerce tests green |

Commerce/payment remain valid when tax posting fails closed on POS/config gaps.

---

## 28. Known Limitations

- No customer GSTIN capture (deferred; nullable snapshot).  
- Shipping GST not implemented (explicit DATA_GAP).  
- PDF vs journal discount tax divergence not fixed in artifacts.  
- Partial refund GST = DATA_GAP.  
- ITC not claimable (5C).  
- No GSTR-1/3B filing reports (5D).  
- Purchase vs sales CGST/SGST half-split rounding still differ historically (documented; no silent rewrite).  
- Temple pickup without POS evidence fails closed (no invented POS).

---

## 29. Phase 5C Readiness

Ready to start **ITC verification** only:

- Input GST already recognized on 2200–2202 with provisional markers.  
- Gateway tax remains outside Input GST with provisional status.  
- Recon already tags `ITC_UNVERIFIED`.  
- Do **not** mark ELIGIBLE until 5C workflow + evidence rules exist.  
- Do **not** start GSTR final reports until 5C completes (frozen slice order: 5B → 5C → 5D).

---

PHASE 5B GST FOUNDATION VALIDATED
