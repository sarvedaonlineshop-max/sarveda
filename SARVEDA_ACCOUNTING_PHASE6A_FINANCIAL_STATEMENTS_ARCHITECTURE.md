# SARVEDA NATIVE ACCOUNTING — PHASE 6A
# FINANCIAL STATEMENTS & MANAGEMENT REPORTING ARCHITECTURE

**Date:** 2026-08-25  
**Mode:** READ-ONLY architecture audit — **no implementation**  
**Prerequisites:** Phases 1–5 COMPLETE (GST & tax closed in Phase 5D)  
**DB authority:** Verified pre-launch Lightsail PostgreSQL (`13.204.112.165` → private Postgres) — **not** localhost  
**Output:** This report only. No schema/code/flag/data changes.

---

## 1. Executive Summary

Sarveda already has a **balanced, immutable POSTED journal foundation**. Lightsail shows **113 POSTED journals / 300 lines**, header and line totals equal (**₹5,83,818.50** debits = credits), **0 unbalanced POSTED journals**, **0 draft/void**, **0 zero-line journals**.

What is missing is the **financial reporting layer**: Trial Balance, General Ledger, P&L, Balance Sheet, management dashboard, period comparison, drill-down, and global integrity checks — all driven from **POSTED GL**, with operational tables used only for context/subledger reconciliation.

**Key design decisions (architecture only):**

| Topic | Decision |
|-------|----------|
| Statement authority | POSTED `AccountingJournalLine` only |
| CoA change in 6A | **None** — classify/map in reporting layer |
| Current earnings | **Option A (V1):** compute dynamically; do **not** auto-post year-end close |
| Financial year | Configurable `financialYearStartMonth` (default **4** = Apr–Mar India); not hardcoded silently |
| Cash Flow | **Defer** — insufficient movement classification for a trustworthy CFS |
| Phase 6 slices | **Exactly 3:** 6B · 6C · 6D |
| Lightsail numbers | **Synthetic / TEST-ACC contaminated** — not production financials; Phase 7 owns cutover cleanup |

**Preliminary Lightsail check (all POSTED, including TEST fixtures):** TB balances; Assets = Liabilities + Equity **when current-period earnings are included** (BS diff = **0**). Retained Earnings **3100** has never been posted.

**Carry-forward Phase 7 dependencies (do not fix in Phase 6):**

- Orphan Output GST ≈ **₹2,593.22** (259,322 paise) — Phase 5D  
- TEST-ACC-* bank GLs, inventory, GST, ITC, GSTR fixtures  
- 17 orphan POSTED journals (no `AccountingPostingEvent`) — all TEST-tagged memos  
- Inventory GL **1200** ₹41,000 vs FIFO remaining ₹34,700 (₹6,300 variance) — fixture-driven  
- AP GL ₹6,372 vs VendorBill outstanding ₹13,173.20 — subledger drift  

**Verdict:** Architecture is ready. No double-entry BLOCKER on POSTED journals.

---

## 2. Current Chart of Accounts

**Source:** `backend/src/modules/accounting/seed-coa.ts` + Lightsail `AccountingAccount`.  
**Prisma type enum:** `ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE` only.  
**Reporting classification** (below) is a **statement mapping layer** — do not change Prisma enum in Phase 6 unless a later slice explicitly needs it.

**Parents:** `parentId` exists; Lightsail has **0** parented accounts. Flat CoA.

**Extra accounts on Lightsail:** **22** non-system ASSET bank/cash GLs created by Phase 4 TEST-ACC bank fixtures (codes like 1093, 1193, 2013…3404). System seed = **35** accounts.

### 2.1 Full system CoA inventory

