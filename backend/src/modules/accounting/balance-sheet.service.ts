import { resolveReportClassForBalance } from "./financial-statement.mapping";
import {
  buildTrialBalance,
  type TrialBalanceRow
} from "./trial-balance.service";
import {
  computeNetProfitForPeriod,
  loadBankHints,
  type StatementLine
} from "./profit-loss.service";
import {
  financialYearContainingDate,
  parseUtcDateOnly
} from "./financial-year";

export type BalanceSheetReport = {
  asOf: string;
  currency: "INR";
  fy: {
    startDate: string;
    endDate: string;
    label: string;
  };
  earnings: {
    /** P&L from FY start through asOf */
    currentFyFrom: string;
    currentFyTo: string;
    currentFyEarningsInPaise: number;
    /**
     * Temporary-account net from inception through day before FY start.
     * Needed because 3100 is unused and no year-end close exists (Phase 6A Option A).
     */
    priorUnclosedFrom: string | null;
    priorUnclosedTo: string | null;
    priorUnclosedEarningsInPaise: number;
    formula: string;
  };
  sections: {
    assets: StatementLine[];
    liabilities: StatementLine[];
    equity: StatementLine[];
  };
  totals: {
    totalAssetsInPaise: number;
    totalLiabilitiesInPaise: number;
    totalEquityInPaise: number;
    differenceInPaise: number;
    balanced: boolean;
  };
  integrity: {
    code: "BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY";
    status: "PASS" | "FAIL";
    varianceInPaise: number;
  };
  disclosures: {
    arSubledger: "AR_SUBLEDGER_DATA_GAP";
    warnings: string[];
  };
  comparison?: {
    priorAsOf: string;
    totalAssetsInPaise: number;
    totalLiabilitiesInPaise: number;
    totalEquityInPaise: number;
  } | null;
};

function closingSigned(row: TrialBalanceRow): number {
  return row.closingNetInPaise;
}

function dayBefore(ymd: string): string | null {
  const d = parseUtcDateOnly(ymd);
  const prev = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  if (prev.getUTCFullYear() < 1970) return null;
  return prev.toISOString().slice(0, 10);
}

function line(
  key: string,
  label: string,
  amount: number,
  codes: string[],
  opts?: Partial<StatementLine>
): StatementLine {
  return {
    key,
    label,
    kind: opts?.kind ?? "line",
    amountInPaise: amount,
    signedNetInPaise: opts?.signedNetInPaise ?? null,
    accountCodes: codes,
    reportClass: opts?.reportClass,
    children: opts?.children,
    warning: opts?.warning ?? null
  };
}

/**
 * Balance Sheet as-of from POSTED GL closing balances (via Trial Balance as-of)
 * plus dynamic current FY earnings and prior unclosed temporary earnings.
 *
 * Equity presentation:
 *   Posted equity accounts (3000/3100/3900) at credit balances
 * + Prior Unclosed Earnings (temp accounts before FY start)
 * + Current FY Earnings (P&L FY start → asOf)
 *
 * No closing journals; 3100 unchanged.
 */
