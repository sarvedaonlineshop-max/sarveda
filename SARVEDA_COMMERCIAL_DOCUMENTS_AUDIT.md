# SARVEDA COMMERCIAL DOCUMENTS — ARCHITECTURE AUDIT

**Mode:** READ-ONLY (no schema, code, accounting, GST, shipping, or document generation changes)  
**Date:** 2026-08-28  
**Stack:** Next.js 14 + Express + Prisma (existing Sarveda commerce / accounting / shipping)

---

## Executive summary

Sarveda already has a **customer Tax Invoice / commercial invoice PDF** (1:1 with `Order`), **gateway refunds + accounting full-refund GST reversal**, **Purchase Orders + Vendor Bills**, and **Delhivery packing slips / labels**. It does **not** have native Quotation, Proforma Invoice, Delivery Challan, or E-Way Bill entities/APIs.

Refund “credit notes” today are **Zoho Books API + accounting journal reversal + GST management report rows** — **not** a Sarveda `CreditNote` PDF document.

E-commerce `Order` is the only sales order model; there is no separate B2B Sales Order. Buyer GSTIN is **not stored** on Order/Address (accounting snapshot hardcodes `buyerGstin: null`).

---

## 1. Current commercial document inventory

| Document | Status | Frontend | Backend | Prisma | Generator |
|----------|--------|----------|---------|--------|-----------|
| **Tax Invoice (IN / INR)** | **IMPLEMENTED** | Admin order detail download; customer My Orders / public invoice URL | `GET /api/admin/orders/:id/invoice`, `…/download`, `GET /api/orders/public/:orderNumber/invoice` | `Invoice` 1:1 `Order` | `utils/invoice.ts` → `buildGstInvoicePdf` (PDFKit); `invoices/invoice.service.ts` |
| **Commercial Invoice (intl)** | **IMPLEMENTED** | Same download paths | Same | Same `Invoice` | `buildCommercialInvoicePdf` when ship country ≠ IN or currency ≠ INR |
| **GST Invoice (accounting sense)** | **PARTIAL** | Accounting Sales GST / Sales Entries (journals, not PDF) | `ORDER_PAID` journal + GST reports | `AccountingPostingEvent` / journals | No separate GST PDF beyond Tax Invoice |
| **Sales Invoice (alias)** | **IMPLEMENTED** (same as Tax/Commercial Invoice) | — | — | — | — |
| **Credit Note (Sarveda PDF/entity)** | **NOT IMPLEMENTED** | — | — | No `CreditNote` model | — |
| **Credit Note (Zoho)** | **PARTIAL / LEGACY-INTEGRATION** | — | `zoho-financials.ts` `createZohoRefundDocumentsForOrder` | Stored ids in `Payment.rawPayload` | Zoho Books API |
| **Credit Note (GST report)** | **PARTIAL** | `/admin/accounting/gst` credit-notes report | `buildCreditNoteReport` from `ORDER_REFUNDED_FULL` | Posting events | Report only — not a legal CN PDF |
| **Refund document (customer)** | **NOT IMPLEMENTED** | Refund status on admin/order UI | `refund.service.ts` gateway refunds | `Refund` on `Payment` | No PDF |
| **Quotation / Estimate** | **NOT IMPLEMENTED** | — | — | — | — |
| **Proforma Invoice** | **NOT IMPLEMENTED** | — | — | — | — |
| **Sales Order (manual B2B)** | **NOT IMPLEMENTED** | — | — | — | Distinct from e-com `Order` |
| **E-commerce Order** | **IMPLEMENTED** | `/admin/orders`, `/checkout`, `/profile` | checkout + orders modules | `Order` | — |
| **Delivery Challan** | **NOT IMPLEMENTED** | — | — | — | — |
| **E-Way Bill** | **NOT IMPLEMENTED** | — | No eway/EWB/GSP/IRN code paths found | — | — |
| **Purchase Order** | **IMPLEMENTED** | `/admin/purchases/purchase-orders` (+ new/detail) | `purchases` module; numbering `PO-#####` | `PurchaseOrder`, `PurchaseOrderLine` | **No PO PDF** (UI + DB only) |
| **Vendor Bill** | **IMPLEMENTED** | `/admin/purchases/bills`, accounting vendor-bills | purchases + `vendor-bill-*` accounting | `VendorBill`, `VendorBillLine` | **No bill PDF** (operational + AP journals) |
| **Packing Slip** | **PARTIAL** | Admin shipping label flow | `GET /api/shipping/admin/label/:waybill` → Delhivery packing_slip API + HTML render | Uses `Shipment.awb` | `delhivery.label.ts` HTML (not PDFKit invoice) |
| **Shipment Label** | **PARTIAL** | Order detail ship UI | Delhivery label/packing slip HTML | `Shipment` | Delhivery HTML |
| **Shipping Manifest** | **NOT IMPLEMENTED** (status string mentions only) | — | Tracking status may include “MANIFEST” substring | — | — |
| **Return document** | **PARTIAL** | Admin reverse shipment / restock | Delhivery reverse pickup; `OrderInventoryRestockEvent`; service requests | Restock + reverse AWB | No return challan PDF |
| **Zoho historical invoices** | **LEGACY** | Admin legacy marketplace invoices UI | `zoho-historical-invoices` | Import tables / Zoho ids on Order | External |

