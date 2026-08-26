# Sarveda Accounting — Accounts Team User Guide

**Audience:** Accounts / finance operators  
**System:** Sarveda Native Accounting (Admin → Accounting)  
**Production cutover:** **1 September 2026, 12:00 AM IST**  
**Training window:** 26–31 August 2026 (sample data only)

This guide is for **day-to-day use**. It is not a developer document.

---

## 1. Big picture (read once)

| Period | What happens |
|--------|----------------|
| Before 1 Sep 2026 | Training / UAT only. Use sample data tagged **`TEST-UAT-ACC-*`**. Do **not** treat books as production. |
| From 1 Sep 2026 00:00 IST | New sales, purchases, expenses, banking, GST go into **Sarveda Native Accounting**. |
| Zoho Books | **Not migrated.** Zoho is reference only. Apr–Aug reconciliation is a separate accounts exercise outside this system. |

**Golden rules**

1. Never invent balances to “make reports balance.”
2. Every journal must have **Total Debits = Total Credits**.
3. Balance Sheet difference must be **₹0.00**.
4. Sample / training work must use names starting with **`TEST-UAT-ACC-`** (orders, vendors, bank labels, memos where you control them).
5. Do not ask engineering to turn on permanent production flags during training.

---

## 2. Where to work

Open Admin → **Accounting**. Main areas:

| Menu | Use for |
|------|---------|
| Dashboard | Health / shadow KPIs |
| Accounts | Chart of accounts (look up codes) |
| Journals | Find and read posted journals |
| Order paid | Sale posting (after payment) |
| Refunds (full) | Full refund accounting |
| Settlements | Gateway → bank settlement |
| Vendor bills | Purchase / AP |
| Purchases | Purchase recon / capitalization |
| Vendor payments | Paying vendors |
| Expenses | Standalone expenses |
| Inventory | Opening layers / COGS views |
| Banking | Banks, transfers, statements, recon |
| GST | Ledgers, ITC, GST reports |
| Reports | Trial Balance, GL, P&L, Balance Sheet |
| Opening | Opening batches (cutover only — not for daily UAT) |

Storefront / orders / purchases ops screens still create the **commerce** documents. Accounting screens **post and verify** the books.

---

## 3. Daily operations

### 3.1 Sales accounting

**WHERE TO GO**  
Orders (ops) → then Accounting → **Order paid** → **Journals** / **Reports**.

**WHAT TO ENTER**  
1. Create a **sample** order with tag in notes/SKU/`TEST-UAT-ACC-*` product if available.  
2. Complete payment (test gateway / captured payment).  
3. On Order paid screen: preview, then post (only when UAT flags are process-scoped ON).

**WHAT THE SYSTEM DOES**  
Posts a balanced sale journal, typically:

- **Debit** gateway clearing (Razorpay 1020 / Stripe 1021 / PayPal 1022) or AR 1100 for COD  
- **Credit** Sales 4000, Shipping income 4100  
- **Debit** Discounts 4200 (if any)  
- **Credit** Output GST 2100/2101 (intra) or 2102 (inter)  
- Later: inventory COGS **Debit 5000 / Credit 1200** when COGS posting runs

**WHAT TO VERIFY**

- [ ] Journal balanced  
- [ ] GST matches invoice / order tax  
- [ ] Clearing / AR = order grand total  
- [ ] P&L shows revenue (and COGS if posted)  
- [ ] Balance Sheet shows clearing / inventory movement  

**COMMON MISTAKES**

- Posting a real customer order during UAT  
- Expecting COGS before inventory valuation / COGS flags are on  
- Confusing **invoice PDF** with the **accounting journal** (both must be checked)

---

### 3.2 Purchases (vendor bills)

**WHERE TO GO**  
Purchases / Vendors (ops) → Accounting → **Vendor bills**.

**WHAT TO ENTER**  
Sample vendor + bill with `TEST-UAT-ACC-*` bill number. Include GST if applicable.

**WHAT THE SYSTEM DOES**

- **Debit** Inventory clearing 1210 and/or expense 5300…  
- **Debit** Input GST 2200/2201/2202  
- **Credit** Accounts Payable 2000  

