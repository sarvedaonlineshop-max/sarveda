import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { AccountingError } from "./accounting-errors";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import {
  INVENTORY_COGS_REVERSED_DOCUMENT_TYPE,
  INVENTORY_COGS_REVERSED_EVENT_TYPE,
  INVENTORY_COGS_REVERSED_SOURCE_TYPE,
  inventoryCogsReversedUniqueKey,
  returnRestockLayerFingerprint
} from "./inventory-cogs-reversal.constants";
import { assessInventoryCogsReversalEligibility } from "./inventory-cogs-reversal.eligibility";
import {
  buildCogsReversalProposalFromSnapshot,
  buildInventoryCogsReversalJournal
} from "./inventory-cogs-reversal.journal.builder";
import { loadInventoryCogsReversalSnapshot } from "./inventory-cogs-reversal.snapshot.service";
import type {
  InventoryCogsReversalProposal,
  InventoryCogsReversalSnapshot
} from "./inventory-cogs-reversal.types";
import { getAccountingAccountByCode } from "./seed-coa";
import { createAndPostJournalInTx } from "./journal.service";
import { assertCogsReversalPostingPersistenceAllowed } from "./production-guard";

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
  input: {
    eventType: string;
    sourceType: string;
    sourceId: string;
    uniqueKey: string;
    payloadJson?: Prisma.InputJsonValue;
  }
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

