export const INVENTORY_COGS_RECOGNIZED_CALC_VERSION = "INVENTORY_COGS_RECOGNIZED_V1";

export const INVENTORY_COGS_RECOGNIZED_EVENT_TYPE = "INVENTORY_COGS_RECOGNIZED";

export const INVENTORY_COGS_RECOGNIZED_SOURCE_TYPE = "ORDER";

export const INVENTORY_COGS_RECOGNIZED_DOCUMENT_TYPE = "ORDER";

export function inventoryCogsRecognizedUniqueKey(orderId: string): string {
  return `inventory_cogs:${orderId}`;
}

export function inventoryCogsSourceFingerprint(parts: {
  orderId: string;
  orderItemIds: string[];
  variantIds: string[];
  layerIds: string[];
  quantities: number[];
  unitCosts: number[];
}): string {
  return JSON.stringify({
    orderId: parts.orderId,
    orderItemIds: [...parts.orderItemIds].sort(),
    variantIds: [...parts.variantIds].sort(),
    layerIds: [...parts.layerIds].sort(),
    quantities: parts.quantities,
    unitCosts: parts.unitCosts,
    calcVersion: INVENTORY_COGS_RECOGNIZED_CALC_VERSION
  });
}