| Code | Name | Prisma type | Normal bal | Report class | Statement section | Posted from (events) | Lightsail used? | Lightsail net (paise) |
|------|------|-------------|------------|--------------|-------------------|----------------------|-----------------|------------------------|
| 1000 | Cash | ASSET | Dr | ASSET | BS Current – Cash | Legacy / COD remittance (future) | No | 0 |
| 1010 | Bank | ASSET | Dr | ASSET | BS Current – Bank (legacy aggregate) | Settlements, vendor pay, expenses (legacy) | Yes | +158,846 |
| 1020 | Razorpay Clearing | ASSET | Dr | ASSET | BS Current – Gateway clearing | ORDER_PAID, PAYMENT_GATEWAY_SETTLED, refunds | Yes | +7,545,700 |
| 1021 | Stripe Clearing | ASSET | Dr | ASSET | BS Current – Gateway clearing | ORDER_PAID / settlement (Stripe) | No | 0 |
| 1022 | PayPal Clearing | ASSET | Dr | ASSET | BS Current – Gateway clearing | ORDER_PAID / settlement (PayPal) | No | 0 |
| 1100 | Accounts Receivable | ASSET | Dr | ASSET | BS Current – AR | ORDER_PAID (COD), bank remittance match | No | 0 |
| 1200 | Inventory Asset | ASSET | Dr | ASSET | BS Current – Inventory | Opening, capitalization, COGS, COGS reversal | Yes | +4,100,000 |
| 1210 | Inventory Purchases Clearing | ASSET | Dr | ASSET* | BS Current – Purchase clearing (surface separately; credit bal = liability-like) | VENDOR_BILL_POSTED, INVENTORY_PURCHASE_CAPITALIZED (+ test receipts) | Yes | **−3,600,000** |
| 2000 | Accounts Payable | LIABILITY | Cr | LIABILITY | BS Current – AP | VENDOR_BILL_POSTED, VENDOR_PAYMENT_MADE | Yes | −637,200 (Cr 6,372) |
| 2100 | Output CGST | LIABILITY | Cr | LIABILITY | BS Current – Output GST | ORDER_PAID, ORDER_REFUNDED_FULL | Yes | −668,996 |
| 2101 | Output SGST | LIABILITY | Cr | LIABILITY | BS Current – Output GST | same | Yes | −668,989 |
| 2102 | Output IGST | LIABILITY | Cr | LIABILITY | BS Current – Output GST | same | Yes | −54,076 |
| 2200 | Input CGST | LIABILITY† | Dr when asset | TAX_ASSET / LIABILITY | BS Current – Input GST (debit bal as recoverable) | VENDOR_BILL, EXPENSE | Yes | +51,975 |
| 2201 | Input SGST | LIABILITY† | Dr when asset | TAX_ASSET / LIABILITY | same | same | Yes | +51,975 |
| 2202 | Input IGST | LIABILITY† | Dr when asset | TAX_ASSET / LIABILITY | same | same | No | 0 |
| 3000 | Owner / Share Capital | EQUITY | Cr | EQUITY | BS Equity | Manual / cutover (future) | No | 0 |
| 3100 | Retained Earnings | EQUITY | Cr | EQUITY | BS Equity (prior years after close) | Year-end close (not implemented) | No | 0 |
| 3900 | Opening Balance Equity | EQUITY | Cr | EQUITY | BS Equity – Opening / cutover | Inventory opening, bank opening | Yes | −26,800,000 |
| 4000 | Product Sales | REVENUE | Cr | REVENUE | P&L Gross sales | ORDER_PAID / full refund | Yes | −7,755,339 |
| 4100 | Shipping Income | REVENUE | Cr | REVENUE | P&L Shipping revenue | ORDER_PAID (SHIPPING_GST_DATA_GAP) | Yes | −15,300 |
| 4200 | Discounts (Contra Revenue) | REVENUE | Dr (contra) | CONTRA_REVENUE | P&L Less discounts | ORDER_PAID | No | 0 |
| 4500 | Interest Income | REVENUE | Cr | OTHER_INCOME | P&L Other income | BANK_INTEREST | Yes | −4,000 |
| 5000 | Cost of Goods Sold | EXPENSE | Dr | COGS | P&L COGS | INVENTORY_COGS_RECOGNIZED / REVERSED | Yes | +3,300,000 |
| 5100 | Payment Gateway Charges | EXPENSE | Dr | EXPENSE | P&L Operating – Gateway | PAYMENT_GATEWAY_SETTLED | Yes | +23,404 |
| 5200 | Shipping Expense | EXPENSE | Dr | EXPENSE | P&L Operating – Freight | Expense mapping / future | No | 0 |
| 5300 | Purchase / Operating Expense | EXPENSE | Dr | EXPENSE | P&L Operating – General | EXPENSE_RECORDED, non-inventory bills | Yes | +707,500 |
| 5310 | Office Expense | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | Yes | +4,500 |
| 5320 | Professional Fees | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | Yes | +10,000 |
| 5330 | Utilities | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | No | 0 |
| 5340 | Travel | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | No | 0 |
| 5350 | Repairs & Maintenance | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | No | 0 |
| 5360 | Marketing / Advertising | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | No | 0 |
| 5370 | Software / Subscription | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | No | 0 |
| 5380 | Misc Operating Expense | EXPENSE | Dr | EXPENSE | P&L Operating | Expense mapping | No | 0 |
| 5390 | Bank Charges Expense | EXPENSE | Dr | EXPENSE | P&L Operating – Bank charges | BANK_CHARGE | Yes | +2,000 |

\*1210 remains ASSET in CoA; **presentation** must show credit balances as a separate clearing liability-like line — never silently net into 1200.  
†Input GST accounts are typed LIABILITY in seed (common Indian SME pattern for tax ledgers). **Statement presentation:** debit balance → current tax asset / recoverable ITC recognized; credit balance → liability. Eligibility still lives on `AccountingItcEvidence` (Phase 5C), not GL.

**Reserved / system:** all seed rows `isSystem: true`. Dynamic bank GLs are non-system.

**Do not change CoA in Phase 6A.** Reporting uses a centralized **FinancialStatementMapping** (codes → section), not hard-coded numbers in React.

---

## 3. Double-Entry Integrity

**Lightsail read-only (2026-08-25):**

| Check | Result |
|-------|--------|
| POSTED journals | **113** |
| Journal lines | **300** |
| Σ header debits | **58,381,850** paise |
| Σ header credits | **58,381,850** paise |
| Unbalanced POSTED (header Dr ≠ Cr) | **0** |
| Header vs line mismatch | **0** |
| Zero-line POSTED | **0** |
| Zero-value POSTED (0/0) | **0** (spot-checked via status aggregation) |
| DRAFT | **0** |
| VOID | **0** |
| Reversed journals | **Not a first-class status**; reversals are **new** POSTED journals (refunds, COGS reverse) |
| Orphan lines (line without entry) | Structurally prevented (`onDelete: Cascade` + FK) |
| Orphan POSTED journals (no posting event) | **17** — all TEST-ACC memos; Phase 7 |
| Orphan posting events (missing journal) | **0** |
| AccountingPeriod rows | **0** |

