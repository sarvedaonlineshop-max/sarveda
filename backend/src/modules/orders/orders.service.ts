import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { orderItemWarehouseUnits } from "../inventory/order-item-fulfillment";

import { expireStripeCheckoutSessionForPayment } from "../payments/stripe.session";
import { restockPaidOrderLinesTx } from "./order-inventory-restock.service";
import { recomputeReservedForOrder } from "./inventory-reserved-reconcile.service";

/** Reserve stock when checkout creates an order (increment `reserved` per line qty). */
export async function reserveStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { variant: { include: { inventory: true } } }
  });

  for (const item of items) {
    if (!item.variantId || !item.variant) continue;
    const inv = item.variant.inventory;
    if (!inv) continue;

    const warehouseQty = orderItemWarehouseUnits(item);
    if (warehouseQty <= 0) continue;

    const rows = await tx.$executeRaw`
      UPDATE "Inventory"
      SET reserved = reserved + ${warehouseQty}
      WHERE id = ${inv.id}::uuid
      AND ("onHand" - reserved) >= ${warehouseQty}
    `;

    if (rows === 0) {
      throw Object.assign(new Error(`Insufficient stock for SKU ${item.skuSnapshot}`), {
        statusCode: 409,
        code: "OUT_OF_STOCK"
      });
    }
  }
}

/** Release reserved stock (payment timeout / failure / cancel while unpaid). */
export async function releaseStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      qtyOrdered: true,
      variantId: true,
      warehouseFulfillmentQty: true,
      dropShipFulfillmentQty: true
    }
  });

  for (const item of items) {
    if (!item.variantId) continue;
    const inv = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
    if (!inv) continue;
    const warehouseQty = orderItemWarehouseUnits(item);
    const dec = Math.min(warehouseQty, inv.reserved);
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
    select: {
      qtyOrdered: true,
      variantId: true,
      warehouseFulfillmentQty: true,
      dropShipFulfillmentQty: true
    }
  });

  for (const item of items) {
    if (!item.variantId) continue;
    const inv = await tx.inventory.findUnique({ where: { variantId: item.variantId } });
    if (!inv) continue;
    const warehouseQty = orderItemWarehouseUnits(item);
    if (warehouseQty <= 0) continue;
    const decReserved = Math.min(warehouseQty, inv.reserved);
    await tx.inventory.update({
      where: { id: inv.id },
      data: {
        onHand: { decrement: warehouseQty },
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

/** @deprecated Zoho retired — no-op retained for import compatibility. */
export async function mirrorOrderStockToZoho(_orderId: string, _context: string): Promise<void> {
  return;
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
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { payments: { orderBy: { createdAt: "desc" } } }
    });
    if (!order) return { changed: false as const, stripeSessionId: null as string | null };
    // Safety A: never auto-cancel COD orders (status PAID, payment PENDING)
    if (order.payments.some((p) => p.provider === "COD")) {
      logger.warn("cancel_unpaid_skipped_cod", { orderId });
      return { changed: false as const, stripeSessionId: null as string | null };
    }
    if (order.status !== "PENDING_PAYMENT") {
      return { changed: false as const, stripeSessionId: null as string | null };
    }
    const payment = order.payments[0];
    if (payment?.status === "CAPTURED") {
      return { changed: false as const, stripeSessionId: null as string | null };
    }

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
    return {
      changed: true as const,
      stripeSessionId:
        payment?.provider === "STRIPE" && payment.providerOrderId ? payment.providerOrderId : null
    };
  });

  const changed = outcome.changed;

  // Safety net: reserved must equal remaining PENDING_PAYMENT holds for these variants.
  if (changed) {
    try {
      await recomputeReservedForOrder(orderId);
    } catch (err) {
      logger.error("reserved_recompute_after_cancel_failed", {
        orderId,
        err: err instanceof Error ? err.message : String(err)
      });
    }
    if (outcome.stripeSessionId) {
      try {
        await expireStripeCheckoutSessionForPayment({
          provider: "STRIPE",
          providerOrderId: outcome.stripeSessionId
        });
      } catch (err) {
        logger.error("stripe_session_expire_after_cancel_failed", {
          orderId,
          sessionId: outcome.stripeSessionId,
          err: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return changed;
}

/**
 * Restock inventory when a paid order is cancelled or refunded (reverse confirmStock).
 * Records OrderInventoryRestockEvent rows (SELLABLE) for accounting provenance.
 * Idempotent per (FULL_ORDER_STATUS_CHANGE, sourceId, orderItemId).
 */
export async function restockPaidOrderTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts?: { sourceId?: string; reason?: string; createdByUserId?: string }
): Promise<void> {
  await restockPaidOrderLinesTx(tx, orderId, {
    sourceId: opts?.sourceId ?? `${orderId}:RESTOCK`,
    reason: opts?.reason,
    createdByUserId: opts?.createdByUserId
  });
}

/** Stock was decremented at checkout (online captured, or COD placed as PAID). */
function orderStockWasConfirmed(order: {
  status: string;
  paymentStatus: string;
  payments: Array<{ status: string; provider: string }>;
}): boolean {
  const inPaidPipeline = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status);
  if (!inPaidPipeline) return false;

  // Include post-refund payment statuses: refund finalize may mark Payment REFUNDED
  // before handlePaidOrderStatusChange runs — stock was still confirmed at capture.
  if (
    order.paymentStatus === "CAPTURED" ||
    order.paymentStatus === "PARTIALLY_REFUNDED" ||
    order.paymentStatus === "REFUNDED"
  ) {
    return true;
  }
  if (
    order.payments.some((p) =>
      ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)
    )
  ) {
    return true;
  }
  // COD: stock confirmed at checkout while payment stays PENDING until cash collection.
  if (order.payments.some((p) => p.provider === "COD")) return true;

  return false;
}

/** Mark course/event access cancelled when a paid digital order is refunded or cancelled. */
async function revokeDigitalPurchasesTx(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<void> {
  await tx.enrollment.updateMany({
    where: { orderId, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" }
  });
  await tx.booking.updateMany({
    where: { orderId, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" }
  });
}

export async function handlePaidOrderStatusChange(
  orderId: string,
  toStatus: "CANCELLED" | "REFUNDED",
  reason: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { payments: { orderBy: { createdAt: "desc" } } }
    });
    if (!order) return;

    const wasPaidPipeline = ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status);
    const stockWasConfirmed = orderStockWasConfirmed(order);

    if (wasPaidPipeline && stockWasConfirmed) {
      await restockPaidOrderTx(tx, orderId, {
        sourceId: `${orderId}:${toStatus}`,
        reason
      });
      if (toStatus === "REFUNDED" || toStatus === "CANCELLED") {
        await revokeDigitalPurchasesTx(tx, orderId);
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus,
        paymentStatus: toStatus === "REFUNDED" ? "REFUNDED" : order.paymentStatus,
        fulfillmentStatus: toStatus === "CANCELLED" ? "UNFULFILLED" : order.fulfillmentStatus
      }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        reason
      }
    });
  });
}
