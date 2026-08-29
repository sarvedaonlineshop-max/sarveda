# SARVEDA E-WAY BILL V1 — DESIGN AUDIT (READ-ONLY)

**Date:** 2026-08-29  
**Stage:** Phase 3 — Design only  
**Integration choice (confirmed):** **Manual EBN recording** after generation on the government portal. **No direct NIC API in V1.** Architecture must remain GSP/API-ready.

**Code change status:** **NONE** — this document does not implement, migrate, or modify application code.

**Completed prerequisites inspected:** Tax Invoice, Quotation + Proforma, Delivery Challan, Order/OrderItem, Shipment/AWB, Delhivery, GST/accounting layer.

---

## Executive verdict

Sarveda already holds most **document, party, item, HSN, value, and AWB** inputs needed for an admin to **prepare** an E-Way Bill externally and then **record the EBN**. Critical gaps remain: **buyer GSTIN is not on Order** (only optional on Delivery Challan / Quote), **no UOM**, **no transporter ID / vehicle / distance**, **no cess**, and **no safe automatic “EWB required” engine**.

**V1 should be a compliance recording + review assistant**, not an automatic legal determination or NIC client.

**Ready to implement V1 after this review:** **YES** (manual EBN only).

---

## A. Existing fields available

Inspected in `backend/prisma/schema.prisma` and related services (invoice, challan, GST utils, shipping, accounting snapshot).

### Order / money / geography

| Data | Where | Notes |
|------|--------|--------|
| Order number | `Order.orderNumber` | Stable commerce id |
| Currency / totals | `subtotalInPaise`, `discountInPaise`, `shippingInPaise`, `taxInPaise`, `grandTotalInPaise` | Integer paise |
| Status / payment / fulfillment | enums on Order | Eligibility gates for docs |
| Shipping zone | `shippingZone` | IN / US / GB / OTHER |
| Placed / created dates | `placedAt`, `createdAt` | Doc date candidates |
| Bill / ship addresses | `OrderAddress` BILLING \| SHIPPING | name, phone, line1/2, city, **state**, **postalCode**, **country** |
| Email / phone | Order | Consignee contact |
| Preferred courier | `preferredCourier` | Soft preference only |

### OrderItem / product tax

| Data | Where | Notes |
|------|--------|--------|
| Description / SKU / qty | `nameSnapshot`, `skuSnapshot`, `qtyOrdered` | Snapshots |
| Unit / line money | `unitPriceInPaise`, `discountInPaise`, `taxInPaise`, `lineTotalInPaise` | Inclusive DTC pricing |
| HSN / tax class | **Live** via `variant.productRel.hsnCode`, `taxClass` | **Not snapshotted on OrderItem** |
| Warehouse link | `pickupLocationId` | Dispatch origin candidate |

### Tax Invoice

| Data | Where | Notes |
|------|--------|--------|
| Invoice row | `Invoice` 1:1 Order | `invoiceNo`, `pdfUrl`, `issuedAt` |
| Stored number | `INV-{orderNumber}` via `invoiceNumberForOrder` | |
| Display number (PDF) | `INV/{FY}/{seq}` via `formatDisplayInvoiceNo` | FY Apr–Mar |
| GST PDF breakdown | Computed in `invoice.service` + `utils/invoice.ts` / `gst.ts` | Taxable, rate, CGST/SGST or IGST for INR+IN |
| Seller on PDF | `SELLER_LEGAL_NAME`, `SELLER_ADDRESS`, `SELLER_GSTIN`, `SELLER_STATE` | Env defaults |

### Delivery Challan (post Phase 2)

| Data | Where | Notes |
|------|--------|--------|
| Challan # / date | `challanNumber` `DC/{FY}/######`, `challanDate` | |
| Reason | `DeliveryChallanReason` | Supply/job work/sample/replacement/return/other |
| Consignee / bill-to | JSON snapshots | |
| Origin / destination | `originState`, dest state/country/PIN | |
| Optional buyer GSTIN | `buyerGstin` | **Only if entered at challan generate** |
| Line HSN/qty/value | `DeliveryChallanItem` snapshots | Better freeze than live Product |
| AWB/carrier snapshot | `awbSnapshot`, `carrierSnapshot`, `shipmentId` | |

