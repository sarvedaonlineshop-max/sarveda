import type { OrderStatus, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import * as delhivery from "./delhivery";
import { assertOrderEligibleForTrackingSync } from "./router";
import * as shiprocket from "./shiprocket";
import { notifyOrderEmail } from "../notifications/email";

import {
  mapCourierStatusToShipment,
  persistShipmentTrackingFromCarrier,
  rollUpOrderFromShipments
} from "./shipmentTracking.persist";

function notifyShipmentMilestones(
  orderId: string,
  prevOrderStatus: OrderStatus,
  nextOrderStatus: OrderStatus,
  awb?: string
): void {
  if (nextOrderStatus === "SHIPPED" && prevOrderStatus !== "SHIPPED" && prevOrderStatus !== "DELIVERED") {
    // Same AWB as the label-create notice, so the customer gets one ship message per parcel.
    notifyOrderEmail(orderId, "order_shipped", awb?.trim() ? { awb: awb.trim() } : undefined);
  }
  if (nextOrderStatus === "DELIVERED" && prevOrderStatus !== "DELIVERED") {
    notifyOrderEmail(orderId, "order_delivered");
  }
}

const BLOCKED_TRACK_ORDER: OrderStatus[] = ["CANCELLED", "REFUNDED", "PENDING_PAYMENT"];

export function orderBlocksCarrierSync(status: OrderStatus): boolean {
  return BLOCKED_TRACK_ORDER.includes(status);
}

const RTO_STATUS_LABELS = [
  "RTO",
  "RTO Initiated",
  "RTO Delivered",
  "Return to Origin",
  "Returned"
];

export function isShiprocketRtoStatus(status: string | undefined): boolean {
  if (!status?.trim()) return false;
  const lower = status.toLowerCase();
  return RTO_STATUS_LABELS.some((s) => lower.includes(s.toLowerCase()));
}

/**
 * Phase 1A: record carrier RTO on shipment only — no auto-cancel, no auto-restock.
 * Physical receipt and refund are handled in Phase 1C RTO V2.
 */
export async function handleRtoShipment(
  orderId: string,
  awb: string,
  status: string
): Promise<{ orderStatus: OrderStatus; fulfillmentStatus: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      email: true,
      orderNumber: true,
      notes: true
    }
  });
  if (!order) return null;

  await prisma.shipment.updateMany({
    where: { orderId, awb },
    data: { status: "RTO", rtoAt: new Date() }
  });

  // One parcel coming back does not return the whole order — roll up across every parcel.
  const rolled = await rollUpOrderFromShipments(orderId);

  const rtoNote = `RTO reported by carrier: ${status} — AWB ${awb} (awaiting physical receipt at Sarveda)`;
  await prisma.order.update({
    where: { id: orderId },
    data: {
      notes: order.notes ? `${order.notes}\n${rtoNote}` : rtoNote
    }
  });

  notifyOrderEmail(orderId, "order_returned");

  console.error("[RTO_ALERT]", {
    orderId,
    orderNumber: order.orderNumber,
    awb,
    status,
    customerEmail: order.email,
    phase: "1A_no_auto_cancel_restock"
  });

  logger.info("rto_recorded_no_auto_restock", { orderId, awb, status });
  return rolled;
}

/**
 * Processing means warehouse-ready — admin picks partner + source on
 * Shipments → Ready to ship. Do not auto-create carrier labels here.
 */
export async function onOrderEnteredProcessing(orderId: string): Promise<void> {
  logger.info("order_ready_to_ship_manual_label", { orderId });
}

type WaybillShipment = Awaited<ReturnType<typeof loadWaybillShipments>>[number];

type TrackingSyncResult =
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
  | { success: false; error: string; code: string };