Capitalization / FIFO may move 1210 → 1200 when receipts are capitalized.

**WHAT TO VERIFY**

- [ ] AP = bill total  
- [ ] Input GST correct  
- [ ] Inventory / clearing sensible after receipt  

**COMMON MISTAKES**

- Posting without a valid vendor  
- Mixing stock and non-stock lines without checking GLs  
- Treating ITC as “claimable” before ITC verification workflow

---

### 3.3 Expenses

**WHERE TO GO**  
Accounting → **Expenses** (and **Expense mappings** if a new paid-through / expense name appears).

**WHAT TO ENTER**  
Expense date, amount, GST if any, paid through (bank/cash), category. Tag description `TEST-UAT-ACC-*`.

**WHAT THE SYSTEM DOES**

- **Debit** expense GL  
- **Debit** input GST (if applicable)  
- **Credit** bank / cash / paid-through GL  

**WHAT TO VERIFY**

- [ ] Expense hits the right GL  
- [ ] Bank/cash reduced  
- [ ] GST input only when evidence supports it  

**COMMON MISTAKES**

- Wrong paid-through mapping → wrong bank  
- Booking personal / non-business spends into ops GLs  

---

### 3.4 Vendor payments

**WHERE TO GO**  
Accounting → **Vendor payments**.

**WHAT TO ENTER**  
Select open bill(s), payment date, bank/cash, UTR/reference (`TEST-UAT-ACC-*`).

**WHAT THE SYSTEM DOES**

- **Debit** AP 2000  
- **Credit** Bank 1010 / Cash 1000 (or mapped bank GL)  

**WHAT TO VERIFY**

- [ ] Vendor outstanding reduced  
- [ ] Bank balance reduced  
- [ ] Partial payments allocate correctly  

**COMMON MISTAKES**

- Paying the wrong bill  
- Double-paying after a failed UI retry (check Journals for duplicates — system is idempotent, but always verify)

---

### 3.5 Banking (daily glance)

**WHERE TO GO**  
Accounting → **Banking**.

**WHAT TO ENTER**  
Check book balances for sample banks; note unexpected clearing leftovers.

**WHAT TO VERIFY**

- [ ] Sample bank GLs match expected UAT activity  
- [ ] No mystery gateway clearing build-up without settlements  

---

## 4. When required

### 4.1 Refunds (full)

**WHERE TO GO**  
Order refund in ops → Accounting → **Refunds (full)**.

**WHAT TO ENTER**  
Process a full refund on a sample paid order (within UAT).

**WHAT THE SYSTEM DOES**  
Posts the **exact reverse** of the original sale journal (revenue, GST, clearing).

**WHAT TO VERIFY**

- [ ] Sale journal existed first  
- [ ] Refund journal mirrors sale  
- [ ] Gateway / AR impact reversed  

**COMMON MISTAKES**

- Expecting auto-post of **partial** refunds (not the same path)  
- Refunding a pre-cutover order after forward-only is on without opening history  

---

### 4.2 Inventory returns

**WHERE TO GO**  
Return / restock ops → Accounting → **Inventory** / Journals (COGS reversal).

**WHAT TO ENTER**  
Restock classification: **SELLABLE**, **DAMAGED**, or **NON_RESTOCKABLE**.

**WHAT THE SYSTEM DOES**

| Class | Typical accounting |
|-------|--------------------|
| SELLABLE | Stock back + COGS reversal (1200 / 5000) when reversal posting is on |
| DAMAGED | Ops may restock differently; do not assume COGS reversal |
| NON_RESTOCKABLE | No sellable inventory layer |

**WHAT TO VERIFY**

- [ ] On-hand moves only when ops restocks  
- [ ] COGS reversal only for sellable path with prior COGS  

**COMMON MISTAKES**

- Assuming every return reverses COGS  
- Changing operational stock outside the return workflow  

---

### 4.3 Gateway settlement

**WHERE TO GO**  
Accounting → **Settlements**.

**WHAT TO ENTER**  
Sample Razorpay (or other) settlement id / payload for UAT.

**WHAT THE SYSTEM DOES**