---

## 2. Current Tax Invoice — full flow

### Lifecycle

1. **Order created** at `POST /api/checkout/create-order` (`PENDING_PAYMENT`).
2. **COD path:** `Invoice` row upserted immediately with `invoiceNo = INV-{orderNumber}` (no PDF yet necessarily).
3. **Payment success** → `afterOrderPaid` → `ensureOrderInvoicePdf(orderId)` (async).
4. PDF built with PDFKit, uploaded to S3 key `invoices/{orderNumber}/{invoiceNo}.pdf`, `Invoice.pdfUrl` set.
5. Admin regenerate: `POST /api/admin/orders/:id/invoice/regenerate`.
6. Downloads: admin proxy (private S3) + public authenticated/email-gated customer route.

### Timing

| Question | Answer |
|----------|--------|
| When created? | Row: COD at place; PDF: after paid / COD confirmed (`paymentStatus CAPTURED` or `status PAID` or COD not pending/cancelled) |
| Before/after payment? | **After** payment (or COD confirm) for PDF readiness |
| One invoice per Order? | **Yes** (`orderId` unique on `Invoice`) |

### Numbering

| Layer | Format |
|-------|--------|
| Stored `Invoice.invoiceNo` | `INV-{orderNumber}` via `invoiceNumberForOrder` (e.g. `INV-SRV-20260800001`) |
| **Printed** on PDF | `INV/{FY}/{seq}` via `formatDisplayInvoiceNo` — fiscal year `YY-YY` + last 5 digits of order number |

Not a dedicated invoice sequence table; derived from order number. Display number ≠ stored number string.

### Fields on Tax Invoice PDF (IN)

| Field | Present? | Source |
|-------|----------|--------|
| Seller legal name | Yes | `SELLER_LEGAL_NAME` / default “Sarveda Life Private Limited” |
| Seller GSTIN | Yes (GST path) | `SELLER_GSTIN` / default |
| Seller address | Yes | `SELLER_ADDRESS` / Mysore warehouse default |
| Buyer name | Yes | Shipping address `fullName` (Bill To uses **shipping** address) |
| Buyer GSTIN | **No** | Not on PDF; not on Order/Address; accounting snapshot `buyerGstin: null` |
| Billing address | **Partial** | Checkout creates BILLING + SHIPPING copies; PDF Bill To = **shipping** only |
| Shipping address | Yes (as Bill To) | `OrderAddress` SHIPPING |
| Place of supply | Yes (GST) | Derived from ship state → GST state code map |
| Product / SKU / qty | Yes | OrderItem snapshots |
| HSN | Yes | Product `hsnCode` or `DEFAULT_HSN_CODE` (default `9205`) |
| Taxable / CGST / SGST / IGST | Yes | Inclusive-price reverse calc (`gstFromInclusiveLine`); inter/intra via seller vs ship state |
| Discount / shipping / grand total | Yes | Order money fields |
| Payment details | **Limited** | Footer has order # + email; not full gateway payment id block |
| Invoice date | Yes | `placedAt ?? createdAt` |

### Legal character (evidence-based, not assumed)

