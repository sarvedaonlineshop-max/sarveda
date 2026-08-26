import type { AccountingAccountType } from "@prisma/client";

import {
  resolveReportClassForBalance,
  type BankGlHint,
  type FinancialReportClass
} from "./financial-statement.mapping";
import { buildTrialBalance, type TrialBalanceRow } from "./trial-balance.service";
import { prisma } from "../../config/db";
import {
  financialYearContainingDate,
  formatUtcDateOnly,
  parseUtcDateOnly
} from "./financial-year";

export type StatementLine = {
  key: string;
  label: string;
  kind: "line" | "subtotal" | "total" | "header";
  /** Normalized management amount in paise (positive = usual statement direction). */
  amountInPaise: number;
  /** Signed GL net debit − credit for the period/as-of (audit). */
  signedNetInPaise: number | null;
  accountCodes: string[];
  reportClass?: FinancialReportClass;
  children?: StatementLine[];
  warning?: string | null;
};

export type ProfitLossReport = {
  from: string;
  to: string;
  currency: "INR";
  sections: {
    revenue: StatementLine[];
    cogs: StatementLine[];
    operatingExpenses: StatementLine[];
    otherIncome: StatementLine[];
    otherExpenses: StatementLine[];
  };
  totals: {
    grossProductSalesInPaise: number;
    discountsInPaise: number;
    netProductSalesInPaise: number;
    shippingRevenueInPaise: number;
    totalOperatingRevenueInPaise: number;
    cogsInPaise: number;
    grossProfitInPaise: number;
    grossMarginPercent: number | null;
    operatingExpensesInPaise: number;
    operatingProfitInPaise: number;
    otherIncomeInPaise: number;
    otherExpensesInPaise: number;
    netProfitInPaise: number;
  };
  integrity: {
    code: "PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS";
    status: "PASS" | "FAIL";
    temporaryAccountsNetInPaise: number;
    varianceInPaise: number;
  };
  comparison?: {
    previousPeriod: { from: string; to: string; netProfitInPaise: number } | null;
    ytd: { from: string; to: string; netProfitInPaise: number } | null;
  };
  drillDown: {
    type: "GL_PERIOD";
  };
};

function periodSignedNet(row: TrialBalanceRow): number {
  return row.periodDebitInPaise - row.periodCreditInPaise;
}

/** Earnings contribution: credit − debit (positive increases equity / profit). */
function earningsContributionFromSignedNet(signedDebitMinusCredit: number): number {
  return -signedDebitMinusCredit;
}

async function loadBankHints(): Promise<Map<string, BankGlHint>> {
  const banks = await prisma.accountingBankAccount.findMany({
    select: { glAccountCode: true, accountType: true }
  });
  const map = new Map<string, BankGlHint>();
  for (const b of banks) {
    map.set(b.glAccountCode, {
      accountType: b.accountType === "CASH" ? "CASH" : "BANK"
    });
  }
  return map;
}

function classifyPeriodRow(
  row: TrialBalanceRow,
  bankHints: Map<string, BankGlHint>
): FinancialReportClass {
  const signed = periodSignedNet(row);
  return resolveReportClassForBalance(
    row.accountCode,
    row.accountType,
    signed,
    bankHints.get(row.accountCode) ?? null
  );
}

