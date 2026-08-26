# Sarveda Native Accounting — Phase 2A Commerce Posting Architecture Audit

**Date:** 2026-08-22 (corrected same day)  
**Type:** Read-only architecture analysis — **no application code modified**  
**Prerequisite:** Phase 1.5 hardening complete  
**Current flags (staging):** `NATIVE_ACCOUNTING_ENABLED=1`, `ACCOUNTING_SALES_POSTING_ENABLED=0`, `ACCOUNTING_PURCHASES_POSTING_ENABLED=0`

**Document status:** Architecture correction pass applied (paise example, discount/GST tax basis, COD semantics, round-off policy, Phase 2B journal algorithms). Still **analysis only** — Phase 2B not implemented.

---

## 1. Executive Summary

Sarveda commerce is a **Next.js + Express + Prisma** stack where customer orders flow through cart → checkout → gateway payment (or COD) → post-payment side effects (`afterOrderPaid`) → PDF invoice → Zoho Books mirror → fulfillment. **Financial PAID** is written inside provider-specific `$transaction` blocks **before** `afterOrderPaid` runs. Zoho Books today acts as the **operational finance mirror** (sales invoices, customer payments, credit notes, inventory adjustments) — not replaced by native accounting.

Native accounting (Phase 1.5) provides an isolated journal engine, posting-event idempotency, and a **non-activated** discovery worker stub. Commerce code has **zero** accounting hooks.

### Correction summary (this revision)

| Issue | Finding | Resolution in this document |
|-------|---------|------------------------------|
| Shipping Income example | Incorrectly showed **50,000** paise for ₹50 | Corrected to **5,000** paise; example rebalanced |
| Round Off misuse | Document implied Round Off to hide architecture imbalance | Round Off **forbidden** for tax-basis / conversion errors; see §5 |
| Discount + GST basis | PDF extracts GST from **gross** lines then subtracts discount; Zoho **prorates discount into line rates** first | Documented with numeric examples; Phase 2B adopts **Zoho-aligned (discount-first) tax basis** |
| Account 4200 | Contra revenue | Retained: **Dr 4200**; reports must use **net** revenue movements |
| COD `ORDER_PAID` | Operational PAID ≠ cash collected | Event retained as commerce label; accounting meaning = **SALE RECOGNISED**; Dr **COD Receivable / Clearing**, never Cash |

### Key findings for Phase 2B

| Finding | Impact on accounting |
|---------|---------------------|
| `Order.taxInPaise` is always **0** at checkout; GST is recomputed later | Journals must derive tax from line snapshots + product tax class |
| Discount is **order-level**; lines store **gross** inclusive totals | Must allocate discount before (or carefully after) GST — PDF and Zoho **differ** |
| Four PAID writers (Razorpay, Stripe, PayPal, COD) | `ORDER_PAID` observable from DB state; discovery preferred over hooks |
| Gateway fee / settlement columns never populated | Settlement events deferred |
| `ProductVariant.costInPaise` not used at sale | Exclude COGS from Phase 2B |
| COD: `Order.status=PAID`, `Payment.status=PENDING` | Sale recognition ≠ cash receipt |

**Recommended Phase 2B scope:** Discovery-driven, idempotent **`ORDER_PAID`** shadow posting using **discount-first inclusive GST extraction** (aligned with Zoho line construction); no commerce hooks; no COGS; no gateway settlement; Zoho remains authoritative for books.

---

## 2. Current Commerce Financial Flow

*(Unchanged from prior audit — abbreviated here for focus; full path still valid.)*

```
Cart → Checkout create-order (PENDING_PAYMENT / COD PAID)
    → Gateway capture (or COD inline)
    → Order.status=PAID inside $transaction  ← financial / operational PAID write
    → afterOrderPaid (PDF, email, Zoho, optional PROCESSING)
    → Fulfillment → SHIPPED → DELIVERED
    → Refund / cancel / RTO as applicable
```

| Step | Key files | Models |
|------|-----------|--------|
| Cart | `cart.service.ts` | `Cart`, `CartItem` |
| Checkout | `checkout.service.ts` | `Order`, `OrderItem`, `OrderAddress`, `Payment`, stock reserve |
| Razorpay PAID | `razorpay.verify.ts` → `completePaidOrder` | Payment CAPTURED, Order PAID, stock confirm |
| Stripe / PayPal PAID | `stripe.service.ts`, `paypal.complete.ts` | Same pattern |
| COD PAID | `checkout.service.ts` inline | Order PAID, Payment PENDING, stock confirm |
| After paid | `afterPaid.ts` | Invoice PDF, Zoho invoice/payment, cart clear |
| Refund | `refund.service.ts` | `Refund`, Payment refunded fields, optional Zoho CN |

