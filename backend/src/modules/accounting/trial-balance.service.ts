import { prisma } from "../../config/db";

import {
  getBaseReportClass,
  presentNetAsDebitCredit,
  resolveReportClassForBalance,
  type BankGlHint,
  type FinancialReportClass
} from "./financial-statement.mapping";
import { parseUtcDateOnly } from "./financial-year";
import type { AccountingAccountType } from "@prisma/client";

export type TrialBalanceMode = "AS_OF" | "PERIOD";

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountingAccountType;
  reportClass: FinancialReportClass;
  openingDebitInPaise: number;
  openingCreditInPaise: number;
  periodDebitInPaise: number;
  periodCreditInPaise: number;
  closingDebitInPaise: number;
  closingCreditInPaise: number;
  closingNetInPaise: number;
};

export type TrialBalanceReport = {
  mode: TrialBalanceMode;
  asOf: string | null;
  from: string | null;
  to: string | null;
  includeZeroBalanceAccounts: boolean;
  currency: "INR";
  rows: TrialBalanceRow[];
  totals: {
    openingDebitInPaise: number;
    openingCreditInPaise: number;
    periodDebitInPaise: number;
    periodCreditInPaise: number;
    closingDebitInPaise: number;
    closingCreditInPaise: number;
  };
  balanced: boolean;
  varianceInPaise: number;
  integrity: {
    code: "TB_DEBITS_EQUAL_CREDITS";
    status: "PASS" | "FAIL";
    varianceInPaise: number;
  };
};

type AggRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountingAccountType;
  openingDebit: bigint | number;
  openingCredit: bigint | number;
  periodDebit: bigint | number;
  periodCredit: bigint | number;
};

