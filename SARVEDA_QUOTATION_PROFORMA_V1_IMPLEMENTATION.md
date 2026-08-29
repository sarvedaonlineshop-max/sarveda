# SARVEDA QUOTATION + PROFORMA V1 — IMPLEMENTATION

**Date:** 2026-08-29  
**Reference:** `SARVEDA_COMMERCIAL_DOCUMENTS_AUDIT.md` (approved)  
**Scope:** Phase 1 only — Quotation + Proforma (as Quote document state)

---

## Decisions

### Quote numbering
Assigned **at creation** (including DRAFT): `QT/{FY}/{6-digit}` e.g. `QT/26-27/000001`  
Fiscal year Apr–Mar (same convention as invoice display). Unique constraint + retry (PO/Bill pattern).

### Proforma numbering (Option A)
**Same `quoteNumber`**; PDF title = PROFORMA INVOICE. Tracked via `proformaIssuedAt`. No separate PF sequence / line-item model.

### Quote → Order conversion
**Deferred (controlled).** UI surfaces reason. Existing Order has payment/stock/checkout/accounting assumptions — no unsafe shortcut in V1.

---

## Checklist

| | Item | Status |
|---|------|--------|
| **A** | Quotation model | PASS |
| **B** | QuotationItem model | PASS |
| **C** | Migration | PASS — `20260829120000_quotation_proforma` (additive) |
| **D** | Numbering | PASS — FY-aware at create |
| **E** | Quote CRUD | PASS — list/create/update/get under `/api/admin/accounting/quotes` |
| **F** | Status workflow | PASS — DRAFT → SENT → ACCEPTED / CANCELLED; EXPIRED display-derived |
| **G** | GST preview | PASS — display only; INTRA/INTER/UNAVAILABLE; no journals |
| **H** | Quote PDF | PASS — PDFKit; disclaimer “not a tax invoice” |
| **I** | Proforma architecture | PASS — render from frozen Quote snapshot |
| **J** | Proforma PDF | PASS — PROFORMA INVOICE + disclaimer |
| **K** | Proforma numbering | Option A documented |
| **L** | Quote → Order | **Deferred** — documented in API + UI |
| **M** | Admin navigation | PASS — Accounting → Sales → Quotes |
| **N** | Security validation | PASS — Zod, GSTIN format, totals server-side, text sanitize |
| **O** | Accounting unaffected | PASS — tests assert journal count unchanged |
| **P** | GST posting unaffected | PASS — preview only |
| **Q** | Inventory unaffected | PASS — no stock APIs |
| **R** | Existing Invoice unaffected | PASS — no Invoice writes |
| **S** | Tests | PASS — `npx vitest run test/commerce/quotation.test.ts` (11) |
| **T** | TypeScript | PASS — backend + frontend `tsc --noEmit` |
| **U** | Build | PASS — `frontend` `npm run build` exit 0 |
| **V** | Deployment | See below |
| **W** | Known limitations | See below |
| **X** | Ready for UAT | YES |

---

## Routes

**Admin UI**
- `/admin/accounting/quotes`
- `/admin/accounting/quotes/new`
- `/admin/accounting/quotes/[id]`
- `/admin/accounting/quotes/[id]/edit`

**API** (accounting access gate)
- `GET/POST /api/admin/accounting/quotes`
- `GET/PUT /api/admin/accounting/quotes/:id`
- `POST .../mark-sent|mark-accepted|cancel`
- `GET .../pdf` · `GET .../proforma-pdf`
- `GET .../catalog` · `GET .../customers`

---

## Deployment

1. Backend: `npx prisma migrate deploy` then build/restart  
2. Frontend: deploy Vercel  
3. Confirm accounting module enabled for admin users who need Quotes  

Existing Orders / Invoices / Payments / journals unchanged.

---

## Known limitations

- Convert to Order not implemented (by design for V1 safety)
- SENT edit returns to DRAFT (simple immutability)
- No email/WhatsApp send of PDF in V1 (download only)
- Expiry is display-derived; no cron mutates status
- Edit form is lighter than create form
- Unauthorized access covered by existing accounting admin gate (not a dedicated quote RBAC suite)

---

SARVEDA QUOTATION + PROFORMA V1 IMPLEMENTATION COMPLETE — READY FOR UAT