function parseReversedQtyFromFingerprint(fp: string, consumptionId: string): number {
  const parts = fp.split(":");
  if (parts[0] !== "return_restock") return 0;
  if (parts[3] !== consumptionId) return 0;
  const qty = Number(parts[4]);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/**
 * Lock consumptions + prior RETURN_RESTOCK layers for the OrderItem so concurrent
 * restocks cannot reverse more than original COGS quantity.
 */
async function lockOrderItemCogsState(
  tx: Prisma.TransactionClient,
  orderItemId: string
): Promise<{
  consumptions: Array<{
    id: string;
    costLayerId: string;
    quantityConsumed: number;
    unitCostInPaise: number;
    totalCostInPaise: number;
    consumedAt: Date;
    alreadyReversedQty: number;
    remainingReversibleQty: number;
  }>;
  originalConsumedQty: number;
  alreadyReversedQty: number;
  remainingReversibleQty: number;
}> {
  await tx.$queryRaw`
    SELECT id FROM "order_inventory_restock_events"
    WHERE "orderItemId" = ${orderItemId}::uuid
    FOR UPDATE
  `;

  const consumptions = await tx.$queryRaw<
    Array<{
      id: string;
      costLayerId: string;
      quantityConsumed: number;
      unitCostInPaise: number;
      totalCostInPaise: number;
      consumedAt: Date;
    }>
  >`
    SELECT
      id,
      "costLayerId",
      "quantityConsumed",
      "unitCostInPaise",
      "totalCostInPaise",
      "consumedAt"
    FROM "AccountingInventoryCostConsumption"
    WHERE "orderItemId" = ${orderItemId}::uuid
    ORDER BY "consumedAt" DESC, "createdAt" DESC, id DESC
    FOR UPDATE
  `;

  const returnLayers = await tx.$queryRaw<
    Array<{ sourceFingerprint: string; quantityOriginal: number }>
  >`
    SELECT "sourceFingerprint", "quantityOriginal"
    FROM "AccountingInventoryCostLayer"
    WHERE
      "sourceType" = 'RETURN_RESTOCK'::"AccountingInventoryCostLayerSourceType"
      AND "sourceLineId" = ${orderItemId}::uuid
    FOR UPDATE
  `;

  const reversedByConsumption = new Map<string, number>();
  let alreadyReversedQty = 0;
  for (const layer of returnLayers) {
    alreadyReversedQty += layer.quantityOriginal;
    for (const c of consumptions) {
      const qty = parseReversedQtyFromFingerprint(layer.sourceFingerprint, c.id);
      if (qty > 0) {
        reversedByConsumption.set(c.id, (reversedByConsumption.get(c.id) ?? 0) + qty);
      }
    }
  }

  if (alreadyReversedQty > 0 && reversedByConsumption.size === 0) {
    let remaining = alreadyReversedQty;
    for (const c of consumptions) {
      const take = Math.min(remaining, c.quantityConsumed);
      if (take > 0) reversedByConsumption.set(c.id, take);
      remaining -= take;
      if (remaining <= 0) break;
    }
  }

  const rows = consumptions.map((c) => {
    const already = reversedByConsumption.get(c.id) ?? 0;
    return {
      id: c.id,
      costLayerId: c.costLayerId,
      quantityConsumed: c.quantityConsumed,
      unitCostInPaise: c.unitCostInPaise,
      totalCostInPaise: c.totalCostInPaise,
      consumedAt: c.consumedAt,
      alreadyReversedQty: already,
      remainingReversibleQty: Math.max(0, c.quantityConsumed - already)
    };
  });

  const originalConsumedQty = consumptions.reduce((s, c) => s + c.quantityConsumed, 0);
  return {
    consumptions: rows,
    originalConsumedQty,
    alreadyReversedQty,
    remainingReversibleQty: Math.max(0, originalConsumedQty - alreadyReversedQty)
  };
}

function applyLockedStateToSnapshot(
  snapshot: InventoryCogsReversalSnapshot,
  locked: Awaited<ReturnType<typeof lockOrderItemCogsState>>
): InventoryCogsReversalSnapshot {
  return {
    ...snapshot,
    consumptions: locked.consumptions,
    originalConsumedQty: locked.originalConsumedQty,
    alreadyReversedQty: locked.alreadyReversedQty,
    remainingReversibleQty: locked.remainingReversibleQty
  };
}

export async function previewInventoryCogsReversal(restockEventId: string) {
  const snapshot = await loadInventoryCogsReversalSnapshot(restockEventId);
  const baseEligibility = await assessInventoryCogsReversalEligibility(snapshot, null);
  if (!baseEligibility.eligible) {
    return { snapshot, eligibility: baseEligibility, proposal: null, journalProposal: null };
  }

  let proposal: InventoryCogsReversalProposal | null = null;
  let eligibility;
  try {
    proposal = buildCogsReversalProposalFromSnapshot(snapshot);
    eligibility = await assessInventoryCogsReversalEligibility(snapshot, proposal);
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
      proposal && eligibility.eligible ? buildInventoryCogsReversalJournal(snapshot, proposal) : null
  };
}

/**
 * Post COGS reversal for a SELLABLE OrderInventoryRestockEvent.
 * Does NOT modify Inventory.onHand / reserved / ProductVariant.costInPaise.
 */
export async function postInventoryCogsReversal(
  restockEventId: string,
  opts?: { postedByUserId?: string; forcePersist?: boolean }
) {
  if (!opts?.forcePersist) {
    assertCogsReversalPostingPersistenceAllowed();
  }

  const snapshot = await loadInventoryCogsReversalSnapshot(restockEventId);
  const initialEligibility = await assessInventoryCogsReversalEligibility(snapshot, null);
  if (!initialEligibility.eligible && initialEligibility.code !== "ALREADY_POSTED") {
    throw new AccountingError(initialEligibility.reason, initialEligibility.code, 409);
  }
  assertDocumentDateAllowedForPosting(snapshot.restockCreatedAt);
  await assertEntryDateInOpenPeriod(snapshot.restockCreatedAt);

  // Capture operational stock before accounting (must remain unchanged).
  const invBefore = await prisma.inventory.findUnique({
    where: { variantId: snapshot.variantId },
    select: { onHand: true, reserved: true }
  });
  const costBefore = await prisma.productVariant.findUnique({
    where: { id: snapshot.variantId },
    select: { costInPaise: true }
  });

  return prisma.$transaction(async (tx) => {
    const uniqueKey = inventoryCogsReversedUniqueKey(snapshot.restockEventId);
    const event = await getOrCreateLockedPostingEvent(tx, {
      eventType: INVENTORY_COGS_REVERSED_EVENT_TYPE,
      sourceType: INVENTORY_COGS_REVERSED_SOURCE_TYPE,
      sourceId: snapshot.restockEventId,
      uniqueKey,
      payloadJson: { restockSourceFingerprint: snapshot.restockSourceFingerprint }
    });

    if (event.status === "POSTED" && event.journalEntry) {
      const payload = (event.payloadJson ?? {}) as Record<string, unknown>;
      const prior =
        typeof payload.restockSourceFingerprint === "string"
          ? payload.restockSourceFingerprint
          : null;
      if (prior && prior !== snapshot.restockSourceFingerprint) {
        throw new AccountingError(
          "Restock/COGS source changed after reversal post",
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
        journalProposal: null,
        stockSafety: {
          onHandBefore: invBefore?.onHand ?? null,
          onHandAfter: invBefore?.onHand ?? null,
          reservedBefore: invBefore?.reserved ?? null,
          reservedAfter: invBefore?.reserved ?? null,
          costInPaiseBefore: costBefore?.costInPaise ?? null,
          costInPaiseAfter: costBefore?.costInPaise ?? null
        }
      };
    }

    const locked = await lockOrderItemCogsState(tx, snapshot.orderItemId);
    const liveSnapshot = applyLockedStateToSnapshot(snapshot, locked);
    const proposal = buildCogsReversalProposalFromSnapshot(liveSnapshot);
    const eligibility = await assessInventoryCogsReversalEligibility(liveSnapshot, proposal);
    if (!eligibility.eligible) {
      throw new AccountingError(eligibility.reason, eligibility.code, 409);
    }

    const journalProposal = buildInventoryCogsReversalJournal(liveSnapshot, proposal);
    if (!journalProposal.balanced) {
      throw new AccountingError("COGS reversal journal is not balanced", "JOURNAL_IMBALANCE", 409);
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

    for (const segment of proposal.segments) {
      const fingerprint = returnRestockLayerFingerprint({
        restockEventId: snapshot.restockEventId,
        orderItemId: snapshot.orderItemId,
        consumptionId: segment.consumptionId,
        quantity: segment.quantityReversed,
        unitCostInPaise: segment.unitCostInPaise
      });
      await tx.accountingInventoryCostLayer.create({
        data: {
          variantId: snapshot.variantId,
          sourceType: "RETURN_RESTOCK",
          sourceId: snapshot.restockEventId,
          sourceLineId: snapshot.orderItemId,
          quantityOriginal: segment.quantityReversed,
          quantityRemaining: segment.quantityReversed,
          unitCostInPaise: segment.unitCostInPaise,
          totalCostInPaise: segment.totalCostInPaise,
          currency: snapshot.currency,
          effectiveAt: snapshot.restockCreatedAt,
          sourceFingerprint: fingerprint,
          status: "ACTIVE"
        }
      });
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
          documentType: INVENTORY_COGS_REVERSED_DOCUMENT_TYPE,
          documentId: snapshot.restockEventId,
          journalEntryId: journal.id
        }
      },
      create: {
        documentType: INVENTORY_COGS_REVERSED_DOCUMENT_TYPE,
        documentId: snapshot.restockEventId,
        journalEntryId: journal.id
      },
      update: {}
    });

    const invAfter = await tx.inventory.findUnique({
      where: { variantId: snapshot.variantId },
      select: { onHand: true, reserved: true }
    });
    const costAfter = await tx.productVariant.findUnique({
      where: { id: snapshot.variantId },
      select: { costInPaise: true }
    });

    if (
      (invBefore?.onHand ?? null) !== (invAfter?.onHand ?? null) ||
      (invBefore?.reserved ?? null) !== (invAfter?.reserved ?? null) ||
      (costBefore?.costInPaise ?? null) !== (costAfter?.costInPaise ?? null)
    ) {
      throw new AccountingError(
        "COGS reversal must not mutate operational inventory quantities or costInPaise",
        "STOCK_SAFETY_VIOLATION",
        500
      );
    }

    return {
      duplicate: false as const,
      event: updatedEvent,
      journal,
      snapshot: liveSnapshot,
      proposal,
      journalProposal,
      stockSafety: {
        onHandBefore: invBefore?.onHand ?? null,
        onHandAfter: invAfter?.onHand ?? null,
        reservedBefore: invBefore?.reserved ?? null,
        reservedAfter: invAfter?.reserved ?? null,
        costInPaiseBefore: costBefore?.costInPaise ?? null,
        costInPaiseAfter: costAfter?.costInPaise ?? null
      }
    };
  });
}
