import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

/** Reserve stock when checkout creates an order (increment `reserved` per line qty). */
export async function reserveStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { variant: { include: { inventory: true } } }
  });

  for (const item of items) {
    const inv = item.variant.inventory;
    if (!inv) continue;
    const available = inv.onHand - inv.reserved;
    if (item.qtyOrdered > available) {
      const e = new Error(`Insufficient stock for SKU ${item.skuSnapshot}`) as Error & {
        statusCode: number;
        code: string;
      };
      e.statusCode = 400;
      e.code = "INSUFFICIENT_STOCK";
      throw e;
    }
    await tx.inventory.update({
      where: { id: inv.id },
      data: { reserved: { increment: item.qtyOrdered } }
    });
  }
}

/** Release reserved stock (payment timeout / failure / cancel while unpaid). */
export async function releaseStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { qtyOrdered: true, variantId: true }
  });

  for (const item of items) {
    const inv = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
    if (!inv) continue;
    const dec = Math.min(item.qtyOrdered, inv.reserved);
    if (dec <= 0) continue;
    await tx.inventory.update({
      where: { id: inv.id },
      data: { reserved: { decrement: dec } }
    });
  }
}

/**
 * On successful payment: reduce physical stock and clear reservation.
 * Handles legacy rows where `reserved` may be 0 (only decrements onHand by line qty).
 */
export async function confirmStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { qtyOrdered: true, variantId: true }
  });

  for (const item of items) {
    const inv = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
    if (!inv) continue;
    const decReserved = Math.min(item.qtyOrdered, inv.reserved);
    await tx.inventory.update({
      where: { id: inv.id },
      data: {
        onHand: { decrement: item.qtyOrdered },
        ...(decReserved > 0 ? { reserved: { decrement: decReserved } } : {})
      }
    });
  }
}

export async function reserveStock(orderId: string): Promise<void> {
  await prisma.$transaction((tx) => reserveStockTx(tx, orderId));
}

export async function releaseStock(orderId: string): Promise<void> {
  await prisma.$transaction((tx) => releaseStockTx(tx, orderId));
}

export async function confirmStock(orderId: string): Promise<void> {
  await prisma.$transaction((tx) => confirmStockTx(tx, orderId));
}

/**
 * Cancel an unpaid order, release reserved stock, mark payment FAILED.
 * Returns true if a transition happened (idempotent if already paid/cancelled).
 */
export async function cancelUnpaidOrderWithRelease(
  orderId: string,
  reason: string,
  rawPayloadExtras?: Record<string, unknown>
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!order) return false;
    if (order.status !== "PENDING_PAYMENT") return false;
    const payment = order.payments[0];
    if (payment?.status === "CAPTURED") return false;

    await releaseStockTx(tx, orderId);

    if (payment) {
      const prev = (payment.rawPayload as Record<string, unknown>) ?? {};
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          rawPayload: { ...prev, ...rawPayloadExtras, cancelledAt: new Date().toISOString(), cancelReason: reason }
        }
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", paymentStatus: "FAILED" }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "CANCELLED",
        reason
      }
    });
    return true;
  });
}
