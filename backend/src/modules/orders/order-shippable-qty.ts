import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import {
  orderItemDropShipUnits,
  orderItemWarehouseUnits
} from "../inventory/order-item-fulfillment";

/**
 * Units still to pack/ship for a line after pre-ship (or other) restocks.
 * Includes warehouse + drop-ship units (both need a carrier label from Ready to ship).
 * Digital offers are not shippable.
 * `qtyOrdered` / allocation snapshots stay historical; restock events are the delta.
 */
export function shippableQuantityForOrderItem(
  item: {
    qtyOrdered: number;
    warehouseFulfillmentQty?: number | null;
    dropShipFulfillmentQty?: number | null;
    digitalOfferId?: string | null;
  },
  returnedQty: number
): number {
  if (item.digitalOfferId) return 0;

  const snapshot = {
    qtyOrdered: item.qtyOrdered,
    warehouseFulfillmentQty: item.warehouseFulfillmentQty ?? 0,
    dropShipFulfillmentQty: item.dropShipFulfillmentQty ?? 0
  };
  const units =
    orderItemWarehouseUnits(snapshot) + orderItemDropShipUnits(snapshot);
  return Math.max(0, units - Math.max(0, returnedQty));
}

/** Batch sum of restock event quantities per order item. */
export async function getReturnedQuantitiesByOrderItemIds(
  tx: Prisma.TransactionClient | typeof prisma,
  orderItemIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orderItemIds.length) return out;

  const rows = await tx.orderInventoryRestockEvent.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: orderItemIds } },
    _sum: { quantity: true }
  });

  for (const row of rows) {
    out.set(row.orderItemId, row._sum.quantity ?? 0);
  }
  return out;
}

export function sumReturnedFromRestockEvents(
  restocks: Array<{ orderItemId: string; quantity: number }>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of restocks) {
    out.set(r.orderItemId, (out.get(r.orderItemId) ?? 0) + r.quantity);
  }
  return out;
}
