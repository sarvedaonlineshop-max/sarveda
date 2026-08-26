import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { AccountingError } from "./accounting-errors";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { assertLayerQuantityInvariants } from "./inventory-layer-invariants";
import {
  INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
  INVENTORY_COGS_RECOGNIZED_SOURCE_TYPE,
  INVENTORY_COGS_RECOGNIZED_DOCUMENT_TYPE,
  inventoryCogsRecognizedUniqueKey
} from "./inventory-cogs.constants";
import { assessInventoryCogsEligibility } from "./inventory-cogs.eligibility";
import { buildInventoryCogsJournal } from "./inventory-cogs.journal.builder";
import { loadInventoryCogsSnapshot, loadInventoryCogsSnapshotByOrderId } from "./inventory-cogs.snapshot.service";
import type {
  InventoryCogsItemProposal,
  InventoryCogsLayerConsumptionProposal,
  InventoryCogsOrderSnapshot,
  InventoryCogsProposal
} from "./inventory-cogs.types";
import { getAccountingAccountByCode } from "./seed-coa";
import { createAndPostJournalInTx } from "./journal.service";
import { assertCogsPostingPersistenceAllowed } from "./production-guard";

type LockedLayerRow = {
  id: string;
  variantId: string;
  quantityOriginal: number;
  quantityRemaining: number;
  unitCostInPaise: number;
  totalCostInPaise: number;
  effectiveAt: Date;
  sourceType: string;
  status: string;
};

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

