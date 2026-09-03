import type { ReturnResolutionStatus, ShipmentStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { orderItemWarehouseUnits } from "../inventory/order-item-fulfillment";
import {
  assertFulfillmentAllowed,
  getVariantFulfillmentAvailability,
  variantFulfillmentInputFromVariant
} from "../inventory/variant-fulfillment-availability";

export const replacementShipmentBodySchema = z.object({
  outboundShipmentId: z.string().uuid().optional(),
  awb: z.string().trim().min(1).max(120).optional(),
  courier: z.string().trim().min(1).max(120).optional(),
  trackingUrl: z.string().trim().url().max(500).optional().or(z.literal(""))
});

export async function reserveReplacementStock(opts: {
  fulfillmentId: string;
  adminUserId?: string;
}): Promise<{ reserved: boolean; outOfStock: boolean }> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: opts.fulfillmentId },
    include: { request: true }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.reservedAt) {
    return { reserved: true, outOfStock: false };
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: fulfillment.replacementVariantId },
    include: { inventory: true }
  });
  const allocation = getVariantFulfillmentAvailability(
    variantFulfillmentInputFromVariant(variant ?? { inventory: null }),
    fulfillment.qty
  );

  if (!allocation.sellable || allocation.requestedQty < fulfillment.qty) {
    await prisma.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { status: "FAILED" as ReturnResolutionStatus }
    });
    return { reserved: false, outOfStock: true };
  }

  const warehouseQty = allocation.warehouseFulfillmentQty;
  const inventory = variant?.inventory ?? null;

  if (inventory && warehouseQty > 0) {
    const available = inventory.onHand - inventory.reserved;
    if (available < warehouseQty) {
      await prisma.orderReplacementFulfillment.update({
        where: { id: fulfillment.id },
        data: { status: "FAILED" as ReturnResolutionStatus }
      });
      return { reserved: false, outOfStock: true };
    }
  } else if (warehouseQty > 0 && !variant?.dropShipEnabled) {
    await prisma.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { status: "FAILED" as ReturnResolutionStatus }
    });
    return { reserved: false, outOfStock: true };
  }

  await prisma.$transaction(async (tx) => {
    if (inventory && warehouseQty > 0) {
      await tx.inventory.update({
        where: { variantId: fulfillment.replacementVariantId },
        data: { reserved: { increment: warehouseQty }, onHand: { decrement: warehouseQty } }
      });
    }
    await tx.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { reservedAt: new Date(), status: "REPLACEMENT_PENDING" }
    });
  });

  logger.info("replacement_stock_reserved", {
    fulfillmentId: fulfillment.id,
    variantId: fulfillment.replacementVariantId,
    qty: fulfillment.qty
  });

  return { reserved: true, outOfStock: false };
}

export async function markReplacementShipped(opts: {
  fulfillmentId: string;
  awb?: string;
  courier?: string;
  trackingUrl?: string;
  outboundShipmentId?: string;
  adminUserId?: string;
}): Promise<void> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: opts.fulfillmentId },
    include: { request: true }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.shippedAt) {
    return;
  }
  if (!fulfillment.reservedAt) {
    const reserve = await reserveReplacementStock({
      fulfillmentId: opts.fulfillmentId,
      adminUserId: opts.adminUserId
    });
    if (!reserve.reserved) {
      throw Object.assign(new Error("Replacement item out of stock"), {
        statusCode: 409,
        code: "OUT_OF_STOCK"
      });
    }
  }

  let shipmentId = opts.outboundShipmentId;
  if (!shipmentId && opts.awb) {
    const shipment = await prisma.shipment.create({
      data: {
        orderId: fulfillment.orderId,
        courier: opts.courier ?? "Manual",
        awb: opts.awb,
        trackingUrl: opts.trackingUrl ?? null,
        status: "SHIPPED" as ShipmentStatus
      }
    });
    shipmentId = shipment.id;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: {
        shippedAt: now,
        outboundShipmentId: shipmentId ?? null,
        status: "REPLACEMENT_SHIPPED"
      }
    }),
    prisma.orderServiceRequest.update({
      where: { id: fulfillment.requestId },
      data: { resolutionStatus: "REPLACEMENT_SHIPPED" }
    })
  ]);

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: fulfillment.requestId,
    eventType: "REPLACEMENT_SHIPPED",
    message: opts.awb ? `Replacement shipped — AWB ${opts.awb}` : "Replacement shipped",
    payloadJson: { fulfillmentId: fulfillment.id, awb: opts.awb ?? null },
    actor: { role: "ADMIN" }
  });

  logger.info("replacement_shipped", { fulfillmentId: fulfillment.id, awb: opts.awb });
}

export async function markReplacementDelivered(opts: {
  fulfillmentId: string;
  adminUserId?: string;
}): Promise<void> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: opts.fulfillmentId }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.deliveredAt) return;

  const now = new Date();
  await prisma.$transaction([
    prisma.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { deliveredAt: now, status: "REPLACEMENT_DELIVERED" }
    }),
    prisma.orderServiceRequest.update({
      where: { id: fulfillment.requestId },
      data: { resolutionStatus: "CLOSED", closedAt: now }
    })
  ]);

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: fulfillment.requestId,
    eventType: "REPLACEMENT_DELIVERED",
    message: "Replacement delivered — case closed",
    payloadJson: { fulfillmentId: fulfillment.id },
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });
  await appendCaseEvent({
    requestId: fulfillment.requestId,
    eventType: "CASE_CLOSED",
    message: "Case closed after replacement delivery",
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });
}

export async function computeReplacementCommercialDelta(opts: {
  orderItemId: string;
  replacementVariantId: string;
  qty: number;
}): Promise<{ deltaPaise: number; classification: "SAME" | "REFUND_REQUIRED" | "ADDITIONAL_PAYMENT_REQUIRED" }> {
  const item = await prisma.orderItem.findUnique({
    where: { id: opts.orderItemId },
    include: { variant: true }
  });
  const replacement = await prisma.productVariant.findUnique({
    where: { id: opts.replacementVariantId }
  });
  if (!item || !replacement) {
    throw Object.assign(new Error("Item or variant not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const originalUnit = Math.round(item.lineTotalInPaise / item.qtyOrdered);
  const newUnit = replacement.saleInPaise;
  const delta = (newUnit - originalUnit) * opts.qty;

  if (delta === 0) return { deltaPaise: 0, classification: "SAME" };
  if (delta > 0) return { deltaPaise: delta, classification: "ADDITIONAL_PAYMENT_REQUIRED" };
  return { deltaPaise: Math.abs(delta), classification: "REFUND_REQUIRED" };
}
