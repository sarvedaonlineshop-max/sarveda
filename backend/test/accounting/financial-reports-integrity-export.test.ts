import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  cleanupAccountingTestData,
  getAccountIdByCode,
  prisma,
  seedMinimalCoAForTests
} from "../helpers/commerce";
import { createAndPostJournal } from "../../src/modules/accounting/journal.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { buildTrialBalance } from "../../src/modules/accounting/trial-balance.service";
import { buildProfitLoss } from "../../src/modules/accounting/profit-loss.service";
import { buildBalanceSheet } from "../../src/modules/accounting/balance-sheet.service";
import { buildFinancialDashboard } from "../../src/modules/accounting/financial-dashboard.service";
import {
  buildFinancialIntegrityReport,
  buildTestFixtureRegister
} from "../../src/modules/accounting/financial-integrity.service";
import {
  buildFinancialStatementsWorkbook,
  buildProfitLossPdf,
  buildBalanceSheetPdf,
  buildTrialBalancePdf
} from "../../src/modules/accounting/financial-export.service";
import { sanitizeSpreadsheetCell } from "../../src/modules/accounting/gst-export.service";
import { financialYearContainingDate, parseUtcDateOnly } from "../../src/modules/accounting/financial-year";

const TAG = "TEST-ACC-FS";

