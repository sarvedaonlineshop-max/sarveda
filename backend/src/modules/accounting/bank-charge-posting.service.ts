import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import {
  BankChargeNotEligibleError,
  BankReconciliationLockedError,
  BankStatementLineNotFoundError
} from "./accounting-errors";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import {
  BANK_CHARGE_CALC_VERSION,
  BANK_CHARGE_DOCUMENT_TYPE,
  BANK_CHARGE_EVENT_TYPE,
  BANK_CHARGE_EXPENSE_CODE,
  BANK_CHARGE_SOURCE_TYPE,
  bankChargeUniqueKey
} from "./bank-reconciliation.constants";
import { assertStatementLineUnlocked } from "./bank-reconciliation.service";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertBankReconciliationPostingAllowed } from "./production-guard";
import { getAccountingAccountByCode } from "./seed-coa";
import { STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS } from "./bank-statement.constants";

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000);
}

async function detectPossibleDuplicateGatewayFee(input: {
  bankAccountId: string;
  amountInPaise: number;
  transactionDate: Date;
}): Promise<boolean> {
  const from = new Date(input.transactionDate);
  from.setUTCDate(from.getUTCDate() - STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS);
  const to = new Date(input.transactionDate);
  to.setUTCDate(to.getUTCDate() + STATEMENT_POSSIBLE_DATE_TOLERANCE_DAYS);

  const settlement = await prisma.accountingGatewaySettlement.findFirst({
    where: {
      status: "POSTED",
      targetBankAccountId: input.bankAccountId,
      feeInPaise: { gt: 0 },
      settledAt: { gte: from, lte: to },
      OR: [{ feeInPaise: input.amountInPaise }, { taxInPaise: input.amountInPaise }]
    }
  });
  if (settlement) return true;

  // Also treat fee portion of net settlement near date as possible duplicate signal
  const nearFee = await prisma.accountingGatewaySettlement.findFirst({
    where: {
      status: "POSTED",
      targetBankAccountId: input.bankAccountId,
      settledAt: { gte: from, lte: to },
      feeInPaise: input.amountInPaise
    }
  });
  return Boolean(nearFee);
}