**Transaction boundaries:** Checkout create; each gateway `complete*PaidOrder`; unpaid cancel/timeout; paid cancel/refund status change. External gateway APIs are outside or adjacent to DB txns.

---

## 3. Payment Authority Point

There is **no single function** for all providers. Sarveda considers an order **financially / operationally paid** when provider-specific `$transaction` commits:

| Provider | Authoritative writer | Payment row after commit |
|----------|---------------------|---------------------------|
| Razorpay | `completePaidOrder` in `razorpay.verify.ts` | `CAPTURED` |
| Stripe | `completeStripePaidOrder` | `CAPTURED` |
| PayPal | `completePayPalPaidOrder` | `CAPTURED` |
| COD | Checkout `$transaction` | **`PENDING`** (cash not collected) |

Common Order writes: `status=PAID`, `placedAt` set (COD sets `placedAt` in checkout), stock confirmed.

**`afterOrderPaid` is not the PAID moment** — it runs after commit, guarded by `afterPaidRanAt`.

**Accounting implication:** Discovery should key off Order/Payment DB state, not `afterPaidRanAt`.

---

## 4. GST Flow (existing behaviour — traced)

### Source files

| File | Role |
|------|------|
| `backend/src/utils/gst.ts` | `gstRatePercent`, `gstFromInclusiveLine`, `isInterState` |
| `backend/src/modules/invoices/invoice.service.ts` | `buildInvoiceInputFromOrder` — GST from **gross** `lineTotalInPaise` |
| `backend/src/utils/invoice.ts` | PDF summary: taxable + tax + shipping − discount; Round Off row |
| `backend/src/modules/zoho/zoho-invoices.ts` | `lineRatesAfterOrderDiscount` then `is_inclusive_tax: true` |

### Pricing model

Storefront prices are **GST-inclusive**. Checkout:

```text
taxInPaise = 0
grandTotalInPaise = subtotalInPaise - discountInPaise + shippingInPaise
```

### Intra vs inter state

At PDF build: GST applicable when shipping country = `IN` and currency = `INR`. Inter-state via `isInterState(buyerState, buyerCountry)` vs `SELLER_STATE` (default Karnataka).

### Shipping GST

Shipping is added as a **non-split** charge in both PDF and Zoho (`shipping_charge`). **No GST extracted on shipping** in current code.

### Invoice dates / numbers

| Context | Behaviour |
|---------|-----------|
| DB invoice no | `INV-{orderNumber}` |
| PDF date | `placedAt ?? createdAt` |
| Zoho date | **Today** at sync time |

---

## 5. Discount + GST Tax Basis (critical correction)

### What the code actually does

**Sarveda PDF (`buildInvoiceInputFromOrder` + `invoice.ts`):**

1. For each line: `gstFromInclusiveLine(lineTotalInPaise, rate)` on **gross** inclusive line (pre-order-discount).
2. Summary: `computedTotal = taxableSum + taxSum + shippingInPaise - discountInPaise`.
3. Round Off = `grandTotalInPaise - computedTotal` if \|diff\| ≥ 1 paise.

**Zoho (`zoho-invoices.ts`):**

1. Pro-rate `Order.discountInPaise` across lines by gross weight (`lineRatesAfterOrderDiscount`).
2. Send **discounted** unit rates with `is_inclusive_tax: true` and `tax_percentage` per line.
3. Zoho extracts inclusive tax from **post-discount** line amounts.
4. Shipping sent separately as `shipping_charge`.

These are **materially different tax bases** when `discountInPaise > 0`.

### Concrete examples (paise; rates from `gstFromInclusiveLine`)

Shared helpers used for calculations:

```text
gstFromInclusiveLine(M, r) = {
  tax = round(M * r / (100+r)),
  taxable = M - tax
}
Zoho/native allocation: lineDiscount_i = round(lineGross_i * discount / sumGross)
  (last line gets remainder); netInclusive_i = lineGross_i - lineDiscount_i
Then gstFromInclusiveLine(netInclusive_i, r)
CGST = round(tax/2); SGST = tax - CGST; IGST = tax if inter-state
```