- PDF title for India INR: **“Tax Invoice”** with GSTIN + place of supply + CGST/SGST or IGST breakdown.
- Prices in DB are **GST-inclusive**; line tax is reverse-calculated for display.
- International: title **“Invoice”** (commercial), no GSTIN/POS.
- Checkout copy: “Tax invoice emailed after order.”
- **Gaps vs full B2B GST tax invoice practice:** no buyer GSTIN capture; Bill To may not be a distinct billing address; invoice number strategy is order-derived (display FY format) rather than a statutory sequence table; no IRN/e-invoice.

**Verdict:** Intended and labeled as a **GST Tax Invoice for domestic INR orders**, and a **commercial invoice for international** — with known B2B data gaps.

---

## 3. Credit Note / Refund document

| Layer | Status |
|-------|--------|
| **MONEY REFUND** | **IMPLEMENTED** — Razorpay/Stripe/PayPal/COD paths via `refund.service.ts`; `Refund` rows |
| **ACCOUNTING REFUND** | **IMPLEMENTED (full)** — `ORDER_REFUNDED_FULL` journal inverts `ORDER_PAID`; partial = data gap |
| **GST REVERSAL** | **IMPLEMENTED (full only)** — via accounting journals + `buildCreditNoteReport` (management report, not filing) |
| **CREDIT NOTE DOCUMENT (Sarveda PDF/entity)** | **NOT IMPLEMENTED** |
| **Zoho Credit Note** | **PARTIAL** — API create + refund against Zoho invoice when integrated |

**Does refund handling satisfy commercial Credit Note requirement?**  
**No.** Money + accounting + Zoho/report exist; there is **no** immutable Sarveda credit-note number + PDF for the customer/auditor.

---

## 4. Quotation

**Search result:** No quotation / quote / estimate / proposal / draft-sale modules, models, or admin routes.

**Reusable infrastructure for a future Quotation:**

| Capability | Exists |
|------------|--------|
| Product / variant / SKU / HSN / taxClass | Yes |
| Zone pricing (INR/USD/GBP) | Yes |
| GST inclusive reverse-calc helpers | Yes (`utils/gst`) |
| Address patterns | Yes (`OrderAddress` / checkout forms) |
| Vendor GSTIN pattern (purchases) | Yes on `Vendor` — **customer GSTIN missing** |
| PDFKit + logo + seller block | Yes (`utils/invoice.ts`) |
| Numbering helpers | PO/Bill sequence style (`purchases-number.ts`); invoice FY display helper |
| Customer `User` | Yes |

**Suggested future fields (design only):** quotation number, date, valid until, customer, billing/shipping, GSTIN, lines (qty/rate/discount/tax), shipping/other, terms, notes, total, status (DRAFT/SENT/ACCEPTED/EXPIRED/CANCELLED/CONVERTED).

---

## 5. Proforma Invoice — design recommendation

| Option | Fit for Sarveda |
|--------|-----------------|
| A. Separate entity | Possible but heavy if Quote already exists |
| **B. Rendering/state of a Quotation** | **Recommended V1** — “Proforma” = accepted/sent quotation PDF watermarked or titled Proforma; same numbers or `PF-` view of quote |
| C. Pre-payment rendering of Sales Order / Order | Weak: e-com Order is post-cart checkout with payment session; unpaid `PENDING_PAYMENT` is not a clean B2B proforma workflow |
| D. Other | Hybrid: Quote → convert to Order only when customer proceeds to pay |

### Differences (architecture)

| | Quotation | Proforma | Tax Invoice |
|--|-----------|----------|-------------|
| Intent | Offer / estimate | Request payment against offered terms | Legal tax document after supply/payment recognition |
| Accounting | None | None | Ties to `ORDER_PAID` / sale |
| Number | Own sequence | Prefer same as Quote or explicit PF link | `Invoice` / INV display |
| Mutability | Editable until accepted | Usually freeze for payment | Immutable after issue |

**Do not** invent a third parallel line-item model if Quote+Proforma can share `Quotation` + document type/status.

---

## 6. Sales Order

- **Native cart checkout:** one `Order` (many `OrderItem`s), created **before** payment.
- **No** manual Sales Order entity distinct from e-commerce Order.
- Constraints: payment method, stock reserve, shipping zone, idempotency, accounting `ORDER_PAID` discovery — all assume this Order shape.

**Recommendation:**  
- DTC website flow: Quote/Proforma → **create/checkout into existing `Order`** (or admin “create order” if added later).  
- Do **not** force a second Sales Order table for V1 unless B2B needs unpaid multi-stage SO without cart. If needed later, introduce carefully; do not overload `PENDING_PAYMENT` abandoned checkouts as “Sales Orders” without UX/status separation.

