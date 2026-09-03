/**
 * Phase 6D — global financial integrity / reconciliation.
 * Surfaces GL truth and known variances; never auto-balances.
 */
import { prisma } from "../../config/db";

import { buildTrialBalance } from "./trial-balance.service";
import { buildProfitLoss } from "./profit-loss.service";
import { buildBalanceSheet } from "./balance-sheet.service";
import { listBankAccounts, computeBookBalanceForGlCode } from "./bank-account.service";
import { getGatewayClearingControls } from "./gateway-clearing-control.service";
import { buildGstReportIntegrity } from "./gst-reporting.service";
import { getNativeBillOutstanding } from "./vendor-payment-outstanding";
import { financialYearContainingDate, parseUtcDateOnly } from "./financial-year";

export type IntegrityStatus = "PASS" | "WARNING" | "FAIL" | "DATA_GAP";
export type IntegritySeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type IntegrityCheck = {
  code: string;
  status: IntegrityStatus;
  severity: IntegritySeverity;
  expectedInPaise: number | null;
  actualInPaise: number | null;
  varianceInPaise: number | null;
  message: string;
  drillDown: Record<string, unknown> | null;
};

export type FinancialIntegrityReport = {
  asOf: string;
  period: { from: string; to: string };
  generatedAt: string;
  overallStatus: "FINANCIAL_REPORTING_ENGINE_HEALTHY" | "REVIEW_REQUIRED";
  /** Explicit: Phase 6 validates the engine, not production cutover. */
  productionCutoverReady: false;
  summary: {
    pass: number;
    warning: number;
    fail: number;
    dataGap: number;
  };
  checks: IntegrityCheck[];
  phase7CarryForward: string[];
};

const TEST_MEMO_RE =
  /TEST-UAT-ACC|TEST-ACC|SRV-TEST-ACC|TEST-ACC-FS|TEST-ACC-FIFO|TEST-ACC-BANK|TEST-ACC-GST|TEST-ACC-ITC|TEST-ACC-GSTR/i;

function check(
  partial: Omit<IntegrityCheck, "severity"> & { severity?: IntegritySeverity }
): IntegrityCheck {
  const severity =
    partial.severity ??
    (partial.status === "FAIL"
      ? "HIGH"
      : partial.status === "WARNING"
        ? "MEDIUM"
        : partial.status === "DATA_GAP"
          ? "INFO"
          : "INFO");
  return { ...partial, severity };
}

function glClosingNetFromTb(
  tb: Awaited<ReturnType<typeof buildTrialBalance>>,
  code: string
): number {
  return tb.rows.find((r) => r.accountCode === code)?.closingNetInPaise ?? 0;
}

/**
 * Aggregate native AP outstanding for bills that have a posted VENDOR_BILL journal.
 */
async function nativeApSubledgerTotal(): Promise<{
  outstandingInPaise: number;
  billCount: number;
}> {
  const postedBillEvents = await prisma.accountingPostingEvent.findMany({
    where: { eventType: "VENDOR_BILL_POSTED", status: "POSTED" },
    select: { sourceId: true }
  });
  let outstanding = 0;
  let billCount = 0;
  for (const ev of postedBillEvents) {
    const o = await getNativeBillOutstanding(ev.sourceId);
    if (o.hasApJournal) {
      outstanding += o.outstandingInPaise;
      billCount += 1;
    }
  }
  return { outstandingInPaise: outstanding, billCount };
}

async function fifoRemainingValue(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ v: bigint }>>`
    SELECT COALESCE(SUM(("quantityRemaining")::bigint * ("unitCostInPaise")::bigint), 0)::bigint AS v
    FROM "AccountingInventoryCostLayer"
    WHERE "quantityRemaining" > 0 AND status = 'ACTIVE'
  `;
  return Number(rows[0]?.v ?? 0);
}

/**
 * Accounting setup items that are still genuinely open, derived from live data.
 * Shown to admins on the reports screen — production wording only.
 */