**BLOCKER rule:** Any unbalanced POSTED journal is HIGH/BLOCKER. **None found.**

---

## 4. Trial Balance Architecture

**Authority:** Aggregate POSTED `AccountingJournalLine` joined to `AccountingAccount` and `AccountingJournalEntry` where `status = POSTED`.

### Filters

- **As-of date:** all lines with `entryDate ≤ asOf` → closing only (opening omitted or = closing).  
- **From/To period:**  
  - Opening = movement with `entryDate < from`  
  - Period = `from ≤ entryDate ≤ to`  
  - Closing = Opening + Period  
- **Include zero-balance accounts:** optional (default off for management; on for statutory-style TB).

### Columns

| Column | Definition |
|--------|------------|
| Account Code / Name / Type | From CoA |
| Opening Debit / Credit | Absolute presentation of opening net by normal balance |
| Period Debit / Credit | SUM(debit), SUM(credit) in period |
| Closing Debit / Credit | Opening + Period, presented in Dr/Cr columns |

### Invariant

`SUM(Closing Debit) == SUM(Closing Credit)` — fail report with `TB_DEBITS_EQUAL_CREDITS` variance if not.

### Explicit non-sources

Do **not** derive TB from Order, Payment, VendorBill, Inventory.onHand, Zoho, or FIFO layers.

### Implementation sketch

Single SQL aggregation grouped by `accountId` with conditional sums on `entryDate`. Prefer DB aggregation; no N+1.

---

## 5. General Ledger

**Input:** account code + period (and optional as-of for closing).

**Columns:** Date · Journal Number · Event Type · Source Type · Source ID · Reference · Description · Debit · Credit · Running Balance.

**Balances:**

- Opening running balance before first period line  
- Period movement  
- Closing = opening + period  

**Drill-down chain (required):**

```
GL line
  → AccountingJournalEntry (immutable)
    → AccountingPostingEvent (if present; else ORPHAN_JOURNAL badge)
      → sourceType/sourceId (Order, VendorBill, Expense, BankTransfer, …)
        → operational UI where available
```

Journal remains immutable; reports never rewrite lines.

**Event type / source:** join `AccountingPostingEvent` on `journalEntryId`. Orphan journals still appear in GL (they affect TB) with explicit `ORPHAN_JOURNAL` / Phase 7 cleanup flag.

---

## 6. Profit & Loss

**Authority:** Period movement on temporary accounts (REVENUE + EXPENSE + report-class overrides), POSTED only.

### Recommended sections (map by FinancialStatementMapping)

```
Revenue
  4000 Product Sales                         Gross Sales
Less: Contra revenue
  4200 Discounts                             (debit increases)
Net product sales
  4100 Shipping Income
= Total operating revenue

Less: Cost of Goods Sold
  5000 COGS
= Gross Profit

Operating expenses
  5100 Gateway Charges
  5200 Shipping Expense
  5300–5380 mapped operating expenses
  5390 Bank Charges
= Operating profit (approx.)

Other income
  4500 Interest Income
Other expenses
  (none reserved today; future codes via mapping)

= Net Profit / (Loss)
```

**Rules:**

- Do **not** put Output GST (210x) in revenue.  
- Do **not** put Input GST (220x) in expense.  
- Do **not** hardcode account numbers in frontend — central mapping module.  
- Net Profit must reconcile to Σ temporary account nets (`PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS`).

---

## 7. Revenue / Contra Revenue

**Traced codes:** 4000, 4100, 4200 (+ 4500 as other income, not operating sales).

**Presentation:**

| Line | Accounts | Notes |
|------|----------|-------|
| Gross Sales | 4000 Cr movement | Tax-exclusive product revenue from ORDER_PAID_V1 |
| Less Discounts | 4200 Dr movement | Contra — **not** operating expense |
| Net Sales | 4000 − 4200 | |
| Shipping Revenue | 4100 | May include SHIPPING_GST_DATA_GAP amounts (no invented shipping GST) |
| Total Operating Revenue | Net Sales + Shipping | |
| Interest | 4500 | **Other income**, not sales |

**GST:** Output 2100–2102 = **liability**, never revenue.  
**Lightsail:** 4200 unused (0 lines); discounts may be absent or embedded in test fixtures — mapping still required.

---

## 8. COGS

**Events:** `INVENTORY_COGS_RECOGNIZED` (Dr 5000 / Cr 1200), `INVENTORY_COGS_REVERSED` (inverse on return/restock).

| Concern | Authority |
|---------|-----------|
| P&L COGS | POSTED 5000 movement |
| Inventory BS | POSTED 1200 balance |
| Layer economics | `AccountingInventoryCostLayer` / consumptions |
| Quantity | `Inventory.onHand` only — **not** financial COGS |

**Phase 3D limitations affecting reporting:**

- Partial refunds: no proportional COGS auto-post (DATA_GAP)  
- Cost layer DATA_GAP / ambiguous bill match blocks capitalization  
- Test orphan PURCHASE_RECEIPT journals credit 1210/affect 1200 without posting events  
- Lightsail FIFO remaining **3,470,000** vs GL 1200 **4,100,000** → variance **630,000** paise (fixture contamination)

