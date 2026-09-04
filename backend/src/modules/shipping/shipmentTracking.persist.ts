import type { Order, OrderStatus, Shipment, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";

/** Normalize courier-facing strings → DB shipment enum. */
export function mapCourierStatusToShipment(rawStatus: string): ShipmentStatus {
  const s = rawStatus.toUpperCase();
  if (s.includes("DELIVER")) return "DELIVERED";
  if (s.includes("RTO") || s.includes("RETURN TO ORIGIN") || s.includes("RETURNED TO")) return "RTO";
  if (s.includes("OUT") || s.includes("OFD")) return "OUT_FOR_DELIVERY";
  if (
    s.includes("TRANSIT") ||
    s.includes("SHIPPED") ||
    s.includes("MANIFEST") ||
    s.includes("PICKUP") ||
    s.includes("DISPATCH")
  ) {
    return "INTRANSIT";
  }
  if (s.includes("PICK")) return "PICKED";
  return "INTRANSIT";
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
