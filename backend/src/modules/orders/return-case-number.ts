import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

const RETURN_CASE_SEQUENCE = "RETURN_CASE";

function yearMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Concurrency-safe case number: RC-YYYYMM-00001 */
export async function nextReturnCaseNumberInTx(
  tx: DbClient,
  at: Date = new Date()
): Promise<string> {
  const ym = yearMonthKey(at);
  const prefix = "RC";

  const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "AccountingSequence" ("id", "sequenceType", "prefix", "yearMonth", "lastSeq", "updatedAt")
    VALUES (gen_random_uuid(), ${RETURN_CASE_SEQUENCE}, ${prefix}, ${ym}, 1, NOW())
    ON CONFLICT ("sequenceType", "yearMonth")
    DO UPDATE SET
      "lastSeq" = "AccountingSequence"."lastSeq" + 1,
      "updatedAt" = NOW()
    RETURNING "lastSeq"
  `;

  const lastSeq = rows[0]?.lastSeq;
  if (lastSeq == null) {
    throw new Error("Failed to allocate return case number sequence");
  }

  return `${prefix}-${ym}-${String(lastSeq).padStart(5, "0")}`;
}

export async function nextReturnCaseNumber(at: Date = new Date()): Promise<string> {
  return prisma.$transaction(async (tx) => nextReturnCaseNumberInTx(tx, at));
}
