# SARVEDA ACCOUNTING UI REVAMP — STAGE 2B IMPLEMENTATION

**Date:** 2026-08-28  
**Scope:** Frontend presentation / information architecture only  
**Reference:** `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2B_BANKING_AUDIT.md`

---

## 1. Files changed

| Path | Role |
|------|------|
| `frontend/app/admin/accounting/banking/layout.tsx` | Banking workspace shell + sub-nav |
| `frontend/app/admin/accounting/banking/page.tsx` | Overview (replaced mega-page) |
| `frontend/app/admin/accounting/banking/accounts/page.tsx` | Bank & Cash Accounts |
| `frontend/app/admin/accounting/banking/accounts/[id]/page.tsx` | Account detail |
| `frontend/app/admin/accounting/banking/statements/page.tsx` | Statements & Matching |
| `frontend/app/admin/accounting/banking/transfers/page.tsx` | Transfers |
| `frontend/app/admin/accounting/banking/reconciliation/page.tsx` | Reconciliation |
| `frontend/app/admin/accounting/banking/gateway/page.tsx` | Gateway Clearing |
| `frontend/components/admin/accounting/banking/banking-ui.tsx` | Shared helpers / labels |
| `frontend/components/admin/accounting/banking/AdminBankingNav.tsx` | In-page Banking tabs |
| `frontend/components/admin/accounting/AdminAccountingNav.tsx` | Sidebar Banking group expanded |

---

## 2. New frontend components / routes

**Routes**

- `/admin/accounting/banking` — Overview  
- `/admin/accounting/banking/accounts`  
- `/admin/accounting/banking/accounts/[id]`  
- `/admin/accounting/banking/statements`  
- `/admin/accounting/banking/transfers`  
- `/admin/accounting/banking/reconciliation`  
- `/admin/accounting/banking/gateway`

**Components**

- `AdminBankingNav`  
- `banking-ui` helpers (`BankingPageShell`, labels, table helpers, `FeatureUnavailable`, `humanizeBankingError`)

---

## 3. Banking navigation

- Horizontal Banking sub-nav on all Banking pages  
- Accounting sidebar Banking group: Overview, Bank & Cash, Statements, Transfers, Reconciliation, Gateway Clearing  
- Overview uses `exact: true` so child routes do not steal Overview highlight  

---

## 4. Overview redesign

- KPIs: Bank & Cash book total, Unmatched, Reconciliation attention, Gateway Clearing (incomplete providers not faked as zero)  
- Needs Attention with cleared empty state  
- Account snapshot: Book / Statement / Difference / Reconciliation / Attention / View  
- Recent transfers From/To/Reference (no create form)

---

## 5. Accounts redesign

- Registry table with Ledger Account (code secondary)  
- Add Account form (no “synthetic/test” wording)  
- Edit details (name / bank name via existing PATCH)  
- Set Razorpay destination + Deactivate with `AdminConfirmModal`  
- Razorpay destination warned on deactivate  
- Detail page with Import Statement / Start Reconciliation CTAs  

---

## 6. Statements / import redesign

- Dedicated BANK account selector (not shared with Reconciliation)  
- Preview → readable summary (valid rows, money in/out, opening/closing, issues list)  
- “Importing into …” safeguard before commit  
- Duplicate import humanized  
- Soft feature-unavailable copy (no env var names)  

---

## 7. Matching redesign

- Work queue filters: All / Unmatched / Suggested Matches / Needs Review / Matched / Ignored  
- Money Out / Money In columns  
- Review panel for bank txn + suggested match  
- Confirm Match / Unmatch explain link-only vs journal-unchanged  
- Record Bank Charge / Interest / Ignore gated by reconciliation flag (same as prior behavior)  
- Gateway fee guard errors humanized  

---

## 8. Transfer redesign

- Dedicated Transfers screen  
- Bank to Bank / Cash Deposit / Cash Withdrawal only  
- Draft → readable journal preview (`proposal.lines`) → Record Transfer confirmation  
- No raw JSON  

---

## 9. Reconciliation redesign

- Independent bank account state  
- Start Reconciliation form  
- History table + detail KPIs (Book / Statement / Difference / Unmatched / Needs Review)  
- Readiness panel (Ready / Not ready)  
- Refresh Balances (= recompute handler)  
- Complete Reconciliation / Reopen with modals + reason  

---

## 10. Gateway clearing redesign

- Separate screen from daily matching  
- Human statuses: Clear / Outstanding / Needs review / Data incomplete / Settlement tracking not configured  
- Balance shown only when meaningful; otherwise “—”  
- Link to Gateway Settlements  

---

## 11. Terminology replacements

| Old | New |
|-----|-----|
| Accounts — BOOK BALANCE | Bank & Cash / Book Balance |
| GL | Ledger Account |
| Stmt balance / Recon Δ | Statement Balance / Difference |
| Recompute | Refresh Balances |
| Charge / Interest | Record Bank Charge / Record Bank Interest |
| Commit import | Import Statement |
| DATA_GAP / SETTLEMENT_NOT_CONFIGURED | Data incomplete / Settlement tracking not configured |
| ACCOUNTING_*_ENABLED=… | Soft “currently unavailable” banners |
| Create account (synthetic / test) | Add Account |

---

## 12. Safety confirmations added

- Deactivate account (+ Razorpay destination warning)  
- Set Razorpay settlement destination  
- Confirm Match (link-only copy)  
- Unmatch (journal remains)  
- Record Bank Charge / Interest  
- Ignore Transaction (reason required; no `window.prompt`)  
- Record Transfer after preview  
- Complete Reconciliation (lock copy)  
- Reopen Reconciliation (reason ≥ 3)  

---

## 13. Empty states

Covered for no accounts, no statements/queue lines, no transfers, no reconciliations, cleared attention, incomplete gateway data.

---

## 14. Responsive behavior

Desktop-first tables with horizontal scroll; ₹ right-aligned; consistent date formatting (`en-IN`).

---

## 15. APIs reused

`fetchBankingDashboard`, `listBankTransfers`, `createBankAccount`, `updateBankAccount`, `deactivateBankAccount`, statement preview/commit/lines/matching/confirm/unmatch/categorize, transfer create/preview/post, reconciliation create/detail/recompute/reconcile/reopen.

**Unused intentionally (deferred):** match reject, UNKNOWN categorize, bank-opening from Banking UI.

---

## 16. Backend changes

**NO**

---

## 17. Accounting logic changes

**NO**

---

## 18. TypeScript / build result

- `npx tsc --noEmit` — **PASS**  
- `npm run build` — **PASS**  

---

## 19. Deferred / future items

- Live bank feeds / ICICI  
- Column mapper / OFX  
- Wire reject-candidate / UNKNOWN UI  
- Cash → cash  
- Stripe/PayPal settlement parity  
- COD remittance  

---

## 20. Visual-review checklist

- [ ] Overview: no live-balance implication; attention clear  
- [ ] Accounts: book vs statement; deactivate guarded  
- [ ] Statements: import target obvious; preview readable; no JSON  
- [ ] Matching: confirm/unmatch/charge/interest copy accurate  
- [ ] Transfers: preview before post  
- [ ] Reconciliation: KPIs + readiness + lock/reopen  
- [ ] Gateway: Razorpay useful; incomplete providers soft  

---

SARVEDA ACCOUNTING UI REVAMP STAGE 2B READY FOR VISUAL REVIEW