---

#### Example A — One GST rate + discount + shipping (intra-state)

| Field | Value |
|-------|-------|
| Line (18% inclusive) | ₹1,180 = **118,000** paise |
| Discount | ₹100 = **10,000** paise |
| Shipping | ₹50 = **5,000** paise |
| Grand total | ₹1,130 = **113,000** paise |

| Metric | 1. Sarveda PDF | 2. Zoho basis | 3. Proposed native (Phase 2B) |
|--------|----------------|---------------|------------------------------|
| ORDER TOTAL (grand) | 113,000 | 113,000 | 113,000 |
| DISCOUNT | 10,000 (summary) | 10,000 embedded in rates | 10,000 allocated to lines |
| TAXABLE VALUE | **100,000** | **91,525** | **91,525** |
| CGST | **9,000** | **8,238** | **8,238** |
| SGST | **9,000** | **8,237** | **8,237** |
| IGST | 0 | 0 | 0 |
| SHIPPING | 5,000 | 5,000 | 5,000 |
| NET PRODUCT REVENUE (ex-GST) | 100,000 | 91,525 | 91,525 |
| Output GST total | **18,000** | **16,475** | **16,475** |

**Discrepancy PDF vs Zoho/native:** taxable **+8,475**; GST **+1,525** on PDF (PDF overstates tax vs post-discount consideration).

---

#### Example B — Multiple GST rates + one order-level coupon + shipping

| Field | Value |
|-------|-------|
| Line 1 (18%) | 118,000 |
| Line 2 (12%) | 56,000 |
| Discount (10% of merchandise) | 17,400 |
| Shipping | 5,000 |
| Grand | 161,600 |

| Metric | 1. Sarveda PDF | 2. Zoho basis | 3. Proposed native |
|--------|----------------|---------------|-------------------|
| ORDER TOTAL | 161,600 | 161,600 | 161,600 |
| DISCOUNT | 17,400 | 17,400 embedded | 17,400 allocated (11,800 + 5,600) |
| TAXABLE VALUE | **150,000** | **135,000** | **135,000** |
| CGST | **12,000** | **10,800** | **10,800** |
| SGST | **12,000** | **10,800** | **10,800** |
| IGST | 0 | 0 | 0 |
| SHIPPING | 5,000 | 5,000 | 5,000 |
| NET PRODUCT REVENUE | 150,000 | 135,000 | 135,000 |
| Output GST total | **24,000** | **21,600** | **21,600** |

**Discrepancy:** PDF GST higher by **2,400** paise vs Zoho/native.

---

#### Example C — Discount + shipping only (same as A)

See Example A. Shipping never enters GST extraction in PDF or Zoho payload.

---

### Phase 2B tax-basis decision (explicit)

**Native Phase 2B shadow accounting SHALL follow the Zoho-aligned algorithm:**

1. Allocate `Order.discountInPaise` across `OrderItem.lineTotalInPaise` by gross weight (same remainder-on-last-line rule as `lineRatesAfterOrderDiscount`, but operating in **paise** on line totals).
2. Run `gstFromInclusiveLine(netInclusive, rate)` per line.
3. Split CGST/SGST or IGST from post-allocation tax.
4. Credit shipping at full `Order.shippingInPaise` (untaxed, matching current commerce).

**Rationale:** Deterministic; matches money already sent to Zoho Books; suitable future source of truth; does **not** silently adopt PDF’s pre-discount GST inflation.

**PDF discrepancy must be reported in reconciliation**, not absorbed into Round Off.

---

## 6. Zoho Books Flow

*(Summary — traced from `zoho-invoices.ts`, `zoho-financials.ts`)*

| Event | File | Zoho object |
|-------|------|-------------|
| afterOrderPaid | `createZohoInvoiceForOrder` | Sales invoice (inclusive tax, discounted rates) |
| afterOrderPaid | `recordZohoPaymentForOrder` | Customer payment (skips COD) |
| Full refund | `createZohoRefundDocumentsForOrder` | Credit note + refund |
| Cancel unpaid | void invoice | Void |
| Stock | inventory adjustments | Optional sync |

**Role:** Partial accounting mirror (sales invoices + payments + full-refund CNs + inventory) — **not** full GL replacement.

