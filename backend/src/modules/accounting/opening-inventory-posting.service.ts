import { prisma } from "../../config/db";

import { getAccountingAccountByCode } from "./seed-coa";
import { AccountingError } from "./accounting-errors";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import {
  INVENTORY_OPENING_POSTED_EVENT_TYPE,
  INVENTORY_OPENING_POSTED_SOURCE_TYPE,
  inventoryOpeningPostedUniqueKey,
  openingLayerFingerprint
} from "./inventory.constants";
import { assertOpeningBatchTotalsMatch } from "./inventory-layer-invariants";
import { buildOpeningInventoryJournal } from "./opening-inventory-journal.builder";
import { getOpeningBatchById } from "./opening-inventory-batch.service";
import { postJournalFromEvent } from "./posting-event.service";
import { assertInventoryOpeningPostingPersistenceAllowed } from "./production-guard";

async function resolveAccountIds(codes: string[]) {
  const unique = [...new Set(codes)];
  const accounts = await Promise.all(unique.map((code) => getAccountingAccountByCode(code)));
  const map = new Map<string, string>();
  for (let i = 0; i < unique.length; i++) {
    const acc = accounts[i];
    if (!acc) throw new AccountingError(`Account ${unique[i]} not found`, "ACCOUNT_NOT_FOUND");
    map.set(unique[i]!, acc.id);
  }
  return map;
}

export async function previewOpeningInventoryPost(batchId: string) {
  const batch = await getOpeningBatchById(batchId);
  if (!batch) {
    throw new AccountingError(`Opening batch not found: ${batchId}`, "OPENING_BATCH_NOT_FOUND", 404);
  }

  const eligibleItems = batch.items.filter((i) => i.classification === "PHYSICAL_INVENTORY");
  const proposal = buildOpeningInventoryJournal(batch, eligibleItems);

  return {
    batch: {
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: batch.status,
      effectiveDate: batch.effectiveDate,
      totalQuantity: batch.totalQuantity,
      totalValueInPaise: batch.totalValueInPaise,
      sourcePayloadHash: batch.sourcePayloadHash
    },
    proposal,
    alreadyPosted: batch.status === "POSTED",
    journalEntryId: batch.journalEntryId
  };
}

export async function postOpeningInventoryBatch(batchId: string, opts?: { postedByUserId?: string }) {
  assertInventoryOpeningPostingPersistenceAllowed();

  const batch = await getOpeningBatchById(batchId);
  if (!batch) {
    throw new AccountingError(`Opening batch not found: ${batchId}`, "OPENING_BATCH_NOT_FOUND", 404);
  }

  if (batch.status === "POSTED" && batch.journalEntryId) {
    const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: batch.journalEntryId },
      include: { lines: true }
    });
    return { batch, journal, proposal: buildOpeningInventoryJournal(batch, batch.items), duplicate: true as const };
  }

  if (batch.status !== "VALIDATED" && batch.status !== "DRAFT") {
    throw new AccountingError(`Batch status ${batch.status} cannot be posted`, "OPENING_BATCH_NOT_ELIGIBLE");
  }

  const eligibleItems = batch.items.filter((i) => i.classification === "PHYSICAL_INVENTORY");
  if (eligibleItems.length === 0) {
    throw new AccountingError("No physical inventory items in batch", "OPENING_NO_ELIGIBLE_ROWS");
  }

  assertOpeningBatchTotalsMatch(eligibleItems, batch.totalQuantity, batch.totalValueInPaise);

  const mismatches = eligibleItems.filter((i) => i.quantityMismatch && !batch.allowQuantityMismatch);
  if (mismatches.length > 0) {
    throw new AccountingError(
      `Quantity mismatch on ${mismatches.length} SKU(s) without override`,
      "QUANTITY_MISMATCH"
    );
  }

  assertDocumentDateAllowedForPosting(batch.effectiveDate);

  await assertEntryDateInOpenPeriod(batch.effectiveDate);

  const proposal = buildOpeningInventoryJournal(batch, eligibleItems);
  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));
  const uniqueKey = inventoryOpeningPostedUniqueKey(batch.id);

  const payloadJson = {
    batchNumber: batch.batchNumber,
    valuationSource: batch.valuationSource,
    sourcePayloadHash: batch.sourcePayloadHash,
    totalQuantity: proposal.totalQuantity,
    totalValueInPaise: proposal.totalValueInPaise,
    variantBreakdown: proposal.variantBreakdown
  };

  const result = await postJournalFromEvent({
    eventType: INVENTORY_OPENING_POSTED_EVENT_TYPE,
    sourceType: INVENTORY_OPENING_POSTED_SOURCE_TYPE,
    sourceId: batch.id,
    uniqueKey,
    payloadJson,
    entryDate: batch.effectiveDate,
    memo: proposal.memo,
    postedByUserId: opts?.postedByUserId,
    lines: proposal.lines.map((line, index) => ({
      accountId: accountIds.get(line.accountCode)!,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      lineMemo: line.lineMemo,
      sortOrder: index
    }))
  });

  if (!result.duplicate) {
    await prisma.$transaction(async (tx) => {
      for (const item of eligibleItems) {
        const fingerprint = openingLayerFingerprint(batch.id, item.variantId, item.id);
        const layer = await tx.accountingInventoryCostLayer.create({
          data: {
            variantId: item.variantId,
            sourceType: "OPENING",
            sourceId: batch.id,
            sourceLineId: item.id,
            quantityOriginal: item.openingQuantity,
            quantityRemaining: item.openingQuantity,
            unitCostInPaise: item.unitCostInPaise,
            totalCostInPaise: item.totalCostInPaise,
            effectiveAt: batch.effectiveDate,
            sourceFingerprint: fingerprint,
            status: "ACTIVE",
            openingBatchItemId: item.id
          }
        });
        await tx.accountingInventoryOpeningBatchItem.update({
          where: { id: item.id },
          data: { costLayerId: layer.id }
        });
      }

      await tx.accountingDocumentLink.create({
        data: {
          documentType: INVENTORY_OPENING_POSTED_SOURCE_TYPE,
          documentId: batch.id,
          journalEntryId: result.journal.id
        }
      });

      await tx.accountingInventoryOpeningBatch.update({
        where: { id: batch.id },
        data: {
          status: "POSTED",
          journalEntryId: result.journal.id,
          postingEventId: result.event.id,
          postedAt: new Date()
        }
      });
    });
  }

  const updated = await getOpeningBatchById(batchId);
  return {
    batch: updated!,
    journal: result.journal,
    proposal,
    duplicate: result.duplicate
  };
}
