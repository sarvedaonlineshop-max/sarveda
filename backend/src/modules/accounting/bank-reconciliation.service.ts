import type { AccountingBankReconciliationStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  BankReconciliationError,
  BankReconciliationLockedError,
  BankReconciliationNotFoundError
} from "./accounting-errors";
import { assertBankAccountPostable } from "./bank-account.service";
import { getAccountingAccountByCode } from "./seed-coa";
import { assertBankReconciliationAllowed } from "./production-guard";
import type { BookBalancePeriod, ReconciliationSnapshot } from "./bank-reconciliation.types";

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function computeBookBalanceForPeriod(
  glAccountCode: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BookBalancePeriod> {
  const acct = await getAccountingAccountByCode(glAccountCode);
  if (!acct) {
    return {
      bookOpeningBalanceInPaise: 0,
      bookDebitTotalInPaise: 0,
      bookCreditTotalInPaise: 0,
      bookClosingBalanceInPaise: 0
    };
  }

  const start = utcDateOnly(periodStart);
  const end = utcDateOnly(periodEnd);

  const openingAgg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: acct.id,
      journalEntry: { status: "POSTED", entryDate: { lt: start } }
    },
    _sum: { debitInPaise: true, creditInPaise: true }
  });
  const bookOpeningBalanceInPaise =
    (openingAgg._sum.debitInPaise ?? 0) - (openingAgg._sum.creditInPaise ?? 0);

  const periodAgg = await prisma.accountingJournalLine.aggregate({
    where: {
      accountId: acct.id,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: start, lte: end }
      }
    },
    _sum: { debitInPaise: true, creditInPaise: true }
  });
  const bookDebitTotalInPaise = periodAgg._sum.debitInPaise ?? 0;
  const bookCreditTotalInPaise = periodAgg._sum.creditInPaise ?? 0;
  const bookClosingBalanceInPaise =
    bookOpeningBalanceInPaise + bookDebitTotalInPaise - bookCreditTotalInPaise;

  return {
    bookOpeningBalanceInPaise,
    bookDebitTotalInPaise,
    bookCreditTotalInPaise,
    bookClosingBalanceInPaise
  };
}

async function assertNoOverlappingReconciled(
  bankAccountId: string,
  periodStart: Date,
  periodEnd: Date,
  excludeId?: string
) {
  const start = utcDateOnly(periodStart);
  const end = utcDateOnly(periodEnd);
  if (start > end) {
    throw new BankReconciliationError("periodStart must be <= periodEnd", "INVALID_PERIOD");
  }

  const overlapping = await prisma.accountingBankReconciliation.findFirst({
    where: {
      bankAccountId,
      status: "RECONCILED",
      id: excludeId ? { not: excludeId } : undefined,
      periodStart: { lte: end },
      periodEnd: { gte: start }
    }
  });
  if (overlapping) {
    throw new BankReconciliationError(
      "Overlaps an existing RECONCILED period for this bank account",
      "OVERLAPPING_RECONCILED_PERIOD",
      409
    );
  }
}

