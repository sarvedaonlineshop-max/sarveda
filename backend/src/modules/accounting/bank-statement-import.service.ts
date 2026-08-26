import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  BankStatementDuplicateFileError,
  BankStatementImportError,
  BankStatementImportNotFoundError
} from "./accounting-errors";
import { assertBankAccountPostable, getBankAccountById } from "./bank-account.service";
import { assertBankStatementImportAllowed } from "./production-guard";
import {
  buildTransactionFingerprint,
  findDuplicateRowNumbers,
  hashStatementFile,
  parseBankStatementFile,
  summarizeStatementTransactions
} from "./bank-statement-parser.service";
import { runStatementMatchingForImport } from "./bank-statement-matching.service";
import { STATEMENT_SUPPORTED_CURRENCIES } from "./bank-statement.constants";
import type { StatementPreviewResult } from "./bank-statement.types";

function isBankStatementAccount(accountType: string): boolean {
  return accountType === "BANK";
}

export async function previewBankStatementImport(input: {
  bankAccountId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<StatementPreviewResult> {
  assertBankStatementImportAllowed();

  const bank = await getBankAccountById(input.bankAccountId);
  if (!bank.isActive) {
    throw new BankStatementImportError("Bank account is inactive", "INACTIVE_BANK_ACCOUNT");
  }
  if (!isBankStatementAccount(bank.accountType)) {
    throw new BankStatementImportError(
      "Bank statements are only supported for BANK accounts (not cash/petty cash)",
      "INVALID_ACCOUNT_TYPE"
    );
  }
  if (!STATEMENT_SUPPORTED_CURRENCIES.includes(bank.currency as "INR")) {
    throw new BankStatementImportError(
      `Unsupported currency ${bank.currency} — V1 supports INR only`,
      "UNSUPPORTED_CURRENCY"
    );
  }

  const fileHash = hashStatementFile(input.buffer);
  const existingFile = await prisma.accountingBankStatementImport.findUnique({
    where: {
      bankAccountId_fileHash: {
        bankAccountId: input.bankAccountId,
        fileHash
      }
    }
  });
  if (existingFile?.importStatus === "IMPORTED") {
    throw new BankStatementDuplicateFileError();
  }

  let parsed;
  try {
    parsed = await parseBankStatementFile({
      buffer: input.buffer,
      fileName: input.fileName
    });
  } catch (err) {
    throw new BankStatementImportError(
      err instanceof Error ? err.message : "Failed to parse statement file",
      "STATEMENT_PARSE_FAILED"
    );
  }

  const duplicateRowsInFile = findDuplicateRowNumbers(parsed.transactions);
  const summary = summarizeStatementTransactions(parsed.transactions);

  if (summary.statementFrom && summary.statementTo && summary.statementFrom > summary.statementTo) {
    throw new BankStatementImportError("Impossible statement date range", "INVALID_DATE_RANGE");
  }

  const sampleTransactions = parsed.transactions.slice(0, 5).map((t) => ({
    rowNumber: t.rowNumber,
    transactionDate: t.transactionDate.toISOString().slice(0, 10),
    description: t.description,
    reference: t.reference,
    debitInPaise: t.debitInPaise,
    creditInPaise: t.creditInPaise,
    runningBalanceInPaise: t.runningBalanceInPaise
  }));

  return {
    bankAccountId: input.bankAccountId,
    fileName: input.fileName,
    fileHash,
    currency: bank.currency,
    detectedColumns: parsed.detectedColumns,
    rowCount: parsed.transactions.length + parsed.errors.length,
    validRowCount: parsed.transactions.length,
    invalidRows: parsed.errors,
    duplicateRowsInFile,
    statementFrom: summary.statementFrom?.toISOString().slice(0, 10) ?? null,
    statementTo: summary.statementTo?.toISOString().slice(0, 10) ?? null,
    openingBalanceInPaise: summary.openingBalanceInPaise,
    closingBalanceInPaise: summary.closingBalanceInPaise,
    debitTotalInPaise: summary.debitTotalInPaise,
    creditTotalInPaise: summary.creditTotalInPaise,
    sampleTransactions,
    canCommit:
      parsed.transactions.length > 0 &&
      parsed.errors.length === 0 &&
      duplicateRowsInFile.length === 0
  };
}

export async function commitBankStatementImport(input: {
  bankAccountId: string;
  fileName: string;
  buffer: Buffer;
  importedByUserId?: string;
}) {
  assertBankStatementImportAllowed();

  const preview = await previewBankStatementImport(input);
  if (!preview.canCommit) {
    throw new BankStatementImportError(
      "Statement cannot be committed — fix invalid or duplicate rows first",
      "STATEMENT_NOT_COMMITTABLE"
    );
  }

  const parsed = await parseBankStatementFile({
    buffer: input.buffer,
    fileName: input.fileName
  });

  const bank = await assertBankAccountPostable(input.bankAccountId);
  const summary = summarizeStatementTransactions(parsed.transactions);
  const now = new Date();

  const importRow = await prisma.$transaction(async (tx) => {
    const created = await tx.accountingBankStatementImport.create({
      data: {
        bankAccountId: input.bankAccountId,
        fileName: input.fileName,
        fileHash: preview.fileHash,
        statementFrom: summary.statementFrom,
        statementTo: summary.statementTo,
        openingBalanceInPaise: summary.openingBalanceInPaise,
        closingBalanceInPaise: summary.closingBalanceInPaise,
        currency: bank.currency,
        importStatus: "IMPORTED",
        rowCount: parsed.transactions.length,
        debitTotalInPaise: summary.debitTotalInPaise,
        creditTotalInPaise: summary.creditTotalInPaise,
        importedByUserId: input.importedByUserId ?? null,
        committedAt: now
      }
    });

    for (const txRow of parsed.transactions) {
      const fingerprint = buildTransactionFingerprint({
        bankAccountId: input.bankAccountId,
        transactionDate: txRow.transactionDate,
        valueDate: txRow.valueDate,
        debitInPaise: txRow.debitInPaise,
        creditInPaise: txRow.creditInPaise,
        reference: txRow.reference,
        description: txRow.description,
        runningBalanceInPaise: txRow.runningBalanceInPaise
      });

      const existingLine = await tx.accountingBankStatementLine.findUnique({
        where: {
          bankAccountId_transactionFingerprint: {
            bankAccountId: input.bankAccountId,
            transactionFingerprint: fingerprint
          }
        }
      });

      await tx.accountingBankStatementLine.create({
        data: {
          statementImportId: created.id,
          bankAccountId: input.bankAccountId,
          rowNumber: txRow.rowNumber,
          transactionDate: txRow.transactionDate,
          valueDate: txRow.valueDate,
          description: txRow.description,
          reference: txRow.reference,
          debitInPaise: txRow.debitInPaise,
          creditInPaise: txRow.creditInPaise,
          runningBalanceInPaise: txRow.runningBalanceInPaise,
          transactionFingerprint: fingerprint,
          matchStatus: existingLine ? "DUPLICATE" : "UNMATCHED"
        }
      });
    }

    return created;
  });

  await runStatementMatchingForImport(importRow.id);

  await writeAccountingAuditLog({
    actorUserId: input.importedByUserId,
    action: "STATEMENT_IMPORTED",
    entityType: "AccountingBankStatementImport",
    entityId: importRow.id,
    afterJson: {
      bankAccountId: input.bankAccountId,
      fileName: input.fileName,
      rowCount: importRow.rowCount
    } as Prisma.InputJsonValue
  });

  return getBankStatementImportById(importRow.id);
}

export async function listBankStatementImports(bankAccountId?: string, limit = 50) {
  return prisma.accountingBankStatementImport.findMany({
    where: bankAccountId ? { bankAccountId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      bankAccount: { select: { id: true, name: true, glAccountCode: true } },
      _count: { select: { lines: true } }
    }
  });
}

export async function getBankStatementImportById(importId: string) {
  const row = await prisma.accountingBankStatementImport.findUnique({
    where: { id: importId },
    include: {
      bankAccount: true,
      lines: {
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
  if (!row) throw new BankStatementImportNotFoundError(importId);
  return row;
}

export async function listBankStatementLines(input: {
  importId?: string;
  bankAccountId?: string;
  matchStatus?: string;
  limit?: number;
}) {
  return prisma.accountingBankStatementLine.findMany({
    where: {
      statementImportId: input.importId,
      bankAccountId: input.bankAccountId,
      matchStatus: input.matchStatus as never
    },
    orderBy: [{ transactionDate: "desc" }, { rowNumber: "asc" }],
    take: input.limit ?? 200,
    include: {
      matches: {
        include: {
          journalEntry: { select: { id: true, entryNumber: true, entryDate: true } }
        }
      },
      statementImport: { select: { id: true, fileName: true, committedAt: true } }
    }
  });
}

export async function getLatestImportedStatementBalance(bankAccountId: string): Promise<number | null> {
  const latest = await prisma.accountingBankStatementImport.findFirst({
    where: { bankAccountId, importStatus: "IMPORTED" },
    orderBy: { committedAt: "desc" },
    select: { closingBalanceInPaise: true }
  });
  return latest?.closingBalanceInPaise ?? null;
}
