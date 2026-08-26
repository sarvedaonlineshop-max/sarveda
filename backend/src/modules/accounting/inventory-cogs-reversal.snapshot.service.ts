import { prisma } from "../../config/db";

import { classifyCutover } from "./accounting-cutover";
import { classifyVariantForInventory } from "./inventory-classification";
import {
  INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
  inventoryCogsRecognizedUniqueKey
} from "./inventory-cogs.constants";
import {
  INVENTORY_COGS_REVERSED_CALC_VERSION,
  inventoryCogsReversalSourceFingerprint
} from "./inventory-cogs-reversal.constants";
import type { InventoryCogsReversalSnapshot } from "./inventory-cogs-reversal.types";
import { getPostingEvent } from "./posting-event.service";

function parseReversedQtyFromFingerprint(fp: string, consumptionId: string): number {
  // return_restock:{restockEventId}:{orderItemId}:{consumptionId}:{qty}:{unitCost}:{version}
  const parts = fp.split(":");
  if (parts[0] !== "return_restock") return 0;
  if (parts[3] !== consumptionId) return 0;
  const qty = Number(parts[4]);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/**
 * Load restock event + original COGS consumptions + already-reversed qty per consumption.
 */
export async function loadInventoryCogsReversalSnapshot(
  restockEventId: string
): Promise<InventoryCogsReversalSnapshot> {
  const event = await prisma.orderInventoryRestockEvent.findUnique({
    where: { id: restockEventId },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          currency: true,
          placedAt: true,
          deletedAt: true
        }
      },
      orderItem: {
        include: {
          variant: {
            include: {
              productRel: { select: { productType: true, catalogHidden: true } },
              inventory: { select: { onHand: true } }
            }
          }
        }
      }
    }
  });

  if (!event || event.order.deletedAt) {
    throw Object.assign(new Error(`Restock event not found: ${restockEventId}`), {
      statusCode: 404,
      code: "RESTOCK_EVENT_NOT_FOUND"
    });
  }

  const variant = event.orderItem.variant;
  const classification = classifyVariantForInventory({
    sku: event.orderItem.skuSnapshot,
    productType: variant?.productRel.productType ?? null,
    catalogHidden: variant?.productRel.catalogHidden ?? false,
    onHand: variant?.inventory?.onHand ?? 0
  });

  const cutoverClassification = classifyCutover(event.createdAt);
  const orderCutoverClassification = classifyCutover(event.order.placedAt ?? event.createdAt);

  const cogsEvent = await getPostingEvent(
    INVENTORY_COGS_RECOGNIZED_EVENT_TYPE,
    inventoryCogsRecognizedUniqueKey(event.orderId)
  );
  const nativeCogsPosted = cogsEvent?.status === "POSTED";

  const consumptions = await prisma.accountingInventoryCostConsumption.findMany({
    where: { orderItemId: event.orderItemId },
    orderBy: [{ consumedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }]
  });

  const returnLayers = await prisma.accountingInventoryCostLayer.findMany({
    where: {
      sourceType: "RETURN_RESTOCK",
      sourceLineId: event.orderItemId
    },
    select: { sourceFingerprint: true, quantityOriginal: true }
  });

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

  // Fallback if fingerprints missing: allocate already-reversed LIFO against consumptions for display
  if (alreadyReversedQty > 0 && reversedByConsumption.size === 0) {
    let remaining = alreadyReversedQty;
    for (const c of consumptions) {
      const take = Math.min(remaining, c.quantityConsumed);
      if (take > 0) reversedByConsumption.set(c.id, take);
      remaining -= take;
      if (remaining <= 0) break;
    }
  }

  const consumptionRows = consumptions.map((c) => {
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
  const remainingReversibleQty = Math.max(0, originalConsumedQty - alreadyReversedQty);

  const restockSourceFingerprint = inventoryCogsReversalSourceFingerprint({
    restockEventId: event.id,
    orderId: event.orderId,
    orderItemId: event.orderItemId,
    quantity: event.quantity,
    disposition: event.disposition,
    originalCogsEventId: cogsEvent?.id ?? null,
    consumptionIds: consumptions.map((c) => c.id),
    unitCosts: consumptions.map((c) => c.unitCostInPaise),
    quantities: consumptions.map((c) => c.quantityConsumed)
  });

  return {
    restockEventId: event.id,
    orderId: event.orderId,
    orderNumber: event.order.orderNumber,
    orderItemId: event.orderItemId,
    variantId: event.variantId,
    skuSnapshot: event.orderItem.skuSnapshot,
    disposition: event.disposition,
    restockQuantity: event.quantity,
    inventoryIncremented: event.inventoryIncremented,
    restockCreatedAt: event.createdAt,
    classification,
    currency: event.order.currency || "INR",
    cutoverClassification,
    orderCutoverClassification,
    nativeCogsPosted,
    originalCogsEventId: cogsEvent?.id ?? null,
    originalCogsJournalEntryId: cogsEvent?.journalEntryId ?? null,
    originalConsumedQty,
    alreadyReversedQty,
    remainingReversibleQty,
    consumptions: consumptionRows,
    restockSourceFingerprint
  };
}

export async function findInventoryCogsReversalDiscoveryCandidates(input: {
  restockEventId?: string;
  orderId?: string;
  orderItemId?: string;
  variantId?: string;
  since?: Date;
  until?: Date;
  limit: number;
}) {
  return prisma.orderInventoryRestockEvent.findMany({
    where: {
      ...(input.restockEventId ? { id: input.restockEventId } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.orderItemId ? { orderItemId: input.orderItemId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
      ...(input.since || input.until
        ? {
            createdAt: {
              ...(input.since ? { gte: input.since } : {}),
              ...(input.until ? { lte: input.until } : {})
            }
          }
        : {}),
      disposition: "SELLABLE"
    },
    orderBy: { createdAt: "asc" },
    take: input.limit,
    select: {
      id: true,
      orderId: true,
      orderItemId: true,
      variantId: true,
      quantity: true,
      disposition: true,
      createdAt: true
    }
  });
}

export { INVENTORY_COGS_REVERSED_CALC_VERSION };