### Shipment / AWB

| Data | Where | Notes |
|------|--------|--------|
| Carrier / AWB / tracking | `Shipment.courier`, `awb`, `trackingUrl` | |
| Status timeline | `ShipmentStatus` | Not EWB status |
| Pickup facility | `pickupLocationId` → `PickupLocation` address fields | Dispatch address **when set** |
| Carrier meta | `carrierMeta` Json | Courier ids / MPS — **not** vehicle/EBN |

### Seller / GST helpers

| Data | Where |
|------|--------|
| Seller GST identity | `resolveSellerGstIdentity()` (`gst-state.ts`) |
| Rate map | `GST_RATES` / `gstRatePercent` / `gstFromInclusiveLine` |
| Inter/intra | `isInterState(buyerState, buyerCountry)` |
| GSTIN format | `isPlausibleGstin` |

### Explicit non-sources for EWB document reference

| Document | Why not normal EWB source |
|----------|---------------------------|
| Quotation | Pre-sale; may never ship |
| Proforma | Same snapshot as Quote; not a tax/movement statutory source in Sarveda V1 |

---

## B. Missing fields

| Gap | Severity for manual EWB V1 | Notes |
|-----|----------------------------|-------|
| **Buyer GSTIN on Order / Address** | High for B2B | Accounting `order-snapshot.service` still sets `buyerGstin: null`. Challan/Quote optional only. |
| **UOM (unit of measure)** | Medium | No `PCS`/`NOS` field; defaultable with user confirm |
| **Transporter ID / GSTIN** | High for Part A/B completeness | Not stored |
| **Vehicle number / vehicle type** | High for road Part B | Not in Shipment |
| **Approx distance (km)** | Medium–High | Not stored; portal often requires |
| **Transport mode enum** (Road/Rail/Air/Ship) | Medium | Only courier string / shipping_mode Surface\|Express |
| **Transport document date** | Medium | Can approximate `Shipment.createdAt`; not explicit |
| **Cess** | Low for current catalog | Not modeled |
| **Per-line CGST/SGST/IGST persisted** | Medium | Derivable at review time; not stored on OrderItem |
| **HSN snapshot on OrderItem** | Medium | Live Product HSN can drift; Challan items / invoice build-time are safer |
| **Dispatch PIN/address as first-class on Order** | Medium | Derivable from PickupLocation or seller env |
| **EBN / EWB validity / portal status** | Critical (feature itself) | **No EWayBill model yet** |
| **Exempt-goods / EWB-not-required flags** | High for automation | Absent — blocks safe auto-eligibility |

---

## C. Tax Invoice mapping