function previousComparablePeriod(from: string, to: string): { from: string; to: string } {
  const fromD = parseUtcDateOnly(from);
  const toD = parseUtcDateOnly(to);
  const days =
    Math.round((toD.getTime() - fromD.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const prevTo = new Date(fromD.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    from: formatUtcDateOnly(prevFrom),
    to: formatUtcDateOnly(prevTo)
  };
}

/**
 * Build P&L from POSTED period movements via Trial Balance period columns.
 */
export async function buildProfitLoss(input: {
  from: string;
  to: string;
  includeComparison?: boolean;
}): Promise<ProfitLossReport> {
  if (!input.from?.trim() || !input.to?.trim()) {
    throw new Error("from and to (YYYY-MM-DD) required");
  }
  const from = input.from.trim();
  const to = input.to.trim();
  const fromD = parseUtcDateOnly(from);
  const toD = parseUtcDateOnly(to);
  if (fromD.getTime() > toD.getTime()) {
    throw new Error("from must be on or before to");
  }

  const bankHints = await loadBankHints();
  const tb = await buildTrialBalance({ from, to, includeZeroBalanceAccounts: true });

  const byCode = new Map(tb.rows.map((r) => [r.accountCode, r]));

  const movement = (code: string) => {
    const row = byCode.get(code);
    if (!row) return { signed: 0, debit: 0, credit: 0 };
    return {
      signed: periodSignedNet(row),
      debit: row.periodDebitInPaise,
      credit: row.periodCreditInPaise
    };
  };

  // Revenue: 4000 credit → positive sales
  const sales = movement("4000");
  const grossProductSales = -sales.signed; // credit net → positive
  const disc = movement("4200");
  const discounts = disc.signed; // debit net → positive discount
  const netProductSales = grossProductSales - discounts;
  const ship = movement("4100");
  const shippingRevenue = -ship.signed;
  const totalOperatingRevenue = netProductSales + shippingRevenue;

  const cogsM = movement("5000");
  const cogs = cogsM.signed; // debit → positive COGS
  const grossProfit = totalOperatingRevenue - cogs;
  const grossMarginPercent =
    totalOperatingRevenue === 0
      ? null
      : Math.round((grossProfit / totalOperatingRevenue) * 10000) / 100;

  // Normalize -0 from arithmetic
  const nz = (n: number) => (Object.is(n, -0) ? 0 : n);

  // Operating expenses: all EXPENSE report-class except mapped elsewhere
  const opexRows = tb.rows.filter((r) => {
    const rc = classifyPeriodRow(r, bankHints);
    return rc === "EXPENSE" && periodSignedNet(r) !== 0;
  });
  const opexChildren: StatementLine[] = opexRows
    .map((r) => {
      const signed = periodSignedNet(r);
      return {
        key: `opex-${r.accountCode}`,
        label: r.accountName,
        kind: "line" as const,
        amountInPaise: signed,
        signedNetInPaise: signed,
        accountCodes: [r.accountCode],
        reportClass: "EXPENSE" as const
      };
    })
    .sort((a, b) => a.accountCodes[0]!.localeCompare(b.accountCodes[0]!));
  const operatingExpenses = opexChildren.reduce((s, l) => s + l.amountInPaise, 0);
  const operatingProfit = grossProfit - operatingExpenses;

  const otherIncRows = tb.rows.filter((r) => {
    const rc = classifyPeriodRow(r, bankHints);
    return rc === "OTHER_INCOME" && periodSignedNet(r) !== 0;
  });
  const otherIncChildren = otherIncRows.map((r) => {
    const signed = periodSignedNet(r);
    return {
      key: `oi-${r.accountCode}`,
      label: r.accountName,
      kind: "line" as const,
      amountInPaise: -signed,
      signedNetInPaise: signed,
      accountCodes: [r.accountCode],
      reportClass: "OTHER_INCOME" as const
    };
  });
  const otherIncome = otherIncChildren.reduce((s, l) => s + l.amountInPaise, 0);

  const otherExpRows = tb.rows.filter((r) => {
    const rc = classifyPeriodRow(r, bankHints);
    return rc === "OTHER_EXPENSE" && periodSignedNet(r) !== 0;
  });
  const otherExpChildren = otherExpRows.map((r) => {
    const signed = periodSignedNet(r);
    return {
      key: `oe-${r.accountCode}`,
      label: r.accountName,
      kind: "line" as const,
      amountInPaise: signed,
      signedNetInPaise: signed,
      accountCodes: [r.accountCode],
      reportClass: "OTHER_EXPENSE" as const
    };
  });
  const otherExpenses = otherExpChildren.reduce((s, l) => s + l.amountInPaise, 0);

  const netProfit = operatingProfit + otherIncome - otherExpenses;

  // Integrity: all REVENUE/EXPENSE CoA types are temporary (incl. 4200/4500/5000).
  // Contribution = credit − debit = −(debit − credit).
  let temporaryNet = 0;
  for (const r of tb.rows) {
    if (r.accountType !== "REVENUE" && r.accountType !== "EXPENSE") continue;
    temporaryNet += earningsContributionFromSignedNet(periodSignedNet(r));
  }

  const variance = netProfit - temporaryNet;

  const revenueSection: StatementLine[] = [
    {
      key: "gross-sales",
      label: "Gross Product Sales",
      kind: "line",
      amountInPaise: grossProductSales,
      signedNetInPaise: sales.signed,
      accountCodes: ["4000"],
      reportClass: "REVENUE"
    },
    {
      key: "discounts",
      label: "Less: Discounts / Contra Revenue",
      kind: "line",
      amountInPaise: discounts,
      signedNetInPaise: disc.signed,
      accountCodes: ["4200"],
      reportClass: "CONTRA_REVENUE"
    },
    {
      key: "net-product-sales",
      label: "Net Product Sales",
      kind: "subtotal",
      amountInPaise: netProductSales,
      signedNetInPaise: null,
      accountCodes: ["4000", "4200"]
    },
    {
      key: "shipping",
      label: "Shipping Revenue",
      kind: "line",
      amountInPaise: shippingRevenue,
      signedNetInPaise: ship.signed,
      accountCodes: ["4100"],
      reportClass: "REVENUE"
    },
    {
      key: "total-op-rev",
      label: "Total Operating Revenue",
      kind: "total",
      amountInPaise: totalOperatingRevenue,
      signedNetInPaise: null,
      accountCodes: ["4000", "4200", "4100"]
    }
  ];

  const cogsSection: StatementLine[] = [
    {
      key: "cogs",
      label: "Cost of Goods Sold",
      kind: "line",
      amountInPaise: cogs,
      signedNetInPaise: cogsM.signed,
      accountCodes: ["5000"],
      reportClass: "COGS"
    },
    {
      key: "gross-profit",
      label: "Gross Profit",
      kind: "total",
      amountInPaise: grossProfit,
      signedNetInPaise: null,
      accountCodes: ["4000", "4200", "4100", "5000"]
    }
  ];

  const opexSection: StatementLine[] = [
    {
      key: "opex-group",
      label: "Operating Expenses",
      kind: "header",
      amountInPaise: operatingExpenses,
      signedNetInPaise: null,
      accountCodes: opexChildren.flatMap((c) => c.accountCodes),
      children: opexChildren
    },
    {
      key: "operating-profit",
      label: "Operating Profit",
      kind: "total",
      amountInPaise: operatingProfit,
      signedNetInPaise: null,
      accountCodes: []
    }
  ];

  let comparison: ProfitLossReport["comparison"];
  if (input.includeComparison) {
    const prev = previousComparablePeriod(from, to);
    const prevPl = await buildProfitLoss({ from: prev.from, to: prev.to, includeComparison: false });
    const fy = financialYearContainingDate(toD);
    const ytdFrom = fy.startDate;
    const ytdTo = to;
    const ytdPl =
      ytdFrom <= ytdTo
        ? await buildProfitLoss({ from: ytdFrom, to: ytdTo, includeComparison: false })
        : null;
    comparison = {
      previousPeriod: {
        from: prev.from,
        to: prev.to,
        netProfitInPaise: prevPl.totals.netProfitInPaise
      },
      ytd: ytdPl
        ? { from: ytdFrom, to: ytdTo, netProfitInPaise: ytdPl.totals.netProfitInPaise }
        : null
    };
  }

  return {
    from,
    to,
    currency: "INR",
    sections: {
      revenue: revenueSection,
      cogs: cogsSection,
      operatingExpenses: opexSection,
      otherIncome: [
        ...otherIncChildren,
        {
          key: "other-income-total",
          label: "Other Income",
          kind: "subtotal",
          amountInPaise: otherIncome,
          signedNetInPaise: null,
          accountCodes: otherIncChildren.flatMap((c) => c.accountCodes)
        }
      ],
      otherExpenses: [
        ...otherExpChildren,
        {
          key: "net-profit",
          label: "Net Profit / (Loss)",
          kind: "total",
          amountInPaise: netProfit,
          signedNetInPaise: null,
          accountCodes: []
        }
      ]
    },
    totals: {
      grossProductSalesInPaise: nz(grossProductSales),
      discountsInPaise: nz(discounts),
      netProductSalesInPaise: nz(netProductSales),
      shippingRevenueInPaise: nz(shippingRevenue),
      totalOperatingRevenueInPaise: nz(totalOperatingRevenue),
      cogsInPaise: nz(cogs),
      grossProfitInPaise: nz(grossProfit),
      grossMarginPercent,
      operatingExpensesInPaise: nz(operatingExpenses),
      operatingProfitInPaise: nz(operatingProfit),
      otherIncomeInPaise: nz(otherIncome),
      otherExpensesInPaise: nz(otherExpenses),
      netProfitInPaise: nz(netProfit)
    },
    integrity: {
      code: "PL_NET_PROFIT_RECONCILES_TO_TEMPORARY_ACCOUNTS",
      status: variance === 0 ? "PASS" : "FAIL",
      temporaryAccountsNetInPaise: temporaryNet,
      varianceInPaise: variance
    },
    comparison,
    drillDown: { type: "GL_PERIOD" }
  };
}

/** Net profit only (for BS current earnings / comparisons). */
export async function computeNetProfitForPeriod(from: string, to: string): Promise<number> {
  const pl = await buildProfitLoss({ from, to, includeComparison: false });
  return pl.totals.netProfitInPaise;
}

export { previousComparablePeriod, loadBankHints, periodSignedNet, earningsContributionFromSignedNet };