P&L must still use **POSTED 5000**, then surface inventory recon separately.

---

## 9. Expenses / Other Income

**Operating expense quality:** Seed CoA is **good enough for V1** — gateway, bank charges, shipping expense, office, professional, utilities, travel, repairs, marketing, software, misc, plus generic 5300.

**Gaps (do not invent accounts in 6A):**

- No dedicated Salary / Rent / Depreciation / Accumulated Depreciation  
- 5300 is a catch-all for unmapped purchase/expense  
- Mapping quality depends on `AccountingExpenseAccountMapping` discipline  

**Other income:** 4500 Interest Income only today — place under Other Income on P&L.

---

## 10. Balance Sheet

**As-of** closing balances from POSTED GL.

### Assets (illustrative)

**Current**

- Cash: 1000 + bank accounts typed CASH  
- Bank: 1010 + `AccountingBankAccount` GL codes (BANK)  
- Gateway clearing: 1020–1022 (and any future clearing codes)  
- AR: 1100  
- Inventory: **1200 only**  
- Inventory purchase clearing: **1210** — show debit as asset; if credit, show under liabilities/clearing (do not net into 1200)  
- Input GST recoverable: debit balances on 2200–2202  

**Non-current:** none seeded.

### Liabilities

- AP: 2000  
- Output GST: 2100–2102  
- 1210 credit balance (clearing)  
- Input GST credit balances if any  

### Equity

- 3000 Share capital  
- 3100 Retained earnings (prior closed years only, when posted)  
- 3900 Opening balance equity  
- **Current period earnings** (calculated — see §11)

### Invariant

`Assets = Liabilities + Equity` (including calculated current earnings).

Lightsail preliminary (all data incl. TEST): **diff = 0** when earnings included.

---

## 11. Current Earnings

**Finding:** Account **3100 Retained Earnings** exists but has **zero POSTED lines**. No year-end closing journals exist. Temporary accounts remain open indefinitely.

**V1 recommendation — Option A:**

- Balance Sheet line: **“Current Period Profit/(Loss)”** = P&L net for FY-to-as-of (or inception-to-as-of until first formal close).  
- Do **not** auto-create closing journals in Phase 6.  
- Option B (formal close → 3100) deferred to a later ops/Phase 7+ workflow when FY close is approved.

**Temporary account handling:** REVENUE/EXPENSE (plus report classes CONTRA_REVENUE/COGS/OTHER_*) roll into current earnings for BS only.

---

## 12. Opening Balances

| Mechanism | Status | Offset |
|-----------|--------|--------|
| Inventory opening batch | Built (3D1) — Dr 1200 / Cr 3900 | 3900 |
| Bank opening | Built (4B) — Dr bank GL / Cr 3900 | 3900 |
| AR opening | **Not built** | — |
| AP opening | **Not built** | — |
| Gateway clearing opening | **Not built** as dedicated wizard | — |
| General opening TB import | **Not built** | — |
| 3000 / 3100 seed postings | Unused | — |

**Cutover TB completeness:** Incomplete for real Phase 7 cutover. Phase 6 reports can still run on whatever POSTED exists; Phase 7 must supply full opening TB (AR/AP/clearing/capital) against 3900/3000/3100 as designed.

**Do not load real openings in Phase 6.**

---

## 13. Accounts Receivable

| Item | Finding |
|------|---------|
| GL account | **1100** |
| Lightsail GL | **0** lines / **0** balance |
| COD mapping | ORDER_PAID → Dr 1100 (code path exists) |
| Customer subledger | **None** — no AR customer ledger table |
| Remittance | Phase 4D COD remittance largely DATA_GAP / stub |

**Reporting:**

- **Financial AR** = GL 1100 only.  
- **Customer AR subledger** = `DATA_GAP` until designed — do not fabricate customer balances from Orders.  
- Optional management drill: unpaid COD orders as **operational** context with banner “not GL subledger.”

Integrity check: `AR_GL_VS_SUBLEDGER` → `NOT_APPLICABLE` / `DATA_GAP` until subledger exists.

---

## 14. Accounts Payable

| Item | Finding |
|------|---------|
| GL | **2000** — Lightsail Cr **637,200** paise |
| Subledger | VendorBill `totalInPaise − paidInPaise` |
| Lightsail bills | 19 OPEN; outstanding **1,317,320**; `paidInPaise` all 0 |
| Native payments | 11 `VENDOR_PAYMENT_MADE` POSTED |
| Aging | `ap-aging.ts` + purchase recon (operational) |

**Financial AP on statements = GL 2000.**  
Vendor aging / outstanding = operational + `AccountingVendorPayment` allocations for drill-down.

**Reconcile:** `AP_GL_VS_SUBLEDGER` must surface exact variance (Lightsail ≈ **680,120** paise) — never auto-balance. Likely causes: test bills unpaid in ops fields, payments not updating `paidInPaise`, orphan/test journals — Phase 7 cleanup.

---

## 15. Inventory / FIFO Reconciliation

| Authority | Role |
|-----------|------|
| GL 1200 | Balance Sheet inventory |
| FIFO Σ(qtyRemaining × unitCost) | Reconciliation evidence |
| Inventory.onHand | Quantity only |
| costInPaise / sale price | **Forbidden** as valuation |

