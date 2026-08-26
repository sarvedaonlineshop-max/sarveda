# SARVEDA Native Accounting — Phase 5D GST Reporting + Final Hardening

**Status:** COMPLETE  
**Date:** 2026-08-25  
**Authorities:** Phase 5A architecture · 5B foundation · 5C ITC verification  
**Scope:** GSTR-style **management / reconciliation** reports, XLSX export, integrity checks, admin UI close-out  
**Not in scope:** GSTN filing, GSTR-2B import, CLAIMED automation, gateway reclassification, Phase 6/7

---

## 1. Executive Summary

Phase 5D turns validated GST + ITC foundations into trustworthy **management reports**. All financial GST totals reconcile to **POSTED journal lines**; claimability remains on **AccountingItcEvidence**; line detail uses **immutable ORDER_PAID tax snapshots**.

Delivered:

- Outward / B2B / B2C / credit-note / HSN / rate / 3B-style overview reports  
- Report integrity (linked events ↔ GL; orphan GL surfaced; snapshot↔journal)  
- XLSX multi-sheet export with formula-injection neutralization  
- Flag `ACCOUNTING_GST_REPORTING_ENABLED` (default OFF)  
- Completed `/admin/accounting/gst` tabs  
- Lightsail final validation PASS  

**Label everywhere:** NOT A FILED GST RETURN / NOT GSTN SUBMISSION.

Full suite: **29 files / 381 tests**.

---

## 2. Reporting Authorities

| Concern | Authority |
|---------|-----------|
| Output / Input GST amounts | POSTED `2100–2102` / `2200–2202` period movement |
| ITC claimability | `AccountingItcEvidence` status |
| Sales tax lines / HSN / POS / rates | Immutable `payloadJson.diagnostics` tax snapshot |
| Period | `month=YYYY-MM` or `from`/`to` on `journalEntry.entryDate` |

Mutable Order/Product fields are **not** financial GST authority.

---

## 3. GST Overview

Shows Output CGST/SGST/IGST, Input recognized, ITC eligible/unverified/blocked/data-gap/gateway provisional, and:

**ESTIMATED NET GST POSITION** = Output GST − Eligible ITC  

Explicitly **not** labeled “tax payable” (RCM/filing adjustments unmodeled).

---

## 4. Outward Supply Report

From POSTED `ORDER_PAID` events + snapshots. Classifications:

- **B2C** — `buyerGstin` null / NOT_AVAILABLE (current native reality)  
- **B2B** — FORMAT_VALID buyer GSTIN on snapshot  
- **B2B_DATA_GAP** — invalid format GSTIN  

Drill-down: posting event → journal → tax snapshot version.

---

## 5. B2B

Honest empty report when no native buyer GSTIN (documented). No fabricated GSTIN.

---

## 6. B2C

**B2C MANAGEMENT SUMMARY** — aggregates by POS × supply type × rate. Not B2CL/B2CS statutory slices.

---

## 7. Credit Notes / Refunds

Full refunds: journal inversion of output GST (separate section).  
Partial refunds: **`PARTIAL_REFUND_GST_DATA_GAP`** only — no invented proportional reversal.

---

## 8. HSN Summary

From immutable `hsnSac` / `hsnSacResolved`; **`HSN_DEFAULTED`** when source is DEFAULT. UQC/description omitted when not on snapshot.

---

## 9. Rate Summary

Per snapshot rate (0/5/12/18…). Never averaged. Refund tax may appear under UNSPECIFIED when refund payload lacks line rates.

---

## 10. 3B-Style Management Summary

Outward (taxable + output components), Input (recognized + ITC buckets + gateway provisional), estimated net position, opening vs period ledger movements. Heavy disclaimer banner.

---

## 11. Input GST vs ITC

Recognized ≠ Eligible everywhere. Gateway provisional excluded from eligible.

---

## 12. Gateway GST

Remains **5100** + provisional / tax-invoice-required. No reclassification journal in 5D.

---

## 13. Shipping GST

**`SHIPPING_GST_DATA_GAP`** preserved; Cr 4100; report surfaces revenue + affected count.

---

## 14. Place of Supply

Canonical codes from immutable snapshot only. INTRA / INTER / POS_DATA_GAP + state-wise summary.

---

## 15. GSTIN Handling

`FORMAT_VALID` | `INVALID_FORMAT` | `NOT_AVAILABLE` — format check only; **not** GSTN-verified.

---

## 16. Data Gaps

Dashboard codes include: BUYER_GSTIN_MISSING, HSN_DEFAULTED, TAX_CLASS_DEFAULTED, SHIPPING_GST_DATA_GAP, PDF_JOURNAL_TAX_DIVERGENCE, PARTIAL_REFUND_GST_DATA_GAP, RCM_DATA_GAP, ITC_UNVERIFIED, INVALID_GSTIN, MISSING_TAX_INVOICE, PLACE_OF_SUPPLY_MISMATCH, HISTORICAL_TAX_DATA_GAP, GATEWAY_GST_PROVISIONAL, etc. Count + exposure where meaningful.

---

## 17. Drill-Down

Outward rows carry `drillDown: { postingEventId, journalEntryId, taxSnapshotVersion }`. ITC UI shows evidence + status history JSON.

