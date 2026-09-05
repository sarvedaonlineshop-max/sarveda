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

const REFUND_RESOLUTIONS = new Set([
  "RETURN_FOR_REFUND",
  "PARTIAL_REFUND",
  "KEEP_ITEM_PARTIAL_REFUND"
]);

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

async function assertAutomaticWarehouseStock(fulfillmentId: string): Promise<void> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: fulfillmentId }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.reservedAt) return;

  const inventory = await prisma.inventory.findUnique({
    where: { variantId: fulfillment.replacementVariantId }
  });
  const available = inventory ? inventory.onHand - inventory.reserved : 0;
  if (available < fulfillment.qty) {
    throw Object.assign(
      new Error(`Replacement requires ${fulfillment.qty} Sarveda warehouse unit(s), but only ${available} are available`),
      { statusCode: 409, code: "REPLACEMENT_WAREHOUSE_STOCK_REQUIRED" }
    );
  }
}

export async function reserveReplacementStock(opts: {
  fulfillmentId: string;
  adminUserId?: string;
}): Promise<{ reserved: boolean; outOfStock: boolean; warehouseQty: number }> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: opts.fulfillmentId },
    include: { request: true }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.reservedAt) {
    return { reserved: true, outOfStock: false, warehouseQty: 0 };
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
    return { reserved: false, outOfStock: true, warehouseQty: 0 };
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
      return { reserved: false, outOfStock: true, warehouseQty: 0 };
    }
  } else if (warehouseQty > 0 && !variant?.dropShipEnabled) {
    await prisma.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { status: "FAILED" as ReturnResolutionStatus }
    });
    return { reserved: false, outOfStock: true, warehouseQty: 0 };
  }

  await prisma.$transaction(async (tx) => {
    if (inventory && warehouseQty > 0) {
      // Consume the fresh replacement stock once. Do not also increase reserved.
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

  return { reserved: true, outOfStock: false, warehouseQty };
}

async function rollbackReplacementReservation(
  fulfillmentId: string,
  warehouseQty: number
): Promise<void> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: fulfillmentId }
  });
  if (!fulfillment?.reservedAt || fulfillment.shippedAt) return;

  await prisma.$transaction(async (tx) => {
    if (warehouseQty > 0) {
      await tx.inventory.updateMany({
        where: { variantId: fulfillment.replacementVariantId },
        data: { onHand: { increment: warehouseQty } }
      });
    }
    await tx.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { reservedAt: null, status: "REPLACEMENT_PENDING" }
    });
  });
}