| EWB concept | Sarveda source | Classification |
|-------------|----------------|----------------|
| Document type | Tax Invoice | **DERIVABLE** — constant `TAX_INVOICE` |
| Document number | Display `INV/{FY}/…` or stored `Invoice.invoiceNo` | **AVAILABLE** (prefer display # for portal parity; document both) |
| Document date | `Invoice.issuedAt` / order `placedAt` | **AVAILABLE** |
| Document value | `Order.grandTotalInPaise` | **AVAILABLE** |
| Line HSN/qty/taxable | Invoice PDF builder path | **DERIVABLE** (rebuild from Order + Product) |
| CGST/SGST/IGST | Invoice GST helpers | **DERIVABLE** for INR domestic |
| Buyer GSTIN | Not on Invoice/Order | **MISSING** / optional manual on EWB form |
| International commercial invoice | Non-GST PDF path | **Usually NOT_REQUIRED** for Indian EWB; treat separately |

**Recommendation:** Primary document for **outward supply of goods against a sale** = Tax Invoice when Invoice exists and shipment is domestic INR.

---

## D. Delivery Challan mapping

| EWB concept | Sarveda source | Classification |
|-------------|----------------|----------------|
| Document type | Delivery Challan | **DERIVABLE** — constant `DELIVERY_CHALLAN` |
| Document number | `challanNumber` | **AVAILABLE** |
| Document date | `challanDate` | **AVAILABLE** |
| Movement reason | `reason` / `reasonOther` | **PARTIALLY AVAILABLE** — map carefully to portal sub-supply; **NEEDS USER INPUT** for confirmation |
| Consignee / dest | Snapshots | **AVAILABLE** |
| Buyer GSTIN | `buyerGstin` if entered | **PARTIALLY AVAILABLE** |
| Lines HSN/qty/value | `DeliveryChallanItem` | **AVAILABLE** (frozen) |
| AWB | Snapshot or linked Shipment | **PARTIALLY AVAILABLE** |

**When to prefer Challan as source document:** job work, sample, replacement, return, or movement **without** relying on Tax Invoice as the portal “document type” (admin-confirmed). Still **never** use Quotation/Proforma.

---

## E. HSN / GST mapping

| Field | Status | Detail |
|-------|--------|--------|
| HSN | **AVAILABLE** / **PARTIALLY** | Product `hsnCode` or `DEFAULT_HSN_CODE` (`9205`). Challan snapshots HSN. OrderItem does not. |
| Item description | **AVAILABLE** | `nameSnapshot` / challan `productName` |
| Quantity | **AVAILABLE** | Integer qty |
| Unit | **MISSING** → **NEEDS USER INPUT** or default `NOS` with confirm |
| Tax rate % | **DERIVABLE** | From `taxClass` via `GST_RATES` |
| Taxable value | **DERIVABLE** | Inclusive → exclusive via `gstFromInclusiveLine` |
| CGST / SGST | **DERIVABLE** | Intra-state when seller/place resolve |
| IGST | **DERIVABLE** | Inter-state / unresolved → helpers lean inter |
| Cess | **MISSING** | Assume 0 unless catalog later needs it |
| Total tax | **DERIVABLE** | Order `taxInPaise` or sum of lines |

**Caution:** Unknown `taxClass` defaults to 18% — review UI must show rate source (known vs defaulted).

---

## F. Supplier / recipient mapping

### Supplier (Sarveda)

| Field | Status | Source |
|-------|--------|--------|
| GSTIN | **AVAILABLE** | `SELLER_GSTIN` |
| Legal / trade name | **AVAILABLE** | `SELLER_LEGAL_NAME` |
| Dispatch address | **PARTIALLY AVAILABLE** | Prefer `PickupLocation` on shipment/items; else `SELLER_ADDRESS` |
| Dispatch state | **AVAILABLE** / **DERIVABLE** | `SELLER_STATE` / GSTIN prefix / pickup state |
| Dispatch PIN | **PARTIALLY AVAILABLE** | Pickup `postalCode` or parse seller address |

### Recipient

| Field | Status | Source |
|-------|--------|--------|
| Name | **AVAILABLE** | Ship-to `fullName` / challan buyer |
| Ship-to address / state / PIN | **AVAILABLE** | `OrderAddress` SHIPPING / challan consignee |
| Recipient GSTIN | **MISSING** on Order; **PARTIALLY** on Challan | Manual entry on EWB record for B2B |
| URP (unregistered) | **DERIVABLE** | If no GSTIN → treat as URP/B2C for portal prep |
| Bill-to vs ship-to | **PARTIALLY AVAILABLE** | Both address types exist; invoice historically ship-centric |

---

## G. Transport / AWB mapping

| Field | Status | Source |
|-------|--------|--------|
| Transporter name | **PARTIALLY AVAILABLE** | `Shipment.courier` / challan `carrierSnapshot` |
| Transporter ID (GSTIN) | **MISSING** | **NEEDS USER INPUT** |
| Transport document / AWB | **AVAILABLE** when booked | `Shipment.awb` |
| Transport doc date | **DERIVABLE** | `Shipment.createdAt` (confirm) |
| Mode of transport | **PARTIALLY AVAILABLE** | Infer Road for Delhivery/surface; **confirm** |
| Vehicle number | **MISSING** | **NEEDS USER INPUT** (Part B) |
| Approx distance | **MISSING** | **NEEDS USER INPUT** |
| Tracking URL | **AVAILABLE** | Informational only — not an EWB field |

**Shipping safety:** EWB module **reads** Shipment; must **not** create/cancel AWBs or rewrite Delhivery/FedEx/India Post flows.

---

## H. Proposed `EWayBill` model (implementation later)

Additive Prisma model — **not created in this phase**.

### Document reference (discriminated)

```text
sourceDocumentType: TAX_INVOICE | DELIVERY_CHALLAN
sourceInvoiceId?: Uuid          // when TAX_INVOICE
sourceDeliveryChallanId?: Uuid  // when DELIVERY_CHALLAN
sourceDocumentNumber: String    // snapshot of INV… or DC…
sourceDocumentDate: DateTime    // snapshot
```

Enforce exactly one of invoice/challan id matching type. Quotation/Proforma **excluded** from enum.

### Core recorded fields (V1 manual)

| Field | Purpose |
|-------|---------|
| `id`, `orderId` | Anchor to Order |
| `shipmentId?` | Optional link; do not invent shipment |
| `ebn` | Government E-Way Bill Number — **user-entered only** |
| `ewbDate` | Date on portal |
| `validUntil?` | If known from portal |
| `status` | See §I |
| `transactionType?` | Outward / etc. — user selected |
| `subSupplyType?` / `subSupplyDesc?` | Mapped from challan reason or user |
| `buyerGstin?` | Snapshot at record time |
| `transporterName?`, `transporterId?` | Manual / from courier name |
| `transportDocNo?`, `transportDocDate?` | Usually AWB |
| `transportMode?` | ROAD / RAIL / AIR / SHIP |
| `vehicleNumber?` | Part B |
| `approxDistanceKm?` | Integer |
| `notes?` | Free text (sanitized) |
| `generationMethod` | `MANUAL` \| `API` (V1 always MANUAL) |
| `provider?` | e.g. `PORTAL` / future `GSP_NAME` — **no secrets** |
| `providerRequestId?` | Future correlation |
| `providerResponseJson?` | Future opaque response (no credentials) |
| `recordedByUserId?`, `createdAt`, `updatedAt`, `cancelledAt?` |

### Optional line snapshot table `EWayBillItem` (recommended)

Freeze HSN/qty/taxable/rate at recording time so Product HSN drift cannot rewrite history. Can be copied from Invoice build or DeliveryChallanItem.

### Multiplicity

Allow **0..n** EWayBills per Order (replacements, multi-vehicle rare). V1 UI may start with **one active GENERATED** + cancel previous. Unique constraint on `ebn` when non-null.

**Never generate EBN locally** (no sequence inventing government numbers).

---

## I. Proposed status model

Do **not** invent unverified NIC state machines.

| Status | Meaning in Sarveda |
|--------|-------------------|
| `NOT_REQUIRED` | Admin marked not needed (international, digital-only, explicit override) |
| `PENDING` | Review started / info incomplete / awaiting portal generation |
| `GENERATED` | Valid EBN recorded |
| `CANCELLED` | EBN cancelled on portal and marked cancelled in Sarveda |
| `EXPIRED` | Validity ended (display/ops); **do not auto-mutate on page view** unless a deliberate job is added later |

**Rejected for V1:** mirroring full portal Part-A/Part-B/update/extend states as first-class enums without API verification. Store such detail later in `providerResponseJson` if needed.

Display helper (non-mutating): if `validUntil < now` and status `GENERATED` → show “Expired?” attention without forcing DB write.

---

## J. Manual EBN workflow (safest V1)

```text
Orders → Order Detail → Documents → E-Way Bill

1. Preconditions (soft):
   - Domestic IN ship-to preferred
   - Tax Invoice and/or Delivery Challan exists (admin picks source)
   - Shipment/AWB optional but recommended for transport doc

2. “Add / Prepare E-Way Bill”
   - Select sourceDocumentType = Tax Invoice | Delivery Challan
   - System shows READ-ONLY review pack (supplier, recipient, lines, values, AWB)
   - Surface gaps: missing buyer GSTIN, UOM default, distance, vehicle, transporter ID
   - Banner: “E-Way Bill may be required — review. Generate on the government portal.”

3. Admin generates EWB on portal externally (outside Sarveda).

4. Admin returns and records:
   - EBN (validated format length/charset — not invented)
   - ewbDate, validUntil (optional)
   - confirmed transport fields
   - status → GENERATED
   - generationMethod = MANUAL

5. Download/view details in Documents card.
```

**Idempotency:** Reject duplicate `ebn`. Allow update of Part-B-ish fields without changing EBN when status GENERATED (manual correction). Cancel = status CANCELLED + timestamp; retain EBN history.

---

## K. Order Detail UX

Extend existing **Documents** card only (`frontend/app/admin/orders/[id]/page.tsx`):

```text
Documents
├─ Tax Invoice … Download
├─ Delivery Challan … Download / Generate
└─ E-Way Bill
     Not recorded                    → [Add E-Way Bill]
     or
     EBN: ………………
     Generated: …
     Valid until: …
     Source: Tax Invoice INV/…  or  DC/…
     [View details] [Mark cancelled]
```

No separate top-level EWB module required for V1. Optional later: Accounting → GST register list of EBNs (out of V1 scope unless requested).

Do not redesign shipment booking UI.

---

## L. Eligibility strategy

**Do not** implement `grandTotal > ₹50,000 ⇒ required`.

Reasons (from current data reality):

- Thresholds and exemptions are legal/config and change.
- Inter/intra, document type, goods exemption, distance, and movement type are incomplete.
- Buyer GSTIN / B2B classification is unreliable (`buyerGstin: null` on accounting snapshots).
- International / commercial invoice paths are not Indian EWB.

**V1 recommendation:**

| Signal | UX |
|--------|-----|
| Ship country ≠ IN or currency ≠ INR | Default suggestion **NOT_REQUIRED** (admin can override) |
| Domestic + invoice/challan + physical goods | Show **“E-Way Bill may be required — review”** |
| Admin explicit | Allow set `NOT_REQUIRED` with note |

No hard “required = true” automation until a legally reviewed rules engine + better GSTIN/exemption data exists.

---

## M. Validation requirements (for future implement)

- Zod on all inputs; recalculate/display derived totals server-side for review pack.
- EBN: non-empty, plausible digit length/charset; **unique**; never auto-assigned.
- GSTIN: format via `isPlausibleGstin` when supplied; allow null (URP).
- Sanitize notes / names (strip `<>` as Quote/Challan).
- Source document must belong to same `orderId`.
- Reject Quotation/Proforma ids.
- Admin-only routes; no public EBN mutation.
- Do not accept client-supplied “generated EBN” from unauthenticated paths.
- Store money as integer paise if values are snapshotted.

---

## N. Future GSP / API readiness

Keep V1 columns:

- `generationMethod`: MANUAL | API  
- `provider`, `providerRequestId`, `providerResponseJson`  
- Same status enum + cancel/expiry timestamps  

Later endpoints (design only): Generate, Update Part B, Update Transporter, Extend Validity, Cancel — map onto **updates of the same row**, not a second schema.

**Credentials:** env / secrets manager only (`EWB_GSP_*`). **Never** on `EWayBill` rows.

Part B / transporter updates should **update EWayBill fields** and optionally re-read live `Shipment.awb` into a form default — still without recreating shipments.

---

## O. Accounting impact

| Action | Creates journal? |
|--------|------------------|
| Record / update / cancel EWB | **NO** |
| Review pack GST display | **NO** |

Sale GST remains **ORDER_PAID** (and refunds) only. EWB must not call posting services.

---

## P. GST posting impact

| Action | GST ledger / output liability? |
|--------|--------------------------------|
| EWB record | **NO** |
| Showing CGST/SGST/IGST in review | Display / copy only |

---

## Q. Inventory impact

EWB **must not** reserve, decrement, or restock inventory. No touch of `Inventory` / restock events.

---

## R. Shipping impact

| Allowed | Forbidden |
|---------|-----------|
| Read Shipment / PickupLocation / challan AWB snapshot | Create/cancel Delhivery/Shiprocket bookings |
| Prefill transport doc from AWB | Silent AWB fabrication |
| Link `shipmentId` | Rewrite shipment status machine |

**DELHIVERY / FedEx / India Post booking logic:** unchanged by design.

---

## S. Security considerations

- Admin auth gate (same as order invoice/challan).
- Zod + GSTIN format; EBN uniqueness.
- Sanitize free text; no HTML in PDF/notes.
- `providerResponseJson` must not store API keys/tokens.
- Private S3 only if attaching portal PDF copies later (optional; not required for V1).
- Audit timestamps `recordedByUserId` / `createdAt` sufficient for V1 (no full audit subsystem required).

---

## T. Migration required for implementation

When implementing (not now):

1. Additive migration: `EWayBill` (+ optional `EWayBillItem`).
2. Enums: `EWayBillStatus`, `EWayBillSourceDocumentType`, `EWayBillGenerationMethod`, transport mode.
3. FKs: `orderId` required; optional `invoiceId`, `deliveryChallanId`, `shipmentId`.
4. No changes to Order payment, Invoice, Shipment booking tables beyond optional relation arrays.
5. Deploy: migrate → backend → frontend Documents UX.

**Optional follow-ups (separate from EWB core):** Order-level `buyerGstin` capture at checkout/admin — improves B2B EWB and Tax Invoice; recommended but can ship EWB V1 with per-record GSTIN entry first.

---

## U. Ready to implement V1 — YES / NO

| Question | Answer |
|----------|--------|
| Manual EBN V1 feasible with current data? | **YES** |
| NIC/GSP API in this phase? | **NO** |
| Safe auto “required” flag? | **NO** — use “may be required — review” |
| Quote/Proforma as source docs? | **NO** |
| Accounting/shipping safe by design? | **YES** if isolated module |

**READY TO IMPLEMENT V1: YES** (after stakeholder review of this audit).

---

## Field master matrix (summary)

Legend: **A** available · **P** partial · **D** derivable · **M** missing · **U** user input

| EWB field | Class | Primary Sarveda source |
|-----------|-------|------------------------|
| Transaction type | U | Admin select (default Outward) |
| Sub-type / reason | P/U | Challan reason → confirm |
| Document type | D | TAX_INVOICE \| DELIVERY_CHALLAN |
| Document number | A | Invoice / `challanNumber` |
| Document date | A | `issuedAt` / `challanDate` |
| Supplier GSTIN / name / address | A | Seller env (+ pickup) |
| Dispatch state / PIN | P/D | Pickup / seller |
| Recipient name / address / state / PIN | A | Ship-to / challan |
| Recipient GSTIN / URP | M/P/U | Manual; challan optional |
| Item desc / HSN / qty | A/P | OrderItem + Product / ChallanItem |
| Unit | M→U | Default NOS |
| Taxable / rate / CGST/SGST/IGST | D | GST helpers |
| Cess | M | N/A → 0 |
| Document value | A | Order / challan totals |
| Transporter name | P | Courier |
| Transporter ID | M→U | Manual |
| AWB / transport doc | A | Shipment |
| Transport doc date | D | Shipment.createdAt |
| Mode | P→U | Infer Road |
| Vehicle number | M→U | Manual |
| Approx distance | M→U | Manual |
| EBN / dates / validity | M→U | Manual portal result |

---

## Explicit non-goals (this phase)

- No code, migrations, or UI implementation  
- No NIC/GSP credentials wiring  
- No local EBN generation  
- No Delhivery/shipment rewrite  
- No accounting/GST posting hooks  

---

SARVEDA E-WAY BILL V1 DESIGN AUDIT COMPLETE — READY FOR REVIEW
