/** Phase 3D2 — INVENTORY_PURCHASE_CAPITALIZED_V1 constants. */

export const INVENTORY_PURCHASE_CAPITALIZED_CALC_VERSION = "INVENTORY_PURCHASE_CAPITALIZED_V1";

export const INVENTORY_PURCHASE_CAPITALIZED_EVENT_TYPE = "INVENTORY_PURCHASE_CAPITALIZED";

export const INVENTORY_PURCHASE_CAPITALIZED_SOURCE_TYPE = "PurchaseReceiptLine";

export const INVENTORY_PURCHASE_CAPITALIZED_MAX_IMBALANCE_PAISE = 2;

export function inventoryPurchaseCapitalizedUniqueKey(receiptId: string, receiptLineId: string): string {
  return `inventory_capitalization:${receiptId}:${receiptLineId}`;
}

export function purchaseReceiptLayerFingerprint(
  receiptLineId: string,
  billLineId: string,
  billSourceFingerprint: string
): string {
  return `receipt_cap:${receiptLineId}:${billLineId}:${billSourceFingerprint}`;
}

/** Bounded discovery default. */
export const PURCHASE_CAPITALIZATION_DISCOVERY_MAX = 500;