---

## 7. Delivery Challan — data availability

| Data | Available? |
|------|------------|
| Order / customer / addresses | Yes |
| Product / SKU / HSN / qty | Yes |
| Taxable/value | Derivable from OrderItem + GST helpers |
| Warehouse / pickup | `PickupLocation` + item/shipment link |
| Courier / AWB / tracking / dispatch | `Shipment` (+ `carrierMeta`) |
| Reason for movement | **MISSING** (no goods-movement reason enum) |

### Scenarios

| Scenario | Relevant to Sarveda today? |
|----------|----------------------------|
| Sale / supply against Order | **Yes** (primary) |
| Return movement | Partial (reverse Delhivery + restock) — challan future |
| Stock transfer between warehouses | Future (multi-pickup exists; no transfer doc) |
| Repair / job work / exhibition / sample / approval | Future / rare |
| Movement without sale | Future |

**Link recommendation:**  
V1 **DeliveryChallan** → optional `orderId` + optional `shipmentId`; for non-sale later add `GoodsMovement` or `reasonCode`. Prefer **not** embedding challan solely inside Shipment JSON.

---

## 8. Delivery Challan numbering / PDF reuse

**Existing numbering:**

- Orders: `SRV-{YYYY}{MM}{seq}`
- Invoice stored: `INV-{orderNumber}`; display `INV/{FY}/{seq}`
- PO: `PO-#####`
- Bill: `BILL-#####`

**Reusable for DC:** same pattern as `purchases-number.ts` → e.g. recommended **`DC-YYYY-######`** or `DC/{FY}/######` (design only).

**PDF stack to reuse:**

| Asset | Location |
|-------|----------|
| Library | PDFKit |
| Logo | `backend/assets/labels/sarveda-logo-with-name.png` |
| Seller/GST formatting | `utils/invoice.ts` sellerBlock / GST tables |
| Storage | S3 private PDF + admin download proxy (invoice pattern) |
| Alternate | Delhivery **HTML** packing slip — logistics label, not tax/challan |

---

## 9. E-Way Bill — current state

Repo search (`eway`, `e-way`, `EWB`, `transporterId`, `vehicleNo`, `IRN`, `GSP`, etc. in app source): **no E-Way Bill feature**.

**Status: NOT IMPLEMENTED**

Delhivery payload may send seller GSTIN / HSN for courier compliance — **not** EBN generation.

---

## 10. E-Way Bill data availability map

| Field | Classification |
|-------|----------------|
| Supplier GSTIN / legal name / address | **AVAILABLE NOW** (env seller) |
| Dispatch-from | **DERIVABLE** (`PickupLocation`) |
| Recipient name / ship-to | **AVAILABLE NOW** |
| Recipient GSTIN | **MISSING** (buyer GSTIN not collected) |
| Place of supply | **DERIVABLE** (ship state) |
| Document type / number / date | **DERIVABLE** from Tax Invoice / Order / future DC |
| Transaction / supply / sub-supply type | **USER INPUT REQUIRED** |
| Product description / HSN / qty / unit | **AVAILABLE NOW** / unit may need default |
| Taxable / CGST / SGST / IGST / total | **DERIVABLE** from invoice helpers |
| Cess | **MISSING** (not modeled) |
| Transport mode | **DERIVABLE** (courier mode) / **USER INPUT** |
| Approx distance | **MISSING** / **USER INPUT** |
| Transporter ID/GSTIN / name | **USER INPUT** or **COURIER-PROVIDED** (not in code today) |
| Vehicle number / type | **MISSING** / **USER INPUT** / sometimes courier |
| Transport doc / AWB / date | **AVAILABLE NOW** (`Shipment`) |

---

## 11. E-Way Bill eligibility

**No** application rules for when EWB is required.

**Safe eligibility assistant inputs (future):** document type + taxable value + supply type + inter/intra state + distance + transporter mode + whether goods are exempt — **without hard-coding legal ₹ thresholds in audit**. Thresholds should be config/legal-reviewed at implement time.

---

## 12. E-Way Bill integration options

