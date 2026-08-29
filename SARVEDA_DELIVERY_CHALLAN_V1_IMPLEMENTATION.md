# SARVEDA DELIVERY CHALLAN V1 — IMPLEMENTATION

**Date:** 2026-08-29  
**Scope:** Phase 2 — Delivery Challan only (no E-Way Bill API)  
**Prior:** Quotation + Proforma V1, Tax Invoice, Order/Shipment/Delhivery

---

## Decisions

### Numbering
`DC/{FY}/{6-digit}` e.g. `DC/26-27/000001` — Indian FY Apr–Mar, same pattern as Quotation. Assigned at create. Unique + retry.

### Duplicate prevention
**One Delivery Challan per Order** (`orderId` unique). Re-POST without `refreshShipment` returns the existing challan (idempotent). No accidental second number.

### AWB / carrier handling
**Snapshot at generate time** (`carrierSnapshot`, `awbSnapshot`, `trackingUrlSnapshot`). PDF download serves the stored snapshot/PDF — not live shipment mutation on every view. If AWB is created later, admin can **Refresh AWB on PDF** (`refreshShipment: true`) which updates the shipment snapshot and rebuilds the PDF **with the same challan number**.

### E-Way Bill
Schema/PDF leave room for future Order + Invoice + Challan + Shipment + HSN/qty/value linkage. **No EBN generated or displayed.** No fake placeholders.

### Accounting
Delivery Challan never creates journals, GST output, payments, revenue, or stock movements.

---

## Checklist

| | Item | Status |
|---|------|--------|
| **A** | Schema/model | PASS — `DeliveryChallan` + `DeliveryChallanItem` |
| **B** | Numbering | PASS — `DC/{FY}/######` |
| **C** | Order linkage | PASS — `orderId` unique FK; snapshots of addresses/items |
| **D** | Challan reasons | PASS — SUPPLY_DELIVERY (default), JOB_WORK, SAMPLE, REPLACEMENT, RETURN, OTHER |
| **E** | PDF | PASS — PDFKit title **DELIVERY CHALLAN**; disclaimer “not a tax invoice” |
| **F** | Customer/GST details | PASS — consignee snapshot; optional `buyerGstin` (format-validated) |
| **G** | Items/SKU/HSN/quantity | PASS — line snapshots from OrderItem + Product HSN |
| **H** | AWB/carrier handling | PASS — snapshot + optional refresh (documented above) |
| **I** | Duplicate prevention | PASS — unique `orderId`; idempotent generate |
| **J** | Accounting impact | PASS — no journal writes (tested) |
| **K** | GST impact | PASS — display/est. taxable value only; no GST posting |
| **L** | Stock impact | PASS — no inventory APIs touched |
| **M** | Payment impact | PASS — no payment/status changes |
| **N** | Existing shipping impact | PASS — Delhivery/AWB booking untouched; challan reads shipment only |
| **O** | Tests | PASS — `npx vitest run test/commerce/delivery-challan.test.ts` (10) |
| **P** | TypeScript | PASS — backend + frontend `tsc --noEmit` |
| **Q** | Build | PASS — frontend `npm run build` exit 0 |
| **R** | Migration/deployment | See below |
| **S** | E-Way Bill readiness | PASS — linked Order/items/origin/destination/AWB fields; no EBN |

---

## Explicit confirmations

| Concern | Result |
|---------|--------|
| **ACCOUNTING JOURNALS CHANGED** | **NO** |
| **GST POSTING LOGIC CHANGED** | **NO** |
| **PAYMENT LOGIC CHANGED** | **NO** |
| **DELHIVERY BOOKING LOGIC CHANGED** | **NO** |

---

## Routes

**Admin UI:** Order Detail → Documents card  
`/admin/orders/[id]`

**API** (admin):
- `GET  /api/admin/orders/:id/delivery-challan`
- `POST /api/admin/orders/:id/delivery-challan` — generate (body: reason, notes, buyerGstin, refreshShipment)
- `GET  /api/admin/orders/:id/delivery-challan/download`

---

## Key files

- `backend/prisma/schema.prisma` — models + enums
- `backend/prisma/migrations/20260829140000_delivery_challan/`
- `backend/src/modules/delivery-challans/*`
- `backend/src/modules/admin/admin.routes.ts` / `admin.handlers.ts`
- `frontend/app/admin/orders/[id]/page.tsx` — Documents section
- `frontend/lib/admin-api.ts`
- `backend/test/commerce/delivery-challan.test.ts`

---

## Deployment

1. Backend: `npx prisma migrate deploy` then build/restart (`20260829140000_delivery_challan` additive only)
2. Frontend: deploy Vercel
3. No env vars required beyond existing `SELLER_*` / S3 (PDF upload soft-fails to `local://` when S3 unset)

Existing Orders, Invoices, Payments, Accounting journals, and Delhivery booking paths unchanged.

---

## Known limitations

- No standalone Delivery Challan list module (by design — order-scoped)
- Buyer GSTIN not stored on Order; optional on generate only
- Reason UI defaults to Supply / delivery; advanced reasons via API body in V1
- No email/WhatsApp of challan PDF
- E-Way Bill generation deferred to a later phase

---

## E-Way Bill readiness (future)

Challan stores: order link, consignee/origin/destination, HSN/qty/value snapshots, carrier/AWB. Future EWB module can reference Order + Invoice + DeliveryChallan + Shipment without inventing numbers in this phase.

---

SARVEDA DELIVERY CHALLAN V1 IMPLEMENTATION COMPLETE — READY FOR UAT