export async function createBankReconciliation(input: {
  bankAccountId: string;
  periodStart: Date;
  periodEnd: Date;
  statementImportId?: string | null;
  statementOpeningBalanceInPaise?: number | null;
  statementClosingBalanceInPaise?: number | null;
  notes?: string | null;
  userId?: string;
}) {
  assertBankReconciliationAllowed();
  const bank = await assertBankAccountPostable(input.bankAccountId);
  if (bank.accountType !== "BANK") {
    throw new BankReconciliationError(
      "Reconciliation is only supported for BANK accounts",
      "INVALID_ACCOUNT_TYPE"
    );
  }

  await assertNoOverlappingReconciled(input.bankAccountId, input.periodStart, input.periodEnd);

  let statementOpening = input.statementOpeningBalanceInPaise ?? null;
  let statementClosing = input.statementClosingBalanceInPaise ?? null;
  let statementImportId = input.statementImportId ?? null;

  if (statementImportId) {
    const imp = await prisma.accountingBankStatementImport.findUnique({
      where: { id: statementImportId }
    });
    if (!imp || imp.bankAccountId !== input.bankAccountId) {
      throw new BankReconciliationError("Statement import not found for bank", "STATEMENT_IMPORT_INVALID");
    }
    if (imp.importStatus !== "IMPORTED") {
      throw new BankReconciliationError("Statement import is not committed", "STATEMENT_NOT_IMPORTED");
    }
    if (statementOpening == null) statementOpening = imp.openingBalanceInPaise;
    if (statementClosing == null) statementClosing = imp.closingBalanceInPaise;
  }

  const books = await computeBookBalanceForPeriod(
    bank.glAccountCode,
    input.periodStart,
    input.periodEnd
  );

  const differenceInPaise =
    statementClosing == null ? books.bookClosingBalanceInPaise : books.bookClosingBalanceInPaise - statementClosing;

  const row = await prisma.accountingBankReconciliation.create({
    data: {
      bankAccountId: input.bankAccountId,
      periodStart: utcDateOnly(input.periodStart),
      periodEnd: utcDateOnly(input.periodEnd),
      statementImportId,
      statementOpeningBalanceInPaise: statementOpening,
      statementClosingBalanceInPaise: statementClosing,
      bookOpeningBalanceInPaise: books.bookOpeningBalanceInPaise,
      bookClosingBalanceInPaise: books.bookClosingBalanceInPaise,
      bookDebitTotalInPaise: books.bookDebitTotalInPaise,
      bookCreditTotalInPaise: books.bookCreditTotalInPaise,
      differenceInPaise,
      status: "OPEN",
      notes: input.notes ?? null
    }
  });

  if (statementImportId) {
    await prisma.accountingBankStatementLine.updateMany({
      where: {
        statementImportId,
        transactionDate: {
          gte: utcDateOnly(input.periodStart),
          lte: utcDateOnly(input.periodEnd)
        }
      },
      data: { reconciliationId: row.id }
    });
  }

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_RECONCILIATION_CREATED",
    entityType: "AccountingBankReconciliation",
    entityId: row.id,
    afterJson: {
      bankAccountId: input.bankAccountId,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10)
    }
  });

  return recomputeBankReconciliation(row.id);
}

export async function listBankReconciliations(bankAccountId?: string, limit = 50) {
  return prisma.accountingBankReconciliation.findMany({
    where: bankAccountId ? { bankAccountId } : undefined,
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      bankAccount: { select: { id: true, name: true, glAccountCode: true } },
      statementImport: { select: { id: true, fileName: true, committedAt: true } }
    }
  });
}

export async function getBankReconciliationById(id: string) {
  const row = await prisma.accountingBankReconciliation.findUnique({
    where: { id },
    include: {
      bankAccount: true,
      statementImport: true,
      statementLines: {
        orderBy: [{ transactionDate: "asc" }, { rowNumber: "asc" }],
        include: {
          matches: {
            include: {
              journalEntry: { select: { id: true, entryNumber: true, entryDate: true } }
            }
          }
        }
      }
    }
  });
  if (!row) throw new BankReconciliationNotFoundError(id);
  return row;
}

function isUnresolvedLine(line: {
  matchStatus: string;
  category: string | null;
}): boolean {
  if (line.matchStatus === "IGNORED" && line.category === "IGNORE") return false;
  if (
    line.matchStatus === "MATCHED_EXACT" ||
    line.matchStatus === "MATCHED_MANUAL" ||
    line.matchStatus === "MATCHED_CATEGORIZED"
  ) {
    return false;
  }
  if (line.matchStatus === "DUPLICATE") return true;
  if (line.matchStatus === "REVIEW_REQUIRED") return true;
  if (line.matchStatus === "UNMATCHED" || line.matchStatus === "POSSIBLE") return true;
  return true;
}

export async function recomputeBankReconciliation(id: string) {
  assertBankReconciliationAllowed();
  const row = await prisma.accountingBankReconciliation.findUnique({
    where: { id },
    include: { bankAccount: true, statementLines: true }
  });
  if (!row) throw new BankReconciliationNotFoundError(id);
  if (row.status === "RECONCILED") {
    throw new BankReconciliationLockedError("Cannot recompute a RECONCILED period — reopen first");
  }

  const books = await computeBookBalanceForPeriod(
    row.bankAccount.glAccountCode,
    row.periodStart,
    row.periodEnd
  );

  const statementClosing = row.statementClosingBalanceInPaise;
  const differenceInPaise =
    statementClosing == null
      ? books.bookClosingBalanceInPaise
      : books.bookClosingBalanceInPaise - statementClosing;

  const nextStatus: AccountingBankReconciliationStatus =
    row.status === "REOPENED" ? "REOPENED" : "IN_PROGRESS";

  return prisma.accountingBankReconciliation.update({
    where: { id },
    data: {
      bookOpeningBalanceInPaise: books.bookOpeningBalanceInPaise,
      bookClosingBalanceInPaise: books.bookClosingBalanceInPaise,
      bookDebitTotalInPaise: books.bookDebitTotalInPaise,
      bookCreditTotalInPaise: books.bookCreditTotalInPaise,
      differenceInPaise,
      status: nextStatus
    },
    include: {
      bankAccount: true,
      statementImport: true,
      statementLines: {
        include: {
          matches: {
            include: { journalEntry: { select: { id: true, entryNumber: true, entryDate: true } } }
          }
        }
      }
    }
  });
}

