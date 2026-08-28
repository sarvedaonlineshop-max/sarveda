# SARVEDA ACCOUNTING UI REVAMP — STAGE 2B.1 BANKING POLISH

**Date:** 2026-08-28  
**Scope:** Frontend visual / copy polish only  
**Prerequisite:** Stage 2B Banking workspace

---

## Summary

Stage 2B.1 reduces action clutter on Bank & Cash Accounts, humanizes Gateway Clearing notes, highlights non-zero reconciliation differences, softens Banking secondary navigation, and replaces remaining engineering-facing Banking copy — without changing APIs, accounting logic, matching, or reconciliation calculations.

---

## 1. Files changed

| File | Change |
|------|--------|
| `frontend/app/admin/accounting/banking/accounts/page.tsx` | Row overflow “More” menu; softer account copy |
| `frontend/app/admin/accounting/banking/accounts/[id]/page.tsx` | Book balance hint wording |
| `frontend/app/admin/accounting/banking/gateway/page.tsx` | Operator-facing notes; clearing copy |
| `frontend/app/admin/accounting/banking/reconciliation/page.tsx` | Difference “Needs attention” / “Balanced” treatment |
| `frontend/app/admin/accounting/banking/transfers/page.tsx` | Plain-language review (not “journal preview”) |
| `frontend/app/admin/accounting/banking/statements/page.tsx` | Softer confirm/charge/interest/ignore/entry labels |
| `frontend/app/admin/accounting/banking/page.tsx` | Soft “recording unavailable” wording |
| `frontend/components/admin/accounting/banking/AdminBankingNav.tsx` | Quieter secondary tab strip |
| `frontend/components/admin/accounting/banking/banking-ui.tsx` | `humanizeGatewayWarning` / `humanizeGatewayNotes` |

---

## 2. Bank & Cash Accounts — actions menu

- **View** remains visible in the Actions column.
- **Edit details**, **Set as Razorpay settlement destination**, and **Deactivate** moved into a compact **More** overflow menu.
- Existing `AdminConfirmModal` guards for settlement destination and deactivate are unchanged (including Razorpay-destination warning on deactivate).

---

## 3. Gateway Clearing — notes humanization

Backend warning strings are still received unchanged. Presentation maps them via `humanizeGatewayNotes`, e.g.:

| Backend-ish text | Operator-facing note |
|------------------|----------------------|
| non-zero POSTED GL balance | Clearing balance is outstanding and needs settlement review |
| no posted Razorpay settlements | Clearing activity exists, but no Razorpay settlements have been recorded yet |
| not configured in native accounting V1 | Stripe/PayPal settlement tracking is not configured yet |
| Captured … without settlement posting | Payments exist without matching settlement records |
| COD_REMITTANCE_V1 stub | COD remittance tracking is not available yet |
| fulfillment is NOT financial… | Order fulfilment is not the same as cash remittance |

Underlying provider **statuses** and balances are unchanged. Incomplete data still shows **—** rather than a fake zero.

---

## 4. Reconciliation history — difference attention

For each history row:

- **Difference ≠ ₹0.00:** amber row tint + bold amount + text label **Needs attention**
- **Difference = ₹0.00:** muted amount + text label **Balanced**

Logic / difference values / handlers unchanged. Distinction is not colour-only.

---

## 5. Banking sub-navigation

Horizontal Banking tabs retained but de-emphasized:

- Smaller type (`11px`)
- Soft cream strip + light border
- Active state = white pill + thin ring (not heavy forest underline)

Intended as secondary navigation beneath the Accounting sidebar.

---

## 6. Transfers — plain language

| Before | After |
|--------|-------|
| “…with a journal preview before posting.” | “…Review the transfer before recording it.” |
| Continue to Preview / Journal preview | Continue to Review / Review transfer |
| posts / posted transfer | records / once recorded |
| Transfer recorded in journal … | Transfer recorded · {entryNumber} |

Draft → preview API → post flow unchanged.

---

## 7. Other presentation copy cleaned

- Accounts: book balances / create-account wording softened (“accounting records”, no “posted ledger” emphasis)
- Account detail: “From accounting records”
- Statements: confirm/unmatch/charge/interest copy without account-code-first journal jargon; “Entry” instead of “Journal” in review panel
- Overview: “Banking recording is currently unavailable…”

Internal mappings (e.g. status `DATA_GAP` → label “Data incomplete”) remain code-only.

---

## 8. Validation

- `npx tsc --noEmit` — **PASS**
- `npm run build` — **PASS** (see run output)

---

## 9. Backend changes

**NO**

## 10. Accounting logic changes

**NO**

---

SARVEDA ACCOUNTING UI REVAMP STAGE 2B.1 POLISH READY FOR VISUAL REVIEW
