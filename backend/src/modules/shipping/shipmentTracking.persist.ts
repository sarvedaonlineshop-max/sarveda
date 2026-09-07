import type { Order, OrderStatus, Shipment, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";

/**
 * Normalize courier-facing strings → DB shipment enum.
 *
 * Delhivery often returns "Manifested" right after label create (not yet packed/picked).
 * That must stay CREATED — never jump to INTRANSIT.
 */
export function mapCourierStatusToShipment(rawStatus: string): ShipmentStatus {
  const s = rawStatus.toUpperCase().trim();
  if (!s || s === "UNKNOWN") return "CREATED";

  if (s.includes("RTO") || s.includes("RETURN TO ORIGIN") || s.includes("RETURNED TO")) {
    return "RTO";
  }
  // OFD before DELIVER — "Out for Delivery" contains "DELIVER"
  if (s.includes("OUT FOR") || s.includes("OFD") || (/\bOUT\b/.test(s) && s.includes("DELIVERY"))) {
    return "OUT_FOR_DELIVERY";
  }
  // "Undelivered" must not match DELIVER
  if (s.includes("DELIVER") && !s.includes("UNDELIVER")) return "DELIVERED";

  // Label / warehouse / awaiting pickup — still Created on our desk
  if (
    s.includes("MANIFEST") ||
    s.includes("SOFT DATA") ||
    s.includes("PENDING") ||
    s.includes("AWAITING") ||
    s.includes("SCHEDULED") ||
    s.includes("NOT PICKED") ||
    s.includes("PICKUP FAIL") ||
    s.includes("CANCELED") ||
    s.includes("CANCELLED") ||
    s === "OPEN" ||
    s.includes("UD:MANIFEST")
  ) {
    return "CREATED";
  }

  // Picked up by courier (not merely "Pickup Scheduled")
  if (s.includes("PICKED UP") || s === "PICKED" || (s.includes("PICKED") && !s.includes("PICKUP"))) {
    return "PICKED";
  }
  if (s.includes("PICKUP")) {
    // Pickup Scheduled / Awaited / Generated → still waiting at warehouse
    return "CREATED";
  }

  if (
    s.includes("TRANSIT") ||
    s.includes("SHIPPED") ||
    s.includes("DISPATCH") ||
    s.includes("CONNECTED") ||
    s.includes("LEFT") ||
    s.includes("ARRIVED")
  ) {
    return "INTRANSIT";
  }

  // Unknown carrier strings: do not invent In transit
  return "CREATED";
}

const ORDER_STATUS_BEFORE_TRANSIT: OrderStatus[] = ["PAID", "PROCESSING", "PACKED"];

/**
 * Apply mapped shipment status to DB (shipment row + order fulfillment / paid pipeline).
 * Used by Shiprocket webhook and by polling sync.
 */
export async function persistShipmentTrackingFromCarrier(
  shipment: Shipment & { order: Order },
  shipmentStatus: ShipmentStatus
): Promise<{
  orderStatus: OrderStatus;
  fulfillmentStatus: string;
}> {
  const alreadyDelivered =
    shipment.status === "DELIVERED" || shipment.deliveredAt != null || shipment.order.status === "DELIVERED";

  // Manual Mark Delivered (or a prior carrier DELIVERED) must not be regressed by a later
  // IN_TRANSIT / OFD poll or webhook.
  if (alreadyDelivered && shipmentStatus !== "DELIVERED" && shipmentStatus !== "RTO") {
    return {
      orderStatus: shipment.order.status === "DELIVERED" ? "DELIVERED" : shipment.order.status,
      fulfillmentStatus:
        shipment.order.status === "DELIVERED" ? "FULFILLED" : shipment.order.fulfillmentStatus
    };
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status: shipmentStatus,
      ...(shipmentStatus === "DELIVERED"
        ? { deliveredAt: shipment.deliveredAt ?? new Date() }
        : {}),
      ...(shipmentStatus === "RTO" ? { rtoAt: shipment.rtoAt ?? new Date() } : {})
    }
  });

  let orderStatus: OrderStatus = shipment.order.status;
  let fulfillmentStatus = shipment.order.fulfillmentStatus;

  if (shipmentStatus === "RTO") {
    await prisma.order.update({
      where: { id: shipment.orderId },
      data: { fulfillmentStatus: "RETURNED" }
    });
    fulfillmentStatus = "RETURNED";
  }

  const inTransitLike: ShipmentStatus[] = ["PICKED", "INTRANSIT", "OUT_FOR_DELIVERY"];
  if (inTransitLike.includes(shipmentStatus) && ORDER_STATUS_BEFORE_TRANSIT.includes(shipment.order.status)) {
    await prisma.order.update({
      where: { id: shipment.orderId },
      data: { status: "SHIPPED" }
    });
    orderStatus = "SHIPPED";
  }

  // Carrier still pre-pickup (e.g. Manifested) — undo premature SHIPPED from a bad sync map.
  if (
    shipmentStatus === "CREATED" &&
    shipment.order.status === "SHIPPED" &&
    shipment.order.fulfillmentStatus !== "FULFILLED" &&
    shipment.order.fulfillmentStatus !== "RETURNED"
  ) {
    await prisma.order.update({
      where: { id: shipment.orderId },
      data: { status: "PROCESSING" }
    });
    orderStatus = "PROCESSING";
  }

  if (shipmentStatus === "DELIVERED") {
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

  return { orderStatus, fulfillmentStatus };
}
