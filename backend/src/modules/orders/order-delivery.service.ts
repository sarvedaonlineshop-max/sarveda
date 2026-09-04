import type { FulfillmentStatus, OrderStatus, Prisma, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

export type MarkOrderDeliveredResult = {
  orderId: string;
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  /** Canonical delivery timestamp used for return-window calculations. */
  deliveredAt: Date;
  /** True when this call newly established delivery state (vs idempotent re-entry). */
  newlyDelivered: boolean;
  shipmentsUpdated: number;
};

function isReverseShipment(carrierMeta: Prisma.JsonValue | null): boolean {
  if (!carrierMeta || typeof carrierMeta !== "object" || Array.isArray(carrierMeta)) return false;
  return (carrierMeta as { direction?: string }).direction === "REVERSE";
}

/**
 * Authoritative manual delivery confirmation (Admin "Mark Delivered").
 *
 * Aligns order + forward shipments + status history so return eligibility,
 * customer My Orders, and carrier-sync code share one delivery truth:
 * - Order.status = DELIVERED
 * - FulfillmentStatus = FULFILLED
 * - Forward shipments → DELIVERED with deliveredAt set once (never reset)
 * - OrderStatusHistory DELIVERED row written once
 */
export async function markOrderDeliveredByAdmin(
  orderId: string,
  opts?: { reason?: string; changedBy?: string | null; now?: Date }
): Promise<MarkOrderDeliveredResult> {
  const now = opts?.now ?? new Date();
  const reason = opts?.reason?.trim() || "Admin marked delivered";

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        shipments: true,
        statusHistory: {
          where: { toStatus: "DELIVERED" },
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });
    if (!order) {
      throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
    }

    const existingHistoryAt = order.statusHistory[0]?.createdAt ?? null;
    const existingShipmentDeliveredAt = order.shipments
      .filter((s) => !isReverseShipment(s.carrierMeta) && s.deliveredAt)
      .map((s) => s.deliveredAt as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const alreadyDelivered =
      order.status === "DELIVERED" &&
      (existingShipmentDeliveredAt != null || existingHistoryAt != null);

    // Canonical deliveredAt: keep the earliest established timestamp forever.
    const deliveredAt = existingShipmentDeliveredAt ?? existingHistoryAt ?? now;
    const newlyDelivered = !alreadyDelivered;

    const forwardShipments = order.shipments.filter((s) => !isReverseShipment(s.carrierMeta));
    let shipmentsUpdated = 0;

    for (const shipment of forwardShipments) {
      const patch: { status?: ShipmentStatus; deliveredAt?: Date } = {};
      if (shipment.status !== "DELIVERED") {
        patch.status = "DELIVERED";
      }
      if (!shipment.deliveredAt) {
        patch.deliveredAt = deliveredAt;
      }
      if (Object.keys(patch).length > 0) {
        await tx.shipment.update({ where: { id: shipment.id }, data: patch });
        shipmentsUpdated += 1;
      }
    }

    if (order.status !== "DELIVERED" || order.fulfillmentStatus !== "FULFILLED") {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "DELIVERED",
          fulfillmentStatus: "FULFILLED"
        }
      });
    }

    if (!existingHistoryAt) {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status === "DELIVERED" ? "DELIVERED" : order.status,
          toStatus: "DELIVERED",
          reason,
          ...(opts?.changedBy ? { changedBy: opts.changedBy } : {})
        }
      });
    }

    if (newlyDelivered) {
      logger.info("order_marked_delivered_by_admin", {
        orderId,
        deliveredAt: deliveredAt.toISOString(),
        shipmentsUpdated
      });
    } else {
      logger.info("order_mark_delivered_idempotent", {
        orderId,
        deliveredAt: deliveredAt.toISOString(),
        shipmentsUpdated
      });
    }

    return {
      orderId,
      orderStatus: "DELIVERED" as OrderStatus,
      fulfillmentStatus: "FULFILLED" as FulfillmentStatus,
      deliveredAt,
      newlyDelivered,
      shipmentsUpdated
    };
  });
}
