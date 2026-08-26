import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupAccountingTestData,
  getAccountIdByCode,
  prisma,
  seedMinimalCoAForTests
} from "../helpers/commerce";
import { createAndPostJournal } from "../../src/modules/accounting/journal.service";
import {
  getBaseReportClass,
  presentNetAsDebitCredit,
  resolveReportClassForBalance
} from "../../src/modules/accounting/financial-statement.mapping";
import {
  currentFinancialYear,
  financialYearContainingDate,
  getAccountingFyStartMonth,
  previousFinancialYear,
  yearToDateStart
} from "../../src/modules/accounting/financial-year";
import { buildTrialBalance } from "../../src/modules/accounting/trial-balance.service";
import { buildGeneralLedger } from "../../src/modules/accounting/general-ledger.service";
import { isAccountingReportsEnabled } from "../../src/modules/accounting/accounting-flag";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";

const TAG = "TEST-ACC-FS";

describe("financial statement mapping", () => {
  it("maps special codes", () => {
    expect(getBaseReportClass("4200", "REVENUE")).toBe("CONTRA_REVENUE");
    expect(getBaseReportClass("4500", "REVENUE")).toBe("OTHER_INCOME");
    expect(getBaseReportClass("5000", "EXPENSE")).toBe("COGS");
    expect(getBaseReportClass("1000", "ASSET")).toBe("CASH");
    expect(getBaseReportClass("1010", "ASSET")).toBe("BANK");
  });

  it("flips 1210 and input GST by balance side", () => {
    expect(resolveReportClassForBalance("1210", "ASSET", 100)).toBe("PURCHASE_CLEARING_ASSET");
    expect(resolveReportClassForBalance("1210", "ASSET", -100)).toBe(
      "PURCHASE_CLEARING_LIABILITY"
    );
    expect(resolveReportClassForBalance("2200", "LIABILITY", 50)).toBe("TAX_ASSET");
    expect(resolveReportClassForBalance("2200", "LIABILITY", -50)).toBe("TAX_LIABILITY");
  });

  it("presents net on actual debit or credit side", () => {
    expect(presentNetAsDebitCredit(500)).toEqual({ debit: 500, credit: 0 });
    expect(presentNetAsDebitCredit(-500)).toEqual({ debit: 0, credit: 500 });
    expect(presentNetAsDebitCredit(0)).toEqual({ debit: 0, credit: 0 });
  });

  it("maps dynamic bank GL via hint", () => {
    expect(getBaseReportClass("9991", "ASSET", { accountType: "BANK" })).toBe("BANK");
    expect(getBaseReportClass("9992", "ASSET", { accountType: "CASH" })).toBe("CASH");
  });
});

describe("financial year helpers", () => {
  const prevMonth = process.env.ACCOUNTING_FY_START_MONTH;

  afterEach(() => {
    if (prevMonth === undefined) delete process.env.ACCOUNTING_FY_START_MONTH;
    else process.env.ACCOUNTING_FY_START_MONTH = prevMonth;
  });

  it("defaults start month to 4", () => {
    delete process.env.ACCOUNTING_FY_START_MONTH;
    expect(getAccountingFyStartMonth()).toBe(4);
  });

  it("rejects invalid FY start month", () => {
    process.env.ACCOUNTING_FY_START_MONTH = "13";
    expect(() => getAccountingFyStartMonth()).toThrow(/1–12/);
  });

  it("computes India FY containing date", () => {
    process.env.ACCOUNTING_FY_START_MONTH = "4";
    const fy = financialYearContainingDate(new Date(Date.UTC(2026, 7, 25)));
    expect(fy.startDate).toBe("2026-04-01");
    expect(fy.endDate).toBe("2027-03-31");
    expect(fy.label).toBe("FY2026-27");
    expect(yearToDateStart(new Date(Date.UTC(2026, 7, 25))).toISOString().slice(0, 10)).toBe(
      "2026-04-01"
    );
    const prev = previousFinancialYear(fy);
    expect(prev.startDate).toBe("2025-04-01");
    expect(prev.endDate).toBe("2026-03-31");
  });

  it("supports calendar FY when start month is 1", () => {
    process.env.ACCOUNTING_FY_START_MONTH = "1";
    const fy = currentFinancialYear(new Date(Date.UTC(2026, 7, 25)));
    expect(fy.startDate).toBe("2026-01-01");
    expect(fy.endDate).toBe("2026-12-31");
  });
});