async function createAutomaticDelhiveryReplacement(fulfillmentId: string): Promise<{
  outboundShipmentId: string;
  courier: string;
  awb: string;
  trackingUrl: string;
}> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: fulfillmentId },
    include: {
      request: true,
      order: { include: { addresses: true } },
      requestItem: true
    }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.outboundShipmentId) {
    const existing = await prisma.shipment.findUnique({ where: { id: fulfillment.outboundShipmentId } });
    if (existing?.awb) {
      return {
        outboundShipmentId: existing.id,
        courier: existing.courier,
        awb: existing.awb,
        trackingUrl: existing.trackingUrl ?? ""
      };
    }
  }

  const shipAddr = fulfillment.order.addresses.find((a) => a.type === "SHIPPING") ?? fulfillment.order.addresses[0];
  if (!shipAddr) {
    throw Object.assign(new Error("Order is missing a shipping address for replacement"), {
      statusCode: 400,
      code: "MISSING_ADDRESS"
    });
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: fulfillment.replacementVariantId },
    include: { productRel: { select: { hsnCode: true } } }
  });
  if (!variant) {
    throw Object.assign(new Error("Replacement variant not found"), {
      statusCode: 404,
      code: "VARIANT_NOT_FOUND"
    });
  }

  const { createShipment } = await import("../shipping/delhivery");
  const { resolveDelhiveryPickupName } = await import("../shipping/router");
  const pickupLocation = await resolveDelhiveryPickupName(fulfillment.orderId);
  const weightGrams = Math.max(
    50,
    (variant.weightGrams && variant.weightGrams > 0 ? variant.weightGrams : 500) * fulfillment.qty
  );
  const replacementRef = `${fulfillment.order.orderNumber}-${fulfillment.request.caseNumber}-REP-${fulfillment.id.slice(0, 6)}`.slice(0, 50);
  const productsDesc = `${fulfillment.requestItem.nameSnapshot} [${fulfillment.requestItem.skuSnapshot}] × ${fulfillment.qty}`.slice(0, 240);

  const created = await createShipment({
    orderNumber: replacementRef,
    paymentMode: "Pre-paid",
    orderValueRupees: Math.max(0, (variant.saleInPaise * fulfillment.qty) / 100),
    productsDesc,
    sellerGstTin: process.env.SELLER_GSTIN?.trim(),
    hsnCode: variant.productRel?.hsnCode?.trim() || process.env.DEFAULT_HSN_CODE?.trim() || "9205",
    invoiceReference: `${fulfillment.order.orderNumber}-REPLACEMENT`,
    weightKg: weightGrams / 1000,
    weightGrams,
    pickupLocation,
    channel: "www.sarveda.com",
    shippingMode: "S",
    packageType: "CARDBOARD_BOX",
    consigneeName: shipAddr.fullName,
    consigneePhone: shipAddr.phone || fulfillment.order.phone,
    address: [shipAddr.line1, shipAddr.line2].filter(Boolean).join(", "),
    city: shipAddr.city,
    state: shipAddr.state,
    pincode: shipAddr.postalCode
  });

  if (!created.success) {
    throw Object.assign(new Error(created.error || "Could not create Delhivery replacement shipment"), {
      statusCode: created.code === "DELHIVERY_NOT_CONFIGURED" ? 503 : 400,
      code: created.code ?? "DELHIVERY_CREATE"
    });
  }

  const shipment = await prisma.shipment.create({
    data: {
      orderId: fulfillment.orderId,
      courier: "Delhivery",
      awb: created.data.waybill,
      trackingUrl: created.data.trackingUrl,
      status: "INTRANSIT" as ShipmentStatus,
      carrierMeta: {
        kind: "REPLACEMENT",
        fulfillmentId: fulfillment.id,
        requestId: fulfillment.requestId,
        caseNumber: fulfillment.request.caseNumber,
        replacementReference: replacementRef
      }
    }
  });

  return {
    outboundShipmentId: shipment.id,
    courier: "Delhivery",
    awb: created.data.waybill,
    trackingUrl: created.data.trackingUrl
  };
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
    include: { request: { include: { items: true } }, order: true }
  });
  if (!fulfillment) {
    throw Object.assign(new Error("Replacement not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (fulfillment.shippedAt) return;

  const readiness = await assertReplacementReadyForShipment(opts.fulfillmentId);
  if (opts.awb?.trim() && readiness.returnAwb && opts.awb.trim() === readiness.returnAwb.trim()) {
    throw Object.assign(
      new Error("Replacement shipment must use a new forward AWB, not the return-pickup AWB"),
      { statusCode: 400, code: "REPLACEMENT_AWB_MUST_BE_NEW" }
    );
  }

  const automaticShipment = !opts.outboundShipmentId && !opts.awb?.trim();
  if (automaticShipment) {
    await assertAutomaticWarehouseStock(opts.fulfillmentId);
  }

  const wasAlreadyReserved = Boolean(fulfillment.reservedAt);
  let warehouseQtyReserved = 0;
  if (!wasAlreadyReserved) {
    const reserve = await reserveReplacementStock({
      fulfillmentId: opts.fulfillmentId,
      adminUserId: opts.adminUserId
    });
    warehouseQtyReserved = reserve.warehouseQty;
    if (!reserve.reserved) {
      throw Object.assign(new Error("Replacement item out of stock"), {
        statusCode: 409,
        code: "OUT_OF_STOCK"
      });
    }
  }

  let shipmentId = opts.outboundShipmentId;
  let courier = opts.courier?.trim() || "";
  let awb = opts.awb?.trim() || "";
  let trackingUrl = opts.trackingUrl?.trim() || "";

  try {
    if (!shipmentId && !awb) {
      const auto = await createAutomaticDelhiveryReplacement(opts.fulfillmentId);
      shipmentId = auto.outboundShipmentId;
      courier = auto.courier;
      awb = auto.awb;
      trackingUrl = auto.trackingUrl;
    } else if (!shipmentId && awb) {
      const shipment = await prisma.shipment.create({
        data: {
          orderId: fulfillment.orderId,
          courier: courier || "Manual",
          awb,
          trackingUrl: trackingUrl || null,
          status: "INTRANSIT" as ShipmentStatus,
          carrierMeta: {
            kind: "REPLACEMENT",
            fulfillmentId: fulfillment.id,
            requestId: fulfillment.requestId
          }
        }
      });
      shipmentId = shipment.id;
    }
  } catch (err) {
    if (!wasAlreadyReserved) {
      await rollbackReplacementReservation(opts.fulfillmentId, warehouseQtyReserved);
    }
    throw err;
  }

  if (!shipmentId || !awb) {
    if (!wasAlreadyReserved) {
      await rollbackReplacementReservation(opts.fulfillmentId, warehouseQtyReserved);
    }
    throw Object.assign(new Error("A new forward replacement shipment is required"), {
      statusCode: 400,
      code: "REPLACEMENT_SHIPMENT_REQUIRED"
    });
  }
  if (readiness.returnAwb && awb === readiness.returnAwb.trim()) {
    if (!wasAlreadyReserved) {
      await rollbackReplacementReservation(opts.fulfillmentId, warehouseQtyReserved);
    }
    throw Object.assign(new Error("Replacement shipment must use a new forward AWB"), {
      statusCode: 400,
      code: "REPLACEMENT_AWB_MUST_BE_NEW"
    });
  }

  const approvedItems = fulfillment.request.items.filter((i) => i.reviewDecision === "APPROVED");
  const hasApprovedRefund = approvedItems.some((i) => REFUND_RESOLUTIONS.has(i.requestedResolution ?? ""));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: {
        shippedAt: now,
        outboundShipmentId: shipmentId!,
        status: "REPLACEMENT_SHIPPED"
      }
    });
    if (!hasApprovedRefund) {
      await tx.orderServiceRequest.update({
        where: { id: fulfillment.requestId },
        data: { resolutionStatus: "REPLACEMENT_SHIPPED" }
      });
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: fulfillment.requestId,
    eventType: "REPLACEMENT_SHIPPED",
    message: `Replacement shipped — AWB ${awb}`,
    payloadJson: {
      fulfillmentId: fulfillment.id,
      outboundShipmentId: shipmentId,
      courier,
      awb,
      trackingUrl
    },
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });

  void (async () => {
    const req = await prisma.orderServiceRequest.findUnique({
      where: { id: fulfillment.requestId },
      include: { order: true, items: true }
    });
    if (!req) return;
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    const item = req.items.find((i) => i.id === fulfillment.requestItemId);
    await notifyReturnCaseEvent(
      req.id,
      "RETURN_REPLACEMENT_SHIPPED",
      {
        orderNumber: req.orderNumber,
        caseNumber: req.caseNumber,
        customerEmail: req.customerEmail,
        customerPhone: req.order.phone,
        itemSummary: item ? `${item.nameSnapshot} × ${item.qtySelected}` : "Replacement item",
        courier,
        awb,
        trackingUrl
      },
      { dedupeSuffix: fulfillment.id }
    );
  })();

  logger.info("replacement_shipped", {
    fulfillmentId: fulfillment.id,
    awb,
    outboundShipmentId: shipmentId
  });
}

