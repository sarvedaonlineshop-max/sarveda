# SARVEDA Native Accounting — Phase 5C ITC Verification

**Status:** COMPLETE  
**Date:** 2026-08-25  
**Architecture authorities:**  
1. `SARVEDA_ACCOUNTING_PHASE5A_GST_TAX_ARCHITECTURE.md`  
2. `SARVEDA_ACCOUNTING_PHASE5B_GST_FOUNDATION.md`  

**Scope:** Input GST recognition vs ITC claimability — evidence model, discovery, admin verify/block/data-gap, summary, API/UI  
**Out of scope:** GSTR-1/3B final reports, GSTR-2B import, filing APIs, gateway reclassification journals, Phase 6/7

---

## 1. Executive Summary

Phase 5C separates **Input GST recognized in GL (2200–2202)** from **ITC verified / eligible to claim**.

Delivered:

1. **`AccountingItcEvidence`** + immutable **`AccountingItcStatusHistory`**
2. Statuses: `UNVERIFIED_PENDING_TAX_INVOICE` | `ELIGIBLE` | `BLOCKED` | `REVERSED` | `CLAIMED` | `DATA_GAP`
3. Deterministic assessment (not GSTR-2B): vendor bills, expenses, gateway settlements
4. Idempotent discovery; admin verify / block / data-gap with reason + audit
5. Summary buckets: recognized vs eligible vs unverified vs blocked vs data-gap vs gateway provisional
6. Flag `ACCOUNTING_ITC_VERIFICATION_ENABLED` (default OFF; requires GST + native)
7. Admin API + `/admin/accounting/gst` ITC cards + review queue

**Hard rule preserved:** Status transitions never rewrite historical journals. `ELIGIBLE` ≠ `CLAIMED` (CLAIMED blocked until filing workflow).

Lightsail validation `PHASE 5C ITC VERIFICATION VALIDATED`. Full suite **28 files / 369 tests**.

---

## 2. Architecture

```
VendorBill / Expense POSTED → Input GST on 2200–2202 (recognition)
        ↓ discover (idempotent)
AccountingItcEvidence (claimability authority)
        ↓ admin verify / block / data-gap
ELIGIBLE | BLOCKED | DATA_GAP (+ immutable history)

Gateway settlement fee+tax → 5100 only
        ↓ discover
Evidence with recognizedInInputGl=false
        ↓ remains GATEWAY_TAX_INVOICE_REQUIRED / provisional
```

GL = financial tax recognized.  
ITC evidence = claimability.  
Never compute “eligible” from GL balances alone.

---

## 3. Schema

Migration: `20260825180000_accounting_phase5c_itc_verification`

| Model | Role |
|-------|------|
| `AccountingItcEvidence` | Source-linked evidence; unique `(sourceType, sourceId)` + `uniqueKey` |
| `AccountingItcStatusHistory` | Append-only status transitions |

Key fields: document reference, supplier GSTIN/name, document date, taxable + CGST/SGST/IGST/total, `recognizedInInputGl`, posting/journal IDs, status, assessmentCode/Json, warnings, verifiedAt/By, claimedAt (structural).

No commerce ownership change. No GL duplication.

---

## 4. Eligibility Rules

Assessment codes (deterministic, not statutory 2B):

| Code | Meaning |
|------|---------|
| `ELIGIBLE_FOR_REVIEW` | Evidence sufficient for admin to verify → suggested `UNVERIFIED_PENDING_TAX_INVOICE` |
| `MISSING_TAX_INVOICE` / `MISSING_SUPPLIER_REFERENCE` | DATA_GAP |
| `INVALID_GSTIN` | DATA_GAP |
| `GST_AMOUNT_MISMATCH` | Journal vs snapshot >2 paise |
| `PLACE_OF_SUPPLY_MISMATCH` | DATA_GAP |
| `RCM_DATA_GAP` | BLOCKED (no RCM journals in 5C) |
| `MISSING_POSTED_INPUT_GST` | DATA_GAP |
| `GATEWAY_TAX_INVOICE_REQUIRED` | Gateway provisional |
| `ZERO_TAX` / `DATA_GAP` | Insufficient |

**Never auto-set `ELIGIBLE` on discover.**

---

## 5. Evidence Model

Sources: `VENDOR_BILL` | `EXPENSE` | `GATEWAY_SETTLEMENT`

`uniqueKey = itc:{sourceType}:{sourceId}`

Discovery refreshes snapshot fields but **does not overwrite** human terminal statuses (`ELIGIBLE` / `BLOCKED` / `CLAIMED` / `REVERSED`).

---

## 6. Status Lifecycle

```
UNVERIFIED ⇄ DATA_GAP ⇄ BLOCKED
     ↓           ↓         ↓
  ELIGIBLE ←───────────────┘
     │
     ✗ CLAIMED (FILING_WORKFLOW_UNAVAILABLE)
```

`REVERSED` / `CLAIMED` reserved structurally. Manual transitions require reason for BLOCKED / DATA_GAP. History rows are never overwritten.

---

## 7. Vendor Bill Behavior