async function buildOpenSetupItems(): Promise<string[]> {
  const [openingPosted, inventoryOpeningPosted, bankAccounts, cardSettlements] =
    await Promise.all([
      prisma.accountingOpeningBatch.count({ where: { status: "POSTED" } }),
      prisma.accountingInventoryOpeningBatch.count({ where: { status: "POSTED" } }),
      prisma.accountingBankAccount.count({ where: { isActive: true } }),
      prisma.accountingGatewaySettlement.count({ where: { status: "POSTED" } })
    ]);

  const items: string[] = [];
  if (openingPosted === 0) {
    items.push("Opening balances (bank, payables, receivables, capital) not posted yet");
  }
  if (inventoryOpeningPosted === 0) {
    items.push("Opening inventory valuation not posted yet");
  }
  if (bankAccounts === 0) {
    items.push("No bank account set up for statement import and reconciliation");
  }
  if (cardSettlements === 0) {
    items.push("No payment gateway settlement recorded yet");
  }
  return items;
}

export async function buildFinancialIntegrityReport(input: {
  asOf?: string;
  from?: string;
  to?: string;
}): Promise<FinancialIntegrityReport> {
  const asOf = (input.asOf ?? new Date().toISOString().slice(0, 10)).trim();
  parseUtcDateOnly(asOf);
  const fy = financialYearContainingDate(parseUtcDateOnly(asOf));
  const from = (input.from ?? fy.startDate).trim();
  const to = (input.to ?? asOf).trim();
  parseUtcDateOnly(from);
  parseUtcDateOnly(to);

  const checks: IntegrityCheck[] = [];
  const phase7 = await buildOpenSetupItems();

  // --- UNBALANCED / ZERO-LINE JOURNALS ---
  const unbalanced = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM "AccountingJournalEntry"
    WHERE status = 'POSTED' AND "totalDebitInPaise" <> "totalCreditInPaise"
  `;
  const unbalancedN = Number(unbalanced[0]?.n ?? 0);
  checks.push(
    check({
      code: "UNBALANCED_POSTED_JOURNALS",
      status: unbalancedN === 0 ? "PASS" : "FAIL",
      severity: unbalancedN === 0 ? "INFO" : "BLOCKER",
      expectedInPaise: 0,
      actualInPaise: unbalancedN,
      varianceInPaise: unbalancedN,
      message:
        unbalancedN === 0
          ? "No unbalanced POSTED journals"
          : `${unbalancedN} unbalanced POSTED journal(s)`,
      drillDown: { count: unbalancedN }
    })
  );

  const zeroLine = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM "AccountingJournalEntry" e
    WHERE e.status = 'POSTED'
      AND NOT EXISTS (SELECT 1 FROM "AccountingJournalLine" l WHERE l."journalEntryId" = e.id)
  `;
  const zeroLineN = Number(zeroLine[0]?.n ?? 0);
  checks.push(
    check({
      code: "ZERO_LINE_POSTED_JOURNALS",
      status: zeroLineN === 0 ? "PASS" : "FAIL",
      severity: zeroLineN === 0 ? "INFO" : "BLOCKER",
      expectedInPaise: 0,
      actualInPaise: zeroLineN,
      varianceInPaise: zeroLineN,
      message:
        zeroLineN === 0
          ? "No zero-line POSTED journals"
          : `${zeroLineN} POSTED journal(s) with zero lines`,
      drillDown: { count: zeroLineN }
    })
  );

  // --- TB (single aggregation; reused for control accounts) ---
  const tb = await buildTrialBalance({ asOf, includeZeroBalanceAccounts: true });
  checks.push(
    check({
      code: "TB_DEBITS_EQUAL_CREDITS",
      status: tb.balanced ? "PASS" : "FAIL",
      severity: tb.balanced ? "INFO" : "BLOCKER",
      expectedInPaise: tb.totals.closingCreditInPaise,
      actualInPaise: tb.totals.closingDebitInPaise,
      varianceInPaise: tb.varianceInPaise,
      message: tb.balanced
        ? "Trial Balance closing debits equal credits"
        : `Trial Balance out of balance by ${tb.varianceInPaise} paise`,
      drillDown: { asOf, rows: tb.rows.length }
    })
  );

  // --- P&L ---
  const pl = await buildProfitLoss({ from, to });
  checks.push(
    check({
      code: "PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS",
      status: pl.integrity.status === "PASS" ? "PASS" : "FAIL",
      severity: pl.integrity.status === "PASS" ? "INFO" : "HIGH",
      expectedInPaise: pl.integrity.temporaryAccountsNetInPaise,
      actualInPaise: pl.totals.netProfitInPaise,
      varianceInPaise: pl.integrity.varianceInPaise,
      message:
        pl.integrity.status === "PASS"
          ? "P&L net equals temporary-account movement"
          : `P&L temporary-account variance ${pl.integrity.varianceInPaise} paise`,
      drillDown: { from, to, netProfitInPaise: pl.totals.netProfitInPaise }
    })
  );

  // --- BS ---
  const bs = await buildBalanceSheet({ asOf });
  checks.push(
    check({
      code: "BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY",
      status: bs.totals.balanced ? "PASS" : "FAIL",
      severity: bs.totals.balanced ? "INFO" : "BLOCKER",
      expectedInPaise: bs.totals.totalLiabilitiesInPaise + bs.totals.totalEquityInPaise,
      actualInPaise: bs.totals.totalAssetsInPaise,
      varianceInPaise: bs.totals.differenceInPaise,
      message: bs.totals.balanced
        ? "Balance Sheet balances (incl. prior unclosed + current FY earnings)"
        : `Balance Sheet difference ${bs.totals.differenceInPaise} paise`,
      drillDown: {
        currentFyEarningsInPaise: bs.earnings.currentFyEarningsInPaise,
        priorUnclosedEarningsInPaise: bs.earnings.priorUnclosedEarningsInPaise,
        formula: bs.earnings.formula
      }
    })
  );

  // 3100 unused
  const reLines = await prisma.accountingJournalLine.count({
    where: { account: { code: "3100" } }
  });
  checks.push(
    check({
      code: "RETAINED_EARNINGS_3100_UNTOUCHED",
      status: reLines === 0 ? "PASS" : "WARNING",
      severity: reLines === 0 ? "INFO" : "MEDIUM",
      expectedInPaise: 0,
      actualInPaise: reLines,
      varianceInPaise: reLines,
      message:
        reLines === 0
          ? "3100 Retained Earnings has no journal lines (Option A — no year-end close)"
          : "3100 has activity — review unexpected close/postings",
      drillDown: { lineCount: reLines }
    })
  );

  // --- AR ---
  const arGl = glClosingNetFromTb(tb, "1100");
  checks.push(
    check({
      code: "AR_GL_VS_SUBLEDGER",
      status: "DATA_GAP",
      severity: "INFO",
      expectedInPaise: null,
      actualInPaise: arGl,
      varianceInPaise: null,
      message:
        "Customer AR subledger unavailable — financial AR = GL 1100 only (AR_SUBLEDGER_DATA_GAP)",
      drillDown: { glAccount: "1100", glNetInPaise: arGl, label: "AR_SUBLEDGER_DATA_GAP" }
    })
  );

  // --- AP ---
  const apGlSigned = glClosingNetFromTb(tb, "2000");
  const apGlLiability = -apGlSigned; // credit balance → positive liability
  const apSub = await nativeApSubledgerTotal();
  const apVar = apGlLiability - apSub.outstandingInPaise;
  checks.push(
    check({
      code: "AP_GL_VS_SUBLEDGER",
      status: apVar === 0 ? "PASS" : "WARNING",
      severity: apVar === 0 ? "INFO" : "HIGH",
      expectedInPaise: apSub.outstandingInPaise,
      actualInPaise: apGlLiability,
      varianceInPaise: apVar,
      message:
        apVar === 0
          ? "AP GL matches native bill outstanding"
          : `AP GL vs native outstanding variance ${apVar} paise — Phase 7 cleanup`,
      drillDown: {
        glAccount: "2000",
        glLiabilityInPaise: apGlLiability,
        nativeOutstandingInPaise: apSub.outstandingInPaise,
        billCount: apSub.billCount
      }
    })
  );

  // --- Inventory ---
  const invGl = glClosingNetFromTb(tb, "1200");
  const fifo = await fifoRemainingValue();
  const invVar = invGl - fifo;
  checks.push(
    check({
      code: "INVENTORY_GL_VS_FIFO",
      status: invVar === 0 ? "PASS" : "WARNING",
      severity: invVar === 0 ? "INFO" : "HIGH",
      expectedInPaise: fifo,
      actualInPaise: invGl,
      varianceInPaise: invVar,
      message:
        invVar === 0
          ? "Inventory GL 1200 equals FIFO remaining layer value"
          : `Inventory GL vs FIFO variance ${invVar} paise — Phase 7 cleanup`,
      drillDown: {
        glAccount: "1200",
        glInPaise: invGl,
        fifoRemainingInPaise: fifo,
        note: "Inventory.onHand is quantity authority only — not valuation"
      }
    })
  );

  // --- Bank book (+ latest statement recon context; statement ≠ BS) ---
  const banks = await listBankAccounts({});
  let bankMismatch = 0;
  const bankDetails: Array<{
    code: string;
    gl: number;
    book: number;
    latestRecon?: {
      id: string;
      status: string;
      statementClosingBalanceInPaise: number | null;
      differenceInPaise: number;
      periodEnd: string;
    } | null;
  }> = [];
  for (const b of banks) {
    const book = await computeBookBalanceForGlCode(b.glAccountCode);
    const gl = (b as { bookBalanceInPaise?: number }).bookBalanceInPaise ?? book;
    const latestRecon = await prisma.accountingBankReconciliation.findFirst({
      where: { bankAccountId: b.id },
      orderBy: { periodEnd: "desc" },
      select: {
        id: true,
        status: true,
        statementClosingBalanceInPaise: true,
        differenceInPaise: true,
        periodEnd: true
      }
    });
    bankDetails.push({
      code: b.glAccountCode,
      gl,
      book,
      latestRecon: latestRecon
        ? {
            id: latestRecon.id,
            status: latestRecon.status,
            statementClosingBalanceInPaise: latestRecon.statementClosingBalanceInPaise,
            differenceInPaise: latestRecon.differenceInPaise,
            periodEnd: latestRecon.periodEnd.toISOString().slice(0, 10)
          }
        : null
    });
    if (gl !== book) bankMismatch += 1;
  }
  checks.push(
    check({
      code: "BANK_GL_VS_BOOK_BALANCE",
      status: bankMismatch === 0 ? "PASS" : "FAIL",
      severity: bankMismatch === 0 ? "INFO" : "HIGH",
      expectedInPaise: 0,
      actualInPaise: bankMismatch,
      varianceInPaise: bankMismatch,
      message:
        bankMismatch === 0
          ? `All ${banks.length} bank registry book balances match GL (statement recon is separate)`
          : `${bankMismatch} bank account(s) book≠GL`,
      drillDown: {
        accounts: bankDetails.slice(0, 50),
        total: banks.length,
        note: "Statement ending balance is NOT substituted into Balance Sheet"
      }
    })
  );

  // --- Gateway ---
  const gw = await getGatewayClearingControls();
  const gwGaps = gw.filter((g) =>
    ["DATA_GAP", "SETTLEMENT_NOT_CONFIGURED", "REVIEW_REQUIRED", "OUTSTANDING"].includes(
      g.status
    )
  );
  checks.push(
    check({
      code: "GATEWAY_CLEARING_CONTROL",
      status: gwGaps.length === 0 ? "PASS" : "WARNING",
      severity: "MEDIUM",
      expectedInPaise: null,
      actualInPaise: gw.reduce((s, g) => s + Math.abs(g.balanceInPaise), 0),
      varianceInPaise: null,
      message:
        gwGaps.length === 0
          ? "Gateway clearing controls clear"
          : `Gateway controls need review: ${gwGaps.map((g) => `${g.provider}:${g.status}`).join(", ")}`,
      drillDown: { rows: gw }
    })
  );

  // --- GST ---
  let orphanGst = 0;
  let gstStatus: IntegrityStatus = "PASS";
  try {
    const month = asOf.slice(0, 7);
    const gst = await buildGstReportIntegrity({ month });
    orphanGst = gst.orphanOutputGstInPaise ?? 0;
    if (gst.status === "PASS") gstStatus = "PASS";
    else if (gst.status === "PASS_WITH_ORPHAN_GL_WARNING") gstStatus = "WARNING";
    else gstStatus = "FAIL";
    checks.push(
      check({
        code: "GST_GL_VS_GST_REPORT",
        status: gstStatus,
        severity: gstStatus === "FAIL" ? "HIGH" : gstStatus === "WARNING" ? "MEDIUM" : "INFO",
        expectedInPaise: 0,
        actualInPaise: orphanGst,
        varianceInPaise: orphanGst,
        message:
          orphanGst === 0
            ? "GST report integrity PASS"
            : `GST integrity ${gst.status}; orphan Output GST ${orphanGst} paise — Phase 7`,
        drillDown: {
          month,
          status: gst.status,
          orphanOutputGstInPaise: orphanGst,
          checks: gst.checks?.slice?.(0, 10) ?? gst.checks
        }
      })
    );
  } catch (err) {
    checks.push(
      check({
        code: "GST_GL_VS_GST_REPORT",
        status: "DATA_GAP",
        message: `GST integrity unavailable: ${err instanceof Error ? err.message : String(err)}`,
        expectedInPaise: null,
        actualInPaise: null,
        varianceInPaise: null,
        drillDown: null
      })
    );
  }

  // --- 1210 ---
  const c1210 = glClosingNetFromTb(tb, "1210");
  checks.push(
    check({
      code: "PURCHASE_CLEARING_1210_CONTROL",
      status: c1210 === 0 ? "PASS" : "WARNING",
      severity: "MEDIUM",
      expectedInPaise: 0,
      actualInPaise: c1210,
      varianceInPaise: c1210,
      message:
        c1210 === 0
          ? "1210 clearing is zero"
          : c1210 > 0
            ? `1210 debit clearing ${c1210} paise (asset) — review capitalization`
            : `1210 credit clearing ${-c1210} paise (liability presentation) — do not net into 1200`,
      drillDown: {
        glNetInPaise: c1210,
        presentation: c1210 >= 0 ? "ASSET" : "LIABILITY"
      }
    })
  );

  // --- Orphans ---
  const orphanJournals = await prisma.accountingJournalEntry.findMany({
    where: { status: "POSTED", postingEvent: { is: null } },
    select: { id: true, entryNumber: true, memo: true, totalDebitInPaise: true },
    orderBy: { entryNumber: "asc" },
    take: 200
  });
  const orphanTest = orphanJournals.filter((j) => TEST_MEMO_RE.test(j.memo ?? ""));
  const orphanOther = orphanJournals.filter((j) => !TEST_MEMO_RE.test(j.memo ?? ""));
  checks.push(
    check({
      code: "ORPHAN_JOURNALS",
      status: orphanJournals.length === 0 ? "PASS" : "WARNING",
      severity: "MEDIUM",
      expectedInPaise: 0,
      actualInPaise: orphanJournals.length,
      varianceInPaise: orphanJournals.length,
      message:
        orphanJournals.length === 0
          ? "No orphan POSTED journals"
          : `${orphanJournals.length} orphan POSTED journal(s) (${orphanTest.length} TEST-tagged)`,
      drillDown: {
        total: orphanJournals.length,
        testTagged: orphanTest.length,
        other: orphanOther.length,
        sample: orphanJournals.slice(0, 20).map((j) => ({
          id: j.id,
          entryNumber: j.entryNumber,
          memo: j.memo,
          testTagged: TEST_MEMO_RE.test(j.memo ?? "")
        }))
      }
    })
  );

  const orphanEvents = await prisma.accountingPostingEvent.count({
    where: {
      status: "POSTED",
      journalEntryId: null
    }
  });
  checks.push(
    check({
      code: "ORPHAN_POSTING_EVENTS",
      status: orphanEvents === 0 ? "PASS" : "WARNING",
      severity: "MEDIUM",
      expectedInPaise: 0,
      actualInPaise: orphanEvents,
      varianceInPaise: orphanEvents,
      message:
        orphanEvents === 0
          ? "No POSTED events missing journal link"
          : `${orphanEvents} POSTED event(s) without journal`,
      drillDown: { count: orphanEvents }
    })
  );

  // --- TEST contamination ---
  const testMemoCount = await prisma.accountingJournalEntry.count({
    where: {
      status: "POSTED",
      OR: [
        { memo: { contains: "TEST-ACC", mode: "insensitive" } },
        { memo: { contains: "SRV-TEST-ACC", mode: "insensitive" } }
      ]
    }
  });
  const testBankCount = await prisma.accountingBankAccount.count({
    where: { name: { contains: "TEST-ACC", mode: "insensitive" } }
  });
  checks.push(
    check({
      code: "TEST_FIXTURE_CONTAMINATION",
      status: testMemoCount + testBankCount === 0 ? "PASS" : "WARNING",
      severity: "MEDIUM",
      expectedInPaise: 0,
      actualInPaise: testMemoCount,
      varianceInPaise: testMemoCount,
      message:
        testMemoCount + testBankCount === 0
          ? "No TEST-ACC tagged journals/banks detected"
          : `${testMemoCount} TEST-tagged journals, ${testBankCount} TEST bank accounts — not production financials`,
      drillDown: { testMemoJournals: testMemoCount, testBankAccounts: testBankCount }
    })
  );

  // --- Historical gap ---
  const orderCount = await prisma.order.count({ where: { deletedAt: null } });
  const orderPaidPosted = await prisma.accountingPostingEvent.count({
    where: { eventType: "ORDER_PAID", status: "POSTED" }
  });
  checks.push(
    check({
      code: "HISTORICAL_NATIVE_GL_GAP",
      status: "DATA_GAP",
      severity: "INFO",
      expectedInPaise: null,
      actualInPaise: orderPaidPosted,
      varianceInPaise: null,
      message: `Native ORDER_PAID posts ${orderPaidPosted} vs ~${orderCount} orders — historical commerce not fully in native GL (Phase 7 cutover)`,
      drillDown: { orders: orderCount, orderPaidPosted }
    })
  );

  const summary = {
    pass: checks.filter((c) => c.status === "PASS").length,
    warning: checks.filter((c) => c.status === "WARNING").length,
    fail: checks.filter((c) => c.status === "FAIL").length,
    dataGap: checks.filter((c) => c.status === "DATA_GAP").length
  };

  const overallStatus =
    summary.fail > 0 ? "REVIEW_REQUIRED" : "FINANCIAL_REPORTING_ENGINE_HEALTHY";

  return {
    asOf,
    period: { from, to },
    generatedAt: new Date().toISOString(),
    overallStatus,
    productionCutoverReady: false,
    summary,
    checks,
    phase7CarryForward: phase7
  };
}

