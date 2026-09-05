import type { ReturnResolutionStatus, ShipmentStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import {
  getVariantFulfillmentAvailability,
  variantFulfillmentInputFromVariant
} from "../inventory/variant-fulfillment-availability";
import { physicalReturnRequiredForReason } from "./return-replacement.constants";

export const replacementShipmentBodySchema = z.object({
  outboundShipmentId: z.string().uuid().optional(),
  awb: z.string().trim().min(1).max(120).optional(),
  courier: z.string().trim().min(1).max(120).optional(),
  trackingUrl: z.string().trim().url().max(500).optional().or(z.literal(""))
});

async function assertReplacementReadyForShipment(fulfillmentId: string): Promise<{
  requestId: string;
  returnAwb: string | null;
}> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: fulfillmentId },
    include: {
      request: {
        include: {
          returnShipment: true,
          items: true
        }
      }
    }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const request = fulfillment.request;
  if (request.status !== "APPROVED" && request.status !== "PARTIALLY_APPROVED") {
    throw Object.assign(new Error("Replacement request must be approved before shipment"), {
      statusCode: 400,
      code: "NOT_APPROVED"
    });
  }

  const requestItem = request.items.find((item) => item.id === fulfillment.requestItemId);
  if (!requestItem || requestItem.reviewDecision !== "APPROVED") {
    throw Object.assign(new Error("Replacement line must be approved before shipment"), {
      statusCode: 400,
      code: "LINE_NOT_APPROVED"
    });
  }

  if (physicalReturnRequiredForReason(requestItem.reasonCode)) {
    const returnShipment = request.returnShipment;
    if (!returnShipment?.receivedAt) {
      throw Object.assign(
        new Error("Returned item must reach the warehouse before the replacement can be shipped"),
        { statusCode: 400, code: "RETURN_NOT_RECEIVED" }
      );
    }
    if (
      request.returnPhysicalStatus !== "INSPECTED" ||
      returnShipment.physicalStatus !== "INSPECTED" ||
      !returnShipment.disposition ||
      returnShipment.disposition === "NEEDS_REVIEW"
    ) {
      throw Object.assign(
        new Error("Complete warehouse QC before shipping the replacement item"),
        { statusCode: 400, code: "QC_INCOMPLETE" }
      );
    }
  }

  return { requestId: request.id, returnAwb: request.returnShipment?.awb ?? null };
}

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
      // Replacement is consumed only when the forward shipment is being created.
      // Decrement onHand once; do not also increment reserved (available = onHand - reserved).
      await tx.inventory.update({
        where: { variantId: fulfillment.replacementVariantId },
        data: { onHand: { decrement: warehouseQty } }
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
    qty: fulfillment.qty,
    warehouseQty
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

  const readiness = await assertReplacementReadyForShipment(opts.fulfillmentId);
  if (!opts.outboundShipmentId && !opts.awb?.trim()) {
    throw Object.assign(new Error("A new forward-shipment AWB is required for the replacement"), {
      statusCode: 400,
      code: "REPLACEMENT_AWB_REQUIRED"
    });
  }
  if (opts.awb?.trim() && readiness.returnAwb && opts.awb.trim() === readiness.returnAwb.trim()) {
    throw Object.assign(
      new Error("Replacement shipment must use a new forward AWB, not the return-pickup AWB"),
      { statusCode: 400, code: "REPLACEMENT_AWB_MUST_BE_NEW" }
    );
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
        courier: opts.courier?.trim() || "Manual",
        awb: opts.awb.trim(),
        trackingUrl: opts.trackingUrl?.trim() || null,
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
    payloadJson: {
      fulfillmentId: fulfillment.id,
      outboundShipmentId: shipmentId ?? null,
      courier: opts.courier ?? null,
      awb: opts.awb ?? null,
      trackingUrl: opts.trackingUrl ?? null
    },
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });

  void (async () => {
    const req = await prisma.orderServiceRequest.findUnique({
      where: { id: fulfillment.requestId }
    });
    if (!req) return;
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(req.id, "RETURN_REPLACEMENT_SHIPPED", {
      orderNumber: req.orderNumber,
      caseNumber: req.caseNumber,
      customerEmail: req.customerEmail,
      itemSummary: "",
      courier: opts.courier ?? null,
      awb: opts.awb ?? null,
      trackingUrl: opts.trackingUrl ?? null
    });
  })();

  logger.info("replacement_shipped", {
    fulfillmentId: fulfillment.id,
    awb: opts.awb,
    outboundShipmentId: shipmentId ?? null
  });
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
  if (!fulfillment.shippedAt || fulfillment.status !== "REPLACEMENT_SHIPPED") {
    throw Object.assign(new Error("Replacement must be shipped before it can be marked delivered"), {
      statusCode: 400,
      code: "REPLACEMENT_NOT_SHIPPED"
    });
  }

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

  void (async () => {
    const req = await prisma.orderServiceRequest.findUnique({
      where: { id: fulfillment.requestId }
    });
    if (!req) return;
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(req.id, "RETURN_CASE_CLOSED", {
      orderNumber: req.orderNumber,
      caseNumber: req.caseNumber,
      customerEmail: req.customerEmail,
      itemSummary: "",
      closureKind: "replacement"
    });
  })();
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