---

## 7. Financial Data Availability Matrix

| Element | Persisted? | Notes |
|---------|------------|-------|
| Subtotal / discount / shipping / grand | ✅ Order header | |
| Line unit / qty / lineTotal | ✅ OrderItem | Gross inclusive; line discount field unused at checkout |
| Taxable / CGST / SGST / IGST | ❌ | Recomputed |
| Gateway fee / settlement | ❌ columns unused | |
| COD cash collected | ❌ | No event |
| Product cost | ⚠️ variant only | Not on order |

---

## 8. Proposed Accounting Event Catalogue

| Event | Meaning | Idempotency key | Phase |
|-------|---------|-----------------|-------|
| **ORDER_PAID** | Commerce source event: sale recognised (see COD note) | `order:{orderId}:paid` | 2B |
| ORDER_REFUNDED_FULL | Full refund posted | `order:{orderId}:refunded_full` | 2C |
| ORDER_PARTIALLY_REFUNDED | Per refund row | `refund:{refundId}` | 2C |
| PAYMENT_GATEWAY_SETTLED | Bank settlement | — | Deferred (no data) |
| COGS_RECOGNISED | Inventory cost | — | Deferred |

### COD event semantics (correction)

**Observed:** `Order.status=PAID`, `Payment.provider=COD`, `Payment.status=PENDING`.

**Decision for Phase 2B:**

- Keep commerce event name **`ORDER_PAID`** (matches DB status and discovery queries).
- Document accounting meaning as **SALE RECOGNISED**, **not CASH RECEIVED**.
- Optional alias in docs: `ORDER_CONFIRMED_COD` = same posting event, clearer finance language.
- Journal: **Dr 1100 Accounts Receivable** (or planned **1023 COD Clearing** — planning only) — **never Dr 1000 Cash** until a future COD collection event exists.
- Receivable remains outstanding until a future COD collection / reconciliation feature.

---

## 9. Corrected Journal Examples & Phase 2B Algorithms

### 9.1 Paise typo correction (prior draft)

Prior draft incorrectly credited Shipping Income **50,000** paise for ₹50.

**Correct:** ₹50 = **5,000** paise.

**PDF-basis illustration** (balances; **not** Phase 2B SoT when discount > 0):

| | Account | Dr | Cr |
|---|---------|----|----|
| Dr | Clearing | 113,000 | |
| Dr | 4200 Discounts | 10,000 | |
| Cr | 4000 Product Sales | | 100,000 |
| Cr | 2100 Output CGST | | 9,000 |
| Cr | 2101 Output SGST | | 9,000 |
| Cr | 4100 Shipping Income | | **5,000** |

Dr = Cr = **123,000**. No Round Off required for this arithmetic.

This PDF-basis journal **overstates GST** vs Zoho when discount exists — retained only as documentation of PDF behaviour.

---

### 9.2 Phase 2B canonical journal (Example A — Zoho-aligned)

**Presentation: Gross sales + contra (taxable portion of discount)**

| | Account | Dr | Cr | Source / formula |
|---|---------|----|----|------------------|
| Dr | 1020/1021/1022 Clearing (by provider) | 113,000 | | `Order.grandTotalInPaise` |
| Dr | 4200 Discounts | **8,475** | | `preDiscountTaxable − postDiscountTaxable` |
| Cr | 4000 Product Sales | | 100,000 | Sum `gstFromInclusiveLine(grossLine).taxable` |
| Cr | 2100 Output CGST | | 8,238 | `round(postTax/2)` |
| Cr | 2101 Output SGST | | 8,237 | `postTax − CGST` |
| Cr | 4100 Shipping Income | | 5,000 | `Order.shippingInPaise` |

Dr = Cr = **121,475**.

Notes:

- **Dr 4200 is not always equal to `Order.discountInPaise`.** Full discount 10,000 inclusive = 8,475 taxable contra + 1,525 GST relief (lower output tax vs PDF).
- Net product revenue = credits(4000) − debits(4200) = 100,000 − 8,475 = **91,525** (matches Zoho taxable).
- **Alternative NET form** (no 4200 lines): Dr Clearing 113,000 / Cr Sales 91,525 / Cr CGST 8,238 / Cr SGST 8,237 / Cr Shipping 5,000. Also balances. Phase 2B **prefers GROSS+CONTRA** so 4200 is exercised and gross sales remain visible.