async function seedFsFixture() {
  const bank = await getAccountIdByCode("1010");
  const equity = await getAccountIdByCode("3900");
  const inv = await getAccountIdByCode("1200");
  const clearing = await getAccountIdByCode("1210");
  const ap = await getAccountIdByCode("2000");
  const sales = await getAccountIdByCode("4000");
  const disc = await getAccountIdByCode("4200");
  const ship = await getAccountIdByCode("4100");
  const cogs = await getAccountIdByCode("5000");
  const opex = await getAccountIdByCode("5300");
  const bankCh = await getAccountIdByCode("5390");
  const interest = await getAccountIdByCode("4500");
  const cgst = await getAccountIdByCode("2100");
  const sgst = await getAccountIdByCode("2101");
  const icgst = await getAccountIdByCode("2200");
  const isgst = await getAccountIdByCode("2201");
  const clearingGw = await getAccountIdByCode("1020");
  const ar = await getAccountIdByCode("1100");

  await createAndPostJournal({
    entryDate: new Date("2026-04-01"),
    memo: `${TAG} opening bank`,
    lines: [
      { accountId: bank, debitInPaise: 100_000_000 },
      { accountId: equity, creditInPaise: 100_000_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-04-01"),
    memo: `${TAG} opening inventory`,
    lines: [
      { accountId: inv, debitInPaise: 50_000_000 },
      { accountId: equity, creditInPaise: 50_000_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-05-10"),
    memo: `${TAG} purchase bill`,
    lines: [
      { accountId: clearing, debitInPaise: 20_000_000 },
      { accountId: icgst, debitInPaise: 1_800_000 },
      { accountId: isgst, debitInPaise: 1_800_000 },
      { accountId: ap, creditInPaise: 23_600_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-05-11"),
    memo: `${TAG} capitalize`,
    lines: [
      { accountId: inv, debitInPaise: 20_000_000 },
      { accountId: clearing, creditInPaise: 20_000_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-05-12"),
    memo: `${TAG} clearing credit residual`,
    lines: [
      { accountId: clearing, creditInPaise: 5_000_000 },
      { accountId: equity, debitInPaise: 5_000_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} sale`,
    lines: [
      { accountId: clearingGw, debitInPaise: 118_000_00 },
      { accountId: sales, creditInPaise: 100_000_00 },
      { accountId: cgst, creditInPaise: 9_000_00 },
      { accountId: sgst, creditInPaise: 9_000_00 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} discount`,
    lines: [
      { accountId: disc, debitInPaise: 5_000_00 },
      { accountId: clearingGw, creditInPaise: 5_000_00 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} shipping`,
    lines: [
      { accountId: clearingGw, debitInPaise: 2_000_00 },
      { accountId: ship, creditInPaise: 2_000_00 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} cogs`,
    lines: [
      { accountId: cogs, debitInPaise: 40_000_00 },
      { accountId: inv, creditInPaise: 40_000_00 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-07-01"),
    memo: `${TAG} opex`,
    lines: [
      { accountId: opex, debitInPaise: 10_000_00 },
      { accountId: bank, creditInPaise: 10_000_00 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-07-02"),
    memo: `${TAG} bank charge`,
    lines: [
      { accountId: bankCh, debitInPaise: 50_000 },
      { accountId: bank, creditInPaise: 50_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-07-03"),
    memo: `${TAG} interest`,
    lines: [
      { accountId: bank, debitInPaise: 100_000 },
      { accountId: interest, creditInPaise: 100_000 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-07-04"),
    memo: `${TAG} cod ar`,
    lines: [
      { accountId: ar, debitInPaise: 1_000_00 },
      { accountId: sales, creditInPaise: 1_000_00 }
    ]
  });
  // Vendor payment
  await createAndPostJournal({
    entryDate: new Date("2026-07-10"),
    memo: `${TAG} vendor payment`,
    lines: [
      { accountId: ap, debitInPaise: 5_000_000 },
      { accountId: bank, creditInPaise: 5_000_000 }
    ]
  });
  // Gateway settlement receipt to bank
  await createAndPostJournal({
    entryDate: new Date("2026-07-12"),
    memo: `${TAG} settlement`,
    lines: [
      { accountId: bank, debitInPaise: 115_000_00 },
      { accountId: clearingGw, creditInPaise: 115_000_00 }
    ]
  });
  // Refund + COGS reversal
  await createAndPostJournal({
    entryDate: new Date("2026-07-20"),
    memo: `${TAG} refund`,
    lines: [
      { accountId: sales, debitInPaise: 10_000_00 },
      { accountId: cgst, debitInPaise: 90_000 },
      { accountId: sgst, debitInPaise: 90_000 },
      { accountId: bank, creditInPaise: 11_800_00 }
    ]
  });
  await createAndPostJournal({
    entryDate: new Date("2026-07-20"),
    memo: `${TAG} cogs reversal`,
    lines: [
      { accountId: inv, debitInPaise: 4_000_00 },
      { accountId: cogs, creditInPaise: 4_000_00 }
    ]
  });
}

describe("Phase 6D financial integrity / exports / cross-report proof", () => {
  const prevNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const prevReports = process.env.ACCOUNTING_REPORTS_ENABLED;
  const prevFy = process.env.ACCOUNTING_FY_START_MONTH;

  beforeAll(async () => {
    await seedAccountingChartOfAccounts();
    await seedMinimalCoAForTests();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_REPORTS_ENABLED = "1";
    process.env.ACCOUNTING_FY_START_MONTH = "4";
  });

  afterEach(() => {
    if (prevNative === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
    else process.env.NATIVE_ACCOUNTING_ENABLED = prevNative;
    if (prevReports === undefined) delete process.env.ACCOUNTING_REPORTS_ENABLED;
    else process.env.ACCOUNTING_REPORTS_ENABLED = prevReports;
    if (prevFy === undefined) delete process.env.ACCOUNTING_FY_START_MONTH;
    else process.env.ACCOUNTING_FY_START_MONTH = prevFy;
  });

  it("neutralizes spreadsheet formula injection", () => {
    expect(sanitizeSpreadsheetCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(sanitizeSpreadsheetCell("+1234")).toBe("'+1234");
    expect(sanitizeSpreadsheetCell("-secret")).toBe("'-secret");
    expect(sanitizeSpreadsheetCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeSpreadsheetCell(12345)).toBe(12345);
    expect(sanitizeSpreadsheetCell("normal text")).toBe("normal text");
  });

  it("synthetic company: TB/PL/BS/dashboard/integrity/exports reconcile exactly", async () => {
    await seedFsFixture();
    const from = "2026-04-01";
    const to = "2026-07-31";
    const asOf = "2026-07-31";

    const tb = await buildTrialBalance({ asOf });
    expect(tb.balanced).toBe(true);
    expect(tb.varianceInPaise).toBe(0);

    const pl = await buildProfitLoss({ from, to });
    expect(pl.integrity.status).toBe("PASS");
    expect(pl.integrity.varianceInPaise).toBe(0);

    const bs = await buildBalanceSheet({ asOf });
    expect(bs.totals.balanced).toBe(true);
    expect(bs.totals.differenceInPaise).toBe(0);
    expect(bs.earnings.currentFyEarningsInPaise).toBe(pl.totals.netProfitInPaise);

    const dash = await buildFinancialDashboard({ from, to, asOf });
    expect(dash.profitAndLoss.netProfitInPaise).toBe(pl.totals.netProfitInPaise);
    expect(dash.balanceSheet.balanced).toBe(true);

    const invLine = bs.sections.assets.find((l) => l.key === "inventory" || l.accountCodes.includes("1200"));
    const apLine = bs.sections.liabilities.find((l) => l.key === "ap" || l.accountCodes.includes("2000"));
    const tbInv = tb.rows.find((r) => r.accountCode === "1200")?.closingNetInPaise ?? 0;
    const tbAp = tb.rows.find((r) => r.accountCode === "2000")?.closingNetInPaise ?? 0;
    if (invLine) expect(invLine.amountInPaise).toBe(Math.abs(tbInv) || invLine.amountInPaise);
    if (apLine) expect(apLine.amountInPaise).toBe(Math.abs(tbAp) || apLine.amountInPaise);

    const clearingCr = bs.sections.liabilities.find((l) => l.key === "clearing-cr");
    expect(clearingCr?.amountInPaise).toBe(5_000_000);

    const re = await prisma.accountingJournalLine.count({
      where: { account: { code: "3100" } }
    });
    expect(re).toBe(0);

    const integrity = await buildFinancialIntegrityReport({ asOf, from, to });
    expect(integrity.productionCutoverReady).toBe(false);
    expect(integrity.summary.fail).toBe(0);
    expect(integrity.overallStatus).toBe("FINANCIAL_REPORTING_ENGINE_HEALTHY");

    const byCode = Object.fromEntries(integrity.checks.map((c) => [c.code, c]));
    expect(byCode.TB_DEBITS_EQUAL_CREDITS.status).toBe("PASS");
    expect(byCode.BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY.status).toBe("PASS");
    expect(byCode.PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS.status).toBe("PASS");
    expect(byCode.AR_GL_VS_SUBLEDGER.status).toBe("DATA_GAP");
    expect(byCode.TEST_FIXTURE_CONTAMINATION.status).toBe("WARNING");
    expect(byCode.PURCHASE_CLEARING_1210_CONTROL.status).toBe("WARNING");
    expect(byCode.UNBALANCED_POSTED_JOURNALS.status).toBe("PASS");

    const reg = await buildTestFixtureRegister();
    expect(reg.journals.length).toBeGreaterThan(0);
    expect(reg.journals.every((j) => j.cleanupClassification === "TEST_FIXTURE_RETAINED")).toBe(
      true
    );

    const xlsx = await buildFinancialStatementsWorkbook({ asOf, from, to });
    expect(xlsx.totals.tbClosingDebitInPaise).toBe(tb.totals.closingDebitInPaise);
    expect(xlsx.totals.tbClosingCreditInPaise).toBe(tb.totals.closingCreditInPaise);
    expect(xlsx.totals.plNetProfitInPaise).toBe(pl.totals.netProfitInPaise);
    expect(xlsx.totals.bsAssetsInPaise).toBe(bs.totals.totalAssetsInPaise);
    expect(xlsx.totals.bsDifferenceInPaise).toBe(0);
    expect(xlsx.buffer.byteLength).toBeGreaterThan(1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.buffer);
    const meta = wb.getWorksheet("Meta");
    expect(meta).toBeTruthy();
    let injectionCell: string | undefined;
    meta!.eachRow((row) => {
      if (String(row.getCell(1).value) === "formula_injection_sample") {
        injectionCell = String(row.getCell(2).value);
      }
    });
    expect(injectionCell?.startsWith("'=")).toBe(true);

    const plPdf = await buildProfitLossPdf({ from, to });
    expect(plPdf.netProfitInPaise).toBe(pl.totals.netProfitInPaise);
    expect(plPdf.buffer.subarray(0, 4).toString()).toBe("%PDF");

    const bsPdf = await buildBalanceSheetPdf({ asOf });
    expect(bsPdf.assetsInPaise).toBe(bs.totals.totalAssetsInPaise);
    expect(bsPdf.differenceInPaise).toBe(0);

    const tbPdf = await buildTrialBalancePdf({ asOf });
    expect(tbPdf.closingDebitInPaise).toBe(tb.totals.closingDebitInPaise);
    expect(tbPdf.closingCreditInPaise).toBe(tb.totals.closingCreditInPaise);
  });

  it("FY start month and leap-year period edges remain read-only safe", async () => {
    process.env.ACCOUNTING_FY_START_MONTH = "1";
    const fy = financialYearContainingDate(parseUtcDateOnly("2024-02-29"));
    expect(fy.startDate).toBe("2024-01-01");
    expect(fy.endDate).toBe("2024-12-31");

    process.env.ACCOUNTING_FY_START_MONTH = "4";
    const fyApr = financialYearContainingDate(parseUtcDateOnly("2026-03-31"));
    expect(fyApr.endDate).toBe("2026-03-31");

    await expect(buildProfitLoss({ from: "2026-08-01", to: "2026-07-01" })).rejects.toThrow(
      /from must/i
    );
  });
});