| Option | Complexity | Credentials | Returns | Gen/cancel/Part-B | Sarveda fit |
|--------|------------|-------------|---------|-------------------|-------------|
| **A. Manual external + store EBN** | Low | None | Manual EBN string + meta | Manual update | **Best V1** |
| **B. Direct GSTN/NIC** | Very high | NIC credentials, crypto, IP whitelist | Full EWB lifecycle | Yes if certified | Heavy; rare for mid-size DTC alone |
| **C. GSP** | High | GSP API keys | Lifecycle APIs | Usually yes | Good V2 if volume justifies |
| **D. Courier/transporter** | Medium–high | Courier contract | May return EBN if supported | Courier-dependent | Inspect Delhivery contract; **not in current code** |

**V1 recommendation:** Manual EBN recording on Order/Shipment/Invoice.  
**V2:** GSP or courier-assisted generation after buyer GSTIN + eligibility UX exist.

---

## 13. Courier integrations

| Courier | Status | Create shipment | AWB/track | Transporter/vehicle for EWB | EWB in code |
|---------|--------|-----------------|-----------|-----------------------------|-------------|
| **Delhivery** | **IMPLEMENTED** (primary domestic) | Yes (`delhivery.ts`) | Yes + webhook | GSTIN/HSN on create; **no vehicle/EBN API usage** | **None** |
| **Shiprocket** | **IMPLEMENTED** (rates/intl assist/create paths) | Yes (router) | Yes | Not EWB | **None** |
| **India Post** | **PARTIAL** — **manual AWB** enum + tracking URL template | No native create API in repo | Manual | N/A | **None** |
| **FedEx** | **PARTIAL** — **manual AWB** + track URL | No FedEx SDK/module in repo | Manual | N/A | **None** |

---

## 14. International / FedEx flow

| Data | Stored? |
|------|---------|
| Country / currency / zone | Yes on Order / address |
| Customs description / HS / IEC / export type | **Not** as dedicated export customs fields |
| Product HSN | Yes (also used domestically) |
| Invoice value | Order totals + commercial invoice PDF |
| FedEx commercial invoice | Sarveda **commercial invoice PDF**; no FedEx API docs |
| AWB | Manual entry on `Shipment` |

**Overlap:** Domestic E-Way Bill ≠ export/customs. Keep FedEx/manual international docs **separate** from EWB.

---

## 15. Recommended document relationships / lifecycle

```
[B2B / offline]
Quotation (DRAFT → SENT)
  └─ Proforma (PDF view / status of Quote)  … no accounting
        └─ Convert → e-commerce Order (checkout or admin create)
              └─ Tax Invoice (Invoice 1:1)  … accounting ORDER_PAID
                    └─ Shipment
                          ├─ Packing slip / label (logistics)
                          ├─ Delivery Challan (when goods movement doc needed)
                          └─ E-Way Bill (manual EBN → later API) linked to Invoice and/or Challan + Shipment

[Refund]
Order + Tax Invoice
  └─ Money Refund (Refund)
  └─ Accounting ORDER_REFUNDED_FULL
  └─ (Future) Credit Note PDF 1:n Order
  └─ (Existing) Zoho credit note when enabled

[Purchases — already separate]
Vendor → PO → Receipt → Vendor Bill → Vendor Payment  … AP accounting
```

Corrected vs naive “Quote → Proforma → Order → Invoice → Shipment”: **Proforma should not be a second invoice entity**; **EWB hangs off Invoice/Challan+Shipment**, not as a sale journal.

---

## 16. Admin information architecture

| Document | Canonical home |
|----------|----------------|
| Orders (fulfillment, AWB, labels) | **Top-level Orders** `/admin/orders` |
| Tax Invoice download | **Orders** detail (already) + link from Sales Entries |
| Credit Note (future PDF) | **Orders** detail + **GST & Tax** list/report |
| Quotes / Proforma | **New** under Accounting → **Sales** *or* top-level **Sales Documents** — **not** under Inventory; avoid duplicating Orders list. Prefer **Accounting → Sales → Quotes** if B2B volume low; else thin top-level **Commercial** |
| Delivery Challans | **Orders** (generate from order/shipment) + optional Sales list |
| E-Way Bills | **Orders** shipment panel (record EBN) + **GST & Tax** register |
| Purchase Orders / Vendor Bills | **Purchases** (already) |
| Sales recognition journals | **Accounting → Sales** (already) |