export async function reconcileBankReconciliation(input: {
  reconciliationId: string;
  userId?: string;
}) {
  assertBankReconciliationAllowed();
  const row = await recomputeBankReconciliation(input.reconciliationId);
  if (row.status === "RECONCILED") {
    throw new BankReconciliationError("Already reconciled", "ALREADY_RECONCILED", 409);
  }

  if (row.statementClosingBalanceInPaise == null) {
    throw new BankReconciliationError(
      "Statement closing balance is required before reconcile",
      "MISSING_STATEMENT_CLOSING"
    );
  }

  if (row.differenceInPaise !== 0) {
    throw new BankReconciliationError(
      `Difference must be zero to reconcile (current ${row.differenceInPaise} paise)`,
      "NONZERO_DIFFERENCE"
    );
  }

  const lines =
    row.statementLines.length > 0
      ? row.statementLines
      : await prisma.accountingBankStatementLine.findMany({
          where: {
            bankAccountId: row.bankAccountId,
            reconciliationId: row.id
          }
        });

  const unresolved = lines.filter(isUnresolvedLine);
  if (unresolved.length > 0) {
    throw new BankReconciliationError(
      `${unresolved.length} unresolved statement line(s) block reconciliation`,
      "UNRESOLVED_LINES"
    );
  }

  const ignoredWithoutReason = lines.filter(
    (l) => l.matchStatus === "IGNORED" && !(l.categoryNote && l.categoryNote.trim())
  );
  if (ignoredWithoutReason.length > 0) {
    throw new BankReconciliationError(
      "Ignored lines require a reason",
      "IGNORE_REASON_REQUIRED"
    );
  }

  const matchedExact = lines.filter((l) => l.matchStatus === "MATCHED_EXACT");
  const matchedManual = lines.filter((l) => l.matchStatus === "MATCHED_MANUAL");
  const matchedCategorized = lines.filter((l) => l.matchStatus === "MATCHED_CATEGORIZED");
  const ignored = lines.filter((l) => l.matchStatus === "IGNORED");

  const amountOf = (l: { debitInPaise: number; creditInPaise: number }) =>
    l.debitInPaise > 0 ? l.debitInPaise : l.creditInPaise;

  const snapshot: ReconciliationSnapshot = {
    bankAccountId: row.bankAccountId,
    glAccountCode: row.bankAccount.glAccountCode,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    bookOpeningBalanceInPaise: row.bookOpeningBalanceInPaise,
    bookDebitTotalInPaise: row.bookDebitTotalInPaise,
    bookCreditTotalInPaise: row.bookCreditTotalInPaise,
    bookClosingBalanceInPaise: row.bookClosingBalanceInPaise,
    statementOpeningBalanceInPaise: row.statementOpeningBalanceInPaise,
    statementClosingBalanceInPaise: row.statementClosingBalanceInPaise,
    differenceInPaise: 0,
    matchedExactCount: matchedExact.length,
    matchedManualCount: matchedManual.length,
    matchedCategorizedCount: matchedCategorized.length,
    matchedAmountInPaise: [...matchedExact, ...matchedManual, ...matchedCategorized].reduce(
      (s, l) => s + amountOf(l),
      0
    ),
    ignoredCount: ignored.length,
    ignoredAmountInPaise: ignored.reduce((s, l) => s + amountOf(l), 0),
    unresolvedCount: 0,
    unresolvedAmountInPaise: 0,
    lineCount: lines.length,
    reconciledAt: new Date().toISOString(),
    reconciledByUserId: input.userId ?? null
  };

  const updated = await prisma.accountingBankReconciliation.update({
    where: { id: row.id },
    data: {
      status: "RECONCILED",
      differenceInPaise: 0,
      reconciledAt: new Date(),
      reconciledByUserId: input.userId ?? null,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      reopenedAt: null,
      reopenedByUserId: null,
      reopenReason: null
    },
    include: {
      bankAccount: true,
      statementImport: true,
      statementLines: {
        include: {
          matches: {
            include: { journalEntry: { select: { id: true, entryNumber: true, entryDate: true } } }
          }
        }
      }
    }
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_RECONCILIATION_RECONCILED",
    entityType: "AccountingBankReconciliation",
    entityId: updated.id,
    afterJson: {
      differenceInPaise: 0,
      lineCount: lines.length,
      glAccountCode: row.bankAccount.glAccountCode
    }
  });

  return updated;
}

