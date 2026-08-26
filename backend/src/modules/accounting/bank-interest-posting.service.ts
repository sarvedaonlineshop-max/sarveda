import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import {
  BankInterestNotEligibleError,
  BankStatementLineNotFoundError
} from "./accounting-errors";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import {
  BANK_INTEREST_CALC_VERSION,
  BANK_INTEREST_DOCUMENT_TYPE,
  BANK_INTEREST_EVENT_TYPE,
  BANK_INTEREST_INCOME_CODE,
  BANK_INTEREST_SOURCE_TYPE,
  bankInterestUniqueKey
} from "./bank-reconciliation.constants";
import { assertStatementLineUnlocked } from "./bank-reconciliation.service";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertBankReconciliationPostingAllowed } from "./production-guard";
import { getAccountingAccountByCode } from "./seed-coa";

export async function categorizeBankInterest(input: {
  statementLineId: string;
  userId?: string;
  note?: string;
  forcePersist?: boolean;
}) {
  if (!input.forcePersist) {
    assertBankReconciliationPostingAllowed();
  }

  await assertStatementLineUnlocked(input.statementLineId);

  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: input.statementLineId },
    include: {
      bankAccount: true,
      matches: { where: { status: "CONFIRMED" } }
    }
  });
  if (!line) throw new BankStatementLineNotFoundError(input.statementLineId);

  if (line.matchStatus === "MATCHED_CATEGORIZED" && line.category === "BANK_INTEREST") {
    const uniqueKeyEarly = bankInterestUniqueKey(line.id);
    const existingEarly = await getPostingEvent(BANK_INTEREST_EVENT_TYPE, uniqueKeyEarly);
    if (existingEarly?.status === "POSTED" && existingEarly.journalEntryId) {
      const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
        where: { id: existingEarly.journalEntryId },
        include: { lines: true }
      });
      return { duplicate: true as const, journal, event: existingEarly, line };
    }
  }

  if (line.debitInPaise > 0 || line.creditInPaise <= 0) {
    throw new BankInterestNotEligibleError(
      "BANK_INTEREST requires a statement credit",
      "DEBIT_LINE_BLOCKED"
    );
  }
  if (line.matches.some((m) => m.status === "CONFIRMED") && line.category !== "BANK_INTEREST") {
    throw new BankInterestNotEligibleError("Line already has a confirmed match", "ALREADY_MATCHED");
  }
  if (line.matches.some((m) => m.status === "CONFIRMED") && line.category === "BANK_INTEREST") {
    const uniqueKeyEarly = bankInterestUniqueKey(line.id);
    const existingEarly = await getPostingEvent(BANK_INTEREST_EVENT_TYPE, uniqueKeyEarly);
    if (existingEarly?.status === "POSTED" && existingEarly.journalEntryId) {
      const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
        where: { id: existingEarly.journalEntryId },
        include: { lines: true }
      });
      return { duplicate: true as const, journal, event: existingEarly, line };
    }
  }
  if (line.matchStatus === "IGNORED") {
    throw new BankInterestNotEligibleError("Ignored line cannot be categorized as interest", "IGNORED_LINE");
  }

  await assertDocumentDateAllowedForPosting(line.transactionDate);
  await assertEntryDateInOpenPeriod(line.transactionDate);

  const income = await getAccountingAccountByCode(BANK_INTEREST_INCOME_CODE);
  const bankGl = await getAccountingAccountByCode(line.bankAccount.glAccountCode);
  if (!income || !bankGl) {
    throw new BankInterestNotEligibleError("Missing CoA for bank interest posting", "MISSING_ACCOUNT");
  }

  const uniqueKey = bankInterestUniqueKey(line.id);
  const existing = await getPostingEvent(BANK_INTEREST_EVENT_TYPE, uniqueKey);
  if (existing?.status === "POSTED" && existing.journalEntryId) {
    const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: existing.journalEntryId },
      include: { lines: true }
    });
    return { duplicate: true as const, journal, event: existing, line };
  }

  const amount = line.creditInPaise;
  const result = await postJournalFromEvent({
    eventType: BANK_INTEREST_EVENT_TYPE,
    sourceType: BANK_INTEREST_SOURCE_TYPE,
    sourceId: line.id,
    uniqueKey,
    payloadJson: {
      calcVersion: BANK_INTEREST_CALC_VERSION,
      statementLineId: line.id,
      bankAccountId: line.bankAccountId,
      amountInPaise: amount
    } as Prisma.InputJsonValue,
    entryDate: line.transactionDate,
    memo: `${BANK_INTEREST_CALC_VERSION} ${line.description.slice(0, 80)}`,
    currency: line.bankAccount.currency,
    postedByUserId: input.userId,
    lines: [
      {
        accountId: bankGl.id,
        debitInPaise: amount,
        creditInPaise: 0,
        lineMemo: `Bank interest from statement`,
        sortOrder: 0
      },
      {
        accountId: income.id,
        debitInPaise: 0,
        creditInPaise: amount,
        lineMemo: `Interest income ${line.reference ?? line.rowNumber}`,
        sortOrder: 1
      }
    ]
  });

  await prisma.$transaction(async (tx) => {
    await tx.accountingBankStatementLine.update({
      where: { id: line.id },
      data: {
        category: "BANK_INTEREST",
        categoryNote: input.note ?? null,
        categorizedAt: new Date(),
        categorizedByUserId: input.userId ?? null,
        matchStatus: "MATCHED_CATEGORIZED"
      }
    });
    await tx.accountingBankStatementMatch.create({
      data: {
        statementLineId: line.id,
        journalEntryId: result.journal.id,
        matchType: "BANK_INTEREST",
        confidence: "EXACT",
        status: "CONFIRMED",
        matchedAmountInPaise: amount,
        bankGlAccountCode: line.bankAccount.glAccountCode,
        sourceEntityType: "AccountingBankStatementLine",
        sourceEntityId: line.id,
        evidenceJson: ["BANK_INTEREST_V1", "ADMIN_CONFIRMED"],
        matchedByUserId: input.userId ?? null,
        matchedAt: new Date()
      }
    });
    await tx.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: BANK_INTEREST_DOCUMENT_TYPE,
          documentId: line.id,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: BANK_INTEREST_DOCUMENT_TYPE,
        documentId: line.id,
        journalEntryId: result.journal.id
      },
      update: {}
    });
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_INTEREST_POSTED",
    entityType: "AccountingBankStatementLine",
    entityId: line.id,
    afterJson: {
      journalEntryId: result.journal.id,
      entryNumber: result.journal.entryNumber,
      amountInPaise: amount
    }
  });
  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_STATEMENT_LINE_CATEGORIZED",
    entityType: "AccountingBankStatementLine",
    entityId: line.id,
    afterJson: { category: "BANK_INTEREST" }
  });

  const updated = await prisma.accountingBankStatementLine.findUniqueOrThrow({
    where: { id: line.id },
    include: { matches: { include: { journalEntry: true } } }
  });

  return { duplicate: false as const, journal: result.journal, event: result.event, line: updated };
}
