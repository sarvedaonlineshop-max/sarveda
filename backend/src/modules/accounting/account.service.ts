import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { SystemAccountProtectedError } from "./accounting-errors";
import { writeAccountingAuditLog } from "./accounting-audit.service";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function deactivateAccountingAccount(
  accountId: string,
  actorUserId?: string,
  db: DbClient = prisma
) {
  const account = await db.accountingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw Object.assign(new Error("Account not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (account.isSystem) {
    throw new SystemAccountProtectedError("deactivated");
  }

  const updated = await db.accountingAccount.update({
    where: { id: accountId },
    data: { isActive: false }
  });

  await writeAccountingAuditLog(
    {
      actorUserId,
      action: "ACCOUNT_DEACTIVATED",
      entityType: "AccountingAccount",
      entityId: accountId,
      beforeJson: { isActive: account.isActive, code: account.code },
      afterJson: { isActive: false, code: account.code }
    },
    db
  );

  return updated;
}

export async function deleteAccountingAccount(accountId: string, db: DbClient = prisma): Promise<void> {
  const account = await db.accountingAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw Object.assign(new Error("Account not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (account.isSystem) {
    throw new SystemAccountProtectedError("deleted");
  }

  const lineCount = await db.accountingJournalLine.count({ where: { accountId } });
  if (lineCount > 0) {
    throw Object.assign(new Error("Account has journal lines and cannot be deleted"), {
      statusCode: 409,
      code: "ACCOUNT_IN_USE"
    });
  }

  await db.accountingAccount.delete({ where: { id: accountId } });
}