async function getOrCreateLockedPostingEvent(
  tx: Prisma.TransactionClient,
  input: { eventType: string; sourceType: string; sourceId: string; uniqueKey: string; payloadJson?: Prisma.InputJsonValue }
) {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "AccountingPostingEvent" (
      "id", "eventType", "sourceType", "sourceId", "uniqueKey", "payloadJson", "status", "attemptCount", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid(),
      ${input.eventType},
      ${input.sourceType},
      ${input.sourceId},
      ${input.uniqueKey},
      ${input.payloadJson ?? null}::jsonb,
      'PENDING'::"AccountingPostingEventStatus",
      0,
      NOW(),
      NOW()
    )
    ON CONFLICT ("eventType", "uniqueKey") DO NOTHING
    RETURNING id
  `;
  const eventId =
    inserted[0]?.id ??
    (
      await tx.accountingPostingEvent.findUniqueOrThrow({
        where: { eventType_uniqueKey: { eventType: input.eventType, uniqueKey: input.uniqueKey } },
        select: { id: true }
      })
    ).id;
  await tx.$queryRaw`SELECT id FROM "AccountingPostingEvent" WHERE id = ${eventId}::uuid FOR UPDATE`;
  return tx.accountingPostingEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { journalEntry: { include: { lines: true } } }
  });
}

async function lockFifoLayersForVariant(
  tx: Prisma.TransactionClient,
  variantId: string
): Promise<LockedLayerRow[]> {
  const rows = await tx.$queryRaw<LockedLayerRow[]>`
    SELECT
      "id",
      "variantId",
      "quantityOriginal",
      "quantityRemaining",
      "unitCostInPaise",
      "totalCostInPaise",
      "effectiveAt",
      "sourceType"::text as "sourceType",
      "status"::text as "status"
    FROM "AccountingInventoryCostLayer"
    WHERE
      "variantId" = ${variantId}::uuid
      AND "status" = 'ACTIVE'::"AccountingInventoryCostLayerStatus"
      AND "quantityRemaining" > 0
    ORDER BY "effectiveAt" ASC, "createdAt" ASC, "id" ASC
    FOR UPDATE
  `;
  for (const row of rows) {
    assertLayerQuantityInvariants(row);
    if (row.unitCostInPaise <= 0) {
      throw new AccountingError(
        `Layer ${row.id} has non-positive unit cost`,
        "COST_LAYER_DATA_GAP",
        409
      );
    }
  }
  return rows;
}

function buildFifoProposalFromLockedLayers(
  snapshot: InventoryCogsOrderSnapshot,
  lockedByVariant: Map<string, LockedLayerRow[]>
): InventoryCogsProposal {
  const physicalItems = snapshot.lines
    .filter((line) => line.classification === "PHYSICAL_INVENTORY" && line.variantId && line.qtyOrdered > 0)
    .sort((a, b) => a.orderItemId.localeCompare(b.orderItemId));

  if (physicalItems.length === 0) {
    throw new AccountingError("Order contains no physical inventory items", "NON_INVENTORY_ONLY", 409);
  }

  const items: InventoryCogsItemProposal[] = [];
  const mutableByVariant = new Map<string, Array<{ row: LockedLayerRow; remaining: number }>>();
  for (const [variantId, rows] of lockedByVariant) {
    for (const row of rows) {
      assertLayerQuantityInvariants(row);
      if (row.unitCostInPaise <= 0) {
        throw new AccountingError(
          `Layer ${row.id} has non-positive unit cost`,
          "COST_LAYER_DATA_GAP",
          409
        );
      }
    }
    mutableByVariant.set(
      variantId,
      rows.map((row) => ({ row, remaining: row.quantityRemaining }))
    );
  }

  for (const item of physicalItems) {
    const variantId = item.variantId!;
    const layers = mutableByVariant.get(variantId) ?? [];
    let needed = item.qtyOrdered;
    const consumptions: InventoryCogsLayerConsumptionProposal[] = [];

    for (const entry of layers) {
      if (needed <= 0) break;
      if (entry.remaining <= 0) continue;
      const qty = Math.min(needed, entry.remaining);
      consumptions.push({
        costLayerId: entry.row.id,
        variantId,
        orderItemId: item.orderItemId,
        quantityConsumed: qty,
        unitCostInPaise: entry.row.unitCostInPaise,
        totalCostInPaise: qty * entry.row.unitCostInPaise,
        layerSourceType: entry.row.sourceType,
        layerEffectiveAt: entry.row.effectiveAt
      });
      entry.remaining -= qty;
      needed -= qty;
    }

    if (needed > 0) {
      throw new AccountingError(
        `Order item ${item.orderItemId} needs ${item.qtyOrdered} but only ${item.qtyOrdered - needed} native layer qty available`,
        "INSUFFICIENT_COST_LAYERS",
        409
      );
    }

    items.push({
      orderItemId: item.orderItemId,
      variantId,
      skuSnapshot: item.skuSnapshot,
      qtyOrdered: item.qtyOrdered,
      totalCostInPaise: consumptions.reduce((sum, c) => sum + c.totalCostInPaise, 0),
      consumptions
    });
  }

  return {
    orderId: snapshot.orderId,
    orderNumber: snapshot.orderNumber,
    accountingDate: snapshot.placedAt,
    currency: snapshot.currency,
    items,
    totalCostInPaise: items.reduce((sum, item) => sum + item.totalCostInPaise, 0),
    warnings: []
  };
}

export async function previewInventoryCogs(identifier: { orderId?: string; orderNumber?: string }) {
  const snapshot = await loadInventoryCogsSnapshot(identifier);
  const baseEligibility = await assessInventoryCogsEligibility(snapshot, null);
  if (!baseEligibility.eligible) {
    return { snapshot, eligibility: baseEligibility, proposal: null, journalProposal: null };
  }

  const variantIds = [...new Set(snapshot.lines.filter((l) => l.variantId).map((l) => l.variantId!))].sort();
  const allLayers = await prisma.accountingInventoryCostLayer.findMany({
    where: {
      variantId: { in: variantIds },
      status: "ACTIVE",
      quantityRemaining: { gt: 0 }
    },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }]
  });
  const byVariant = new Map<string, LockedLayerRow[]>();
  for (const variantId of variantIds) {
    byVariant.set(
      variantId,
      allLayers
        .filter((l) => l.variantId === variantId)
        .map((l) => ({
          id: l.id,
          variantId: l.variantId,
          quantityOriginal: l.quantityOriginal,
          quantityRemaining: l.quantityRemaining,
          unitCostInPaise: l.unitCostInPaise,
          totalCostInPaise: l.totalCostInPaise,
          effectiveAt: l.effectiveAt,
          sourceType: l.sourceType,
          status: l.status
        }))
    );
  }

  let proposal: InventoryCogsProposal | null = null;
  let eligibility;
  try {
    proposal = buildFifoProposalFromLockedLayers(snapshot, byVariant);
    eligibility = await assessInventoryCogsEligibility(snapshot, proposal);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "ERROR";
    eligibility = { eligible: false, code: code as never, reason: message };
  }

  return {
    snapshot,
    eligibility,
    proposal,
    journalProposal:
      proposal && eligibility.eligible ? buildInventoryCogsJournal(snapshot, proposal) : null
  };
}

export async function postInventoryCogs(
  identifier: { orderId?: string; orderNumber?: string },
  opts?: { postedByUserId?: string; forcePersist?: boolean }
) {
  if (!opts?.forcePersist) {
    assertCogsPostingPersistenceAllowed();
  }

  const snapshot = await loadInventoryCogsSnapshot(identifier);
  const initialEligibility = await assessInventoryCogsEligibility(snapshot, null);
  if (!initialEligibility.eligible && initialEligibility.code !== "ALREADY_POSTED") {
    throw new AccountingError(initialEligibility.reason, initialEligibility.code, 409);
  }
  assertDocumentDateAllowedForPosting(snapshot.placedAt);
  await assertEntryDateInOpenPeriod(snapshot.placedAt);

  return prisma.$transaction(async (tx) => {
    const uniqueKey = inventoryCogsRecognizedUniqueKey(snapshot.orderId);
    const event = await getOrCreateLockedPostingEvent(tx, {
      eventType: INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
      sourceType: INVENTORY_COGS_RECOGNIZED_SOURCE_TYPE,
      sourceId: snapshot.orderId,
      uniqueKey,
      payloadJson: { sourceFingerprint: snapshot.sourceFingerprint }
    });

    if (event.status === "POSTED" && event.journalEntry) {
      const payload = (event.payloadJson ?? {}) as Record<string, unknown>;
      const prior = typeof payload.orderSourceFingerprint === "string" ? payload.orderSourceFingerprint : null;
      if (prior && prior !== snapshot.sourceFingerprint) {
        throw new AccountingError(
          "Order changed after COGS post — reversal required",
          "SOURCE_CHANGED_AFTER_POST",
          409
        );
      }
      return {
        duplicate: true as const,
        event,
        journal: event.journalEntry,
        snapshot,
        proposal: null,
        journalProposal: null
      };
    }

    const variantIds = [...new Set(snapshot.lines.filter((l) => l.variantId).map((l) => l.variantId!))].sort();
    const lockedByVariant = new Map<string, LockedLayerRow[]>();
    for (const variantId of variantIds) {
      lockedByVariant.set(variantId, await lockFifoLayersForVariant(tx, variantId));
    }

    const proposal = buildFifoProposalFromLockedLayers(snapshot, lockedByVariant);
    const eligibility = await assessInventoryCogsEligibility(snapshot, proposal);
    if (!eligibility.eligible) {
      throw new AccountingError(eligibility.reason, eligibility.code, 409);
    }

    const journalProposal = buildInventoryCogsJournal(snapshot, proposal);
    if (!journalProposal.balanced) {
      throw new AccountingError("COGS journal is not balanced", "JOURNAL_IMBALANCE", 409);
    }
    const accountIds = await resolveAccountIds(journalProposal.lines.map((l) => l.accountCode));

    const journal = await createAndPostJournalInTx(tx, {
      entryDate: journalProposal.accountingDate,
      memo: journalProposal.memo,
      currency: journalProposal.currency,
      postedByUserId: opts?.postedByUserId,
      lines: journalProposal.lines.map((line, index) => ({
        accountId: accountIds.get(line.accountCode)!,
        debitInPaise: line.debitInPaise,
        creditInPaise: line.creditInPaise,
        lineMemo: line.lineMemo,
        sortOrder: index
      }))
    });

    for (const item of proposal.items) {
      for (const consumption of item.consumptions) {
        const current = lockedByVariant
          .get(item.variantId)
          ?.find((entry) => entry.id === consumption.costLayerId);
        if (!current || current.quantityRemaining < consumption.quantityConsumed) {
          throw new AccountingError(
            `Layer ${consumption.costLayerId} no longer has sufficient quantity`,
            "INSUFFICIENT_COST_LAYERS",
            409
          );
        }
        const newRemaining = current.quantityRemaining - consumption.quantityConsumed;
        current.quantityRemaining = newRemaining;
        await tx.accountingInventoryCostLayer.update({
          where: { id: consumption.costLayerId },
          data: {
            quantityRemaining: { decrement: consumption.quantityConsumed },
            status: newRemaining <= 0 ? "DEPLETED" : "ACTIVE"
          }
        });
        await tx.accountingInventoryCostConsumption.create({
          data: {
            costLayerId: consumption.costLayerId,
            variantId: consumption.variantId,
            orderId: snapshot.orderId,
            orderItemId: consumption.orderItemId,
            quantityConsumed: consumption.quantityConsumed,
            unitCostInPaise: consumption.unitCostInPaise,
            totalCostInPaise: consumption.totalCostInPaise,
            consumedAt: snapshot.placedAt,
            postingEventId: event.id,
            journalEntryId: journal.id,
            sourceFingerprint: journalProposal.reconciliationMetadata.sourceFingerprint as string
          }
        });
      }
    }

    const updatedEvent = await tx.accountingPostingEvent.update({
      where: { id: event.id },
      data: {
        status: "POSTED",
        journalEntryId: journal.id,
        processedAt: new Date(),
        attemptCount: { increment: 1 },
        lastError: null,
        payloadJson: journalProposal.reconciliationMetadata as Prisma.InputJsonValue
      },
      include: { journalEntry: { include: { lines: true } } }
    });

    await tx.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: INVENTORY_COGS_RECOGNIZED_DOCUMENT_TYPE,
          documentId: snapshot.orderId,
          journalEntryId: journal.id
        }
      },
      create: {
        documentType: INVENTORY_COGS_RECOGNIZED_DOCUMENT_TYPE,
        documentId: snapshot.orderId,
        journalEntryId: journal.id
      },
      update: {}
    });

    return {
      duplicate: false as const,
      event: updatedEvent,
      journal,
      snapshot,
      proposal,
      journalProposal
    };
  });
}

export async function postInventoryCogsByOrderId(
  orderId: string,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
) {
  return postInventoryCogs({ orderId }, opts);
}

export async function previewInventoryCogsByOrderId(orderId: string) {
  const snapshot = await loadInventoryCogsSnapshotByOrderId(orderId);
  return previewInventoryCogs({ orderId: snapshot.orderId });
}
