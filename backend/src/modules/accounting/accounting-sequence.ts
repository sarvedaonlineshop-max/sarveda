import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

const JOURNAL_SEQUENCE = "JOURNAL";

function yearMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Concurrency-safe journal entry number inside caller transaction: JE-YYYYMM-00001 */
export async function nextJournalEntryNumberInTx(
  tx: DbClient,
  entryDate: Date
): Promise<string> {
  const ym = yearMonthKey(entryDate);
  const prefix = "JE";

  // Single-statement upsert+increment avoids lost updates and reduces deadlock risk.
  const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "AccountingSequence" ("id", "sequenceType", "prefix", "yearMonth", "lastSeq", "updatedAt")
    VALUES (gen_random_uuid(), ${JOURNAL_SEQUENCE}, ${prefix}, ${ym}, 1, NOW())
    ON CONFLICT ("sequenceType", "yearMonth")
    DO UPDATE SET
      "lastSeq" = "AccountingSequence"."lastSeq" + 1,
      "updatedAt" = NOW()
    RETURNING "lastSeq"
  `;

  const lastSeq = rows[0]?.lastSeq;
  if (lastSeq == null) {
    throw new Error("Failed to allocate journal entry sequence");
  }

  return `${prefix}-${ym}-${String(lastSeq).padStart(5, "0")}`;
}

/** Standalone helper — wraps its own transaction (prefer nextJournalEntryNumberInTx). */
export async function nextJournalEntryNumber(entryDate: Date): Promise<string> {
  return prisma.$transaction(async (tx) => nextJournalEntryNumberInTx(tx, entryDate));
}
