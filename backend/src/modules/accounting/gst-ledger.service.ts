import { prisma } from "../../config/db";

import { getAccountingAccountByCode } from "./seed-coa";
import {
  GST_ACCOUNT_LABELS,
  GST_INPUT_ACCOUNT_CODES,
  GST_OUTPUT_ACCOUNT_CODES
} from "./gst.constants";

export type GstLedgerAccountRow = {
  accountCode: string;
  accountName: string;
  openingBalanceInPaise: number;
  periodDebitInPaise: number;
  periodCreditInPaise: number;
  closingBalanceInPaise: number;
};

export type GstLedgerReport = {
  from: string;
  to: string;
  accounts: GstLedgerAccountRow[];
  aggregates: {
    outputCgstClosingInPaise: number;
    outputSgstClosingInPaise: number;
    outputIgstClosingInPaise: number;
    inputCgstRecognizedClosingInPaise: number;
    inputSgstRecognizedClosingInPaise: number;
    inputIgstRecognizedClosingInPaise: number;
  };
  periodMovement: {
    outputCgstInPaise: number;
    outputSgstInPaise: number;
    outputIgstInPaise: number;
    inputCgstRecognizedInPaise: number;
    inputSgstRecognizedInPaise: number;
    inputIgstRecognizedInPaise: number;
  };
};

export function parseGstReportPeriod(opts: { from?: string; to?: string; month?: string }): {
  from: Date;
  toExclusive: Date;
  fromLabel: string;
  toLabel: string;
  monthKey: string | null;
} {
  if (opts.month?.trim()) {
    const m = opts.month.trim();
    if (!/^\d{4}-\d{2}$/.test(m)) {
      throw new Error("month must be YYYY-MM");
    }
    const [y, mo] = m.split("-").map(Number);
    if (!mo || mo < 1 || mo > 12) {
      throw new Error("month must be YYYY-MM with month 01-12");
    }
    const from = new Date(Date.UTC(y!, mo - 1, 1));
    const toExclusive = new Date(Date.UTC(y!, mo, 1));
    const lastDay = new Date(Date.UTC(y!, mo, 0)).getUTCDate();
    return {
      from,
      toExclusive,
      fromLabel: `${m}-01`,
      toLabel: `${m}-${String(lastDay).padStart(2, "0")}`,
      monthKey: m
    };
  }
  if (!opts.from?.trim() || !opts.to?.trim()) {
    throw new Error("from and to (YYYY-MM-DD) or month (YYYY-MM) required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to.trim())) {
    throw new Error("from and to must be YYYY-MM-DD");
  }
  const from = new Date(`${opts.from.trim()}T00:00:00.000Z`);
  const toInclusive = new Date(`${opts.to.trim()}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime())) {
    throw new Error("invalid from/to date");
  }
  if (toInclusive < from) {
    throw new Error("to must be on or after from");
  }
  const toExclusive = new Date(toInclusive);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return {
    from,
    toExclusive,
    fromLabel: opts.from.trim(),
    toLabel: opts.to.trim(),
    monthKey: null
  };
}

function parsePeriod(opts: { from?: string; to?: string; month?: string }) {
  return parseGstReportPeriod(opts);
}

async function accountMovement(
  accountCode: string,
  from: Date,
  toExclusive: Date
): Promise<GstLedgerAccountRow> {
  const acct = await getAccountingAccountByCode(accountCode);
  if (!acct) {
    return {
      accountCode,
      accountName: GST_ACCOUNT_LABELS[accountCode] ?? accountCode,
      openingBalanceInPaise: 0,
      periodDebitInPaise: 0,
      periodCreditInPaise: 0,
      closingBalanceInPaise: 0
    };
  }

  const openingAgg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: acct.id,
      journalEntry: { status: "POSTED", entryDate: { lt: from } }
    },
    _sum: { debitInPaise: true, creditInPaise: true }
  });
  const periodAgg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: acct.id,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: from, lt: toExclusive }
      }
    },
    _sum: { debitInPaise: true, creditInPaise: true }
  });

  const openingDebit = openingAgg._sum.debitInPaise ?? 0;
  const openingCredit = openingAgg._sum.creditInPaise ?? 0;
  // Liability: credit balance positive when credit > debit
  const openingBalanceInPaise = openingCredit - openingDebit;
  const periodDebitInPaise = periodAgg._sum.debitInPaise ?? 0;
  const periodCreditInPaise = periodAgg._sum.creditInPaise ?? 0;
  const closingBalanceInPaise =
    openingBalanceInPaise + periodCreditInPaise - periodDebitInPaise;

  return {
    accountCode,
    accountName: acct.name,
    openingBalanceInPaise,
    periodDebitInPaise,
    periodCreditInPaise,
    closingBalanceInPaise
  };
}

/** GST ledger from POSTED journal lines only. */
export async function buildGstLedger(opts: {
  from?: string;
  to?: string;
  month?: string;
}): Promise<GstLedgerReport> {
  const period = parsePeriod(opts);
  const codes = [...GST_OUTPUT_ACCOUNT_CODES, ...GST_INPUT_ACCOUNT_CODES];
  const accounts: GstLedgerAccountRow[] = [];
  for (const code of codes) {
    accounts.push(await accountMovement(code, period.from, period.toExclusive));
  }
  const byCode = Object.fromEntries(accounts.map((a) => [a.accountCode, a]));
  return {
    from: period.fromLabel,
    to: period.toLabel,
    accounts,
    aggregates: {
      outputCgstClosingInPaise: byCode["2100"]?.closingBalanceInPaise ?? 0,
      outputSgstClosingInPaise: byCode["2101"]?.closingBalanceInPaise ?? 0,
      outputIgstClosingInPaise: byCode["2102"]?.closingBalanceInPaise ?? 0,
      // Input recognized as debit balance → report absolute recognized (debit − credit)
      inputCgstRecognizedClosingInPaise: -(byCode["2200"]?.closingBalanceInPaise ?? 0),
      inputSgstRecognizedClosingInPaise: -(byCode["2201"]?.closingBalanceInPaise ?? 0),
      inputIgstRecognizedClosingInPaise: -(byCode["2202"]?.closingBalanceInPaise ?? 0)
    },
    /** Period movement (excludes opening) — use for GSTR-style current-period integrity. */
    periodMovement: {
      outputCgstInPaise: (byCode["2100"]?.periodCreditInPaise ?? 0) - (byCode["2100"]?.periodDebitInPaise ?? 0),
      outputSgstInPaise: (byCode["2101"]?.periodCreditInPaise ?? 0) - (byCode["2101"]?.periodDebitInPaise ?? 0),
      outputIgstInPaise: (byCode["2102"]?.periodCreditInPaise ?? 0) - (byCode["2102"]?.periodDebitInPaise ?? 0),
      inputCgstRecognizedInPaise:
        (byCode["2200"]?.periodDebitInPaise ?? 0) - (byCode["2200"]?.periodCreditInPaise ?? 0),
      inputSgstRecognizedInPaise:
        (byCode["2201"]?.periodDebitInPaise ?? 0) - (byCode["2201"]?.periodCreditInPaise ?? 0),
      inputIgstRecognizedInPaise:
        (byCode["2202"]?.periodDebitInPaise ?? 0) - (byCode["2202"]?.periodCreditInPaise ?? 0)
    }
  };
}
