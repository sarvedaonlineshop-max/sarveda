# Sarveda Accounting — UAT Checklist

**Cutover:** 01/09/2026 00:00 IST (`2026-09-01T00:00:00+05:30`)  
**UAT window:** 26–31 Aug 2026  
**Sample tag:** `TEST-UAT-ACC-*`  
**Guide:** `SARVEDA_ACCOUNTING_USER_GUIDE.md`

**Instructions for testers**

1. Use only sample / training data.  
2. Mark PASS / FAIL.  
3. If FAIL, classify bug: **BLOCKER / HIGH / MEDIUM / LOW**.  
4. Do not change expected accounting to force a pass.  
5. Persistent production flags stay **OFF** unless engineering enables **process-scoped** UAT flags.

**Severity**

| Level | Examples |
|-------|----------|
| BLOCKER | Unbalanced journal; wrong GST/COGS/inventory/bank/AP; duplicate journal; BS ≠ 0 |
| HIGH | Wrong clearing; settlement fee wrong; COGS missing when expected |
| MEDIUM | UX confusion; slow screens; unclear labels |
| LOW | Cosmetic copy |

---

## Environment sign-off (before scenarios)

| Check | Expected | PASS/FAIL | Tester | Date | Notes |
|-------|----------|-----------|--------|------|-------|
| Admin Accounting menu visible | Yes (with UAT access) | | | | |
| Persistent `.env` accounting flags | ABSENT / 0 | | | | |
| Sample data uses `TEST-UAT-ACC-*` | Yes | | | | |
| Zoho not written by native posting | No Zoho journal create from UAT | | | | |
| Cutover date documented | 01/09/2026 00:00 IST | | | | |

---

## A. SALE

| Field | Content |
|-------|---------|
| **Scenario** | Sample order → payment → invoice → GST → revenue → gateway clearing → inventory → COGS |
| **Steps** | 1. Create `TEST-UAT-ACC` order 2. Capture payment 3. Confirm invoice 4. Preview/post Order paid 5. Run/verify COGS if inventory valuation on 6. Open Journals + Reports |
| **Expected accounting** | Dr clearing/AR = grand total; Cr sales/shipping; Dr discount; Cr output GST; COGS Dr 5000 Cr 1200 when posted |
| **Expected journal** | Balanced ORDER_PAID (+ COGS journal if applicable) |
| **Expected operational** | Order PAID; stock decremented per ops rules; invoice available |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## B. PAYMENT GATEWAY SETTLEMENT

| Field | Content |
|-------|---------|
| **Scenario** | Sample Razorpay settlement |
| **Steps** | 1. Post related sale(s) into clearing 2. Enter/import sample settlement 3. Post settlement 4. Check bank + fees + clearing |
| **Expected accounting** | Dr bank (net); Dr fees/tax; clear 1020 (or mapped gateway) |
| **Expected journal** | Balanced PAYMENT_GATEWAY_SETTLED |
| **Expected operational** | Settlement marked posted; bank book up |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## C. REFUND (full)

| Field | Content |
|-------|---------|
| **Scenario** | Full refund of a sample paid order |
| **Steps** | 1. Complete sale A 2. Process full refund in ops 3. Preview/post full refund accounting 4. If sellable restock, verify COGS reversal path |
| **Expected accounting** | Exact invert of sale; GST reversed; clearing/AR impact reversed |
| **Expected journal** | Balanced ORDER_REFUNDED_FULL |
| **Expected operational** | Payment refunded; order status reflects refund |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## C2. COMMERCE REFUND HARDENING (Phase 7C.1) — required before accounting UAT

Use **TEST-UAT-ACC** sample orders. Confirm provider acceptance **before** treating refund as success.

| Scenario | Steps | Expected | PASS/FAIL | Tester | Date |
|----------|-------|----------|-----------|--------|------|
| Razorpay full refund | Admin → Refund to customer on captured Razorpay order | Provider refund ID returned; `Refund` processed; order `REFUNDED`; stock restocked if applicable | | | |
| Razorpay partial refund | Service-request Process refund for part of amount | `PARTIALLY_REFUNDED`; order **not** full `REFUNDED`; `refundedInPaise` correct | | | |
| Stripe full refund | Same on Stripe-captured sample | Provider ID + processed Refund + full REFUNDED when cumulative complete | | | |
| Stripe partial refund | Partial amount | PARTIALLY_REFUNDED only | | | |
| PayPal full refund | Same on PayPal-captured sample | Authoritative `Refund` row (not status-only) | | | |
| PayPal partial refund | Partial amount | PARTIALLY_REFUNDED; Refund row with amount + provider id | | | |
| Double-click protection | Double-submit full refund quickly | Only **one** gateway call / one processed total ≤ captured | | | |
| Provider failure | Simulate/force gateway error (staging) | UI shows failure; no false success; capacity can retry | | | |
| COD manual refund | COD order → cancel/refund or service-request with note | **Manual refund required**; note saved; no gateway payout; accounting fail-closed | | | |
| Webhook recovery (optional) | After admin refund, replay provider webhook | Idempotent; no double amount | | | |

**Accounting note:** Native **partial** refund journals remain **DATA_GAP** / `UNPOSTED_PARTIAL` until line-level GST allocation exists. Full refund accounting still requires `Refund.status=processed` + `providerRefundId`.

---

## D. INVENTORY RETURN