**Lightsail:** GL 1200 **4,100,000** vs FIFO **3,470,000** → variance **630,000** (TEST orphan receipts / layers). Report as `INVENTORY_GL_VS_FIFO` with exact paise.

Existing inventory recon APIs (V1–V4) feed the integrity tab; BS number remains GL.

---

## 16. Purchase Clearing (1210)

**Meaning:** Supplier-billed inventory cost pending capitalization to 1200.

**Lightsail:** net **−3,600,000** (credit) — largely TEST PURCHASE_RECEIPT journals that **credit 1210 without matching bill debits**.

**BS presentation:**

- Debit balance → Current asset “Inventory purchases clearing”  
- Credit balance → Current liability / clearing (named explicitly)  
- **Never** silently net 1210 into 1200 on the face of the BS  

---

## 17. Bank / Cash

**Book balance authority:** POSTED GL for each bank/cash account code.  
**Statement balance:** reconciliation evidence only (`AccountingBankReconciliation` / statement import).

**BS drill-down:**

```
Bank line (book)
  → AccountingBankAccount
    → book balance (GL)
    → latest reconciled statement closing (if any)
    → unreconciled difference
```

**Lightsail:** Many TEST bank GLs; legacy **1010** still holds some settlement activity. Phase 4 policy: new banks get dedicated GLs; 1010 may remain legacy aggregate until cutover.

---

## 18. Gateway Clearing

| Code | Provider | Lightsail |
|------|----------|-----------|
| 1020 | Razorpay | **+7,545,700** outstanding clearing |
| 1021 | Stripe | 0 — DATA_GAP / unused on Lightsail native posts |
| 1022 | PayPal | 0 — same |

BS shows clearing **assets** when debit. Phase 4 gateway dashboard statuses (CLEAR / OUTSTANDING / DATA_GAP) remain control layer — do not hide DATA_GAP gateways.

---

## 19. GST Presentation

**Financial statements (GL):**

- Output 2100–2102 → liabilities  
- Input 2200–2202 debit → tax asset / recoverable recognized  
- Do not invent netting beyond what journals contain  

**Optional disclosure (control, not BS replacement):** Phase 5D overview — recognized input, eligible ITC, unverified, blocked, output, estimated net position. ITC eligibility = `AccountingItcEvidence`.

**Orphan Output GST (carry-forward):** ≈ **259,322** paise (2100: 129,662 + 2101: 129,660). Affects TB/BS GST liabilities and `GST_GL_VS_GST_REPORT` until Phase 7 cleanup. Linked event integrity may still `PASS_WITH_ORPHAN_GL_WARNING`.

---

## 20. Refunds / Returns

| Flow | GL effect | Double-count risk |
|------|-----------|-------------------|
| Full refund | Inverse ORDER_PAID (revenue, GST, clearing/AR) | Low if one event |
| Partial refund | **PARTIAL_REFUND_GST_DATA_GAP** — no invented tax/revenue split | Gap, not double count |
| COGS reversal | Dr 1200 / Cr 5000 via INVENTORY_COGS_REVERSED | Separate from revenue reversal |
| Restock layers | RETURN_RESTOCK layers | Quantity/cost layer — not second revenue hit |

Document DATA_GAPs on reports where refunds incomplete. Lightsail: 1 full refund POSTED; 2 COGS reversals.

---

## 21. Cash Flow Feasibility

**Assessment:** Current GL has cash/bank movements but **lacks consistent cash-flow classification tags** (operating vs investing vs financing) on journal lines/events.

| Method | Feasibility |
|--------|-------------|
| Direct | Weak — many clearing/settlement paths; COD remittance incomplete |
| Indirect | Possible sketch from P&L + BS deltas, but noisy with clearing, 1210, test fixtures |

**Recommendation:** **Do not implement Cash Flow in Phase 6.** Future enhancement after cutover + cleaner cash tagging. Avoid low-quality CFS.

---

## 22. Management Dashboard

**Route:** `/admin/accounting/reports` → Overview tab.

**Period metrics (all GL-backed):**

| Metric | Source |
|--------|--------|
| Revenue / Net Revenue | 4000, 4200, 4100 |
| COGS / Gross Profit / Margin % | 5000 + revenue |
| Operating Expenses | 51xx–53xx mapping |
| Net Profit | P&L net |
| Cash + Bank | 1000 + bank GLs |
| AR / AP | 1100 / 2000 |
| Inventory Value | 1200 |
| GST Position | 210x − eligible ITC disclosure optional; GL output/input for financial |

**Trends:** current month · previous month · YTD (FY-aware).

Every tile links into TB/GL/P&L/BS drill-down — no dead-end KPIs.

---

## 23. Period Comparison

| Statement | Compare |
|-----------|---------|
| P&L | Period **movement** (This Month / Prior Month / Same Month Prior Year if data / YTD) |
| Balance Sheet | **As-of closing** balances only — never period movement |
| TB | As-of or period columns as selected |

---

## 24. Accounting Periods

| Status | Exists |
|--------|--------|
| OPEN | Yes (`AccountingPeriodStatus`) |
| CLOSED | Yes — `assertEntryDateInOpenPeriod` blocks new posts |
| LOCKED | **No** separate status |

**Lightsail:** zero period rows — close workflow unused.

**Reporting:** Reports **may** run for closed periods (read-only history). Closed periods stabilize prior reports by blocking new posts into that date range. Design period-close checklist: reconcile TB → lock period CLOSED → optional FY close later.

