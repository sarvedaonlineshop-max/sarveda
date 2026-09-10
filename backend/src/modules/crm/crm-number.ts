import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CrmSequenceType = "LEAD" | "ACC" | "CON" | "DEAL";

function yearMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/**
 * Allocate the next CRM document number inside a transaction.
 * Format: PREFIX-YYYYMM-00001 (e.g. LEAD-202609-00001)
 */
export async function nextCrmNumberInTx(
  tx: DbClient,
  sequenceType: CrmSequenceType,
  at: Date = new Date()
): Promise<string> {
  const ym = yearMonthKey(at);
  const prefix = sequenceType;

  const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "CrmSequence" ("id", "sequenceType", "prefix", "yearMonth", "lastSeq", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${sequenceType}, ${prefix}, ${ym}, 1, NOW(), NOW())
    ON CONFLICT ("sequenceType", "yearMonth")
    DO UPDATE SET
      "lastSeq" = "CrmSequence"."lastSeq" + 1,
      "updatedAt" = NOW()
    RETURNING "lastSeq"
  `;

  const lastSeq = rows[0]?.lastSeq;
  if (lastSeq == null) {
    throw new Error(`Failed to allocate CRM sequence for ${sequenceType}`);
  }

  return `${prefix}-${ym}-${String(lastSeq).padStart(5, "0")}`;
}

export async function nextCrmNumber(
  sequenceType: CrmSequenceType,
  at: Date = new Date()
): Promise<string> {
  return prisma.$transaction(async (tx) => nextCrmNumberInTx(tx, sequenceType, at));
}