| Field | Content |
|-------|---------|
| **Scenario** | Restock classes: SELLABLE / DAMAGED / NON_RESTOCKABLE |
| **Steps** | For each class on a sample order: process return → check Inventory onHand → check COGS reversal journals |
| **Expected accounting** | SELLABLE: COGS reversal when enabled; DAMAGED / NON_RESTOCKABLE: no sellable layer / no false COGS reversal |
| **Expected journal** | Reversal only where eligible |
| **Expected operational** | OnHand changes only when ops restocks sellable qty |
| **PASS / FAIL** | SELLABLE: ____  DAMAGED: ____  NON_RESTOCKABLE: ____ |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## E. PURCHASE (vendor bill)

| Field | Content |
|-------|---------|
| **Scenario** | Sample vendor bill → AP + input GST + clearing/capitalization |
| **Steps** | 1. Create `TEST-UAT-ACC` vendor/bill 2. Post vendor bill 3. Receive stock if applicable 4. Capitalize / check FIFO layers |
| **Expected accounting** | Dr 1210/expense + input GST; Cr AP 2000; capitalization 1210→1200 when applicable |
| **Expected journal** | Balanced VENDOR_BILL (+ capitalization) |
| **Expected operational** | Bill OPEN/POSTED; receipt recorded |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## F. VENDOR PAYMENT

| Field | Content |
|-------|---------|
| **Scenario** | Pay sample bill from sample bank |
| **Steps** | 1. Open posted bill 2. Record payment from UAT bank 3. Check AP + bank |
| **Expected accounting** | Dr AP 2000; Cr bank/cash |
| **Expected journal** | Balanced vendor payment |
| **Expected operational** | Outstanding reduced / paid |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## G. EXPENSE

| Field | Content |
|-------|---------|
| **Scenario** | Sample expense with optional GST |
| **Steps** | 1. Ensure expense mapping exists 2. Create expense `TEST-UAT-ACC-*` 3. Post 4. Verify GLs |
| **Expected accounting** | Dr expense (+ input GST); Cr paid-through |
| **Expected journal** | Balanced EXPENSE |
| **Expected operational** | Expense recorded |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## H. BANK TRANSFER

| Field | Content |
|-------|---------|
| **Scenario** | bank→bank, cash→bank, bank→cash |
| **Steps** | Create three `TEST-UAT-ACC` transfers; post each; verify both GLs |
| **Expected accounting** | Dr destination; Cr source; equal amounts |
| **Expected journal** | Balanced BANK_TRANSFER ×3 |
| **Expected operational** | Transfer rows posted |
| **PASS / FAIL** | bank→bank: ____  cash→bank: ____  bank→cash: ____ |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## I. BANK STATEMENT

| Field | Content |
|-------|---------|
| **Scenario** | Import small sample statement |
| **Steps** | Import → test exact match, possible match, manual confirm, unmatched, bank charge, bank interest |
| **Expected accounting** | Matches link statement↔book; charge Dr expense Cr bank; interest Dr bank Cr income |
| **Expected journal** | Charge / interest journals balanced when categorized |
| **Expected operational** | Line statuses: MATCHED / POSSIBLE / UNMATCHED / CATEGORIZED |
| **PASS / FAIL** | exact: ____ possible: ____ manual: ____ unmatched: ____ charge: ____ interest: ____ |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## J. BANK RECONCILIATION

| Field | Content |
|-------|---------|
| **Scenario** | Reconcile sample bank |
| **Steps** | Open recon → compare book vs statement → reconcile → lock → reopen (UAT only) |
| **Expected accounting** | Difference explained; locked period immutable for edits |
| **Expected journal** | No accidental extra journals from lock |
| **Expected operational** | Status RECONCILED / LOCKED / reopened with reason |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## K. GST

| Field | Content |
|-------|---------|
| **Scenario** | Output CGST/SGST/IGST + Input + ITC + reports |
| **Steps** | From sale E/B and purchase E/G: open GST screens; run ITC verification on sample input; open GST reports |
| **Expected accounting** | 2100/2101/2102 output; 2200/2201/2202 input; ITC claimability not invented |
| **Expected journal** | Matches source documents |
| **Expected operational** | GST reports open; export works if enabled |
| **PASS / FAIL** | |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## L. REPORTS (end of lifecycle)

| Field | Content |
|-------|---------|
| **Scenario** | After A–K sample activity, run full report pack |
| **Steps** | Trial Balance → GL → P&L → Balance Sheet → GST reports → banking dashboard → integrity |
| **Expected accounting** | **Total Debits = Total Credits**; **BS difference = ₹0.00** |
| **Expected journal** | All sample journals listed in GL |
| **Expected operational** | Dashboards load without error |
| **PASS / FAIL** | TB: ____  GL: ____  P&L: ____  BS: ____  GST: ____  Bank: ____  Integrity: ____ |
| **Bug ref / severity** | |
| **Tester / Date** | |

---

## Cutover guard spot-checks

| Scenario | Steps | Expected | PASS/FAIL | Tester | Date |
|----------|-------|----------|-----------|--------|------|
| Pre-cutover document blocked when FORWARD_ONLY | Attempt post with date &lt; 01/09/2026 IST after flags configured | Blocked / PRE_CUTOVER | | | |
| On/after cutover allowed | Document dated ≥ 01/09/2026 00:00 IST | Allowed | | | |
| No dual posting to Zoho+native for same UAT event | Check Zoho was not auto-written by native post | Native only | | | |

---

## Bug log

| ID | Scenario | Severity | Description | Status (OPEN/FIXED) | Fixed in |
|----|----------|----------|-------------|---------------------|----------|
| | | | | | |

---

## Final UAT sign-off

| Role | Name | Sign | Date |
|------|------|------|------|
| Accounts tester | | | |
| Backend / engineering | | | |
| Owner (optional) | | | |

**Overall UAT result:** PASS / FAIL  

**Blockers remaining:** _______________________  

**Ready for Phase 7D production activation?** YES / NO  