---

## 25. Financial Year

India-based business; **no** `financialYearStartMonth` config in schema today.

**Recommend (Phase 6B/6C config, no CoA change):**

- Env or settings: `ACCOUNTING_FY_START_MONTH` default **4** (1 April)  
- FY selector, YTD bounds, prior-FY comparison derived from that  

Do not hardcode Apr–Mar without making it configurable.

---

## 26. Retained Earnings / Year-End Close

| Option | Description | V1 |
|--------|-------------|----|
| **A** | Dynamic current earnings on BS | **Recommended** |
| B | Formal close journals → 3100 | Later |

No automatic closing in Phase 6. Document Option B as Phase 7+ ops when openings cleaned and FY chosen.

---

## 27. Report Authority Matrix

| Report / figure | Authority | Evidence / recon |
|-----------------|-----------|------------------|
| Trial Balance | POSTED GL | TB_DEBITS_EQUAL_CREDITS |
| General Ledger | POSTED GL | Journal immutability |
| P&L | POSTED GL temporary accounts | PL_NET_PROFIT_RECONCILES… |
| Balance Sheet | POSTED GL + calc current earnings | BS_ASSETS_EQUAL_L+E |
| Bank book balance | POSTED GL | BANK_GL_VS_BOOK_BALANCE |
| Bank statement balance | Reconciliation / statement import | Difference disclosure |
| AR | GL 1100 | Subledger DATA_GAP |
| AP | GL 2000 | VendorBill + payments recon |
| Inventory value | GL 1200 | FIFO layers |
| GST amounts | GL 210x/220x | Phase 5 reports |
| ITC eligibility | AccountingItcEvidence | Not GL rewrite |
| Gateway outstanding | GL 102x | Phase 4 gateway dashboard |

This matrix is **implementation authority** for Phase 6B–6D.

---

## 28. Drill-Down Architecture

```
Financial Statement line
  → Account (code)
    → GL transactions (period)
      → JournalEntry
        → PostingEvent (or ORPHAN)
          → Source document UI
```

Examples:

- P&L Sales → 4000 → JE → ORDER_PAID → Order  
- Inventory → 1200 → COGS/capitalization/opening → cost layer  
- Bank → bank GL → transfer / settlement / vendor payment  
- GST liability → 210x → ORDER_PAID / refund / orphan badge  

No report total may be a dead end.

---

## 29. Integrity / Reconciliation

**Minimum checks (surface exact variance; never auto-balance):**

| Code | Meaning |
|------|---------|
| TB_DEBITS_EQUAL_CREDITS | Closing TB |
| BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY | Including current earnings |
| PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS | |
| AR_GL_VS_SUBLEDGER | DATA_GAP until subledger |
| AP_GL_VS_SUBLEDGER | Exact paise |
| INVENTORY_GL_VS_FIFO | Exact paise |
| BANK_GL_VS_BOOK_BALANCE | Per bank account |
| GST_GL_VS_GST_REPORT | Incl. orphan warning |
| ORPHAN_POSTING_EVENTS | |
| ORPHAN_JOURNALS | |
| UNBALANCED_JOURNALS | Must be 0 |

UI: Reconciliation / Integrity tab with PASS / WARN / FAIL + variance.

---

## 30. Lightsail Read-Only Findings

**Environment:** SSH `ubuntu@13.204.112.165` → backend Prisma → intended Lightsail Postgres. Read-only queries only.

### Headline numbers (ALL POSTED — includes TEST-ACC)

| Metric | Value |
|--------|-------|
| POSTED journals | 113 |
| Lines | 300 |
| Total debits = credits | 58,381,850 paise (₹5,83,818.50) |
| Unbalanced | 0 |
| Draft/Void | 0 |
| Orphan journals | 17 (TEST) |
| Linked POSTED events | 96 |
| Accounts | 57 (35 system + 22 test bank GLs) |
| Periods | 0 |

### Key balances (paise, net Dr positive)

| Account | Net |
|---------|-----|
| 1010 Bank | +158,846 |
| 1020 Razorpay Clearing | +7,545,700 |
| 1100 AR | 0 |
| 1200 Inventory | +4,100,000 |
| 1210 Clearing | −3,600,000 |
| 2000 AP | −637,200 |
| Output GST 2100–2102 | −1,392,061 |
| Input GST 2200–2201 | +103,950 |
| 3900 Opening Equity | −26,800,000 |
| 4000 Sales | −7,755,339 |
| 4100 Shipping | −15,300 |
| 4500 Interest | −4,000 |
| 5000 COGS | +3,300,000 |
| OpEx (5100+5300+5310+5320+5390) | +747,404 |

### Preliminary P&L (inception, contaminated)

| | Paise | ₹ |
|--|------|---|
| Revenue (incl. interest) | 7,774,639 | 77,746.39 |
| Expenses (incl. COGS) | 4,047,404 | 40,474.04 |
| Net profit | **3,727,235** | **37,272.35** |

### Preliminary BS (with current earnings)

| | Paise |
|--|------|
| Assets | 32,452,546 |
| Liabilities | 1,925,311 |
| Equity posted (3900) | 26,800,000 |
| + Current earnings | 3,727,235 |
| L+E | 32,452,546 |
| **Difference** | **0** |

### Separation note

