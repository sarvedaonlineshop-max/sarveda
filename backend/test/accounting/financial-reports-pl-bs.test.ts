import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupAccountingTestData,
  getAccountIdByCode,
  prisma,
  seedMinimalCoAForTests
} from "../helpers/commerce";
import { createAndPostJournal } from "../../src/modules/accounting/journal.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { buildProfitLoss } from "../../src/modules/accounting/profit-loss.service";
import { buildBalanceSheet } from "../../src/modules/accounting/balance-sheet.service";
import { buildFinancialDashboard } from "../../src/modules/accounting/financial-dashboard.service";

const TAG = "TEST-ACC-FS";

/**
 * Deterministic lifecycle (paise):
 * Opening Bank 10,00,000 + Inventory 5,00,000 / Cr 3900 15,00,000
 * Purchase clearing Dr 1210 2,00,000 / Cr AP 2,00,000
 * Capitalize Dr 1200 2,00,000 / Cr 1210 2,00,000
 * Extra Cr 1210 50,000 / Dr 3900 50,000  → 1210 credit residual
 * Sale Dr Bank 1,18,000 / Cr Sales 1,00,000 / Cr CGST 9,000 / Cr SGST 9,000
 * Discount Dr 4200 5,000 / Cr Bank 5,000
 * Shipping Cr 4100 2,000 / Dr Bank 2,000  (net bank +115k from sale net of disc/ship weird)
 * Simpler sale path:
 *   Dr Razorpay 1,00,000 / Cr 4000 1,00,000
 *   Dr 4200 5,000 / Cr 4000 wait no — discount is separate debit to 4200 and reduce clearing
 * Spec example:
 *   Product revenue 1,00,000, COGS 40,000, opex 10,000, charge 500, interest 1,000
 */
async function seedFsPlBsFixture() {
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

  // Purchase with input GST
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
  // 1210 credit residual
  await createAndPostJournal({
    entryDate: new Date("2026-05-12"),
    memo: `${TAG} clearing credit residual`,
    lines: [
      { accountId: clearing, creditInPaise: 5_000_000 },
      { accountId: equity, debitInPaise: 5_000_000 }
    ]
  });

  // Sale: revenue 1,00,000 + GST 18,000 → clearing
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
  // Discount 5,000 contra
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} discount`,
    lines: [
      { accountId: disc, debitInPaise: 5_000_00 },
      { accountId: clearingGw, creditInPaise: 5_000_00 }
    ]
  });
  // Shipping 2,000
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} shipping`,
    lines: [
      { accountId: clearingGw, debitInPaise: 2_000_00 },
      { accountId: ship, creditInPaise: 2_000_00 }
    ]
  });
  // COGS 40,000
  await createAndPostJournal({
    entryDate: new Date("2026-06-15"),
    memo: `${TAG} cogs`,
    lines: [
      { accountId: cogs, debitInPaise: 40_000_00 },
      { accountId: inv, creditInPaise: 40_000_00 }
    ]
  });
  // Opex 10,000
  await createAndPostJournal({
    entryDate: new Date("2026-07-01"),
    memo: `${TAG} opex`,
    lines: [
      { accountId: opex, debitInPaise: 10_000_00 },
      { accountId: bank, creditInPaise: 10_000_00 }
    ]
  });
  // Bank charge 500
  await createAndPostJournal({
    entryDate: new Date("2026-07-02"),
    memo: `${TAG} bank charge`,
    lines: [
      { accountId: bankCh, debitInPaise: 50_000 },
      { accountId: bank, creditInPaise: 50_000 }
    ]
  });
  // Interest 1,000
  await createAndPostJournal({
    entryDate: new Date("2026-07-03"),
    memo: `${TAG} interest`,
    lines: [
      { accountId: bank, debitInPaise: 100_000 },
      { accountId: interest, creditInPaise: 100_000 }
    ]
  });
  // COD AR sample
  await createAndPostJournal({
    entryDate: new Date("2026-07-04"),
    memo: `${TAG} cod ar`,
    lines: [
      { accountId: ar, debitInPaise: 1_000_00 },
      { accountId: sales, creditInPaise: 1_000_00 }
    ]
  });

  const dyn = await prisma.accountingAccount.upsert({
    where: { code: "9088" },
    create: {
      code: "9088",
      name: `${TAG}-DYN-BANK`,
      type: "ASSET",
      isSystem: false,
      isActive: true
    },
    update: { name: `${TAG}-DYN-BANK`, isActive: true }
  });
  await prisma.accountingBankAccount.create({
    data: {
      name: `${TAG}-HDFC`,
      glAccountCode: "9088",
      accountType: "BANK",
      currency: "INR",
      isActive: true,
      isDefault: false
    }
  });
  await createAndPostJournal({
    entryDate: new Date("2026-07-05"),
    memo: `${TAG} dyn bank`,
    lines: [
      { accountId: dyn.id, debitInPaise: 500_000 },
      { accountId: bank, creditInPaise: 500_000 }
    ]
  });
}

