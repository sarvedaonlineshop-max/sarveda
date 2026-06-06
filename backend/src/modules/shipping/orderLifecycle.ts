import type { OrderStatus, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import * as delhivery from "./delhivery";
import { assertOrderEligibleForTrackingSync, autoSelectAndCreate } from "./router";
import { scheduleShippingRetry } from "../../jobs/shippingRetryJob";
import * as shiprocket from "./shiprocket";
import { notifyOrderEmail } from "../notifications/email";

import {
  mapCourierStatusToShipment,
  persistShipmentTrackingFromCarrier
} from "./shipmentTracking.persist";

function notifyShipmentMilestones(
  orderId: string,
  prevOrderStatus: OrderStatus,
  nextOrderStatus: OrderStatus
): void {
  if (nextOrderStatus === "SHIPPED" && prevOrderStatus !== "SHIPPED" && prevOrderStatus !== "DELIVERED") {
    notifyOrderEmail(orderId, "order_shipped");
  }
  if (nextOrderStatus === "DELIVERED" && prevOrderStatus !== "DELIVERED") {
    notifyOrderEmail(orderId, "order_delivered");
  }
}

const BLOCKED_TRACK_ORDER: OrderStatus[] = ["CANCELLED", "REFUNDED", "PENDING_PAYMENT"];

export function orderBlocksCarrierSync(status: OrderStatus): boolean {
  return BLOCKED_TRACK_ORDER.includes(status);
}

export async function onOrderEnteredProcessing(orderId: string): Promise<void> {
  const result = await autoSelectAndCreate(orderId);
  if (!result.success) {
    logger.error("shipping_processing_failed", { orderId, error: result.error, code: result.code });
    const msg = `${result.code ?? "SHIPMENT_FAILED"}: ${result.error}`.slice(0, 4000);
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          shippingLastError: msg,
          shippingLastErrorAt: new Date()
        }
      });
    } catch (e) {
      logger.warn("shipping_error_persist_failed", { orderId, err: e });
    }
    await scheduleShippingRetry(orderId);
    return;
  }
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippingLastError: null,
        shippingLastErrorAt: null
      }
    });
  } catch {
    /* ignore */
  }
  logger.info("shipping_processing_ok", { orderId, waybill: result.data.waybill });
}

/**
 * Apply a carrier-reported status (e.g. Shiprocket webhook) without calling tracking APIs again.
 */
export async function applyCarrierWebhookTracking(
  waybill: string,
  statusLabel: string
): Promise<
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
  if (courierLower.includes("stub")) {
    return { success: false, error: "Stub shipments ignore carrier webhooks", code: "STUB_SHIPMENT" };
  }

  if (orderBlocksCarrierSync(shipment.order.status)) {
    return {
      success: false,
      error: "Tracking cannot be updated for cancelled, unpaid, or refunded orders.",
      code: "ORDER_STATE"
    };
  }

  const payOk = assertOrderEligibleForTrackingSync(shipment.order);
  if (!payOk.ok) {
    return { success: false, error: payOk.error, code: payOk.code };
  }

  const shipmentStatus = mapCourierStatusToShipment(statusLabel);
  const prevOrderStatus = shipment.order.status;
  const out = await persistShipmentTrackingFromCarrier(shipment, shipmentStatus);
  notifyShipmentMilestones(shipment.orderId, prevOrderStatus, out.orderStatus);

  logger.info("shiprocket_webhook_tracking_applied", {
    waybill: wb,
    shipmentStatus,
    orderStatus: out.orderStatus
  });

  return {
    success: true,
    data: {
      waybill: wb,
      courier: shipment.courier,
      shipmentStatus,
      orderStatus: out.orderStatus,
      fulfillmentStatus: out.fulfillmentStatus
    }
  };
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

  if (orderBlocksCarrierSync(shipment.order.status)) {
    return {
      success: false,
      error: "Tracking cannot be updated for cancelled, unpaid, or refunded orders.",
      code: "ORDER_STATE"
    };
  }

  const payOk = assertOrderEligibleForTrackingSync(shipment.order);
  if (!payOk.ok) {
    return { success: false, error: payOk.error, code: payOk.code };
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
  const prevOrderStatus = shipment.order.status;
  const out = await persistShipmentTrackingFromCarrier(shipment, shipmentStatus);
  notifyShipmentMilestones(shipment.orderId, prevOrderStatus, out.orderStatus);

  return {
    success: true,
    data: {
      waybill: wb,
      courier: shipment.courier,
      shipmentStatus,
      orderStatus: out.orderStatus,
      fulfillmentStatus: out.fulfillmentStatus
    }
  };
}
