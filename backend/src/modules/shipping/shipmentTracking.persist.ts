import type {
  FulfillmentStatus,
  Order,
  OrderStatus,
  Shipment,
  ShipmentStatus
} from "@prisma/client";

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

const MOVING: ShipmentStatus[] = ["PICKED", "INTRANSIT", "OUT_FOR_DELIVERY"];

/** Statuses a carrier event may move. Cancelled / refunded / unpaid orders are never touched. */
const CARRIER_DRIVEN_ORDER_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "PACKED", "SHIPPED"];

type ShipmentLegMeta = { direction?: string; kind?: string };

/**
 * Forward legs are the parcels still owed to the customer. Reverse pickups and
 * replacement dispatches ride on the same order and must not speak for its fulfilment.
 */
function isForwardLeg(s: { courier: string; carrierMeta: unknown }): boolean {
  const meta =
    s.carrierMeta && typeof s.carrierMeta === "object" && !Array.isArray(s.carrierMeta)
      ? (s.carrierMeta as ShipmentLegMeta)
      : null;
  if (meta?.direction === "REVERSE" || meta?.kind === "REPLACEMENT") return false;
  return !s.courier.toLowerCase().includes("return");
}

/**
 * Recompute order state from every forward parcel.
 *
 * A carrier event describes one box. Writing it straight onto the order let the first
 * delivered parcel mark a whole multi-parcel order DELIVERED and FULFILLED while the
 * rest were still in transit — which also opened the return window early and stopped
 * the remaining parcels from being tracked. An order is only as far along as its
 * slowest parcel.
 */
export async function rollUpOrderFromShipments(orderId: string): Promise<{
  orderStatus: OrderStatus;
  fulfillmentStatus: string;
}> {
  const [order, shipments] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, fulfillmentStatus: true }
    }),
    prisma.shipment.findMany({
      where: { orderId },
      select: { status: true, courier: true, carrierMeta: true }
    })
  ]);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const forward = shipments.filter(isForwardLeg);
  if (forward.length === 0) {
    return { orderStatus: order.status, fulfillmentStatus: order.fulfillmentStatus };
  }

  const owed = forward.filter((s) => s.status !== "RTO");
  const anyReturned = owed.length !== forward.length;
  const fulfillmentStatus: FulfillmentStatus =
    owed.length === 0
      ? "RETURNED"
      : owed.every((s) => s.status === "DELIVERED") && !anyReturned
        ? "FULFILLED"
        : "PARTIAL";

  // Every parcel came back — the RTO workflow owns cancel/refund, tracking must not guess.
  let status = order.status;
  if (owed.length > 0 && CARRIER_DRIVEN_ORDER_STATUSES.includes(order.status)) {
    if (owed.every((s) => s.status === "DELIVERED")) {
      status = "DELIVERED";
    } else if (owed.some((s) => s.status === "DELIVERED" || MOVING.includes(s.status))) {
      status = "SHIPPED";
    } else if (order.status === "SHIPPED") {
      // Carrier fell back to pre-pickup (e.g. Manifested) — undo a premature SHIPPED.
      status = "PROCESSING";
    }
  }

  if (status !== order.status || fulfillmentStatus !== order.fulfillmentStatus) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(status !== order.status ? { status } : {}),
        ...(fulfillmentStatus !== order.fulfillmentStatus ? { fulfillmentStatus } : {})
      }
    });
  }

  return { orderStatus: status, fulfillmentStatus };
}

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
  // Manual Mark Delivered (or a prior carrier DELIVERED) on THIS parcel must not be regressed
  // by a later IN_TRANSIT / OFD poll or webhook. Scoped to the parcel, not the order: a sibling
  // box that is still moving has to keep receiving its own tracking updates.
  const parcelAlreadyDelivered = shipment.status === "DELIVERED" || shipment.deliveredAt != null;
  if (parcelAlreadyDelivered && shipmentStatus !== "DELIVERED" && shipmentStatus !== "RTO") {
    return {
      orderStatus: shipment.order.status,
      fulfillmentStatus: shipment.order.fulfillmentStatus
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

  return rollUpOrderFromShipments(shipment.orderId);
}
