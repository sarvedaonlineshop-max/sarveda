import {
  OrderInventoryRestockDisposition,
  OrderInventoryRestockSourceType,
  type OrderInventoryRestockEvent,
  type Prisma
} from "@prisma/client";
import { z } from "zod";

import { orderItemWarehouseUnits } from "../inventory/order-item-fulfillment";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

export const adminInventoryRestockBodySchema = z.object({
  lines: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
        disposition: z.nativeEnum(OrderInventoryRestockDisposition)
      })
    )
    .min(1)
    .max(100),
  reason: z.string().trim().max(500).optional(),
  /** Client idempotency key; defaults to a new UUID when omitted. */
  idempotencyKey: z.string().trim().min(8).max(128).optional()
});

export type AdminInventoryRestockBody = z.infer<typeof adminInventoryRestockBodySchema>;

export type RestockLineInput = {
  orderItemId: string;
  quantity: number;
  disposition: OrderInventoryRestockDisposition;
};

export type ApplyRestockInput = {
  orderId: string;
  lines: RestockLineInput[];
  sourceType: OrderInventoryRestockSourceType;
  sourceId: string;
  reason?: string;
  createdByUserId?: string;
};

function assertPositiveQty(qty: number): void {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw Object.assign(new Error("Restock quantity must be a positive integer"), {
      statusCode: 400,
      code: "INVALID_RESTOCK_QTY"
    });
  }
}

/**
 * Sum of quantities already recorded on restock events for an order item
 * (all dispositions count against returnable qty).
 */
export async function getReturnedQuantityForOrderItem(
  tx: Prisma.TransactionClient | typeof prisma,
  orderItemId: string
): Promise<number> {
  const agg = await tx.orderInventoryRestockEvent.aggregate({
    where: { orderItemId },
    _sum: { quantity: true }
  });
  return agg._sum.quantity ?? 0;
}

/**
 * Apply physical return / restock lines.
 * - SELLABLE + Inventory row present → increments onHand and sets inventoryIncremented=true
 * - DAMAGED / NON_RESTOCKABLE → records event only (no onHand change)
 * - Idempotent on (sourceType, sourceId, orderItemId): duplicate returns existing rows, no second increment
 *
 * Accounting must never call this to invent stock; commerce owns onHand.
 */
export async function applyOrderInventoryRestockTx(
  tx: Prisma.TransactionClient,
  input: ApplyRestockInput
): Promise<OrderInventoryRestockEvent[]> {
  if (!input.lines.length) return [];

  const seenItemIds = new Set<string>();
  for (const line of input.lines) {
    assertPositiveQty(line.quantity);
    if (seenItemIds.has(line.orderItemId)) {
      throw Object.assign(new Error("Duplicate orderItemId in restock request"), {
        statusCode: 400,
        code: "DUPLICATE_RESTOCK_LINE"
      });
    }
    seenItemIds.add(line.orderItemId);
  }

  const orderItems = await tx.orderItem.findMany({
    where: { orderId: input.orderId, id: { in: input.lines.map((l) => l.orderItemId) } },
    select: {
      id: true,
      orderId: true,
      variantId: true,
      qtyOrdered: true,
      warehouseFulfillmentQty: true,
      dropShipFulfillmentQty: true
    }
  });
  const byId = new Map(orderItems.map((i) => [i.id, i]));

  const results: OrderInventoryRestockEvent[] = [];

  for (const line of input.lines) {
    const item = byId.get(line.orderItemId);
    if (!item) {
      throw Object.assign(new Error(`Order item ${line.orderItemId} not found on this order`), {
        statusCode: 400,
        code: "ORDER_ITEM_NOT_ON_ORDER"
      });
    }

    const existing = await tx.orderInventoryRestockEvent.findUnique({
      where: {
        sourceType_sourceId_orderItemId: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          orderItemId: line.orderItemId
        }
      }
    });
    if (existing) {
      results.push(existing);
      continue;
    }

    const alreadyReturned = await getReturnedQuantityForOrderItem(tx, line.orderItemId);
    const warehouseOrdered = orderItemWarehouseUnits(item);
    const remaining = warehouseOrdered - alreadyReturned;
    if (line.quantity > remaining) {
      throw Object.assign(
        new Error(
          `Restock qty ${line.quantity} exceeds remaining returnable ${remaining} for order item ${line.orderItemId}`
        ),
        { statusCode: 400, code: "RESTOCK_QTY_EXCEEDS_REMAINING" }
      );
    }

    let inventoryIncremented = false;
    if (!item.variantId) {
      throw Object.assign(new Error(`Cannot restock digital line ${line.orderItemId}`), {
        statusCode: 400,
        code: "RESTOCK_DIGITAL_LINE"
      });
    }
    if (line.disposition === OrderInventoryRestockDisposition.SELLABLE) {
      const inv = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
      if (inv) {
        await tx.inventory.update({
          where: { id: inv.id },
          data: { onHand: { increment: line.quantity } }
        });
        inventoryIncremented = true;
      }
    }

    const created = await tx.orderInventoryRestockEvent.create({
      data: {
        orderId: input.orderId,
        orderItemId: line.orderItemId,
        variantId: item.variantId,
        quantity: line.quantity,
        disposition: line.disposition,
        inventoryIncremented,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reason: input.reason ?? null,
        createdByUserId: input.createdByUserId ?? null
      }
    });
    results.push(created);
  }

  return results;
}