---

### 9.3 Round Off policy (strict)

**Round Off may be used only for legitimate arithmetic rounding** produced by the **same** Phase 2B tax algorithm (typically CGST/SGST half-split or inclusive extraction rounding), normally **1–2 paise**.

**Round Off MUST NOT** force-balance:

- incorrect paise conversion (e.g. 50,000 vs 5,000)
- PDF vs Zoho tax-basis differences
- missing revenue / shipping / discount components
- discount allocation differences

**Automatic Round Off threshold:** \|imbalance\| ≤ **2 paise**.  
If \|imbalance\| > 2 paise → **fail posting** / flag for reconciliation (do not post).

CoA Round Off account may be planned later; until then, fail closed.

---

### 9.4 Account 4200 — confirmed

- Type remains **REVENUE** (contra by usage).
- ORDER_PAID: **Debit 4200** (never credit for granting a discount).
- Reports: **Net revenue = credits(4000 + 4100) − debits(4200)** (and exclude GST liability credits from “revenue”).
- Do **not** reclassify discount as operating expense.

Seed description text that implies “credits reduce gross sales” is **worded incorrectly** relative to contra usage; operational rule is **debit 4200**.

---

### 9.5 Exact Phase 2B ORDER_PAID algorithms

#### Shared preprocessing (all providers, India INR GST orders)

```text
INPUT: Order + OrderItems + shipping address + Payment.provider

1. isGstApplicable = (shipCountry == "IN" AND currency == "INR")
2. interState = isInterState(shipState, shipCountry)   // if GST applicable
3. For each item i:
     rate_i = isGstApplicable ? gstRatePercent(product.taxClass) : 0
     gross_i = OrderItem.lineTotalInPaise
4. Allocate discount D = Order.discountInPaise across gross_i (Zoho weight rule)
5. For each item:
     net_i = gross_i - discount_i
     pre_i = gstFromInclusiveLine(gross_i, rate_i)   // for gross sales + contra
     post_i = gstFromInclusiveLine(net_i, rate_i)    // for output GST
6. preTaxable = Σ pre_i.taxable
   postTaxable = Σ post_i.taxable
   postTax = Σ post_i.tax
   discountTaxable = preTaxable - postTaxable        // → Dr 4200
7. Split postTax → CGST/SGST or IGST
8. shipping = Order.shippingInPaise
9. clearingDr = Order.grandTotalInPaise
10. Assert: clearingDr + discountTaxable == preTaxable + postTax + shipping
    (within 2 paise; else FAIL)
```

#### Provider debit account

| Provider | Debit account | Source |
|----------|---------------|--------|
| Razorpay | 1020 Razorpay Clearing | `grandTotalInPaise` |
| Stripe | 1021 Stripe Clearing | same |
| PayPal | 1022 PayPal Clearing | same |
| COD | 1100 Accounts Receivable *(or planned 1023 COD Clearing)* | same — **not Cash** |

#### Intra-state GST credits

| Credit | Formula |
|--------|---------|
| 4000 Product Sales | `preTaxable` |
| 2100 Output CGST | `round(postTax / 2)` |
| 2101 Output SGST | `postTax - CGST` |
| 4100 Shipping Income | `shippingInPaise` (omit if 0) |
| Debit 4200 | `discountTaxable` (omit if 0) |

#### Inter-state GST credits

Same as intra, but single **2102 Output IGST = postTax** (no CGST/SGST).

#### No-discount order

`discountTaxable = 0`; pre\* = post\*; no 4200 line.

#### Shipping / no-shipping

If `shippingInPaise = 0`, omit 4100. Shipping never gets GST lines in Phase 2B (matches commerce).

#### International / non-GST

`isGstApplicable = false`:

| Line | Amount |
|------|--------|
| Dr Clearing / AR | `grandTotalInPaise` |
| Dr 4200 | `discountInPaise` (full order discount; no GST embedded split) |
| Cr 4000 | `subtotalInPaise` (= Σ line totals) |
| Cr 4100 | `shippingInPaise` |

Assert: grand + discount = subtotal + shipping.

---

### 9.6 Worked Phase 2B matrices (all must balance)

#### Razorpay + intra + discount + shipping (Example A)