/** Expected P&L 2026-04-01 → 2026-07-31 (paise) */
const EXPECTED = {
  grossSales: 100_000_00 + 1_000_00, // sale + COD
  discounts: 5_000_00,
  shipping: 2_000_00,
  // net product = 10100000 - 500000 = 9600000; + shipping 200000 = 9800000 operating
  cogs: 40_000_00,
  opex: 10_000_00 + 50_000, // 5300 + 5390
  otherIncome: 100_000,
  // net = 9800000 - 4000000 - 1050000 + 100000 = 4850000
};

describe("Phase 6C Profit & Loss / Balance Sheet / Dashboard", () => {
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

  it("computes exact P&L with contra, COGS, opex, other income + integrity", async () => {
    await seedFsPlBsFixture();
    const pl = await buildProfitLoss({
      from: "2026-04-01",
      to: "2026-07-31",
      includeComparison: true
    });

    expect(pl.totals.grossProductSalesInPaise).toBe(EXPECTED.grossSales);
    expect(pl.totals.discountsInPaise).toBe(EXPECTED.discounts);
    expect(pl.totals.shippingRevenueInPaise).toBe(EXPECTED.shipping);
    expect(pl.totals.netProductSalesInPaise).toBe(
      EXPECTED.grossSales - EXPECTED.discounts
    );
    expect(pl.totals.totalOperatingRevenueInPaise).toBe(
      EXPECTED.grossSales - EXPECTED.discounts + EXPECTED.shipping
    );
    expect(pl.totals.cogsInPaise).toBe(EXPECTED.cogs);
    expect(pl.totals.grossProfitInPaise).toBe(
      EXPECTED.grossSales - EXPECTED.discounts + EXPECTED.shipping - EXPECTED.cogs
    );
    expect(pl.totals.operatingExpensesInPaise).toBe(EXPECTED.opex);
    expect(pl.totals.otherIncomeInPaise).toBe(EXPECTED.otherIncome);
    const expectedNet =
      EXPECTED.grossSales -
      EXPECTED.discounts +
      EXPECTED.shipping -
      EXPECTED.cogs -
      EXPECTED.opex +
      EXPECTED.otherIncome;
    expect(pl.totals.netProfitInPaise).toBe(expectedNet);
    expect(pl.integrity.status).toBe("PASS");
    expect(pl.integrity.varianceInPaise).toBe(0);
    expect(pl.totals.grossMarginPercent).not.toBeNull();
    expect(pl.comparison?.previousPeriod).toBeTruthy();
    expect(pl.comparison?.ytd?.from).toBe("2026-04-01");
  });

  it("handles zero revenue margin safely", async () => {
    await seedFsPlBsFixture();
    const pl = await buildProfitLoss({ from: "2025-04-01", to: "2025-04-30" });
    expect(pl.totals.totalOperatingRevenueInPaise).toBe(0);
    expect(pl.totals.grossMarginPercent).toBeNull();
  });

  it("builds balanced BS with 1210 credit liability and current earnings", async () => {
    await seedFsPlBsFixture();
    const bs = await buildBalanceSheet({ asOf: "2026-07-31" });

    expect(bs.totals.balanced).toBe(true);
    expect(bs.integrity.status).toBe("PASS");
    expect(bs.totals.differenceInPaise).toBe(0);

    const clearingCr = bs.sections.liabilities.find((l) => l.key === "clearing-cr");
    expect(clearingCr).toBeTruthy();
    expect(clearingCr!.amountInPaise).toBe(5_000_000);

    const itc = bs.sections.assets.filter((l) => l.key.startsWith("itc-"));
    expect(itc.length).toBeGreaterThan(0);

    const outGst = bs.sections.liabilities.filter((l) => l.key.startsWith("out-gst-"));
    expect(outGst.length).toBe(2);

    const dyn = bs.sections.assets
      .flatMap((l) => l.children ?? [l])
      .find((l) => l.accountCodes.includes("9088"));
    expect(dyn).toBeTruthy();

    expect(bs.earnings.currentFyFrom).toBe("2026-04-01");
    expect(bs.earnings.currentFyEarningsInPaise).toBe(
      (
        await buildProfitLoss({ from: "2026-04-01", to: "2026-07-31" })
      ).totals.netProfitInPaise
    );

    // 3100 unchanged — no journal lines
    const re = await prisma.accountingJournalLine.count({
      where: { account: { code: "3100" } }
    });
    expect(re).toBe(0);

    expect(bs.disclosures.arSubledger).toBe("AR_SUBLEDGER_DATA_GAP");
  });

  it("1210 debit presents as asset", async () => {
    const bank = await getAccountIdByCode("1010");
    const clearing = await getAccountIdByCode("1210");
    await createAndPostJournal({
      entryDate: new Date("2026-06-01"),
      memo: `${TAG} clearing debit only`,
      lines: [
        { accountId: clearing, debitInPaise: 3_000_000 },
        { accountId: bank, creditInPaise: 3_000_000 }
      ]
    });
    const bs = await buildBalanceSheet({ asOf: "2026-06-30" });
    const asset = bs.sections.assets.find((l) => l.key === "clearing-dr");
    expect(asset?.amountInPaise).toBe(3_000_000);
    expect(bs.sections.liabilities.find((l) => l.key === "clearing-cr")).toBeFalsy();
    expect(bs.totals.balanced).toBe(true);
  });

  it("respects non-April FY start for current earnings", async () => {
    await seedFsPlBsFixture();
    process.env.ACCOUNTING_FY_START_MONTH = "1";
    const bs = await buildBalanceSheet({ asOf: "2026-07-31" });
    expect(bs.fy.startDate).toBe("2026-01-01");
    expect(bs.earnings.currentFyFrom).toBe("2026-01-01");
  });

  it("dashboard reconciles to P&L and BS services", async () => {
    await seedFsPlBsFixture();
    const dash = await buildFinancialDashboard({
      from: "2026-04-01",
      to: "2026-07-31",
      asOf: "2026-07-31"
    });
    const pl = await buildProfitLoss({ from: "2026-04-01", to: "2026-07-31" });
    const bs = await buildBalanceSheet({ asOf: "2026-07-31" });

    expect(dash.profitAndLoss.netProfitInPaise).toBe(pl.totals.netProfitInPaise);
    expect(dash.profitAndLoss.cogsInPaise).toBe(pl.totals.cogsInPaise);
    expect(dash.balanceSheet.balanced).toBe(bs.totals.balanced);
    expect(dash.balanceSheet.inventoryInPaise).toBe(
      bs.sections.assets.find((l) => l.key === "inventory")?.amountInPaise ?? 0
    );
    expect(dash.links.profitLoss.from).toBe("2026-04-01");
  });

  it("as-of before FY activity yields zero current earnings when no FY posts", async () => {
    await seedFsPlBsFixture();
    // asOf before openings still includes openings in BS; earnings FY starts Apr 1
    const bs = await buildBalanceSheet({ asOf: "2026-03-31" });
    expect(bs.earnings.currentFyEarningsInPaise).toBe(0);
    // Prior unclosed may include nothing before Apr if openings are Apr 1
    expect(bs.totals.balanced).toBe(true);
  });
});