export async function categorizeBankCharge(input: {
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

  if (line.matchStatus === "MATCHED_CATEGORIZED" && line.category === "BANK_CHARGE") {
    const uniqueKeyEarly = bankChargeUniqueKey(line.id);
    const existingEarly = await getPostingEvent(BANK_CHARGE_EVENT_TYPE, uniqueKeyEarly);
    if (existingEarly?.status === "POSTED" && existingEarly.journalEntryId) {
      const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
        where: { id: existingEarly.journalEntryId },
        include: { lines: true }
      });
      return { duplicate: true as const, journal, event: existingEarly, line };
    }
  }

  if (line.creditInPaise > 0 || line.debitInPaise <= 0) {
    throw new BankChargeNotEligibleError("BANK_CHARGE requires a statement debit", "CREDIT_LINE_BLOCKED");
  }
  if (line.matches.some((m) => m.status === "CONFIRMED") && line.category !== "BANK_CHARGE") {
    throw new BankChargeNotEligibleError("Line already has a confirmed match", "ALREADY_MATCHED");
  }
  if (line.matches.some((m) => m.status === "CONFIRMED") && line.category === "BANK_CHARGE") {
    const uniqueKeyEarly = bankChargeUniqueKey(line.id);
    const existingEarly = await getPostingEvent(BANK_CHARGE_EVENT_TYPE, uniqueKeyEarly);
    if (existingEarly?.status === "POSTED" && existingEarly.journalEntryId) {
      const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
        where: { id: existingEarly.journalEntryId },
        include: { lines: true }
      });
      return { duplicate: true as const, journal, event: existingEarly, line };
    }
  }
  if (line.matchStatus === "IGNORED") {
    throw new BankChargeNotEligibleError("Ignored line cannot be categorized as charge", "IGNORED_LINE");
  }

  const possibleDup = await detectPossibleDuplicateGatewayFee({
    bankAccountId: line.bankAccountId,
    amountInPaise: line.debitInPaise,
    transactionDate: line.transactionDate
  });
  if (possibleDup) {
    await prisma.accountingBankStatementLine.update({
      where: { id: line.id },
      data: {
        category: "POSSIBLE_DUPLICATE_GATEWAY_FEE",
        categoryNote: input.note ?? "Possible Razorpay/gateway fee already recognized",
        categorizedAt: new Date(),
        categorizedByUserId: input.userId ?? null,
        matchStatus: "REVIEW_REQUIRED"
      }
    });
    await writeAccountingAuditLog({
      actorUserId: input.userId,
      action: "BANK_STATEMENT_LINE_CATEGORIZED",
      entityType: "AccountingBankStatementLine",
      entityId: line.id,
      afterJson: { category: "POSSIBLE_DUPLICATE_GATEWAY_FEE" }
    });
    throw new BankChargeNotEligibleError(
      "Possible duplicate of gateway fee already recognized — review required",
      "POSSIBLE_DUPLICATE_GATEWAY_FEE",
      409
    );
  }

  await assertDocumentDateAllowedForPosting(line.transactionDate);
  await assertEntryDateInOpenPeriod(line.transactionDate);

  const expense = await getAccountingAccountByCode(BANK_CHARGE_EXPENSE_CODE);
  const bankGl = await getAccountingAccountByCode(line.bankAccount.glAccountCode);
  if (!expense || !bankGl) {
    throw new BankChargeNotEligibleError("Missing CoA for bank charge posting", "MISSING_ACCOUNT");
  }

  const uniqueKey = bankChargeUniqueKey(line.id);
  const existing = await getPostingEvent(BANK_CHARGE_EVENT_TYPE, uniqueKey);
  if (existing?.status === "POSTED" && existing.journalEntryId) {
    const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: existing.journalEntryId },
      include: { lines: true }
    });
    return { duplicate: true as const, journal, event: existing, line };
  }

  const amount = line.debitInPaise;
  const result = await postJournalFromEvent({
    eventType: BANK_CHARGE_EVENT_TYPE,
    sourceType: BANK_CHARGE_SOURCE_TYPE,
    sourceId: line.id,
    uniqueKey,
    payloadJson: {
      calcVersion: BANK_CHARGE_CALC_VERSION,
      statementLineId: line.id,
      bankAccountId: line.bankAccountId,
      amountInPaise: amount
    } as Prisma.InputJsonValue,
    entryDate: line.transactionDate,
    memo: `${BANK_CHARGE_CALC_VERSION} ${line.description.slice(0, 80)}`,
    currency: line.bankAccount.currency,
    postedByUserId: input.userId,
    lines: [
      {
        accountId: expense.id,
        debitInPaise: amount,
        creditInPaise: 0,
        lineMemo: `Bank charge ${line.reference ?? line.rowNumber}`,
        sortOrder: 0
      },
      {
        accountId: bankGl.id,
        debitInPaise: 0,
        creditInPaise: amount,
        lineMemo: `Bank charge from statement`,
        sortOrder: 1
      }
    ]
  });

  await prisma.$transaction(async (tx) => {
    await tx.accountingBankStatementLine.update({
      where: { id: line.id },
      data: {
        category: "BANK_CHARGE",
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
        matchType: "BANK_CHARGE",
        confidence: "EXACT",
        status: "CONFIRMED",
        matchedAmountInPaise: amount,
        bankGlAccountCode: line.bankAccount.glAccountCode,
        sourceEntityType: "AccountingBankStatementLine",
        sourceEntityId: line.id,
        evidenceJson: ["BANK_CHARGE_V1", "ADMIN_CONFIRMED"],
        matchedByUserId: input.userId ?? null,
        matchedAt: new Date()
      }
    });
    await tx.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: BANK_CHARGE_DOCUMENT_TYPE,
          documentId: line.id,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: BANK_CHARGE_DOCUMENT_TYPE,
        documentId: line.id,
        journalEntryId: result.journal.id
      },
      update: {}
    });
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_CHARGE_POSTED",
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
    afterJson: { category: "BANK_CHARGE" }
  });

  const updated = await prisma.accountingBankStatementLine.findUniqueOrThrow({
    where: { id: line.id },
    include: { matches: { include: { journalEntry: true } } }
  });

  return { duplicate: false as const, journal: result.journal, event: result.event, line: updated };
}

void BankReconciliationLockedError;
void daysBetween;
