export const INVENTORY_OPENING_POSTED_EVENT_TYPE = "INVENTORY_OPENING_POSTED";
export const INVENTORY_OPENING_POSTED_SOURCE_TYPE = "AccountingInventoryOpeningBatch";

export const INVENTORY_ACCOUNT_CODE = {
  INVENTORY_ASSET: "1200",
  INVENTORY_PURCHASES_CLEARING: "1210",
  OPENING_BALANCE_EQUITY: "3900",
  COST_OF_GOODS_SOLD: "5000"
} as const;

export const OPENING_BATCH_SEQUENCE_TYPE = "INV_OPENING";

export function inventoryOpeningPostedUniqueKey(batchId: string): string {
  return `inventory_opening:${batchId}`;
}

export function openingLayerFingerprint(batchId: string, variantId: string, itemId: string): string {
  return `opening:${batchId}:${variantId}:${itemId}`;
}

/** FIFO ordering: effectiveAt → createdAt → id (documented for Phase 3D3). */
export const FIFO_LAYER_ORDER = [
  { effectiveAt: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const }
];
