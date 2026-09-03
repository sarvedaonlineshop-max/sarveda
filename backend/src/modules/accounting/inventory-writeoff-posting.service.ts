/**
 * Inventory write-off posting for WRITE_OFF / DAMAGED return QC dispositions.
 *
 * Valuation: authoritative unit cost from original sale consumptions (newest first).
 * Journal: Dr 5400 Inventory Write-off / Cr 5000 COGS (reclass at cost).
 * Does NOT invent sale-value loss and does NOT restore Inventory Asset 1200
 * (goods were never returned to sellable stock).
 *
 * Idempotent on restockEventId via AccountingPostingEvent uniqueKey.
 */
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";

export const INVENTORY_WRITE_OFF_EVENT_TYPE = "INVENTORY_WRITE_OFF";
export const INVENTORY_WRITE_OFF_SOURCE_TYPE = "OrderInventoryRestockEvent";

function writeOffUniqueKey(restockEventId: string): string {
  return `INVENTORY_WRITE_OFF:${restockEventId}`;
}

export async function postInventoryWriteOffIfEligible(restockEventId: string): Promise<{
  status: "POSTED" | "SKIPPED" | "ALREADY_POSTED";
  reason?: string;
}> {
  const event = await prisma.orderInventoryRestockEvent.findUnique({
    where: { id: restockEventId }
  });
  if (!event) {
    return { status: "SKIPPED", reason: "Restock event not found" };
  }
  if (event.disposition !== "WRITE_OFF" && event.disposition !== "DAMAGED") {
    return { status: "SKIPPED", reason: "Disposition is not WRITE_OFF/DAMAGED" };
  }

  const existing = await getPostingEvent(
    INVENTORY_WRITE_OFF_EVENT_TYPE,
    writeOffUniqueKey(restockEventId)
  );
  if (existing?.status === "POSTED") {
    return { status: "ALREADY_POSTED" };
  }
  if (existing?.status === "SKIPPED") {
    return { status: "SKIPPED", reason: "Previously skipped" };
  }

  const consumptions = await prisma.accountingInventoryCostConsumption.findMany({
    where: { orderItemId: event.orderItemId },
    orderBy: { consumedAt: "desc" }
  });

  let needed = event.quantity;
  let totalCost = 0;
  const segments: Array<{ consumptionId: string; qty: number; unitCostInPaise: number }> = [];

  for (const c of consumptions) {
    if (needed <= 0) break;
    if (c.unitCostInPaise <= 0 || c.quantityConsumed <= 0) continue;
    const qty = Math.min(needed, c.quantityConsumed);
    segments.push({
      consumptionId: c.id,
      qty,
      unitCostInPaise: c.unitCostInPaise
    });
    totalCost += qty * c.unitCostInPaise;
    needed -= qty;
  }

  if (totalCost <= 0 || segments.length === 0) {
    await prisma.accountingPostingEvent.upsert({
      where: {
        eventType_uniqueKey: {
          eventType: INVENTORY_WRITE_OFF_EVENT_TYPE,
          uniqueKey: writeOffUniqueKey(restockEventId)
        }
      },
      create: {
        eventType: INVENTORY_WRITE_OFF_EVENT_TYPE,
        sourceType: INVENTORY_WRITE_OFF_SOURCE_TYPE,
        sourceId: restockEventId,
        uniqueKey: writeOffUniqueKey(restockEventId),
        status: "SKIPPED",
        processedAt: new Date(),
        payloadJson: {
          reason: "NO_AUTHORITATIVE_COST",
          restockEventId,
          disposition: event.disposition
        },
        lastError: "No authoritative inventory cost — write-off not invented"
      },
      update: {
        status: "SKIPPED",
        lastError: "No authoritative inventory cost — write-off not invented"
      }
    });
    return { status: "SKIPPED", reason: "NO_AUTHORITATIVE_COST" };
  }

  const writeOffAccount = await prisma.accountingAccount.findUnique({ where: { code: "5400" } });
  const cogsAccount = await prisma.accountingAccount.findUnique({ where: { code: "5000" } });
  if (!writeOffAccount || !cogsAccount) {
    return { status: "SKIPPED", reason: "Missing CoA 5400 or 5000" };
  }

  await postJournalFromEvent({
    eventType: INVENTORY_WRITE_OFF_EVENT_TYPE,
    sourceType: INVENTORY_WRITE_OFF_SOURCE_TYPE,
    sourceId: restockEventId,
    uniqueKey: writeOffUniqueKey(restockEventId),
    entryDate: new Date(),
    memo: `Inventory write-off restock ${restockEventId.slice(0, 8)} (${event.disposition})`,
    payloadJson: {
      restockEventId,
      orderItemId: event.orderItemId,
      quantity: event.quantity,
      totalCostInPaise: totalCost,
      segments,
      formula: "Dr 5400 / Cr 5000 at consumption unit cost; no Inventory Asset restore"
    },
    lines: [
      {
        accountId: writeOffAccount.id,
        debitInPaise: totalCost,
        creditInPaise: 0,
        lineMemo: "Inventory write-off / shrinkage"
      },
      {
        accountId: cogsAccount.id,
        debitInPaise: 0,
        creditInPaise: totalCost,
        lineMemo: "Reclass from COGS at authoritative cost"
      }
    ]
  });

  logger.info("inventory_writeoff_posted", {
    restockEventId,
    totalCostInPaise: totalCost,
    quantity: event.quantity
  });

  return { status: "POSTED" };
}