describe("Phase 6B Trial Balance + General Ledger (TEST-ACC-FS)", () => {
  const prevNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const prevReports = process.env.ACCOUNTING_REPORTS_ENABLED;

  beforeAll(async () => {
    await seedAccountingChartOfAccounts();
    await seedMinimalCoAForTests();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_REPORTS_ENABLED = "1";
  });

  afterEach(() => {
    if (prevNative === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
    else process.env.NATIVE_ACCOUNTING_ENABLED = prevNative;
    if (prevReports === undefined) delete process.env.ACCOUNTING_REPORTS_ENABLED;
    else process.env.ACCOUNTING_REPORTS_ENABLED = prevReports;
  });

  async function seedFsFixture() {
    const bank = await getAccountIdByCode("1010");
    const equity = await getAccountIdByCode("3900");
    const inv = await getAccountIdByCode("1200");
    const clearing = await getAccountIdByCode("1210");
    const ap = await getAccountIdByCode("2000");
    const sales = await getAccountIdByCode("4000");
    const cogs = await getAccountIdByCode("5000");
    const expense = await getAccountIdByCode("5300");

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
        { accountId: ap, creditInPaise: 20_000_000 }
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
        { accountId: bank, debitInPaise: 11_800_000 },
        { accountId: sales, creditInPaise: 11_800_000 }
      ]
    });

    await createAndPostJournal({
      entryDate: new Date("2026-06-15"),
      memo: `${TAG} cogs`,
      lines: [
        { accountId: cogs, debitInPaise: 8_000_000 },
        { accountId: inv, creditInPaise: 8_000_000 }
      ]
    });

    await createAndPostJournal({
      entryDate: new Date("2026-07-01"),
      memo: `${TAG} expense`,
      lines: [
        { accountId: expense, debitInPaise: 100_000 },
        { accountId: bank, creditInPaise: 100_000 }
      ]
    });

    await createAndPostJournal({
      entryDate: new Date("2026-07-02"),
      memo: `${TAG} orphan journal`,
      lines: [
        { accountId: expense, debitInPaise: 50_000 },
        { accountId: bank, creditInPaise: 50_000 }
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
      entryDate: new Date("2026-07-03"),
      memo: `${TAG} dyn bank funding`,
      lines: [
        { accountId: dyn.id, debitInPaise: 1_000_000 },
        { accountId: bank, creditInPaise: 1_000_000 }
      ]
    });
  }

  it("reports flag requires native accounting", () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "0";
    process.env.ACCOUNTING_REPORTS_ENABLED = "1";
    expect(isAccountingReportsEnabled()).toBe(false);
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    expect(isAccountingReportsEnabled()).toBe(true);
  });

  it("builds balanced TB as-of with 1210 credit presentation", async () => {
    await seedFsFixture();

    const tb = await buildTrialBalance({ asOf: "2026-07-31" });
    expect(tb.balanced).toBe(true);
    expect(tb.varianceInPaise).toBe(0);
    expect(tb.integrity.status).toBe("PASS");
    expect(tb.totals.closingDebitInPaise).toBe(tb.totals.closingCreditInPaise);

    const row1210 = tb.rows.find((r) => r.accountCode === "1210");
    expect(row1210).toBeTruthy();
    expect(row1210!.closingCreditInPaise).toBe(5_000_000);
    expect(row1210!.closingDebitInPaise).toBe(0);
    expect(row1210!.reportClass).toBe("PURCHASE_CLEARING_LIABILITY");

    const bank = tb.rows.find((r) => r.accountCode === "1010");
    expect(bank!.closingDebitInPaise).toBe(
      100_000_000 + 11_800_000 - 100_000 - 50_000 - 1_000_000
    );

    const dyn = tb.rows.find((r) => r.accountCode === "9088");
    expect(dyn).toBeTruthy();
    expect(dyn!.reportClass).toBe("BANK");
    expect(dyn!.closingDebitInPaise).toBe(1_000_000);
  });

  it("computes opening / period / closing for period mode", async () => {
    await seedFsFixture();

    const tb = await buildTrialBalance({
      from: "2026-06-01",
      to: "2026-06-30"
    });
    expect(tb.balanced).toBe(true);

    const bank = tb.rows.find((r) => r.accountCode === "1010")!;
    expect(bank.openingDebitInPaise).toBe(100_000_000);
    expect(bank.periodDebitInPaise).toBe(11_800_000);
    expect(bank.periodCreditInPaise).toBe(0);
    expect(bank.closingDebitInPaise).toBe(111_800_000);

    const sales = tb.rows.find((r) => r.accountCode === "4000")!;
    expect(sales.openingDebitInPaise + sales.openingCreditInPaise).toBe(0);
    expect(sales.periodCreditInPaise).toBe(11_800_000);
    expect(sales.closingCreditInPaise).toBe(11_800_000);
  });

  it("excludes zero-balance accounts by default and includes when requested", async () => {
    await seedFsFixture();
    const tb = await buildTrialBalance({ asOf: "2026-07-31" });
    expect(tb.rows.some((r) => r.accountCode === "1100")).toBe(false);

    const tbZ = await buildTrialBalance({
      asOf: "2026-07-31",
      includeZeroBalanceAccounts: true
    });
    expect(tbZ.rows.some((r) => r.accountCode === "1100")).toBe(true);
    expect(tbZ.balanced).toBe(true);
  });

  it("GL opening + movement = closing with deterministic running balance", async () => {
    await seedFsFixture();

    const gl = await buildGeneralLedger({
      accountCode: "1010",
      from: "2026-04-01",
      to: "2026-07-31",
      limit: 50,
      offset: 0
    });

    expect(gl.openingBalanceInPaise).toBe(0);
    expect(gl.closingBalanceInPaise).toBe(
      gl.openingBalanceInPaise + gl.periodDebitInPaise - gl.periodCreditInPaise
    );
    expect(gl.lines.length).toBeGreaterThan(0);

    let running = gl.openingBalanceInPaise;
    for (const line of gl.lines) {
      running += line.debitInPaise - line.creditInPaise;
      expect(line.runningBalanceInPaise).toBe(running);
    }
    if (!gl.pagination.hasMore) {
      expect(gl.lines[gl.lines.length - 1]!.runningBalanceInPaise).toBe(gl.closingBalanceInPaise);
    }

    const orphan = gl.lines.find((l) => l.description?.includes("orphan journal"));
    expect(orphan?.orphanJournal).toBe(true);
    expect(orphan?.eventType).toBeNull();
  });

  it("GL pagination preserves running balance across pages", async () => {
    await seedFsFixture();
    const page1 = await buildGeneralLedger({
      accountCode: "1010",
      from: "2026-04-01",
      to: "2026-07-31",
      limit: 2,
      offset: 0
    });
    const page2 = await buildGeneralLedger({
      accountCode: "1010",
      from: "2026-04-01",
      to: "2026-07-31",
      limit: 2,
      offset: 2
    });
    expect(page1.lines).toHaveLength(2);
    expect(page2.lines.length).toBeGreaterThan(0);
    const expected =
      page1.lines[1]!.runningBalanceInPaise +
      page2.lines[0]!.debitInPaise -
      page2.lines[0]!.creditInPaise;
    expect(page2.lines[0]!.runningBalanceInPaise).toBe(expected);
  });

  it("GL orders by entryDate, entryNumber, sortOrder, id", async () => {
    await seedFsFixture();
    const gl = await buildGeneralLedger({
      accountCode: "1010",
      from: "2026-04-01",
      to: "2026-07-31"
    });
    for (let i = 1; i < gl.lines.length; i++) {
      const a = gl.lines[i - 1]!;
      const b = gl.lines[i]!;
      const keyA = `${a.entryDate}|${a.journalNumber}|${a.lineId}`;
      const keyB = `${b.entryDate}|${b.journalNumber}|${b.lineId}`;
      expect(keyA <= keyB).toBe(true);
    }
  });
});