| Bucket | Notes |
|--------|-------|
| TEST/TAGGED | TEST-ACC-*, SRV-TEST-ACC-*, synthetic bank GLs, FIFO/GST/ITC fixtures |
| REAL/MIGRATED | ~4,396 orders exist commercially; **native accounting posts are overwhelmingly validation fixtures**, not full historical migration |
| UNKNOWN | Orphan Output GST journals without events |

**Do not treat these as production financial statements.** Phase 7 cutover owns real openings and cleanup.

---

## 31. Test Fixture Impact

Retained fixtures affecting TB/P&L/BS:

- `TEST-ACC-FIFO-*`, Phase 3D3/3D4 OPENING / PURCHASE_RECEIPT orphans  
- `TEST-ACC-BANK-*`, `TEST-ACC-STMT-*`, `TEST-ACC-RECON-*`, `TEST-ACC-BANK-4E-*`  
- `TEST-ACC-GST-*`, `TEST-ACC-ITC-*`, `TEST-ACC-GSTR-*` (from Phase 5)  
- SRV-TEST-ACC order journals  

**Impact:** Inflated clearing, inventory, equity 3900, gateway, P&L.  
**Phase 6:** Do not delete.  
**Phase 7:** Cleanup dependency register (immutable journal policy — approved purge/offset procedure).

---

## 32. Historical Data Risks

| Risk | Severity | Note |
|------|----------|------|
| Orphan Output GST ~₹2,593.22 | HIGH (recon) | Phase 5D / Phase 7 |
| TEST bank GL sprawl | MEDIUM | Distorts cash/bank KPIs |
| 1210 credit from orphan receipts | HIGH (presentation) | Misleading clearing |
| AP GL vs VendorBill drift | HIGH (recon) | |
| Inventory GL vs FIFO | HIGH (recon) | |
| No AR history / COD remittance | MEDIUM | |
| Stripe/PayPal clearing unused | MEDIUM | DATA_GAP vs commerce |
| Zoho historical not in native GL | HIGH for cutover | Phase 7 — do not mix into TB |
| Shipping GST DATA_GAP | MEDIUM | 4100 may hold untaxed shipping |
| Partial refund DATA_GAP | MEDIUM | |

---

## 33. Export Architecture

| Format | Reports |
|--------|---------|
| XLSX (required V1) | Trial Balance, General Ledger, P&L, Balance Sheet |
| PDF (optional V1 / 6D) | P&L, Balance Sheet, Trial Balance |

**Rule:** One reporting service computes numbers; UI and export call the same functions (mirror Phase 5D GST export pattern: ExcelJS + formula neutralization). No duplicate engines.

---

## 34. Admin UI

**Propose:** `/admin/accounting/reports`

**Tabs:** Overview · Trial Balance · General Ledger · Profit & Loss · Balance Sheet · Reconciliation / Integrity  

**Cash Flow tab:** omitted until future enhancement.

**Filters:** period from/to · as-of · financial year · comparison mode · account (GL)

**Nav:** extend `AdminAccountingNav` — admin-only via existing `requireAdmin` on `/api/admin/accounting/*`.

---

## 35. Performance

**Current indexes:** `entryDate`, `status`, `accountId`, `journalEntryId` — adequate for aggregation at current scale (hundreds of journals).

**Strategy:**

- SQL `GROUP BY accountId` with date filters  
- Avoid loading all journals into Node for TB/P&L/BS  
- GL detail: paginated by account + date  
- Optional covering index later: `(status, entryDate)` already partial via separate indexes; consider composite `(status, entryDate, id)` if needed  

**Scale:** Sarveda order volume is manageable; even 100k–1M lines are fine with aggregation. N+1 forbidden.

---

## 36. Security

| Control | Requirement |
|---------|-------------|
| Auth | Admin / Super-admin only (`requireAdmin`) |
| Public endpoints | **None** for financial reports |
| Exports | Same auth; audit log recommended |
| Query bounds | Zod-validate dates; max range cap |
| Formula injection | Neutralize XLSX cells (Phase 5D pattern) |
| Errors | No raw DB errors to client |
| PII | Drill-down may show customer email/phone — admin-only; minimize on exports |
| Flags | Gate new report APIs behind accounting module flag (and optional `ACCOUNTING_REPORTS_ENABLED`) |

---

## 37. Synthetic Test Strategy

**Primary correctness proof:** balanced synthetic company fixture (tagged `TEST-ACC-FS-*`), not migrated commerce data.

**Suggested lifecycle:**

1. Opening: Bank ₹10,00,000 + Inventory ₹5,00,000 vs 3900  
2. Purchase: Inventory / 1210 / Input GST / AP  
3. Capitalize → 1200; FIFO layers  
4. Vendor payment  
5. Sale: Revenue, Output GST, clearing/AR, COGS  
6. Settlement / COD receipt  
7. Expense + Input GST  
8. Full refund + COGS reversal  
9. Bank charge + interest  

**Assert:** TB balances · P&L exact · BS balances · AR/AP GL exact · Inventory GL = FIFO · GST exact · Bank exact · integrity suite PASS.

Run on Lightsail with flags ON only for validation window; leave flags OFF in persistent `.env`.

---

## 38. Proposed Phase 6 Implementation Slices

**Final count: 3 slices** (smallest safe fixed set). Do not expand unless a genuine blocker appears.

### 6B — Report engine + Trial Balance + General Ledger