**Do not** put Quotes under Inventory. **Do not** duplicate Invoice under both Sales and Orders as two editors — Orders owns PDF; Sales owns journal.

---

## 17. Owner requirement matrix

| # | Requirement | Status | Missing |
|---|-------------|--------|---------|
| 1 | Invoice | **PARTIAL → near COMPLETE for DTC** | Buyer GSTIN; distinct Bill To; statutory sequence clarity; payment block; B2B completeness |
| 2 | Quotation / Proforma | **MISSING** | Entire feature |
| 3 | Purchase Order | **COMPLETE** (ops) | PDF print optional gap |
| 4 | Refund handling | **PARTIAL** | Sarveda Credit Note PDF/entity; partial GST auto-reversal |
| 5 | E-Way Bill | **MISSING** | All |
| 6 | Delivery Challan | **MISSING** | All (packing slip ≠ challan) |

---

## 18. Launch-required V1 vs future

### LAUNCH REQUIRED V1 (recommended after design)

1. **Quotation** CRUD + PDF + statuses (no accounting).
2. **Proforma** as Quote PDF/status (no separate money model).
3. **Delivery Challan** PDF linked to Order/Shipment for sale dispatch.
4. **Manual E-Way Bill recording** (EBN, vehicle optional, link to Order/Shipment/Invoice).
5. Optional: surface existing Tax Invoice + packing slip more clearly in admin IA.

### POST-LAUNCH / FUTURE

- Native **Credit Note PDF** + number sequence.
- Buyer GSTIN on checkout / B2B orders.
- GSP / NIC / courier **EWB generate-cancel-Part-B**.
- Automatic eligibility engine (legal-reviewed thresholds).
- Non-sale challan reasons (job work, stock transfer).
- PO/Vendor Bill PDFs.
- FedEx API / customs packet automation.

---

## 19. Database design recommendation (design only — no migration)

### Quotation + QuotationItem

- `Quotation`: number, status, customerId?, email/phone, bill/ship addresses JSON or child rows, buyerGstin?, validUntil, currency, money totals, terms, notes, convertedOrderId?, timestamps  
- `QuotationItem`: product/variant refs optional + snapshots, qty, rate, discount, taxClass, hsn, line totals  
- **No journal**

### DeliveryChallan + DeliveryChallanItem

- Link `orderId?`, `shipmentId?`, `challanNumber`, `reasonCode`, dispatchFrom pickup, party addresses, status, timestamps  
- Items: sku/name/hsn/qty/(optional value)  
- **No sale journal**

### EWayBill

- Link `orderId?`, `invoiceId?`, `shipmentId?`, `deliveryChallanId?`  
- `ebn`, status (DRAFT/ACTIVE/CANCELLED), documentType, supplyType, vehicleNo?, transporterId?, distanceKm?, rawPayload Json?, timestamps  
- **No accounting**

Avoid duplicating Invoice; reuse `Invoice` for tax invoices.

---

## 20. Accounting impact

| Document | Journal? |
|----------|----------|
| Quotation | **Does NOT** |
| Proforma | **Does NOT** |
| Tax Invoice PDF | Document; sale journal is **ORDER_PAID** (separate) |
| Credit Note PDF (future) | Should align with **ORDER_REFUNDED_*** — not double-post |
| Delivery Challan | **Does NOT** (logistics/commercial) |
| E-Way Bill | **Does NOT** |
| PO | Ops; capitalization/AP via bill path |
| Vendor Bill | **May** post AP when posted |

---

## 21. GST impact

| Document | GST calc reuse | Creates GST journal? |
|----------|----------------|----------------------|
| Tax Invoice PDF | Yes (display from inclusive prices) | No (ORDER_PAID does) |
| Quotation/Proforma | May **preview** GST | No |
| Delivery Challan / EWB | May **copy** HSN/value for compliance | **Must NOT** duplicate GST postings |
| Credit Note report | From refund journals | Already posted via refund |

---

## 22. PDF / print / download UX

**Current pattern:** Generate → S3 private → admin download proxy; customer public invoice with auth/email gate; Delhivery label HTML print button.

**Recommend consistent actions for new docs:** Preview (admin), Download PDF, Print (browser), Email if `notifyOrderEmail`-style exists (WhatsApp later — do not require new messaging in V1).

---

## 23. Numbering & immutability