function loadWaybillShipments(wb: string) {
  return prisma.shipment.findMany({
    where: { awb: wb },
    include: {
      order: {
        include: { payments: { select: { provider: true }, orderBy: { createdAt: "desc" }, take: 3 } }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

/** One waybill can be saved on more than one order. Skip a row instead of blocking the others. */
function waybillSkipReason(shipment: WaybillShipment): { error: string; code: string } | null {
  if (orderBlocksCarrierSync(shipment.order.status)) {
    return {
      error: "Tracking cannot be updated for cancelled, unpaid, or refunded orders.",
      code: "ORDER_STATE"
    };
  }
  const payOk = assertOrderEligibleForTrackingSync(shipment.order);
  if (!payOk.ok) return { error: payOk.error, code: payOk.code };
  return null;
}

/**
 * Write one carrier status onto every order that carries this waybill.
 * A row that is cancelled, unpaid, or a stub is left as it is.
 */
async function applyStatusToWaybillShipments(
  wb: string,
  shipments: WaybillShipment[],
  shipmentStatus: ShipmentStatus,
  statusLabel: string
): Promise<TrackingSyncResult> {
  const eligible = shipments.filter((shipment) => waybillSkipReason(shipment) == null);
  if (eligible.length === 0) {
    const reason = shipments[0] ? waybillSkipReason(shipments[0]) : null;
    if (reason) return { success: false, error: reason.error, code: reason.code };
    return { success: false, error: "Shipment not found", code: "NOT_FOUND" };
  }

  let last: TrackingSyncResult | null = null;
  for (const shipment of eligible) {
    if (shipmentStatus === "RTO") {
      if (shipment.status === "RTO") {
        last = {
          success: true,
          data: {
            waybill: wb,
            courier: shipment.courier,
            shipmentStatus: "RTO",
            orderStatus: shipment.order.status,
            fulfillmentStatus: shipment.order.fulfillmentStatus
          }
        };
        continue;
      }
      const rolled = await handleRtoShipment(shipment.orderId, wb, statusLabel);
      last = {
        success: true,
        data: {
          waybill: wb,
          courier: shipment.courier,
          shipmentStatus: "RTO",
          orderStatus: rolled?.orderStatus ?? shipment.order.status,
          fulfillmentStatus: rolled?.fulfillmentStatus ?? shipment.order.fulfillmentStatus
        }
      };
      continue;
    }

    const prevOrderStatus = shipment.order.status;
    const out = await persistShipmentTrackingFromCarrier(shipment, shipmentStatus);
    notifyShipmentMilestones(shipment.orderId, prevOrderStatus, out.orderStatus, wb);
    last = {
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

  if (eligible.length > 1) {
    logger.info("waybill_status_applied_to_orders", {
      waybill: wb,
      shipmentStatus,
      orders: eligible.length
    });
  }
  return last!;
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

  const shipments = await loadWaybillShipments(wb);
  if (shipments.length === 0) {
    return { success: false, error: "Shipment not found", code: "NOT_FOUND" };
  }
  if (shipments.every((shipment) => shipment.courier.toLowerCase().includes("stub"))) {
    return { success: false, error: "Stub shipments ignore carrier webhooks", code: "STUB_SHIPMENT" };
  }

  const shipmentStatus = mapCourierStatusToShipment(statusLabel);
  const applied = await applyStatusToWaybillShipments(wb, shipments, shipmentStatus, statusLabel);
  if (applied.success) {
    logger.info("shiprocket_webhook_tracking_applied", {
      waybill: wb,
      shipmentStatus,
      orderStatus: applied.data.orderStatus
    });
  }
  return applied;
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

  const shipments = await loadWaybillShipments(wb);
  if (shipments.length === 0) {
    return { success: false, error: "Shipment not found", code: "NOT_FOUND" };
  }

  const trackFrom =
    shipments.find((shipment) => !shipment.courier.toLowerCase().includes("stub")) ?? shipments[0]!;
  const courierLower = trackFrom.courier.toLowerCase();
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
  return applyStatusToWaybillShipments(wb, shipments, shipmentStatus, tracked.data.status);
}