/**
 * Full-order restock used by cancel/refund status change.
 * Emits one SELLABLE event per OrderItem for qtyOrdered (idempotent per sourceId).
 */
export async function restockPaidOrderLinesTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: {
    sourceId: string;
    reason?: string;
    createdByUserId?: string;
  }
): Promise<OrderInventoryRestockEvent[]> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      id: true,
      qtyOrdered: true,
      warehouseFulfillmentQty: true,
      dropShipFulfillmentQty: true,
      variantId: true,
      digitalOfferId: true
    }
  });

  const lines: RestockLineInput[] = [];
  for (const item of items) {
    if (!item.variantId || item.digitalOfferId) continue;
    const warehouseOrdered = orderItemWarehouseUnits(item);
    const alreadyReturned = await getReturnedQuantityForOrderItem(tx, item.id);
    const remaining = warehouseOrdered - alreadyReturned;
    if (remaining <= 0) continue;
    lines.push({
      orderItemId: item.id,
      quantity: remaining,
      disposition: OrderInventoryRestockDisposition.SELLABLE
    });
  }

  if (!lines.length) return [];

  return applyOrderInventoryRestockTx(tx, {
    orderId,
    sourceType: OrderInventoryRestockSourceType.FULL_ORDER_STATUS_CHANGE,
    sourceId: opts.sourceId,
    reason: opts.reason,
    createdByUserId: opts.createdByUserId,
    lines
  });
}

export async function listOrderInventoryRestocks(orderId: string) {
  return prisma.orderInventoryRestockEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" }
  });
}

export async function adminApplyInventoryRestock(opts: {
  orderId: string;
  body: AdminInventoryRestockBody;
  createdByUserId?: string;
}): Promise<{ events: OrderInventoryRestockEvent[]; sourceId: string }> {
  const order = await prisma.order.findFirst({
    where: { id: opts.orderId, deletedAt: null },
    select: {
      id: true,
      status: true,
      shipments: { select: { status: true } }
    }
  });
  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const { orderIsDispatched } = await import("./cancellation-eligibility");
  if (orderIsDispatched(order)) {
    const wantsSellable = opts.body.lines.some(
      (l) => l.disposition === OrderInventoryRestockDisposition.SELLABLE
    );
    if (wantsSellable) {
      throw Object.assign(
        new Error(
          "After dispatch, sellable restock is only allowed through the return or RTO receipt workflow"
        ),
        { statusCode: 409, code: "RESTOCK_REQUIRES_RETURN_WORKFLOW" }
      );
    }
  }

  const sourceId = opts.body.idempotencyKey?.trim() || crypto.randomUUID();

  const events = await prisma.$transaction(async (tx) =>
    applyOrderInventoryRestockTx(tx, {
      orderId: opts.orderId,
      sourceType: OrderInventoryRestockSourceType.ADMIN_EXPLICIT,
      sourceId,
      reason: opts.body.reason,
      createdByUserId: opts.createdByUserId,
      lines: opts.body.lines
    })
  );

  logger.info("admin_inventory_restock_applied", {
    orderId: opts.orderId,
    sourceId,
    lineCount: events.length,
    sellableIncremented: events.filter((e) => e.inventoryIncremented).length
  });

  return { events, sourceId };
}
