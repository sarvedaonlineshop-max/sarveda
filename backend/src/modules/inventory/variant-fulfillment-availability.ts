/**
 * Authoritative customer sellability + warehouse/dropship allocation for shop variants.
 * Do not duplicate this logic elsewhere — import from this module.
 */

/** Matches cart/checkout untracked-inventory cap when no Inventory row exists. */
export const UNTRACKED_WAREHOUSE_AVAILABLE = 1_000_000;

/** Matches storefront PDP max quantity cap (UNTRACKED_STOCK_ON_HAND). */
export const CUSTOMER_MAX_LINE_QTY = 999;

export type VariantFulfillmentInput = {
  onHand?: number | null;
  reserved?: number | null;
  dropShipEnabled?: boolean;
  /** When false, warehouse availability is treated as UNTRACKED_WAREHOUSE_AVAILABLE. */
  hasInventoryRow?: boolean;
};

export type FulfillmentAllocation = {
  warehouseAvailableQty: number;
  dropShipEnabled: boolean;
  sellable: boolean;
  requestedQty: number;
  warehouseFulfillmentQty: number;
  dropShipFulfillmentQty: number;
  /** Max purchasable qty for non-dropship lines; null = only global cap applies (dropship). */
  maxAllowedQty: number | null;
};

export type ShopAvailabilityStatus =
  | "WAREHOUSE_IN_STOCK"
  | "DROP_SHIP_AVAILABLE"
  | "OUT_OF_STOCK";

export function computeWarehouseAvailableQty(
  onHand: number | null | undefined,
  reserved: number | null | undefined
): number {
  return Math.max(0, (onHand ?? 0) - (reserved ?? 0));
}

export function variantFulfillmentInputFromVariant(variant: {
  dropShipEnabled?: boolean;
  inventory?: { onHand: number; reserved: number } | null;
}): VariantFulfillmentInput {
  return {
    onHand: variant.inventory?.onHand,
    reserved: variant.inventory?.reserved,
    dropShipEnabled: variant.dropShipEnabled ?? false,
    hasInventoryRow: variant.inventory != null
  };
}

export function resolveWarehouseAvailableQty(input: VariantFulfillmentInput): number {
  if (input.hasInventoryRow === false) {
    return UNTRACKED_WAREHOUSE_AVAILABLE;
  }
  return computeWarehouseAvailableQty(input.onHand, input.reserved);
}

export function isCustomerSellable(input: VariantFulfillmentInput): boolean {
  const warehouseAvailableQty = resolveWarehouseAvailableQty(input);
  if (warehouseAvailableQty > 0) return true;
  return Boolean(input.dropShipEnabled);
}

export function shopAvailabilityStatus(input: VariantFulfillmentInput): ShopAvailabilityStatus {
  const warehouseAvailableQty = resolveWarehouseAvailableQty(input);
  if (warehouseAvailableQty > 0) return "WAREHOUSE_IN_STOCK";
  if (input.dropShipEnabled) return "DROP_SHIP_AVAILABLE";
  return "OUT_OF_STOCK";
}

export function customerMaxLineQty(input: VariantFulfillmentInput): number {
  const warehouseAvailableQty = resolveWarehouseAvailableQty(input);
  if (input.dropShipEnabled) {
    return CUSTOMER_MAX_LINE_QTY;
  }
  if (input.hasInventoryRow === false) {
    return CUSTOMER_MAX_LINE_QTY;
  }
  return Math.max(0, warehouseAvailableQty);
}

export function getVariantFulfillmentAvailability(
  input: VariantFulfillmentInput,
  requestedQty: number
): FulfillmentAllocation {
  const qty = Math.max(0, Math.floor(requestedQty));
  const dropShipEnabled = Boolean(input.dropShipEnabled);
  const warehouseAvailableQty = resolveWarehouseAvailableQty(input);

  if (qty === 0) {
    return {
      warehouseAvailableQty,
      dropShipEnabled,
      sellable: isCustomerSellable(input),
      requestedQty: 0,
      warehouseFulfillmentQty: 0,
      dropShipFulfillmentQty: 0,
      maxAllowedQty: dropShipEnabled ? null : warehouseAvailableQty
    };
  }

  const warehouseFulfillmentQty = Math.min(qty, warehouseAvailableQty);
  const shortfall = Math.max(0, qty - warehouseAvailableQty);

  if (shortfall === 0) {
    return {
      warehouseAvailableQty,
      dropShipEnabled,
      sellable: true,
      requestedQty: qty,
      warehouseFulfillmentQty,
      dropShipFulfillmentQty: 0,
      maxAllowedQty: dropShipEnabled ? null : warehouseAvailableQty
    };
  }

  if (dropShipEnabled) {
    const cappedQty = Math.min(qty, CUSTOMER_MAX_LINE_QTY);
    const wh = Math.min(cappedQty, warehouseAvailableQty);
    const ds = cappedQty - wh;
    return {
      warehouseAvailableQty,
      dropShipEnabled: true,
      sellable: true,
      requestedQty: cappedQty,
      warehouseFulfillmentQty: wh,
      dropShipFulfillmentQty: ds,
      maxAllowedQty: null
    };
  }

  return {
    warehouseAvailableQty,
    dropShipEnabled: false,
    sellable: false,
    requestedQty: qty,
    warehouseFulfillmentQty: warehouseAvailableQty,
    dropShipFulfillmentQty: 0,
    maxAllowedQty: warehouseAvailableQty
  };
}

export function assertFulfillmentAllowed(
  input: VariantFulfillmentInput,
  requestedQty: number
): FulfillmentAllocation {
  const allocation = getVariantFulfillmentAvailability(input, requestedQty);
  if (!allocation.sellable || allocation.requestedQty < 1) {
    throw Object.assign(new Error("Out of stock"), {
      statusCode: 400,
      code: "OUT_OF_STOCK"
    });
  }
  if (
    !allocation.dropShipEnabled &&
    allocation.maxAllowedQty != null &&
    requestedQty > allocation.maxAllowedQty
  ) {
    throw Object.assign(
      new Error(
        allocation.maxAllowedQty === 0
          ? "Out of stock"
          : `Only ${allocation.maxAllowedQty} available`
      ),
      { statusCode: 400, code: "INSUFFICIENT_STOCK" }
    );
  }
  if (allocation.requestedQty < requestedQty) {
    throw Object.assign(new Error(`Only ${allocation.requestedQty} available`), {
      statusCode: 400,
      code: "INSUFFICIENT_STOCK"
    });
  }
  return allocation;
}

export function merchantFeedAvailability(
  onHand: number | null | undefined,
  reserved: number | null | undefined,
  dropShipEnabled: boolean | null | undefined
): "in_stock" | "out_of_stock" {
  const warehouseAvailableQty = computeWarehouseAvailableQty(onHand, reserved);
  if (warehouseAvailableQty > 0 || dropShipEnabled) return "in_stock";
  return "out_of_stock";
}