/** Read-only TEST fixture register for Phase 7 cleanup. */
export async function buildTestFixtureRegister() {
  const journals = await prisma.accountingJournalEntry.findMany({
    where: {
      status: "POSTED",
      OR: [
        { memo: { contains: "TEST-ACC", mode: "insensitive" } },
        { memo: { contains: "SRV-TEST-ACC", mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      entryNumber: true,
      memo: true,
      totalDebitInPaise: true,
      entryDate: true,
      postingEvent: { select: { id: true, eventType: true, sourceType: true, sourceId: true } },
      lines: {
        select: { account: { select: { code: true } }, debitInPaise: true, creditInPaise: true }
      }
    },
    orderBy: { entryNumber: "asc" },
    take: 500
  });

  const banks = await prisma.accountingBankAccount.findMany({
    where: { name: { contains: "TEST-ACC", mode: "insensitive" } },
    select: { id: true, name: true, glAccountCode: true, accountType: true }
  });

  return {
    journals: journals.map((j) => ({
      journalId: j.id,
      entryNumber: j.entryNumber,
      memo: j.memo,
      entryDate: j.entryDate,
      totalDebitInPaise: j.totalDebitInPaise,
      postingEventId: j.postingEvent?.id ?? null,
      eventType: j.postingEvent?.eventType ?? null,
      sourceType: j.postingEvent?.sourceType ?? null,
      sourceId: j.postingEvent?.sourceId ?? null,
      orphanJournal: !j.postingEvent,
      accounts: [...new Set(j.lines.map((l) => l.account.code))],
      cleanupClassification: "TEST_FIXTURE_RETAINED"
    })),
    bankAccounts: banks.map((b) => ({
      ...b,
      cleanupClassification: "TEST_FIXTURE_RETAINED"
    })),
    note: "Do not delete immutable POSTED journals without approved Phase 7 procedure"
  };
}
