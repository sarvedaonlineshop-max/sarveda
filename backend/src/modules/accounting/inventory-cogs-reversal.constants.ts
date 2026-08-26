/** Phase 3D4-B — reverse historical FIFO COGS for SELLABLE restocks. */

export const INVENTORY_COGS_REVERSED_CALC_VERSION = "INVENTORY_COGS_REVERSED_V1";

export const INVENTORY_COGS_REVERSED_EVENT_TYPE = "INVENTORY_COGS_REVERSED";

export const INVENTORY_COGS_REVERSED_SOURCE_TYPE = "OrderInventoryRestockEvent";

export const INVENTORY_COGS_REVERSED_DOCUMENT_TYPE = "ORDER_INVENTORY_RESTOCK";

/**
 * Deterministic reversal policy:
 * Reverse the most recently consumed units first for the OrderItem
 * (LIFO against AccountingInventoryCostConsumption chronology).
 * Tie-break: consumedAt DESC, createdAt DESC, then consumption id DESC.
 */
export const COGS_REVERSAL_POLICY = "LIFO_OF_CONSUMPTION_V1" as const;

export function inventoryCogsReversedUniqueKey(restockEventId: string): string {
  return `inventory_cogs_reversal:${restockEventId}`;
}

export function returnRestockLayerFingerprint(parts: {
  restockEventId: string;
  orderItemId: string;
  consumptionId: string;
  quantity: number;
  unitCostInPaise: number;
}): string {
  return [
    "return_restock",
    parts.restockEventId,
    parts.orderItemId,
    parts.consumptionId,
    String(parts.quantity),
    String(parts.unitCostInPaise),
    INVENTORY_COGS_REVERSED_CALC_VERSION
  ].join(":");
}

export function inventoryCogsReversalSourceFingerprint(parts: {
  restockEventId: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  disposition: string;
  originalCogsEventId: string | null;
  consumptionIds: string[];
  unitCosts: number[];
  quantities: number[];
}): string {
  return JSON.stringify({
    restockEventId: parts.restockEventId,
    orderId: parts.orderId,
    orderItemId: parts.orderItemId,
    quantity: parts.quantity,
    disposition: parts.disposition,
    originalCogsEventId: parts.originalCogsEventId,
    consumptionIds: [...parts.consumptionIds].sort(),
    unitCosts: parts.unitCosts,
    quantities: parts.quantities,
    policy: COGS_REVERSAL_POLICY,
    calcVersion: INVENTORY_COGS_REVERSED_CALC_VERSION
  });
}
