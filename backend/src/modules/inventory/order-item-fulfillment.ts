/** Warehouse units reserved/deducted/restocked/shipped for an order line. */

export type OrderItemFulfillmentSnapshot = {
  qtyOrdered: number;
  warehouseFulfillmentQty: number;
  dropShipFulfillmentQty: number;
};

export function orderItemWarehouseUnits(item: OrderItemFulfillmentSnapshot): number {
  if (item.warehouseFulfillmentQty > 0 || item.dropShipFulfillmentQty > 0) {
    return item.warehouseFulfillmentQty;
  }
  return item.qtyOrdered;
}

export function orderItemDropShipUnits(item: OrderItemFulfillmentSnapshot): number {
  if (item.warehouseFulfillmentQty > 0 || item.dropShipFulfillmentQty > 0) {
    return item.dropShipFulfillmentQty;
  }
  return 0;
}

export function orderItemHasDropShip(item: OrderItemFulfillmentSnapshot): boolean {
  return orderItemDropShipUnits(item) > 0;
}