| DEBIT | CREDIT | SOURCE / FORMULA |
|-------|--------|------------------|
| 1020 Clearing 113,000 | | `grandTotalInPaise` |
| 4200 Discounts 8,475 | | `preTaxable − postTaxable` |
| | 4000 Sales 100,000 | Σ gross taxable |
| | 2100 CGST 8,238 | half of postTax |
| | 2101 SGST 8,237 | remainder |
| | 4100 Shipping 5,000 | `shippingInPaise` |

**Balanced: 121,475 = 121,475**

#### Stripe / PayPal

Identical credits; debit **1021** or **1022** instead of 1020.

#### COD + same merchandise

Identical credits; debit **1100 AR** (COD receivable). Memo: sale recognised, cash not collected.

#### Inter-state (Example A numbers)

| DEBIT | CREDIT |
|-------|--------|
| Clearing/AR 113,000 | |
| 4200 8,475 | |
| | 4000 100,000 |
| | 2102 IGST 16,475 |
| | 4100 5,000 |

**Balanced: 121,475 = 121,475**

#### Multi-rate + discount (Example B)

| DEBIT | CREDIT |
|-------|--------|
| Clearing 161,600 | |
| 4200 15,000 | |
| | 4000 150,000 |
| | CGST 10,800 |
| | SGST 10,800 |
| | Shipping 5,000 |

**Balanced: 176,600 = 176,600**

#### No discount + shipping (₹1,180 + ₹50)

| DEBIT | CREDIT |
|-------|--------|
| Clearing 123,000 | |
| | 4000 100,000 |
| | CGST 9,000 |
| | SGST 9,000 |
| | Shipping 5,000 |

**Balanced: 123,000 = 123,000** (PDF and Zoho agree)

#### No discount, no shipping

| DEBIT | CREDIT |
|-------|--------|
| Clearing 118,000 | |
| | 4000 100,000 |
| | CGST 9,000 |
| | SGST 9,000 |

**Balanced: 118,000 = 118,000**

#### International (no GST): merchandise 50,000 + shipping 2,000

| DEBIT | CREDIT |
|-------|--------|
| Clearing/AR 52,000 | |
| | 4000 50,000 |
| | 4100 2,000 |

**Balanced: 52,000 = 52,000**

---

## 10. Refund / Cancellation Accounting

| Scenario | Proposed native treatment |
|----------|---------------------------|
| Cancel / fail before capture | No journal |
| Full refund | Reverse ORDER_PAID (Phase 2C) |
| Partial refund | Deferred — needs Sales Returns design |
| COD cancel after PAID | Reverse sale / AR if posted |
| RTO | Cancel path; refund separate if money moved |

---

## 11. Gateway Settlement Accounting

**Deferred.** `gatewayFeeInPaise` / `settledInPaise` never written. Clearing holds gross capture until a future reconciliation phase.

---

## 12. Chart of Accounts Gap Review

| Code | Name | Role |
|------|------|------|
| 1020 | Razorpay Clearing | Online India capture |
| 1021 | Stripe Clearing | International card |
| 1022 | PayPal Clearing | PayPal |
| 1100 | Accounts Receivable | **Use for COD Phase 2B** until dedicated COD clearing exists |
| 4200 | Discounts (Contra Revenue) | Dr on ORDER_PAID |

**Planning only (do not implement in this phase):** 1023 COD Clearing; Sales Returns; Round Off (≤2 paise automatic only).

---

## 13. Inventory / COGS Readiness

Stock confirms at payment/COD checkout. Cost on variant not snapped to order. **Exclude COGS from Phase 2B.**

---

## 14. Historical Backfill Feasibility

Eligible: paid pipeline statuses + CAPTURED payment **or** COD PAID; not cancelled unpaid; not deleted. Idempotency via `AccountingPostingEvent`. Reconcile totals to Zoho; **expect GST line differences vs PDF** when discounts exist — flag, do not Round Off.

---

## 15. Source-of-Truth Transition Strategy

| Phase | Authority |
|-------|-----------|
| A (now→2B) | Zoho books; native shadow |
| B | Dual reconciliation |
| C | Native authoritative after sign-off |

Exit A→B requires: balanced shadow posts, sample recon, COD policy accepted, PDF-vs-native GST discrepancy understood.

---

## 16. Future Production Integration Points