- **Debit** Bank (net)  
- **Debit** Fees / tax expense (e.g. 5100)  
- Clear gateway control 1020/1021/1022  

**WHAT TO VERIFY**

- [ ] Clearing reduced  
- [ ] Bank increased by net  
- [ ] Fees match settlement  

---

### 4.4 Bank transfers

**WHERE TO GO**  
Accounting → **Banking** → Transfers.

**WHAT TO ENTER**  
From account, to account, amount, date. Label `TEST-UAT-ACC-*`.

**WHAT THE SYSTEM DOES**  
**Debit** destination GL / **Credit** source GL (bank↔bank, cash↔bank).

**WHAT TO VERIFY**

- [ ] Both sides move by same amount  
- [ ] Cannot transfer a bank to itself  

---

### 4.5 Bank statement import

**WHERE TO GO**  
Accounting → **Banking** → Statements.

**WHAT TO ENTER**  
Small CSV/sample statement for the UAT bank.

**WHAT THE SYSTEM DOES**  
Imports lines; suggests **exact** / **possible** matches; allows manual confirm / ignore; supports bank charge & interest categorization.

**WHAT TO VERIFY**

- [ ] Exact match works  
- [ ] Possible match needs human confirm  
- [ ] Unmatched stays open  
- [ ] Charge / interest post sensible journals  

---

## 5. Weekly rhythm

| Task | Where | Verify |
|------|-------|--------|
| Gateway clearing review | Settlements + Reports / GL 1020–1022 | Clearing not drifting without settlements |
| Bank reconciliation | Banking → Recon | Book vs statement; lock when done |
| AP review | Vendor bills / payments | Ageing / open bills make sense |
| GST / ITC review | GST | Output vs sales; input claimability via ITC workflow |

---

## 6. Monthly rhythm (and before go-live)

| Task | Where | Pass criteria |
|------|-------|----------------|
| Bank recon complete | Banking | Locked recon; difference explained |
| GST review | GST reports | Output/input agree with journals |
| Trial Balance | Reports | **Debits = Credits** |
| Profit & Loss | Reports | Matches expected UAT activity |
| Balance Sheet | Reports | **Difference ₹0.00** |
| Integrity | Reports / integrity dashboard | No unbalanced journals; TEST fixtures flagged |

---

## 7. Cutover date (important)

Production boundary:

```text
ACCOUNTING_CUTOVER_DATE=2026-09-01T00:00:00+05:30
```

That is **1 Sep 2026, 12:00 AM India time**.

Do **not** use bare `2026-09-01` in production — that is interpreted as midnight **UTC** (5:30 AM IST).

Before cutover, with forward-only on, the system must **not** post pre-cutover documents into the live native ledger (except explicit opening / approved exceptions).

---

## 8. Opening balances (Sept 1 — after UAT)

Owner decision: **do not import Zoho openings**.

Expected openings (when Phase 7D / final cutover runs):

1. Physical inventory (qty + approved costs)  
2. Actual bank balances  
3. Actual cash  

**Not** auto-carried: Zoho AP, AR, GST, gateway clearing, marketplaces, retained earnings.

Accounts will confirm physical/bank/cash evidence before any opening batch is **posted**.

---

## 9. Training data hygiene

- Prefix everything you can with **`TEST-UAT-ACC-`**.  
- Do not mix real Sept production openings into August UAT.  
- Before production: engineering will dry-run Phase 7B accounting reset / cleanup — **commerce orders and operational inventory are preserved** by that tool; accounting shadow tables are cleared.  
- Never run reset execute yourself.

---

## 10. When something looks wrong

1. Check **Journals** for the document.  
2. Check **Reports → Trial Balance** (must balance).  
3. Note order number / bill number / journal number.  
4. Log on the UAT checklist as **BLOCKER / HIGH / MEDIUM / LOW**.  
5. Do **not** change expected accounting just to pass a test — fix the system or escalate.

Support contact for system issues: engineering / Shivakumar. Business policy: care@sarveda.com / owner.

---

*Last updated: 26 Aug 2026 — Phase 7C UAT / production readiness*