---

## 18. Report Reconciliation

| Check | Meaning |
|-------|---------|
| `OUTPUT_EVENT_JOURNALS_VS_LINKED_GL` | ORDER_PAID + FULL_REFUND 210x vs GL **excluding orphans** |
| `SNAPSHOT_VS_JOURNAL_FOR_SNAPSHOTED_SALES` | Per-event snapshot ↔ journal (±2) |
| `ORPHAN_OUTPUT_GST_GL` | POSTED 210x with **no** posting event (surfaced, not balanced away) |
| Input / Eligible / Gateway | As designed |

Statuses: `PASS` | `PASS_WITH_ORPHAN_GL_WARNING` | `REPORT_RECONCILIATION_FAILED`.

Lightsail Aug 2026: orphan Output GST **₹2,593.22** (259322 paise) — Phase 7 cleanup; linked integrity PASS_WITH_ORPHAN_GL_WARNING.

---

## 19. Opening Balances

Ledger accounts expose opening / period debit / credit / closing. GSTR-style activity uses **periodMovement** only.

---

## 20. Historical Data

Missing snapshot → `HISTORICAL_TAX_DATA_GAP`. No Zoho/Woo reconstruction in 5D.

---

## 21. XLSX Export

`GET /api/admin/accounting/gst/export` — ExcelJS sheets: Overview, Outward, B2B, B2C, Credit Notes, HSN, Rate, ITC, GST Ledger, Data Gaps, Reconciliation. Same services as UI. Cells starting with `= + - @` prefixed with `'`.

---

## 22. API

Admin-only under `/api/admin/accounting/gst/reports/*` + `/gst/export`. Period validation → 400 `INVALID_PERIOD`. Flag gate `ACCOUNTING_GST_REPORTING_ENABLED`.

---

## 23. Admin UI

`/admin/accounting/gst` tabs: Overview, Outward, B2B, B2C, Credit Notes, HSN (+ rates), ITC, GST Ledger, Reconciliation, Data Gaps. XLSX download link.

---

## 24. Security

Admin auth (existing), Zod period bounds, export auth same as GST reporting flag, formula neutralization, row limit 5000, no raw DB errors, GSTIN only to admins.

---

## 25. Performance

Period-bounded queries on posting events + journal lines; aggregates in memory per month (≤5k events). Expected scale: monthly e-commerce volumes. No full-history load.

---

## 26. Tests

| Suite | Result |
|-------|--------|
| `gst-reporting.test.ts` | 12 passed |
| Phase 5B + 5C + 5D focused | **3 files / 42 passed** |
| Full backend vitest | **29 files / 381 passed** |
| prisma validate / tsc / backend build | OK |
| frontend build | OK (after ReactNode label fix) |

---

## 27. Lightsail Final Validation

Script: `phase5d-lightsail-gst-reporting-validation.ts`  
Tag: `TEST-ACC-GSTR-1787647394185`

| Proof | Result |
|-------|--------|
| A–C intra/inter/mixed | PASS |
| D–E credit / partial DATA_GAP | PASS |
| F–H HSN / B2C / B2B honest | PASS |
| I/J/P linked integrity | PASS_WITH_ORPHAN_GL_WARNING |
| K–L ITC / gateway | PASS |
| M–N shipping / RCM | PASS |
| O XLSX | PASS |
| Q–R tagged + flags absent | PASS |

---

## 28. Commerce Safety

| Area | Verdict |
|------|---------|
| Commerce / payment / refund / invoice PDF / Zoho | **Unmodified** for 5D |
| Purchases operational | Unmodified |
| Accounting | Reporting/export/handlers/flags/UI only |
| Schema | **No new migration** in 5D |
| Historical journals rewritten? | **No** |
| Flags persistent on Lightsail? | **No** (absent) |

---

## 29. Phase 5 Test Data Cleanup Register (→ Phase 7)

| Tag | Notes |
|-----|-------|
| `TEST-ACC-GST-*` | Phase 5B POS/snapshot fixtures + journals |
| `TEST-ACC-ITC-*` | Phase 5C ITC evidence + history + journals |
| `TEST-ACC-GSTR-*` | Phase 5D reporting orders/journals (e.g. `TEST-ACC-GSTR-1787647394185`) |
| Orphan Output GST journals | ~259322 paise Aug 2026 — POSTED 210x **without** posting event |

Do **not** force-delete immutable journals; register for Phase 7 cleanup/linking.

---

## 30. Known Limitations

- No GSTN filing / GSTR-2B / automatic CLAIMED  
- No gateway GST reclassification  
- No customer GSTIN capture → B2B empty by design  
- Shipping GST DATA_GAP  
- Partial refund GST DATA_GAP  
- Historical tax DATA_GAP / orphan GL journals  
- PDF vs journal discount divergence (status only)  
- ESTIMATED NET ≠ statutory payable  

---

## 31. Phase 5 Final Recommendation

Phase 5 (5A→5D) is **complete** for native GST foundation + claimability + management reporting. Next frozen work is **Phase 6** (financial statements) only when requested — not Phase 5E.

Do not start GSTN submission or Phase 7 cutover from this slice.

---

PHASE 5 GST & TAX COMPLETE
