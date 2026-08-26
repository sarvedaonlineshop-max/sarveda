import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

const BANK_TRANSFER_SEQUENCE = "BANK_TRANSFER";

function yearMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Atomic BT-YYYYMM-00001 inside caller transaction. */
export async function nextBankTransferNumberInTx(
  tx: DbClient,
  transferDate: Date
): Promise<string> {
  const ym = yearMonthKey(transferDate);
  const prefix = "BT";

  const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "AccountingSequence" ("id", "sequenceType", "prefix", "yearMonth", "lastSeq", "updatedAt")
    VALUES (gen_random_uuid(), ${BANK_TRANSFER_SEQUENCE}, ${prefix}, ${ym}, 1, NOW())
    ON CONFLICT ("sequenceType", "yearMonth")
    DO UPDATE SET
      "lastSeq" = "AccountingSequence"."lastSeq" + 1,
      "updatedAt" = NOW()
    RETURNING "lastSeq"
  `;

  const lastSeq = rows[0]?.lastSeq;
  if (lastSeq == null) {
    throw new Error("Failed to allocate bank transfer sequence");
  }

  return `${prefix}-${ym}-${String(lastSeq).padStart(5, "0")}`;
}
