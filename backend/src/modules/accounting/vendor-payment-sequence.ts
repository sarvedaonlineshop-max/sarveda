import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

const VENDOR_PAYMENT_SEQUENCE = "VENDOR_PAYMENT";

function yearMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Atomic VP-YYYYMM-00001 inside caller transaction. */
export async function nextVendorPaymentNumberInTx(
  tx: DbClient,
  paymentDate: Date
): Promise<string> {
  const ym = yearMonthKey(paymentDate);
  const prefix = "VP";

  const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "AccountingSequence" ("id", "sequenceType", "prefix", "yearMonth", "lastSeq", "updatedAt")
    VALUES (gen_random_uuid(), ${VENDOR_PAYMENT_SEQUENCE}, ${prefix}, ${ym}, 1, NOW())
    ON CONFLICT ("sequenceType", "yearMonth")
    DO UPDATE SET
      "lastSeq" = "AccountingSequence"."lastSeq" + 1,
      "updatedAt" = NOW()
    RETURNING "lastSeq"
  `;

  const lastSeq = rows[0]?.lastSeq;
  if (lastSeq == null) {
    throw new Error("Failed to allocate vendor payment sequence");
  }

  return `${prefix}-${ym}-${String(lastSeq).padStart(5, "0")}`;
}