function n(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
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

/**
 * Trial Balance from POSTED journal lines only (DB aggregation).
 *
 * Opening/closing: actual net shown on debit OR credit side (not forced by normal balance).
 * Period: raw SUM(debit) / SUM(credit) for the window.
 */
export async function buildTrialBalance(input: {
  asOf?: string;
  from?: string;
  to?: string;
  includeZeroBalanceAccounts?: boolean;
}): Promise<TrialBalanceReport> {
  const includeZero = input.includeZeroBalanceAccounts === true;
  const hasAsOf = Boolean(input.asOf?.trim());
  const hasFrom = Boolean(input.from?.trim());
  const hasTo = Boolean(input.to?.trim());

  if (hasAsOf && (hasFrom || hasTo)) {
    throw new Error("Provide either asOf or from+to, not both");
  }
  if (!hasAsOf && !(hasFrom && hasTo)) {
    throw new Error("asOf (YYYY-MM-DD) or from+to (YYYY-MM-DD) required");
  }
  if ((hasFrom && !hasTo) || (!hasFrom && hasTo)) {
    throw new Error("from and to are both required for period mode");
  }

  let mode: TrialBalanceMode;
  let asOf: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let periodFrom: Date;
  let periodToInclusive: Date;
  /** When set, opening = POSTED lines with entryDate < this date. */
  let openingCutoff: Date | null = null;

  if (hasAsOf) {
    mode = "AS_OF";
    asOf = input.asOf!.trim();
    // Epoch floor so period includes all history through asOf; opening stays 0.
    periodFrom = parseUtcDateOnly("1970-01-01");
    periodToInclusive = parseUtcDateOnly(asOf);
    openingCutoff = null;
  } else {
    mode = "PERIOD";
    from = input.from!.trim();
    to = input.to!.trim();
    const fromD = parseUtcDateOnly(from);
    const toD = parseUtcDateOnly(to);
    if (fromD.getTime() > toD.getTime()) {
      throw new Error("from must be on or before to");
    }
    periodFrom = fromD;
    periodToInclusive = toD;
    openingCutoff = fromD;
  }

  const bankHints = await loadBankHints();

  let rowsRaw: AggRow[];
  if (openingCutoff) {
    rowsRaw = await prisma.$queryRaw<AggRow[]>`
      SELECT
        a.id AS "accountId",
        a.code,
        a.name,
        a.type,
        COALESCE(SUM(
          CASE WHEN e.status = 'POSTED' AND e."entryDate" < ${openingCutoff}::date
            THEN l."debitInPaise" ELSE 0 END
        ), 0) AS "openingDebit",
        COALESCE(SUM(
          CASE WHEN e.status = 'POSTED' AND e."entryDate" < ${openingCutoff}::date
            THEN l."creditInPaise" ELSE 0 END
        ), 0) AS "openingCredit",
        COALESCE(SUM(
          CASE WHEN e.status = 'POSTED'
            AND e."entryDate" >= ${periodFrom}::date
            AND e."entryDate" <= ${periodToInclusive}::date
            THEN l."debitInPaise" ELSE 0 END
        ), 0) AS "periodDebit",
        COALESCE(SUM(
          CASE WHEN e.status = 'POSTED'
            AND e."entryDate" >= ${periodFrom}::date
            AND e."entryDate" <= ${periodToInclusive}::date
            THEN l."creditInPaise" ELSE 0 END
        ), 0) AS "periodCredit"
      FROM "AccountingAccount" a
      LEFT JOIN "AccountingJournalLine" l ON l."accountId" = a.id
      LEFT JOIN "AccountingJournalEntry" e ON e.id = l."journalEntryId"
      GROUP BY a.id
      ORDER BY a.code ASC
    `;
  } else {
    rowsRaw = await prisma.$queryRaw<AggRow[]>`
      SELECT
        a.id AS "accountId",
        a.code,
        a.name,
        a.type,
        0::bigint AS "openingDebit",
        0::bigint AS "openingCredit",
        COALESCE(SUM(
          CASE WHEN e.status = 'POSTED'
            AND e."entryDate" >= ${periodFrom}::date
            AND e."entryDate" <= ${periodToInclusive}::date
            THEN l."debitInPaise" ELSE 0 END
        ), 0) AS "periodDebit",
        COALESCE(SUM(
          CASE WHEN e.status = 'POSTED'
            AND e."entryDate" >= ${periodFrom}::date
            AND e."entryDate" <= ${periodToInclusive}::date
            THEN l."creditInPaise" ELSE 0 END
        ), 0) AS "periodCredit"
      FROM "AccountingAccount" a
      LEFT JOIN "AccountingJournalLine" l ON l."accountId" = a.id
      LEFT JOIN "AccountingJournalEntry" e ON e.id = l."journalEntryId"
      GROUP BY a.id
      ORDER BY a.code ASC
    `;
  }

  const rows: TrialBalanceRow[] = [];
  for (const r of rowsRaw) {
    const openingDebitSum = n(r.openingDebit);
    const openingCreditSum = n(r.openingCredit);
    const periodDebit = n(r.periodDebit);
    const periodCredit = n(r.periodCredit);
    const openingNet = openingDebitSum - openingCreditSum;
    const closingNet = openingNet + periodDebit - periodCredit;

    if (
      !includeZero &&
      openingNet === 0 &&
      periodDebit === 0 &&
      periodCredit === 0 &&
      closingNet === 0
    ) {
      continue;
    }

    const opening = presentNetAsDebitCredit(openingNet);
    const closing = presentNetAsDebitCredit(closingNet);
    const bankHint = bankHints.get(r.code) ?? null;
    const reportClass = resolveReportClassForBalance(r.code, r.type, closingNet, bankHint);

    rows.push({
      accountId: r.accountId,
      accountCode: r.code,
      accountName: r.name,
      accountType: r.type,
      reportClass,
      openingDebitInPaise: opening.debit,
      openingCreditInPaise: opening.credit,
      periodDebitInPaise: periodDebit,
      periodCreditInPaise: periodCredit,
      closingDebitInPaise: closing.debit,
      closingCreditInPaise: closing.credit,
      closingNetInPaise: closingNet
    });
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.openingDebitInPaise += row.openingDebitInPaise;
      acc.openingCreditInPaise += row.openingCreditInPaise;
      acc.periodDebitInPaise += row.periodDebitInPaise;
      acc.periodCreditInPaise += row.periodCreditInPaise;
      acc.closingDebitInPaise += row.closingDebitInPaise;
      acc.closingCreditInPaise += row.closingCreditInPaise;
      return acc;
    },
    {
      openingDebitInPaise: 0,
      openingCreditInPaise: 0,
      periodDebitInPaise: 0,
      periodCreditInPaise: 0,
      closingDebitInPaise: 0,
      closingCreditInPaise: 0
    }
  );

  const varianceInPaise = totals.closingDebitInPaise - totals.closingCreditInPaise;
  const balanced = varianceInPaise === 0;

  return {
    mode,
    asOf,
    from,
    to,
    includeZeroBalanceAccounts: includeZero,
    currency: "INR",
    rows,
    totals,
    balanced,
    varianceInPaise,
    integrity: {
      code: "TB_DEBITS_EQUAL_CREDITS",
      status: balanced ? "PASS" : "FAIL",
      varianceInPaise
    }
  };
}

export type ReportAccountRow = {
  id: string;
  code: string;
  name: string;
  type: AccountingAccountType;
  reportClass: FinancialReportClass;
  normalBalance: "DEBIT" | "CREDIT";
  isActive: boolean;
  isSystem: boolean;
  isBankRegistryGl: boolean;
  bankAccountType: "BANK" | "CASH" | null;
  hasPostedActivity: boolean;
};

export async function listReportAccounts(): Promise<ReportAccountRow[]> {
  const bankHints = await loadBankHints();
  const accounts = await prisma.accountingAccount.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      isActive: true,
      isSystem: true,
      _count: {
        select: { journalLines: true }
      }
    }
  });

  const { normalBalanceForReportClass } = await import("./financial-statement.mapping");

  return accounts.map((a) => {
    const bankHint = bankHints.get(a.code) ?? null;
    const reportClass = getBaseReportClass(a.code, a.type, bankHint);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      reportClass,
      normalBalance: normalBalanceForReportClass(reportClass),
      isActive: a.isActive,
      isSystem: a.isSystem,
      isBankRegistryGl: Boolean(bankHint),
      bankAccountType: bankHint?.accountType ?? null,
      hasPostedActivity: a._count.journalLines > 0
    };
  });
}