export async function reopenBankReconciliation(input: {
  reconciliationId: string;
  reason: string;
  userId?: string;
}) {
  assertBankReconciliationAllowed();
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw new BankReconciliationError("Reopen requires a reason", "REOPEN_REASON_REQUIRED");
  }

  const row = await prisma.accountingBankReconciliation.findUnique({
    where: { id: input.reconciliationId }
  });
  if (!row) throw new BankReconciliationNotFoundError(input.reconciliationId);
  if (row.status !== "RECONCILED") {
    throw new BankReconciliationError("Only RECONCILED periods can be reopened", "NOT_RECONCILED");
  }

  const updated = await prisma.accountingBankReconciliation.update({
    where: { id: row.id },
    data: {
      status: "REOPENED",
      reopenedAt: new Date(),
      reopenedByUserId: input.userId ?? null,
      reopenReason: reason.slice(0, 2000)
    },
    include: { bankAccount: true, statementImport: true, statementLines: true }
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_RECONCILIATION_REOPENED",
    entityType: "AccountingBankReconciliation",
    entityId: updated.id,
    afterJson: { reason }
  });

  return updated;
}

/** Returns true when statement-line mutation is blocked by a RECONCILED period. */
export async function assertStatementLineUnlocked(lineId: string): Promise<void> {
  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: lineId },
    include: { reconciliation: true }
  });
  if (!line) return;
  if (line.reconciliation?.status === "RECONCILED") {
    throw new BankReconciliationLockedError(
      "Statement line belongs to a RECONCILED period — reopen to change matches/categories"
    );
  }

  // Also lock if any RECONCILED recon covers this line's bank + date via statement import
  const locked = await prisma.accountingBankReconciliation.findFirst({
    where: {
      bankAccountId: line.bankAccountId,
      status: "RECONCILED",
      periodStart: { lte: line.transactionDate },
      periodEnd: { gte: line.transactionDate },
      OR: [
        { statementImportId: line.statementImportId },
        { statementLines: { some: { id: lineId } } }
      ]
    }
  });
  if (locked) {
    throw new BankReconciliationLockedError(
      "Statement line is covered by a RECONCILED period — reopen to change matches/categories"
    );
  }
}

export async function getLatestReconciliationSummary(bankAccountId: string) {
  const latest = await prisma.accountingBankReconciliation.findFirst({
    where: { bankAccountId },
    orderBy: [{ periodEnd: "desc" }, { updatedAt: "desc" }]
  });
  if (!latest) return null;

  const lines = await prisma.accountingBankStatementLine.findMany({
    where: {
      bankAccountId,
      OR: [
        { reconciliationId: latest.id },
        ...(latest.statementImportId
          ? [
              {
                statementImportId: latest.statementImportId,
                transactionDate: { gte: latest.periodStart, lte: latest.periodEnd }
              }
            ]
          : [])
      ]
    },
    select: { matchStatus: true }
  });

  return {
    id: latest.id,
    status: latest.status,
    periodStart: latest.periodStart,
    periodEnd: latest.periodEnd,
    differenceInPaise: latest.differenceInPaise,
    bookClosingBalanceInPaise: latest.bookClosingBalanceInPaise,
    statementClosingBalanceInPaise: latest.statementClosingBalanceInPaise,
    reconciledAt: latest.reconciledAt,
    unmatchedCount: lines.filter((l) => l.matchStatus === "UNMATCHED").length,
    reviewRequiredCount: lines.filter((l) => l.matchStatus === "REVIEW_REQUIRED").length
  };
}

export async function updateReconciliationStatementBalances(input: {
  reconciliationId: string;
  statementOpeningBalanceInPaise?: number | null;
  statementClosingBalanceInPaise?: number | null;
}) {
  assertBankReconciliationAllowed();
  const row = await prisma.accountingBankReconciliation.findUnique({
    where: { id: input.reconciliationId }
  });
  if (!row) throw new BankReconciliationNotFoundError(input.reconciliationId);
  if (row.status === "RECONCILED") {
    throw new BankReconciliationLockedError("Cannot update balances on RECONCILED period");
  }

  await prisma.accountingBankReconciliation.update({
    where: { id: row.id },
    data: {
      statementOpeningBalanceInPaise:
        input.statementOpeningBalanceInPaise !== undefined
          ? input.statementOpeningBalanceInPaise
          : undefined,
      statementClosingBalanceInPaise:
        input.statementClosingBalanceInPaise !== undefined
          ? input.statementClosingBalanceInPaise
          : undefined
    }
  });
  return recomputeBankReconciliation(row.id);
}
