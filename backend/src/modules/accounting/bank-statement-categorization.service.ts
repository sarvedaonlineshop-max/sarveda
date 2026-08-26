import { prisma } from "../../config/db";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  BankReconciliationError,
  BankStatementLineNotFoundError
} from "./accounting-errors";
import { assertStatementLineUnlocked } from "./bank-reconciliation.service";
import { assertBankReconciliationAllowed } from "./production-guard";

export async function ignoreStatementLine(input: {
  statementLineId: string;
  reason: string;
  userId?: string;
}) {
  assertBankReconciliationAllowed();
  await assertStatementLineUnlocked(input.statementLineId);

  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) {
    throw new BankReconciliationError("Ignore requires a reason", "IGNORE_REASON_REQUIRED");
  }

  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: input.statementLineId },
    include: { matches: { where: { status: "CONFIRMED" } } }
  });
  if (!line) throw new BankStatementLineNotFoundError(input.statementLineId);
  if (line.matches.length > 0) {
    throw new BankReconciliationError(
      "Unmatch confirmed matches before ignoring",
      "ALREADY_MATCHED"
    );
  }

  const updated = await prisma.accountingBankStatementLine.update({
    where: { id: line.id },
    data: {
      matchStatus: "IGNORED",
      category: "IGNORE",
      categoryNote: reason.slice(0, 2000),
      categorizedAt: new Date(),
      categorizedByUserId: input.userId ?? null
    }
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_STATEMENT_LINE_IGNORED",
    entityType: "AccountingBankStatementLine",
    entityId: line.id,
    afterJson: { reason: reason.slice(0, 500) }
  });

  return updated;
}

export async function markStatementLineUnknown(input: {
  statementLineId: string;
  note?: string;
  userId?: string;
}) {
  assertBankReconciliationAllowed();
  await assertStatementLineUnlocked(input.statementLineId);

  const line = await prisma.accountingBankStatementLine.findUnique({
    where: { id: input.statementLineId }
  });
  if (!line) throw new BankStatementLineNotFoundError(input.statementLineId);

  const updated = await prisma.accountingBankStatementLine.update({
    where: { id: line.id },
    data: {
      category: "UNKNOWN",
      categoryNote: input.note?.slice(0, 2000) ?? null,
      categorizedAt: new Date(),
      categorizedByUserId: input.userId ?? null,
      matchStatus: line.matchStatus === "UNMATCHED" ? "REVIEW_REQUIRED" : line.matchStatus
    }
  });

  await writeAccountingAuditLog({
    actorUserId: input.userId,
    action: "BANK_STATEMENT_LINE_CATEGORIZED",
    entityType: "AccountingBankStatementLine",
    entityId: line.id,
    afterJson: { category: "UNKNOWN" }
  });

  return updated;
}
