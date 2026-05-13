import type { OrderStatus, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import * as delhivery from "./delhivery";
import { autoSelectAndCreate } from "./router";
import * as shiprocket from "./shiprocket";

export async function onOrderEnteredProcessing(orderId: string): Promise<void> {
  const result = await autoSelectAndCreate(orderId);
  if (!result.success) {
    logger.error("shipping_processing_failed", { orderId, error: result.error, code: result.code });
    return;
  }
  logger.info("shipping_processing_ok", { orderId, waybill: result.data.waybill });
}

function mapCourierStatusToShipment(rawStatus: string): ShipmentStatus {
  const s = rawStatus.toUpperCase();
  if (s.includes("DELIVER")) return "DELIVERED";
  if (s.includes("RTO")) return "RTO";
  if (s.includes("OUT") || s.includes("OFD")) return "OUT_FOR_DELIVERY";
  if (s.includes("TRANSIT") || s.includes("SHIPPED")) return "INTRANSIT";
  if (s.includes("PICK")) return "PICKED";
  return "INTRANSIT";
}

function shouldMarkOrderDelivered(shipmentStatus: ShipmentStatus): boolean {
  return shipmentStatus === "DELIVERED";
}

export async function syncTrackingByWaybill(waybill: string): Promise<
  | {
      success: true;
      data: {
        waybill: string;
        courier: string;
        shipmentStatus: ShipmentStatus;
        orderStatus: OrderStatus;
        fulfillmentStatus: string;
      };
    }
  | { success: false; error: string; code: string }
> {
  const wb = waybill.trim();
  if (!wb) {
    return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  }

  const shipment = await prisma.shipment.findFirst({
    where: { awb: wb },
    include: { order: true }
  });
  if (!shipment) {
    return { success: false, error: "Shipment not found", code: "NOT_FOUND" };
  }

  const courierLower = shipment.courier.toLowerCase();
  const tracked =
    courierLower.includes("delhivery") && !courierLower.includes("stub")
      ? await delhivery.trackShipment(wb)
      : courierLower.includes("stub")
        ? ({ success: true, data: { status: "In Transit", raw: {} } } as const)
        : await shiprocket.trackShipment(wb);

  if (!tracked.success) {
    return tracked;
  }

  const shipmentStatus = mapCourierStatusToShipment(tracked.data.status);

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status: shipmentStatus,
      ...(shipmentStatus === "DELIVERED" ? { deliveredAt: new Date() } : {})
    }
  });

  let orderStatus: OrderStatus = shipment.order.status;
  let fulfillmentStatus = shipment.order.fulfillmentStatus;

  if (shouldMarkOrderDelivered(shipmentStatus)) {
    await prisma.order.update({
      where: { id: shipment.orderId },
      data: {
        status: "DELIVERED",
        fulfillmentStatus: "FULFILLED"
      }
    });
    orderStatus = "DELIVERED";
    fulfillmentStatus = "FULFILLED";
  }

  return {
    success: true,
    data: {
      waybill: wb,
      courier: shipment.courier,
      shipmentStatus,
      orderStatus,
      fulfillmentStatus
    }
  };
}
