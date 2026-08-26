import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { ClosedAccountingPeriodError } from "./accounting-errors";

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Reject journal posting when entryDate falls in a CLOSED accounting period. */
export async function assertEntryDateInOpenPeriod(
  entryDate: Date,
  db: DbClient = prisma
): Promise<void> {
  const closed = await db.accountingPeriod.findFirst({
    where: {
      status: "CLOSED",
      startDate: { lte: entryDate },
      endDate: { gte: entryDate }
    },
    select: { id: true, name: true }
  });

  if (closed) {
    throw new ClosedAccountingPeriodError(closed.name);
  }
}

export async function findPeriodForDate(entryDate: Date, db: DbClient = prisma) {
  return db.accountingPeriod.findFirst({
    where: {
      startDate: { lte: entryDate },
      endDate: { gte: entryDate }
    }
  });
}
