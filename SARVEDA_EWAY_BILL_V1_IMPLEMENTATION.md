# SARVEDA E-WAY BILL V1 — IMPLEMENTATION

**Date:** 2026-08-29  
**Reference:** `SARVEDA_EWAY_BILL_V1_DESIGN_AUDIT.md` (approved)  
**Scope:** Manual EBN recording + review assistant + GSP-ready schema (no NIC/GSP calls)

---

## Explicit confirmations

| Concern | Result |
|---------|--------|
| **NIC API CALLED** | **NO** |
| **GSP API CALLED** | **NO** |
| **EBN GENERATED LOCALLY** | **NO** |
| **ACCOUNTING JOURNALS CHANGED** | **NO** |
| **GST POSTING LOGIC CHANGED** | **NO** |
| **INVENTORY LOGIC CHANGED** | **NO** |
| **DELHIVERY BOOKING LOGIC CHANGED** | **NO** |

---

## Checklist

| | Item | Status |
|---|------|--------|
| **A** | Prisma model | PASS — `EWayBill` + enums |
| **B** | EWayBillItem snapshots | PASS — HSN/qty/UOM/tax split frozen |
| **C** | Status model | PASS — NOT_REQUIRED / PENDING / GENERATED / CANCELLED / EXPIRED (enum; expiry display-derived) |
| **D** | Source document handling | PASS — TAX_INVOICE \| DELIVERY_CHALLAN only; same-order FKs |
| **E** | Invoice integration | PASS — review via invoice GST path + display INV/{FY}/… |
| **F** | Delivery Challan integration | PASS — frozen challan items + buyerGstin/AWB prefill |
| **G** | EBN handling | PASS — 12-digit portal format; unique; never auto-filled |
| **H** | Transport fields | PASS — courier/AWB prefill; ID/vehicle/distance manual |
| **I** | Buyer GSTIN | PASS — on EWB record; challan prefill; format validation |
| **J** | UOM handling | PASS — default NOS with admin confirm/override |
| **K** | Eligibility UX | PASS — “may be required — review” / international soft hint |
| **L** | NOT_REQUIRED workflow | PASS — admin explicit + note |
| **M** | Cancellation workflow | PASS — local only; confirm portal already cancelled; EBN retained |
| **N** | Expiry behavior | PASS — `displayExpiry` only; no mutate-on-view |
| **O** | Order Documents integration | PASS — Documents card + review modal |
| **P** | GSP/API readiness | PASS — generationMethod / provider / requestId / responseJson reserved |
| **Q** | Security | PASS — admin routes, Zod, GSTIN/EBN, sanitize, ownership |
| **R** | Accounting impact | PASS — no journals (tested) |
| **S** | GST posting impact | PASS — display only |
| **T** | Inventory impact | PASS — stock unchanged (tested) |
| **U** | Shipment impact | PASS — read-only AWB/courier |
| **V** | Tests | PASS — `npx vitest run test/commerce/eway-bill.test.ts` (6) |
| **W** | TypeScript | PASS — backend + frontend `tsc --noEmit` |
| **X** | Build | PASS — frontend `npm run build` (see below) |
| **Y** | Migration/deployment | See below |
| **Z** | Known limitations | See below |
| **AA** | Ready for UAT | **YES** |

---

## Decisions

- **V1 generationMethod** always `MANUAL`; provider `PORTAL` when EBN recorded.
- **Multiplicity:** 0..n per Order; primary = latest GENERATED else PENDING else NOT_REQUIRED.
- **Order-level buyer GSTIN** still future; capture on EWB / challan only.
- **No ₹50k auto-required rule.**

---

## API (admin)

- `GET  /api/admin/orders/:id/eway-bills`
- `GET  /api/admin/orders/:id/eway-bills/review?sourceDocumentType=`
- `POST /api/admin/orders/:id/eway-bills/prepare`
- `POST /api/admin/orders/:id/eway-bills/record`
- `POST /api/admin/orders/:id/eway-bills/:ewayBillId/record`
- `PATCH /api/admin/orders/:id/eway-bills/:ewayBillId/transport`
- `POST /api/admin/orders/:id/eway-bills/:ewayBillId/cancel`
- `POST /api/admin/orders/:id/eway-bills/not-required`
- `GET  /api/admin/orders/:id/eway-bills/:ewayBillId`

---

## Key files

- `backend/prisma/migrations/20260829150000_eway_bill/`
- `backend/src/modules/eway-bills/*`
- `backend/src/modules/admin/admin.routes.ts` / `admin.handlers.ts`
- `frontend/components/admin/AdminOrderEwayBillCard.tsx`
- `frontend/app/admin/orders/[id]/page.tsx`
- `backend/test/commerce/eway-bill.test.ts`

---

## Deployment

1. `npx prisma migrate deploy` (additive `20260829150000_eway_bill`)
2. Backend build/restart
3. Frontend deploy

No NIC/GSP env vars required for MANUAL V1.

---

## Known limitations

- No NIC/GSP generate/update/cancel API
- No automatic legal eligibility engine
- Buyer GSTIN not on Order/checkout
- Catalog UOM not modeled (confirm NOS)
- Vehicle / transporter ID / distance usually manual
- Part B updates are local field edits only

---

SARVEDA E-WAY BILL V1 IMPLEMENTATION COMPLETE — READY FOR UAT