- `FinancialStatementMapping` / account classification helpers  
- FY config helper (`financialYearStartMonth`)  
- TB + GL services, handlers, Zod routes, admin UI tabs  
- Feature flag(s) default OFF  
- Unit tests + synthetic smoke  

### 6C — P&L + Balance Sheet + Management Dashboard

- P&L + BS (Option A current earnings)  
- Overview dashboard + period comparison  
- Drill-down wiring to existing journal/source pages  
- Synthetic end-to-end statement proof  

### 6D — Integrity, exports, hardening, Lightsail validation

- Integrity matrix checks + UI  
- XLSX (and optional PDF) exports  
- Performance/security pass  
- Lightsail validation script  
- Document Phase 7 cleanup register (orphans, TEST-ACC, AP/FIFO variances)  
- **No** Cash Flow; **no** year-end close journals; **no** real cutover balances  

**Rationale against combining further:** mapping + earnings + integrity + exports is too large for one safe merge; 6B foundation must stabilize before BS earnings presentation.

---

## 39. Risk Matrix

| Area | Rating | Notes |
|------|--------|-------|
| Chart of Accounts classification | **MEDIUM** | Prisma types coarse; need mapping layer (4200 contra, 4500 other income, 5000 COGS, 220x presentation) |
| Trial Balance | **LOW** | GL balanced; aggregation straightforward |
| General Ledger | **LOW** | Orphan journals need badges |
| P&L | **MEDIUM** | Mapping discipline; shipping/discount DATA_GAPs |
| Balance Sheet | **MEDIUM** | Current earnings Option A mandatory |
| Current earnings | **MEDIUM** | 3100 unused — must compute dynamically |
| Opening balances | **HIGH** | Incomplete for real cutover (AR/AP/general) — Phase 7, not 6 blocker |
| AR reconciliation | **HIGH** | No subledger; GL unused on Lightsail |
| AP reconciliation | **HIGH** | GL vs VendorBill variance on Lightsail |
| Inventory reconciliation | **HIGH** | GL vs FIFO variance on fixtures |
| Bank balances | **MEDIUM** | Book vs statement; test GL sprawl |
| Gateway clearing | **MEDIUM** | Large Razorpay clearing; Stripe/PayPal empty |
| GST presentation | **HIGH** | Orphan Output GST ₹2,593.22 |
| Contra accounts | **LOW** | 4200 defined; unused on Lightsail |
| Financial year | **MEDIUM** | Config absent — add in 6B/6C |
| Year-end close | **LOW** (defer) | Option A avoids rush |
| Cash Flow | **HIGH** if forced now | **Defer** — quality insufficient |
| Historical/migrated data | **HIGH** | Not in native GL; Phase 7 |
| TEST-ACC fixtures | **HIGH** (distortion) | Phase 7 cleanup; do not delete in 6 |

**HIGH explanations:** Opening/AR/AP/inventory/GST/historical/TEST issues distort **trust** in Lightsail numbers and cutover readiness, but **do not block** building a GL-based report engine that surfaces variances honestly.

**No BLOCKER** on double-entry integrity of POSTED journals.

---

## 40. Files Future Implementation May Touch

**Do not modify in 6A — list only:**

### Backend — likely new

- `backend/src/modules/accounting/financial-statement.mapping.ts`  
- `backend/src/modules/accounting/financial-year.ts`  
- `backend/src/modules/accounting/trial-balance.service.ts`  
- `backend/src/modules/accounting/general-ledger.service.ts`  
- `backend/src/modules/accounting/profit-loss.service.ts`  
- `backend/src/modules/accounting/balance-sheet.service.ts`  
- `backend/src/modules/accounting/financial-dashboard.service.ts`  
- `backend/src/modules/accounting/financial-integrity.service.ts`  
- `backend/src/modules/accounting/financial-export.service.ts`  
- `backend/src/modules/accounting/financial-reports.handlers.ts`  
- `backend/scripts/phase6*-lightsail-*-validation.ts`  

### Backend — likely edits

- `accounting.routes.ts`, `accounting.handlers.ts`, `accounting-flag.ts` / `.env.example`  
- `accounting-period.service.ts` (read helpers)  
- `seed-coa.ts` — **read-only reference** (no CoA change unless later approved)  
- Tests under `backend/src/modules/accounting/__tests__/`  

### Schema

- Possibly **no** migration for 6B–6C if mapping is code-only  
- Optional later: FY settings table — **not required for V1** if env-based  

### Frontend

- `frontend/app/admin/accounting/reports/page.tsx` (new)  
- `frontend/components/admin/accounting/*` report components  
- `AdminAccountingNav.tsx`, `frontend/lib/api` accounting helpers  

### Docs

- Phase 6B/6C/6D result reports  
- Phase 7 cleanup register updates  

---

## 41. Recommendation

Proceed to Phase 6 implementation with **three fixed slices (6B → 6C → 6D)**.

Build a single GL-derived report engine; present P&L/BS with **dynamic current earnings**; centralize account→statement mapping; defer Cash Flow and formal year-end close; treat Lightsail figures as contaminated proof of plumbing; carry orphan GST, TEST-ACC, AP/FIFO variances to Phase 7 cleanup.

Architecture is complete for implementation. Double-entry foundation is sound.

READY FOR PHASE 6 IMPLEMENTATION