export async function buildBalanceSheet(input: {
  asOf: string;
  includeComparison?: boolean;
}): Promise<BalanceSheetReport> {
  if (!input.asOf?.trim()) {
    throw new Error("asOf (YYYY-MM-DD) required");
  }
  const asOf = input.asOf.trim();
  const asOfD = parseUtcDateOnly(asOf);
  const fy = financialYearContainingDate(asOfD);
  const bankHints = await loadBankHints();

  const tb = await buildTrialBalance({ asOf, includeZeroBalanceAccounts: true });
  const byCode = new Map(tb.rows.map((r) => [r.accountCode, r]));

  const signedOf = (code: string) => byCode.get(code)?.closingNetInPaise ?? 0;

  // --- Current FY earnings ---
  const fyStart = fy.startDate;
  let currentFyEarnings = 0;
  if (fyStart <= asOf) {
    currentFyEarnings = await computeNetProfitForPeriod(fyStart, asOf);
  }

  // --- Prior unclosed earnings (inception → day before FY start) ---
  const priorTo = dayBefore(fyStart);
  let priorUnclosed = 0;
  if (priorTo) {
    // Use P&L from earliest practical date through priorTo
    priorUnclosed = await computeNetProfitForPeriod("1970-01-01", priorTo);
  }

  const warnings: string[] = [];

  // --- Assets ---
  const assetLines: StatementLine[] = [];
  const cashChildren: StatementLine[] = [];
  const bankChildren: StatementLine[] = [];

  for (const r of tb.rows) {
    const signed = closingSigned(r);
    if (signed === 0) continue;
    const hint = bankHints.get(r.accountCode) ?? null;
    const rc = resolveReportClassForBalance(r.accountCode, r.accountType, signed, hint);

    if (rc === "CASH" || (r.accountCode === "1000" && signed > 0)) {
      cashChildren.push(
        line(`cash-${r.accountCode}`, r.accountName, signed, [r.accountCode], {
          signedNetInPaise: signed,
          reportClass: "CASH"
        })
      );
    } else if (rc === "BANK" || (r.accountCode === "1010" && signed !== 0)) {
      const amt = signed > 0 ? signed : signed;
      bankChildren.push(
        line(`bank-${r.accountCode}`, r.accountName, amt, [r.accountCode], {
          signedNetInPaise: signed,
          reportClass: "BANK",
          warning: signed < 0 ? "Bank GL has credit balance" : null
        })
      );
    }
  }

  const cashTotal = cashChildren.reduce((s, l) => s + l.amountInPaise, 0);
  const bankTotal = bankChildren.reduce((s, l) => s + l.amountInPaise, 0);
  if (cashChildren.length) {
    assetLines.push(
      line("cash", "Cash", cashTotal, cashChildren.flatMap((c) => c.accountCodes), {
        kind: "header",
        children: cashChildren,
        reportClass: "CASH"
      })
    );
  }
  if (bankChildren.length) {
    assetLines.push(
      line("bank", "Bank", bankTotal, bankChildren.flatMap((c) => c.accountCodes), {
        kind: "header",
        children: bankChildren,
        reportClass: "BANK"
      })
    );
  }

  // Gateway clearing 1020-1022
  for (const code of ["1020", "1021", "1022"] as const) {
    const row = byCode.get(code);
    if (!row || row.closingNetInPaise === 0) continue;
    const signed = row.closingNetInPaise;
    if (signed > 0) {
      assetLines.push(
        line(`gw-${code}`, row.accountName, signed, [code], {
          signedNetInPaise: signed,
          reportClass: "ASSET"
        })
      );
    } else {
      warnings.push(`${code} has credit balance — shown under liabilities`);
    }
  }

  // AR
  const ar = signedOf("1100");
  if (ar !== 0) {
    assetLines.push(
      line("ar", "Accounts Receivable", ar, ["1100"], {
        signedNetInPaise: ar,
        reportClass: "ASSET",
        warning: ar < 0 ? "AR has credit balance" : null
      })
    );
  }

  // Inventory 1200
  const inv = signedOf("1200");
  if (inv !== 0) {
    assetLines.push(
      line("inventory", "Inventory Asset", inv, ["1200"], {
        signedNetInPaise: inv,
        reportClass: "ASSET",
        warning: inv < 0 ? "Inventory has credit balance" : null
      })
    );
  }

  // 1210 debit → asset
  const c1210 = signedOf("1210");
  if (c1210 > 0) {
    assetLines.push(
      line("clearing-dr", "Inventory Purchases Clearing", c1210, ["1210"], {
        signedNetInPaise: c1210,
        reportClass: "PURCHASE_CLEARING_ASSET"
      })
    );
  }

  // Input GST debit → asset
  for (const code of ["2200", "2201", "2202"]) {
    const s = signedOf(code);
    if (s > 0) {
      const row = byCode.get(code)!;
      assetLines.push(
        line(`itc-${code}`, `${row.accountName} (Recoverable)`, s, [code], {
          signedNetInPaise: s,
          reportClass: "TAX_ASSET"
        })
      );
    }
  }

  // Other ASSET-class (non-bank, non-cash, non-clearing/gst/ar/inv already handled)
  const handledAsset = new Set([
    "1000",
    "1010",
    "1020",
    "1021",
    "1022",
    "1100",
    "1200",
    "1210",
    "2200",
    "2201",
    "2202",
    ...cashChildren.flatMap((c) => c.accountCodes),
    ...bankChildren.flatMap((c) => c.accountCodes)
  ]);

  for (const r of tb.rows) {
    if (handledAsset.has(r.accountCode)) continue;
    if (r.accountType !== "ASSET") continue;
    const signed = closingSigned(r);
    if (signed === 0) continue;
    const hint = bankHints.get(r.accountCode) ?? null;
    const rc = resolveReportClassForBalance(r.accountCode, r.accountType, signed, hint);
    if (rc === "CASH" || rc === "BANK") continue;
    if (rc === "PURCHASE_CLEARING_LIABILITY" || rc === "TAX_LIABILITY") continue;
    assetLines.push(
      line(`asset-${r.accountCode}`, r.accountName, signed, [r.accountCode], {
        signedNetInPaise: signed,
        reportClass: rc,
        warning: signed < 0 ? "Asset account has credit balance" : null
      })
    );
  }

  const totalAssets = assetLines.reduce((s, l) => s + l.amountInPaise, 0);

  // --- Liabilities ---
  const liabilityLines: StatementLine[] = [];

  const ap = signedOf("2000");
  if (ap !== 0) {
    // liability positive = credit balance = -signed when signed is debit-minus-credit
    const amt = -ap;
    liabilityLines.push(
      line("ap", "Accounts Payable", amt, ["2000"], {
        signedNetInPaise: ap,
        reportClass: "LIABILITY",
        warning: ap > 0 ? "AP has debit balance" : null
      })
    );
  }

  for (const code of ["2100", "2101", "2102"]) {
    const s = signedOf(code);
    if (s === 0) continue;
    const row = byCode.get(code)!;
    const amt = -s;
    liabilityLines.push(
      line(`out-gst-${code}`, row.accountName, amt, [code], {
        signedNetInPaise: s,
        reportClass: "TAX_LIABILITY",
        warning: s > 0 ? "Output GST has debit balance" : null
      })
    );
  }

  // 1210 credit → liability
  if (c1210 < 0) {
    liabilityLines.push(
      line("clearing-cr", "Inventory Purchases Clearing — Credit Balance", -c1210, ["1210"], {
        signedNetInPaise: c1210,
        reportClass: "PURCHASE_CLEARING_LIABILITY",
        warning: "Do not net into Inventory Asset 1200"
      })
    );
  }

  // Input GST credit → liability
  for (const code of ["2200", "2201", "2202"]) {
    const s = signedOf(code);
    if (s < 0) {
      const row = byCode.get(code)!;
      liabilityLines.push(
        line(`itc-cr-${code}`, row.accountName, -s, [code], {
          signedNetInPaise: s,
          reportClass: "TAX_LIABILITY"
        })
      );
    }
  }

  // Gateway clearing credit
  for (const code of ["1020", "1021", "1022"] as const) {
    const s = signedOf(code);
    if (s < 0) {
      const row = byCode.get(code);
      liabilityLines.push(
        line(`gw-cr-${code}`, `${row?.accountName ?? code} (Credit)`, -s, [code], {
          signedNetInPaise: s,
          reportClass: "LIABILITY",
          warning: "Gateway clearing credit balance"
        })
      );
    }
  }

  // Other liability accounts
  const handledLiab = new Set([
    "2000",
    "2100",
    "2101",
    "2102",
    "2200",
    "2201",
    "2202",
    "1210",
    "1020",
    "1021",
    "1022"
  ]);
  for (const r of tb.rows) {
    if (handledLiab.has(r.accountCode)) continue;
    if (r.accountType !== "LIABILITY") continue;
    const signed = closingSigned(r);
    if (signed === 0) continue;
    const rc = resolveReportClassForBalance(
      r.accountCode,
      r.accountType,
      signed,
      bankHints.get(r.accountCode) ?? null
    );
    if (rc === "TAX_ASSET") continue;
    liabilityLines.push(
      line(`liab-${r.accountCode}`, r.accountName, -signed, [r.accountCode], {
        signedNetInPaise: signed,
        reportClass: rc
      })
    );
  }

  const totalLiabilities = liabilityLines.reduce((s, l) => s + l.amountInPaise, 0);

  // --- Equity ---
  const equityLines: StatementLine[] = [];
  for (const code of ["3000", "3100", "3900"]) {
    const s = signedOf(code);
    if (s === 0 && code !== "3100") continue;
    if (s === 0) continue;
    const row = byCode.get(code);
    equityLines.push(
      line(`eq-${code}`, row?.accountName ?? code, -s, [code], {
        signedNetInPaise: s,
        reportClass: "EQUITY"
      })
    );
  }

  if (priorUnclosed !== 0) {
    equityLines.push(
      line(
        "prior-unclosed",
        "Prior Unclosed Earnings (no year-end close)",
        priorUnclosed,
        [],
        {
          kind: "line",
          signedNetInPaise: null,
          warning:
            "Temporary accounts before current FY; 3100 unused — computed, not posted"
        }
      )
    );
  }

  equityLines.push(
    line("current-earnings", "Current Period Profit / (Loss)", currentFyEarnings, [], {
      kind: "line",
      signedNetInPaise: null,
      warning: `Derived from P&L ${fyStart} → ${asOf}; no closing journal`
    })
  );

  const totalEquity = equityLines.reduce((s, l) => s + l.amountInPaise, 0);
  const difference = totalAssets - (totalLiabilities + totalEquity);
  const balanced = difference === 0;

  let comparison: BalanceSheetReport["comparison"] = null;
  if (input.includeComparison) {
    const priorAsOf = priorTo ?? dayBefore(asOf);
    if (priorAsOf) {
      const priorBs = await buildBalanceSheet({
        asOf: priorAsOf,
        includeComparison: false
      });
      comparison = {
        priorAsOf,
        totalAssetsInPaise: priorBs.totals.totalAssetsInPaise,
        totalLiabilitiesInPaise: priorBs.totals.totalLiabilitiesInPaise,
        totalEquityInPaise: priorBs.totals.totalEquityInPaise
      };
    }
  }

  return {
    asOf,
    currency: "INR",
    fy: {
      startDate: fy.startDate,
      endDate: fy.endDate,
      label: fy.label
    },
    earnings: {
      currentFyFrom: fyStart,
      currentFyTo: asOf,
      currentFyEarningsInPaise: currentFyEarnings,
      priorUnclosedFrom: priorTo ? "1970-01-01" : null,
      priorUnclosedTo: priorTo,
      priorUnclosedEarningsInPaise: priorUnclosed,
      formula:
        "Assets = Liabilities + PostedEquity(3000/3100/3900) + PriorUnclosedTempEarnings(to FY-1) + CurrentFyP&L(FY start→asOf). No closing journal to 3100."
    },
    sections: {
      assets: assetLines,
      liabilities: liabilityLines,
      equity: equityLines
    },
    totals: {
      totalAssetsInPaise: totalAssets,
      totalLiabilitiesInPaise: totalLiabilities,
      totalEquityInPaise: totalEquity,
      differenceInPaise: difference,
      balanced
    },
    integrity: {
      code: "BS_ASSETS_EQUAL_LIABILITIES_PLUS_EQUITY",
      status: balanced ? "PASS" : "FAIL",
      varianceInPaise: difference
    },
    disclosures: {
      arSubledger: "AR_SUBLEDGER_DATA_GAP",
      warnings
    },
    comparison
  };
}
