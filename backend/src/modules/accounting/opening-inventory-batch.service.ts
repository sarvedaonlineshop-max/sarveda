import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { OPENING_BATCH_SEQUENCE_TYPE } from "./inventory.constants";

type DbClient = Prisma.TransactionClient | typeof prisma;

function yearMonthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export async function nextOpeningBatchNumberInTx(tx: DbClient, effectiveDate: Date): Promise<string> {
  const ym = yearMonthKey(effectiveDate);
  const prefix = "INV-OPEN";

  const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
    INSERT INTO "AccountingSequence" ("id", "sequenceType", "prefix", "yearMonth", "lastSeq", "updatedAt")
    VALUES (gen_random_uuid(), ${OPENING_BATCH_SEQUENCE_TYPE}, ${prefix}, ${ym}, 1, NOW())
    ON CONFLICT ("sequenceType", "yearMonth")
    DO UPDATE SET
      "lastSeq" = "AccountingSequence"."lastSeq" + 1,
      "updatedAt" = NOW()
    RETURNING "lastSeq"
  `;

  const lastSeq = rows[0]?.lastSeq;
  if (lastSeq == null) throw new Error("Failed to allocate opening batch sequence");
  return `${prefix}-${ym}-${String(lastSeq).padStart(5, "0")}`;
}

export async function saveOpeningBatchDraft(input: {
  preview: import("./inventory.types").OpeningImportPreview;
  createdByUserId?: string;
  batchId?: string;
}) {
  const eligible = input.preview.rows.filter((r) => !r.excluded);
  if (eligible.length === 0) {
    throw Object.assign(new Error("No eligible physical SKUs"), { code: "OPENING_NO_ELIGIBLE_ROWS" });
  }

  return prisma.$transaction(async (tx) => {
    const effectiveDate = new Date(input.preview.effectiveDate);
    const batchNumber =
      input.batchId != null
        ? (
            await tx.accountingInventoryOpeningBatch.findUniqueOrThrow({
              where: { id: input.batchId },
              select: { batchNumber: true, status: true }
            })
          ).batchNumber
        : await nextOpeningBatchNumberInTx(tx, effectiveDate);

    if (input.batchId) {
      const existing = await tx.accountingInventoryOpeningBatch.findUniqueOrThrow({
        where: { id: input.batchId }
      });
      if (existing.status === "POSTED") {
        throw Object.assign(new Error("Posted batch is immutable"), { code: "OPENING_BATCH_IMMUTABLE" });
      }
      await tx.accountingInventoryOpeningBatchItem.deleteMany({ where: { batchId: input.batchId } });
    }

    const batch = input.batchId
      ? await tx.accountingInventoryOpeningBatch.update({
          where: { id: input.batchId },
          data: {
            effectiveDate,
            valuationSource: input.preview.valuationSource,
            sourceDocumentRef: input.preview.sourceDocumentRef,
            preparedBy: input.preview.preparedBy,
            reviewedBy: input.preview.reviewedBy,
            status: "VALIDATED",
            totalQuantity: input.preview.totals.quantity,
            totalValueInPaise: input.preview.totals.valueInPaise,
            sourceFileName: input.preview.sourceFileName,
            sourcePayloadHash: input.preview.sourcePayloadHash,
            allowQuantityMismatch: input.preview.allowQuantityMismatch,
            createdByUserId: input.createdByUserId
          }
        })
      : await tx.accountingInventoryOpeningBatch.create({
          data: {
            batchNumber,
            effectiveDate,
            valuationSource: input.preview.valuationSource,
            sourceDocumentRef: input.preview.sourceDocumentRef,
            preparedBy: input.preview.preparedBy,
            reviewedBy: input.preview.reviewedBy,
            status: "VALIDATED",
            totalQuantity: input.preview.totals.quantity,
            totalValueInPaise: input.preview.totals.valueInPaise,
            sourceFileName: input.preview.sourceFileName,
            sourcePayloadHash: input.preview.sourcePayloadHash,
            allowQuantityMismatch: input.preview.allowQuantityMismatch,
            createdByUserId: input.createdByUserId
          }
        });

    await tx.accountingInventoryOpeningBatchItem.createMany({
      data: eligible.map((row, index) => ({
        batchId: batch.id,
        variantId: row.variantId,
        sku: row.sku,
        openingQuantity: row.openingQuantity,
        unitCostInPaise: row.unitCostInPaise,
        totalCostInPaise: row.totalCostInPaise,
        operationalOnHand: row.operationalOnHand,
        quantityMismatch: row.quantityMismatch,
        classification: row.classification,
        notes: row.notes,
        sortOrder: index
      }))
    });

    return tx.accountingInventoryOpeningBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
  });
}

export async function getOpeningBatchById(batchId: string) {
  return prisma.accountingInventoryOpeningBatch.findUnique({
    where: { id: batchId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      journalEntry: { include: { lines: { include: { account: true } } } }
    }
  });
}

export async function listOpeningBatches(limit = 25) {
  return prisma.accountingInventoryOpeningBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { items: true } } }
  });
}
