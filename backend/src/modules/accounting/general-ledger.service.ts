import { prisma } from "../../config/db";

import {
  getBaseReportClass,
  type FinancialReportClass
} from "./financial-statement.mapping";
import { parseUtcDateOnly } from "./financial-year";

/**
 * Deterministic GL line order (documented):
 * 1. entryDate ASC
 * 2. entryNumber ASC
 * 3. line.sortOrder ASC
 * 4. line.id ASC
 *
 * Running balance = cumulative signed net (debit − credit), starting from opening.
 */

export type GeneralLedgerLine = {
  lineId: string;
  entryDate: string;
  journalEntryId: string;
  journalNumber: string;
  description: string | null;
  lineMemo: string | null;
  debitInPaise: number;
  creditInPaise: number;
  runningBalanceInPaise: number;
  eventType: string | null;
  sourceType: string | null;
  sourceId: string | null;
  postingEventId: string | null;
  orphanJournal: boolean;
  sourceHref: string | null;
};

export type GeneralLedgerReport = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  reportClass: FinancialReportClass;
  from: string;
  to: string;
  openingBalanceInPaise: number;
  periodDebitInPaise: number;
  periodCreditInPaise: number;
  closingBalanceInPaise: number;
  /** Signed net convention: debit − credit */
  balanceConvention: "DEBIT_MINUS_CREDIT";
  sortOrder: "entryDate ASC, entryNumber ASC, sortOrder ASC, lineId ASC";
  pagination: {
    limit: number;
    offset: number;
    totalLines: number;
    hasMore: boolean;
  };
  lines: GeneralLedgerLine[];
};

const MAX_GL_LIMIT = 200;
const DEFAULT_GL_LIMIT = 50;

/** Safe admin hrefs only — never invent routes. */
function sourceHrefFor(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  switch (sourceType) {
    case "ORDER":
      return `/admin/orders/${sourceId}`;
    case "VENDOR_BILL":
      return `/admin/accounting/vendor-bills`;
    case "EXPENSE":
      return `/admin/accounting/expenses`;
    case "BANK_TRANSFER":
    case "BANK_ACCOUNT":
      return `/admin/accounting/banking`;
    default:
      return null;
  }
}

export async function buildGeneralLedger(input: {
  accountCode?: string;
  accountId?: string;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
}): Promise<GeneralLedgerReport> {
  if (!input.accountCode?.trim() && !input.accountId?.trim()) {
    throw new Error("accountCode or accountId required");
  }
  if (!input.from?.trim() || !input.to?.trim()) {
    throw new Error("from and to (YYYY-MM-DD) required");
  }

  const fromD = parseUtcDateOnly(input.from.trim());
  const toD = parseUtcDateOnly(input.to.trim());
  if (fromD.getTime() > toD.getTime()) {
    throw new Error("from must be on or before to");
  }

  const limit = Math.min(
    Math.max(1, input.limit ?? DEFAULT_GL_LIMIT),
    MAX_GL_LIMIT
  );
  const offset = Math.max(0, input.offset ?? 0);

  const account = input.accountId?.trim()
    ? await prisma.accountingAccount.findUnique({ where: { id: input.accountId.trim() } })
    : await prisma.accountingAccount.findUnique({
        where: { code: input.accountCode!.trim() }
      });

  if (!account) {
    throw new Error("Account not found");
  }

  const bank = await prisma.accountingBankAccount.findFirst({
    where: { glAccountCode: account.code },
    select: { accountType: true }
  });
  const bankHint = bank
    ? { accountType: (bank.accountType === "CASH" ? "CASH" : "BANK") as "CASH" | "BANK" }
    : null;
  const reportClass = getBaseReportClass(account.code, account.type, bankHint);

  const openingAgg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: account.id,
      journalEntry: { status: "POSTED", entryDate: { lt: fromD } }
    },
    _sum: { debitInPaise: true, creditInPaise: true }
  });
  const openingDebit = openingAgg._sum.debitInPaise ?? 0;
  const openingCredit = openingAgg._sum.creditInPaise ?? 0;
  const openingBalanceInPaise = openingDebit - openingCredit;

  const periodAgg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: account.id,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: fromD, lte: toD }
      }
    },
    _sum: { debitInPaise: true, creditInPaise: true },
    _count: true
  });
  const periodDebitInPaise = periodAgg._sum.debitInPaise ?? 0;
  const periodCreditInPaise = periodAgg._sum.creditInPaise ?? 0;
  const closingBalanceInPaise =
    openingBalanceInPaise + periodDebitInPaise - periodCreditInPaise;
  const totalLines = periodAgg._count;

  // All period lines in deterministic order for correct running balance + pagination slice.
  // At Sarveda scale this is fine; avoid N+1 by including postingEvent once.
  const allLines = await prisma.accountingJournalLine.findMany({
    where: {
      accountId: account.id,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: fromD, lte: toD }
      }
    },
    include: {
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          memo: true,
          createdAt: true,
          postingEvent: {
            select: {
              id: true,
              eventType: true,
              sourceType: true,
              sourceId: true
            }
          }
        }
      }
    },
    orderBy: [
      { journalEntry: { entryDate: "asc" } },
      { journalEntry: { entryNumber: "asc" } },
      { sortOrder: "asc" },
      { id: "asc" }
    ]
  });

  let running = openingBalanceInPaise;
  const withRunning: GeneralLedgerLine[] = allLines.map((line) => {
    running += line.debitInPaise - line.creditInPaise;
    const pe = line.journalEntry.postingEvent;
    const entryDate =
      line.journalEntry.entryDate instanceof Date
        ? line.journalEntry.entryDate.toISOString().slice(0, 10)
        : String(line.journalEntry.entryDate).slice(0, 10);

    return {
      lineId: line.id,
      entryDate,
      journalEntryId: line.journalEntry.id,
      journalNumber: line.journalEntry.entryNumber,
      description: line.journalEntry.memo,
      lineMemo: line.lineMemo,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      runningBalanceInPaise: running,
      eventType: pe?.eventType ?? null,
      sourceType: pe?.sourceType ?? null,
      sourceId: pe?.sourceId ?? null,
      postingEventId: pe?.id ?? null,
      orphanJournal: !pe,
      sourceHref: sourceHrefFor(pe?.sourceType ?? null, pe?.sourceId ?? null)
    };
  });

  const lines = withRunning.slice(offset, offset + limit);

  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    accountType: account.type,
    reportClass,
    from: input.from.trim(),
    to: input.to.trim(),
    openingBalanceInPaise,
    periodDebitInPaise,
    periodCreditInPaise,
    closingBalanceInPaise,
    balanceConvention: "DEBIT_MINUS_CREDIT",
    sortOrder: "entryDate ASC, entryNumber ASC, sortOrder ASC, lineId ASC",
    pagination: {
      limit,
      offset,
      totalLines,
      hasMore: offset + limit < totalLines
    },
    lines
  };
}

export const GL_PAGINATION = { MAX_GL_LIMIT, DEFAULT_GL_LIMIT };