Posted taxable bills → discover from journal Input GST + bill/vendor evidence.  
RCM → fail-closed posting (`RCM_DATA_GAP`) + ITC `BLOCKED`.  
Missing ref / invalid GSTIN / amount or POS issues → `DATA_GAP`.  
Complete evidence → `UNVERIFIED` + `ELIGIBLE_FOR_REVIEW` until admin verifies.

---

## 8. Expense Behavior

Taxable RECORDED expenses with posted Input GST. Incomplete invoice/GSTIN/gaps → `DATA_GAP`. Complete → reviewable. RCM remains blocked at expense eligibility.

---

## 9. Gateway Behavior

Fee + tax remains in **5100**. Evidence: `recognizedInInputGl=false`, assessment `GATEWAY_TAX_INVOICE_REQUIRED`.

**Boundary (documented, not implemented):** Future claimability after tax invoice would require an **explicit reclassification event** into 2200–2202. Phase 5C does **not** invent/post that journal. Admin `ELIGIBLE` on gateway means “tax invoice held” only — amounts stay out of Input GST totals for claimable summary.

---

## 10. Audit History

Every discover create and status change writes `AccountingItcStatusHistory` (+ `AccountingAuditLog` action `ITC_STATUS_CHANGED`). Fields: evidenceId, oldStatus, newStatus, actorUserId, reason, createdAt.

---

## 11. Recognized vs Eligible

| Concept | Authority |
|---------|-----------|
| Recognized Input GST | POSTED 2200–2202 (and evidence `recognizedInInputGl`) |
| Eligible ITC | Evidence status `ELIGIBLE` only |
| Unverified / Blocked / Data gap | Evidence statuses |
| Gateway provisional | Separate bucket (5100) |

Overview/UI labels: “Input GST Recognized” — **never** “ITC available”.

---

## 12. Reconciliation

5B recon extended: vendor bill rows include `itcStatus`, `itcAssessmentCode`, `eligibleInputGstInPaise` when evidence exists. `ITC_UNVERIFIED` cleared when evidence is `ELIGIBLE`. Sales recon unchanged.

---

## 13. API / UI

**Flag:** `ACCOUNTING_ITC_VERIFICATION_ENABLED=0` (requires `ACCOUNTING_GST_ENABLED` + native).

**Endpoints:**

- `GET /api/admin/accounting/gst/itc/summary`
- `GET /api/admin/accounting/gst/itc`
- `GET /api/admin/accounting/gst/itc/:id`
- `POST /api/admin/accounting/gst/itc/discover`
- `POST /api/admin/accounting/gst/itc/:id/verify`
- `POST /api/admin/accounting/gst/itc/:id/block`
- `POST /api/admin/accounting/gst/itc/:id/data-gap`

**UI:** `/admin/accounting/gst` — ITC cards, review queue (filters/actions), evidence detail + status history.

---

## 14. Tests

| Suite | Result |
|-------|--------|
| `itc-verification.test.ts` | **14 passed** |
| `gst-foundation.test.ts` | **16 passed** |
| Full backend vitest | **28 files / 369 passed** |
| prisma validate + migrate | OK |
| backend `tsc` / `npm run build` | OK |
| frontend `npm run build` | OK (`/admin/accounting/gst`) |

Matrix coverage: A–T from phase brief (vendor/expense/gateway/idempotency/GL immutability/summary/flag).

---

## 15. Lightsail Proof

Script: `backend/scripts/phase5c-lightsail-itc-validation.ts`  
Tag: `TEST-ACC-ITC-*` (register for Phase 7 cleanup)

| Check | Result |
|-------|--------|
| Complete VendorBill review → ELIGIBLE | PASS |
| Incomplete → DATA_GAP | PASS |
| RCM fail-closed + ITC BLOCKED | PASS |
| Expense ITC workflow | PASS |
| Gateway provisional / not Input GL | PASS |
| ELIGIBLE does not alter GL | PASS |
| Audit history immutable | PASS |
| Rediscovery idempotent | PASS |
| Summary recognized ≥ eligible | PASS |
| Commerce counts unchanged | PASS |
| Persistent flags absent | PASS |

---

## 16. Commerce Safety

| Area | Verdict |
|------|---------|
| Commerce / payment / refund / invoice PDF / Zoho | **Not modified** for 5C |
| Purchase operational | Unchanged (eligibility/posting already fail-closed for RCM) |
| Accounting | ITC modules + GST recon/overview + flags + routes |
| Schema/migration | Phase 5C ITC tables added |
| GL mutated by ITC decisions? | **No** |
| Historical data rewritten? | **No** |
| Test fixtures retained? | Yes — `TEST-ACC-ITC-*` on Lightsail |

---

## 17. Known Limitations

- No GSTR-2B matching / auto-ELIGIBLE from government data  
- CLAIMED unavailable until filing/period lock (5D+)  
- Gateway reclassification journal not implemented  
- Historical Zoho/migrated data not perfected (DATA_GAP / UNVERIFIED)  
- No document file upload — verification is admin attestation + existing refs  

---

## 18. Phase 5D Readiness

Ready for **GSTR-style reporting + UI + final GST hardening**:

- Output/Input GL ledger (5B)  
- ITC eligible vs recognized vs provisional (5C)  
- Do **not** invent filing until report design consumes these authorities  

Next frozen slice: **5D only** — not Phase 6.

---

PHASE 5C ITC VERIFICATION VALIDATED
