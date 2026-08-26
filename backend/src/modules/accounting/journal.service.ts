import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  InvalidJournalLineError,
  PostedJournalImmutableError,
  UnbalancedJournalError,
  ZeroValueJournalError
} from "./accounting-errors";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { nextJournalEntryNumberInTx } from "./accounting-sequence";

export type JournalLineInput = {
  accountId: string;
  debitInPaise?: number;
  creditInPaise?: number;
  lineMemo?: string;
  sortOrder?: number;
};

export type CreateAndPostJournalInput = {
  entryDate: Date;
  memo?: string;
  lines: JournalLineInput[];
  postedByUserId?: string;
  currency?: string;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

function normalizeLine(line: JournalLineInput, index: number): Required<
  Pick<JournalLineInput, "debitInPaise" | "creditInPaise" | "sortOrder">
> &
  JournalLineInput {
  const debit = line.debitInPaise ?? 0;
  const credit = line.creditInPaise ?? 0;

  if (debit > 0 && credit > 0) {
    throw new InvalidJournalLineError("A journal line cannot have both debit and credit");
  }
  if (debit <= 0 && credit <= 0) {
    throw new InvalidJournalLineError("A journal line must have either debit or credit greater than zero");
  }
  if (debit < 0 || credit < 0) {
    throw new InvalidJournalLineError("Debit and credit amounts must be non-negative");
  }

  return {
    ...line,
    debitInPaise: debit,
    creditInPaise: credit,
    sortOrder: line.sortOrder ?? index
  };
}

export function validateJournalBalance(lines: Array<{ debitInPaise: number; creditInPaise: number }>) {
  const totalDebit = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditInPaise, 0);

  if (totalDebit <= 0) {
    throw new ZeroValueJournalError();
  }
  if (totalDebit !== totalCredit) {
    throw new UnbalancedJournalError(totalDebit, totalCredit);
  }

  return { totalDebit, totalCredit };
}

async function assertJournalMutable(
  entry: { id: string; status: string },
  action: string
): Promise<void> {
  if (entry.status === "POSTED" || entry.status === "VOID") {
    throw new PostedJournalImmutableError(action);
  }
}

/** Atomically allocate number, create header + lines, validate, POSTED — within one transaction. */
export async function createAndPostJournalInTx(
  tx: Prisma.TransactionClient,
  input: CreateAndPostJournalInput
) {
  const normalized = input.lines.map((line, i) => normalizeLine(line, i));
  const { totalDebit, totalCredit } = validateJournalBalance(normalized);
  await assertEntryDateInOpenPeriod(input.entryDate, tx);

  const entryNumber = await nextJournalEntryNumberInTx(tx, input.entryDate);
  const currency = input.currency ?? "INR";

  const entry = await tx.accountingJournalEntry.create({
    data: {
      entryNumber,
      entryDate: input.entryDate,
      memo: input.memo,
      status: "POSTED",
      postedAt: new Date(),
      postedByUserId: input.postedByUserId ?? null,
      totalDebitInPaise: totalDebit,
      totalCreditInPaise: totalCredit,
      currency,
      lines: {
        create: normalized.map((line) => ({
          accountId: line.accountId,
          debitInPaise: line.debitInPaise,
          creditInPaise: line.creditInPaise,
          lineMemo: line.lineMemo,
          sortOrder: line.sortOrder
        }))
      }
    },
    include: { lines: { include: { account: true }, orderBy: { sortOrder: "asc" } } }
  });

  await writeAccountingAuditLog(
    {
      actorUserId: input.postedByUserId,
      action: "JOURNAL_POSTED",
      entityType: "AccountingJournalEntry",
      entityId: entry.id,
      afterJson: {
        entryNumber: entry.entryNumber,
        totalDebitInPaise: totalDebit,
        totalCreditInPaise: totalCredit
      }
    },
    tx
  );

  logger.info("accounting_journal_posted", {
    entryId: entry.id,
    entryNumber: entry.entryNumber,
    totalDebitInPaise: totalDebit
  });

  return entry;
}

/** Atomically create journal header + lines and mark POSTED. */
export async function createAndPostJournal(input: CreateAndPostJournalInput) {
  return prisma.$transaction(async (tx) => createAndPostJournalInTx(tx, input));
}

export async function getJournalEntryById(id: string) {
  return prisma.accountingJournalEntry.findUnique({
    where: { id },
    include: {
      lines: { include: { account: true }, orderBy: { sortOrder: "asc" } },
      postingEvent: true,
      documentLinks: true
    }
  });
}

export async function listJournalEntries(opts?: { limit?: number; offset?: number }) {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const [items, total] = await Promise.all([
    prisma.accountingJournalEntry.findMany({
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      include: {
        lines: { include: { account: true }, orderBy: { sortOrder: "asc" } }
      }
    }),
    prisma.accountingJournalEntry.count()
  ]);
  return { items, total, limit, offset };
}

export async function updateJournalEntry(
  id: string,
  data: { memo?: string; entryDate?: Date; currency?: string }
) {
  const existing = await prisma.accountingJournalEntry.findUnique({ where: { id } });
  if (!existing) {
    throw Object.assign(new Error("Journal entry not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  await assertJournalMutable(existing, "updated");

  return prisma.accountingJournalEntry.update({
    where: { id },
    data: {
      memo: data.memo,
      entryDate: data.entryDate,
      currency: data.currency
    }
  });
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const existing = await prisma.accountingJournalEntry.findUnique({ where: { id } });
  if (!existing) {
    throw Object.assign(new Error("Journal entry not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  await assertJournalMutable(existing, "deleted");
  await prisma.accountingJournalEntry.delete({ where: { id } });
}

export async function updateJournalLine(
  journalEntryId: string,
  lineId: string,
  data: Partial<Pick<JournalLineInput, "debitInPaise" | "creditInPaise" | "lineMemo" | "accountId">>
) {
  const entry = await prisma.accountingJournalEntry.findUnique({ where: { id: journalEntryId } });
  if (!entry) {
    throw Object.assign(new Error("Journal entry not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  await assertJournalMutable(entry, "modified (line update)");

  if (data.debitInPaise !== undefined || data.creditInPaise !== undefined) {
    const line = await prisma.accountingJournalLine.findUnique({ where: { id: lineId } });
    if (!line) {
      throw Object.assign(new Error("Journal line not found"), { statusCode: 404, code: "NOT_FOUND" });
    }
    normalizeLine(
      {
        accountId: data.accountId ?? line.accountId,
        debitInPaise: data.debitInPaise ?? line.debitInPaise,
        creditInPaise: data.creditInPaise ?? line.creditInPaise
      },
      0
    );
  }

  return prisma.accountingJournalLine.update({
    where: { id: lineId },
    data: {
      accountId: data.accountId,
      debitInPaise: data.debitInPaise,
      creditInPaise: data.creditInPaise,
      lineMemo: data.lineMemo
    }
  });
}

export async function deleteJournalLine(journalEntryId: string, lineId: string) {
  const entry = await prisma.accountingJournalEntry.findUnique({ where: { id: journalEntryId } });
  if (!entry) {
    throw Object.assign(new Error("Journal entry not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  await assertJournalMutable(entry, "modified (line deletion)");
  await prisma.accountingJournalLine.delete({ where: { id: lineId } });
}

export async function assertJournalEntryImmutable(id: string) {
  const entry = await prisma.accountingJournalEntry.findUnique({ where: { id } });
  if (!entry) {
    throw Object.assign(new Error("Journal entry not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  await assertJournalMutable(entry, "modified");
  return entry;
}