**Prefer discovery — no payment-path hooks.** High-risk files if hooked later: `razorpay.verify.ts`, `stripe.service.ts`, `paypal.complete.ts`, `checkout.service.ts` (COD), `afterPaid.ts`. Safer: accounting-module pure `buildOrderPaidJournal` + discovery worker.

---

## 17. Risks / Unknowns

| Risk | Mitigation |
|------|------------|
| PDF GST ≠ native/Zoho when discounted | Document; reconcile explicitly; no Round Off cover-up |
| Shipping untaxed | Match commerce; revisit if law/product changes |
| COD AR aging | No collection event yet |
| Zoho invoice date ≠ placedAt | Native date = `placedAt` |
| Partial refunds | Phase 2C |

---

## 18. Recommended Phase 2B Scope

**In:**

1. Pure `buildOrderPaidJournal` using §9.5 algorithm  
2. Discovery worker (dry-run default) creating posting events  
3. Shadow post when sales posting flag on  
4. Admin replay + imbalance fail (>2 paise)  
5. Reconciliation report: native vs Zoho vs PDF tax columns  

**Out:** Commerce hooks; COGS; settlement; partial refunds; CoA migrations in 2B unless COD account explicitly approved separately.

---

## 19. Explicit Files Inspected

### Commerce / payments
- `backend/src/modules/cart/cart.service.ts`
- `backend/src/modules/checkout/checkout.service.ts`
- `backend/src/modules/payments/razorpay.ts`
- `backend/src/modules/payments/razorpay.verify.ts`
- `backend/src/modules/payments/razorpay.webhook.ts`
- `backend/src/modules/payments/stripe.service.ts`
- `backend/src/modules/payments/stripe.webhook.ts`
- `backend/src/modules/payments/paypal.complete.ts`
- `backend/src/modules/payments/paypal.webhook.ts`
- `backend/src/modules/payments/refund.service.ts`
- `backend/src/jobs/paymentTimeoutJob.ts` (or equivalent timeout job)

### Orders / fulfillment
- `backend/src/modules/orders/afterPaid.ts`
- `backend/src/modules/orders/orders.service.ts`
- `backend/src/modules/shipping/orderLifecycle.ts`

### Invoices / GST
- `backend/src/utils/gst.ts`
- `backend/src/utils/invoice.ts`
- `backend/src/modules/invoices/invoice.service.ts`

### Zoho
- `backend/src/modules/zoho/zoho-invoices.ts` (`lineRatesAfterOrderDiscount`)
- `backend/src/modules/zoho/zoho-financials.ts`
- `backend/src/modules/zoho/zoho-contacts.ts`
- `backend/src/modules/zoho/zoho-items.ts`

### Native accounting
- `backend/src/modules/accounting/journal.service.ts`
- `backend/src/modules/accounting/posting-event.service.ts`
- `backend/src/modules/accounting/discovery-worker.ts`
- `backend/src/modules/accounting/seed-coa.ts`
- `backend/src/modules/accounting/accounting-flag.ts`

### Schema
- `backend/prisma/schema.prisma` (`Order`, `OrderItem`, `Payment`, `Refund`, `Invoice`, accounting models)

---

## 20. Code Modification Statement

**No application source code, Prisma schema, migrations, tests, environment variables, configuration, commerce data, or accounting data were modified in this correction pass.**

**Only this document was updated:**

**`SARVEDA_ACCOUNTING_PHASE2A_POSTING_ARCHITECTURE.md`**

---

## Verdict

# READY FOR PHASE 2B IMPLEMENTATION

**Reason:** Tax/posting policy is now **resolved** for Phase 2B:

1. Shipping paise example corrected (5,000 not 50,000); balanced examples provided without Round Off abuse.  
2. Discount/GST basis choice is explicit: **Zoho-aligned discount-first inclusive extraction**; PDF discrepancy documented with numbers.  
3. Round Off limited to ≤2 paise same-algorithm rounding; larger gaps fail closed.  
4. 4200 remains contra revenue via **debit**; net reporting required.  
5. COD `ORDER_PAID` means **sale recognised**; Dr AR/COD clearing, not Cash.  
6. Provider-specific ORDER_PAID algorithms specified and arithmetically balanced.

**Constraints unchanged:** discovery-only shadow posting; Zoho authoritative; no commerce hooks; no COGS/settlement/partial refunds in 2B; do not activate discovery worker until Phase 2B implementation is approved and gated.

**STOP.** Await architectural review before any Phase 2B coding.