| Doc | Draft # | Final # | FY prefix | Immutable when finalized | Cancel |
|-----|---------|---------|-----------|--------------------------|--------|
| Invoice today | N/A | Order-derived | Display FY | Practically stable; regenerate overwrites PDF | Order refund/cancel separate |
| Quote V1 | Optional draft | On SENT | Recommended | Lock on ACCEPTED/PROFORMA | CANCELLED / EXPIRED |
| DC / EBN | — | On issue | Recommended | Yes | Cancel status + EWB cancel later |

Reuse PO-style sequential helpers; prefer fiscal-year-aware sequences for customer-facing tax-adjacent docs.

---

## 24. Safety / compliance risks (UX safeguards only)

- Wrong GSTIN / missing buyer GSTIN on B2B Tax Invoice  
- Wrong HSN defaults (`9205`)  
- Incorrect place of supply if Bill To ≠ ship state  
- Duplicate document numbers under concurrency (mitigate with unique + retry like PO)  
- EWB against wrong document / cancelled invoice with live EBN  
- Shipment without required EBN (checklist warning — not hard block until policy set)  
- Delivery Challan mistaken for Tax Invoice (clear PDF title + watermark)  
- Manual EBN typos (format validation)  
- Mixing FedEx export with domestic EWB UI  

---

## 25. Implementation effort (approx.)

| Workstream | Effort | Touched areas |
|------------|--------|---------------|
| **A. Quotation / Proforma** | M–L | New Prisma models, purchases-like CRUD, PDFKit template, Accounting→Sales or Commercial UI (~15–25 files) |
| **B. Delivery Challan** | M | Models, PDF, order/shipment actions (~10–15 files) |
| **C. Manual E-Way Bill** | S–M | Model + order UI + GST register list (~8–12 files) |
| **D. Direct EWB API** | XL | GSP client, credentials, cancel/Part-B, eligibility (~20+ files + ops) |
| **E. Admin UI/PDF/tests** | Across A–C | Shared PDF header, numbering util, vitest |

---

## 26. Final checklist

**A. Tax Invoice status —** IMPLEMENTED (domestic Tax Invoice + intl commercial PDF); B2B gaps (buyer GSTIN, bill-to).  
**B. Credit Note status —** PARTIAL (money + accounting + Zoho/report); NO Sarveda CN PDF.  
**C. Quotation status —** NOT IMPLEMENTED.  
**D. Proforma Invoice status —** NOT IMPLEMENTED (recommend Quote render/status).  
**E. Sales Order status —** E-com Order only; no manual SO.  
**F. Delivery Challan status —** NOT IMPLEMENTED (packing slip ≠ challan).  
**G. E-Way Bill status —** NOT IMPLEMENTED.  
**H. Purchase Order status —** IMPLEMENTED (ops UI/API; no PDF).  
**I. Vendor Bill status —** IMPLEMENTED (ops + AP posting path; no PDF).  
**J. Delhivery integration relevance —** High for labels/AWB; **no** EWB API in code.  
**K. India Post integration relevance —** Manual AWB only.  
**L. FedEx/international relevance —** Manual AWB + commercial invoice; separate from EWB.  
**M. Recommended admin IA —** Orders = fulfillment + invoice/challan/EBN actions; Sales/Commercial = Quotes/Proforma lists; GST = registers; Purchases = PO/Bills.  
**N. Recommended document lifecycle —** Quote → Proforma(view) → Order → Tax Invoice → Shipment → (Challan) + (EWB); Refunds → money/accounting → future CN PDF.  
**O. Launch-required V1 features —** Quote+Proforma PDF; Delivery Challan PDF; Manual EBN recording.  
**P. Future integrations —** GSP/NIC/courier EWB; Credit Note PDF; buyer GSTIN; eligibility engine.  
**Q. Backend changes required —** Yes for V1 (new modules); **none in this audit**.  
**R. Prisma migration required —** Yes for V1 models; **none in this audit**.  
**S. Accounting changes required —** **No** for Quote/Proforma/Challan/EWB; CN PDF must align with existing refund journals.  
**T. GST logic changes required —** **No** duplicate postings; reuse display helpers only.  
**U. Estimated implementation effort —** V1 (A+B+C+E): roughly medium multi-sprint; D alone is large.  
**V. Ready for design —** **YES**

---

SARVEDA COMMERCIAL DOCUMENTS AUDIT COMPLETE — READY FOR DESIGN