export async function markReplacementDelivered(opts: {
  fulfillmentId: string;
  adminUserId?: string;
}): Promise<void> {
  const fulfillment = await prisma.orderReplacementFulfillment.findUnique({
    where: { id: opts.fulfillmentId },
    include: {
      request: {
        include: {
          items: true,
          replacementFulfillments: true,
          order: true
        }
      }
    }
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

  const request = fulfillment.request;
  const approvedItems = request.items.filter((i) => i.reviewDecision === "APPROVED");
  const hasApprovedRefund = approvedItems.some((i) => REFUND_RESOLUTIONS.has(i.requestedResolution ?? ""));
  const refundComplete =
    !hasApprovedRefund ||
    Boolean(request.refundProcessedAt || (request.refundTotalInPaise ?? 0) > 0);
  const allReplacementsDelivered = request.replacementFulfillments.every(
    (row) => row.id === fulfillment.id || Boolean(row.deliveredAt)
  );
  const shouldClose = allReplacementsDelivered && refundComplete;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.orderReplacementFulfillment.update({
      where: { id: fulfillment.id },
      data: { deliveredAt: now, status: "REPLACEMENT_DELIVERED" }
    });
    if (shouldClose) {
      await tx.orderServiceRequest.update({
        where: { id: fulfillment.requestId },
        data: { resolutionStatus: "CLOSED", closedAt: now }
      });
    }
  });

  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: fulfillment.requestId,
    eventType: "REPLACEMENT_DELIVERED",
    message: shouldClose
      ? "Replacement delivered — case closed"
      : "Replacement delivered — other resolution still pending",
    payloadJson: { fulfillmentId: fulfillment.id, caseClosed: shouldClose },
    actor: { userId: opts.adminUserId, role: "ADMIN" }
  });

  if (shouldClose) {
    await appendCaseEvent({
      requestId: fulfillment.requestId,
      eventType: "CASE_CLOSED",
      message: "Case closed after all refund/replacement resolutions completed",
      actor: { userId: opts.adminUserId, role: "ADMIN" }
    });
    void (async () => {
      const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
      await notifyReturnCaseEvent(request.id, "RETURN_CASE_CLOSED", {
        orderNumber: request.orderNumber,
        caseNumber: request.caseNumber,
        customerEmail: request.customerEmail,
        customerPhone: request.order.phone,
        itemSummary: "",
        closureKind: "replacement"
      });
    })();
  }
}

export async function computeReplacementCommercialDelta(opts: {
  orderItemId: string;
  replacementVariantId: string;
  qty: number;
}): Promise<{
  deltaPaise: number;
  classification: "SAME" | "REFUND_REQUIRED" | "ADDITIONAL_PAYMENT_REQUIRED";
}> {
  const item = await prisma.orderItem.findUnique({
    where: { id: opts.orderItemId },
    include: { variant: true }
  });
  const replacement = await prisma.productVariant.findUnique({
    where: { id: opts.replacementVariantId }
  });
  if (!item || !replacement) {
    throw Object.assign(new Error("Item or variant not found"), {
      statusCode: 404,
      code: "NOT_FOUND"
    });
  }

  const originalUnit = Math.round(item.lineTotalInPaise / item.qtyOrdered);
  const newUnit = replacement.saleInPaise;
  const delta = (newUnit - originalUnit) * opts.qty;

  if (delta === 0) return { deltaPaise: 0, classification: "SAME" };
  if (delta > 0) return { deltaPaise: delta, classification: "ADDITIONAL_PAYMENT_REQUIRED" };
  return { deltaPaise: Math.abs(delta), classification: "REFUND_REQUIRED" };
}
