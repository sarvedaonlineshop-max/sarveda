import { buildProfitLoss } from "./profit-loss.service";
import { buildBalanceSheet } from "./balance-sheet.service";
import {
  financialYearContainingDate,
  parseUtcDateOnly
} from "./financial-year";

export type FinancialDashboardReport = {
  period: { from: string; to: string };
  asOf: string;
  fy: { label: string; startDate: string; endDate: string };
  profitAndLoss: {
    revenueInPaise: number;
    netRevenueInPaise: number;
    cogsInPaise: number;
    grossProfitInPaise: number;
    grossMarginPercent: number | null;
    operatingExpensesInPaise: number;
    netProfitInPaise: number;
  };
  balanceSheet: {
    cashAndBankInPaise: number;
    accountsReceivableInPaise: number;
    accountsPayableInPaise: number;
    inventoryInPaise: number;
    gatewayClearingInPaise: number;
    inputGstAssetInPaise: number;
    outputGstLiabilityInPaise: number;
    balanced: boolean;
  };
  comparison: {
    previousPeriodNetProfitInPaise: number | null;
    ytdNetProfitInPaise: number | null;
  };
  links: {
    profitLoss: { from: string; to: string };
    balanceSheet: { asOf: string };
    trialBalance: { asOf: string };
  };
  disclosures: string[];
};

function sumLines(
  lines: Array<{ amountInPaise: number; accountCodes: string[]; key: string }>,
  pred: (l: { key: string; accountCodes: string[] }) => boolean
): number {
  return lines.filter(pred).reduce((s, l) => s + l.amountInPaise, 0);
}

/**
 * Management dashboard — all figures from P&L / BS services (same GL authority).
 */
export async function buildFinancialDashboard(input: {
  from: string;
  to: string;
  asOf?: string;
}): Promise<FinancialDashboardReport> {
  if (!input.from?.trim() || !input.to?.trim()) {
    throw new Error("from and to (YYYY-MM-DD) required");
  }
  const from = input.from.trim();
  const to = input.to.trim();
  const asOf = (input.asOf ?? to).trim();
  parseUtcDateOnly(from);
  parseUtcDateOnly(to);
  parseUtcDateOnly(asOf);

  const [pl, bs] = await Promise.all([
    buildProfitLoss({ from, to, includeComparison: true }),
    buildBalanceSheet({ asOf, includeComparison: false })
  ]);

  const assets = bs.sections.assets;
  const liabilities = bs.sections.liabilities;

  const cashAndBank =
    sumLines(assets, (l) => l.key === "cash" || l.key === "bank") ||
    sumLines(assets, (l) => l.key.startsWith("cash-") || l.key.startsWith("bank-"));

  // Prefer header totals
  const cashHeader = assets.find((l) => l.key === "cash");
  const bankHeader = assets.find((l) => l.key === "bank");
  const cashBankTotal =
    (cashHeader?.amountInPaise ?? 0) + (bankHeader?.amountInPaise ?? 0) || cashAndBank;

  const ar = assets.find((l) => l.key === "ar")?.amountInPaise ?? 0;
  const inv = assets.find((l) => l.key === "inventory")?.amountInPaise ?? 0;
  const gateway = assets
    .filter((l) => l.key.startsWith("gw-"))
    .reduce((s, l) => s + l.amountInPaise, 0);
  const inputGst = assets
    .filter((l) => l.key.startsWith("itc-"))
    .reduce((s, l) => s + l.amountInPaise, 0);
  const outputGst = liabilities
    .filter((l) => l.key.startsWith("out-gst-"))
    .reduce((s, l) => s + l.amountInPaise, 0);
  const ap = liabilities.find((l) => l.key === "ap")?.amountInPaise ?? 0;

  const fy = financialYearContainingDate(parseUtcDateOnly(asOf));

  return {
    period: { from, to },
    asOf,
    fy: { label: fy.label, startDate: fy.startDate, endDate: fy.endDate },
    profitAndLoss: {
      revenueInPaise: pl.totals.grossProductSalesInPaise,
      netRevenueInPaise: pl.totals.totalOperatingRevenueInPaise,
      cogsInPaise: pl.totals.cogsInPaise,
      grossProfitInPaise: pl.totals.grossProfitInPaise,
      grossMarginPercent: pl.totals.grossMarginPercent,
      operatingExpensesInPaise: pl.totals.operatingExpensesInPaise,
      netProfitInPaise: pl.totals.netProfitInPaise
    },
    balanceSheet: {
      cashAndBankInPaise: cashBankTotal,
      accountsReceivableInPaise: ar,
      accountsPayableInPaise: ap,
      inventoryInPaise: inv,
      gatewayClearingInPaise: gateway,
      inputGstAssetInPaise: inputGst,
      outputGstLiabilityInPaise: outputGst,
      balanced: bs.totals.balanced
    },
    comparison: {
      previousPeriodNetProfitInPaise:
        pl.comparison?.previousPeriod?.netProfitInPaise ?? null,
      ytdNetProfitInPaise: pl.comparison?.ytd?.netProfitInPaise ?? null
    },
    links: {
      profitLoss: { from, to },
      balanceSheet: { asOf },
      trialBalance: { asOf }
    },
    disclosures: [
      "Figures from POSTED GL only via P&L/BS services",
      bs.disclosures.arSubledger,
      ...bs.disclosures.warnings
    ]
  };
}
