import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AuditAction =
  | "ACCOUNT_CREATED"
  | "ACCOUNT_MODIFIED"
  | "ACCOUNT_DEACTIVATED"
  | "JOURNAL_POSTED"
  | "POSTING_REJECTED"
  | "POSTING_FAILED"
  | "POSTING_RETRY"
  | "POSTING_SKIPPED"
  | "PERIOD_CLOSED"
  | "BANK_ACCOUNT_CREATED"
  | "BANK_ACCOUNT_MODIFIED"
  | "BANK_ACCOUNT_DEACTIVATED"
  | "BANK_TRANSFER_POSTED"
  | "STATEMENT_IMPORTED"
  | "STATEMENT_MATCHED"
  | "STATEMENT_UNMATCHED"
  | "BANK_RECONCILIATION_CREATED"
  | "BANK_RECONCILIATION_RECONCILED"
  | "BANK_RECONCILIATION_REOPENED"
  | "BANK_STATEMENT_LINE_CATEGORIZED"
  | "BANK_STATEMENT_LINE_IGNORED"
  | "BANK_CHARGE_POSTED"
  | "BANK_INTEREST_POSTED"
  | "ITC_STATUS_CHANGED";

export async function writeAccountingAuditLog(
  input: {
    actorUserId?: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    beforeJson?: Prisma.InputJsonValue;
    afterJson?: Prisma.InputJsonValue;
  },
  db: DbClient = prisma
): Promise<void> {
  await db.accountingAuditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson
    }
  });
}
