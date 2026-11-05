export const DELIVERY_STEPS = [
  "AWAITING_DISPATCH",
  "PACKING",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED"
] as const;

export type DeliveryStep = (typeof DELIVERY_STEPS)[number];

export const GOOGLE_REVIEW_URL = "https://maps.app.goo.gl/5bUnDzxDRBycUpGQA";

export type TrackingEvent = {
  id: string;
  label: string;
  at: string | null;
  detail: string | null;
  state: "done" | "current" | "upcoming";
};

const TRACKING_STEPS = [
  ["CONFIRMED", "Order confirmed"],
  ["PACKED", "Packed"],
  ["DISPATCHED", "Dispatched"],
  ["IN_TRANSIT", "In Transit"],
  ["OUT_FOR_DELIVERY", "Out for Delivery"],
  ["DELIVERED", "Delivered (POD)"]
] as const;

function historyAt(history: Array<{ toStatus: string; createdAt: Date }>, status: string): Date | null {
  const row = history.find((item) => item.toStatus === status);
  return row?.createdAt ?? null;
}

function trackingIndex(orderStatus: string, shipmentStatus: string | null): number {
  const ship = (shipmentStatus ?? "").toUpperCase();
  const status = orderStatus.toUpperCase();
  if (ship === "DELIVERED" || status === "DELIVERED") return 5;
  if (ship === "OUT_FOR_DELIVERY") return 4;
  if (ship === "INTRANSIT" || status === "SHIPPED") return 3;
  if (ship === "PICKED") return 2;
  if (status === "PACKED") return 1;
  return 0;
}

export function trackingTimeline(input: {
  orderStatus: string;
  placedAt: Date | null;
  history: Array<{ toStatus: string; createdAt: Date }>;
  shipment: {
    status: string;
    createdAt: Date;
    deliveredAt: Date | null;
    courier: string | null;
  } | null;
}): { currentLabel: string; events: TrackingEvent[] } {
  const shipStatus = input.shipment && input.shipment.status !== "RTO" ? input.shipment.status : null;
  const current = trackingIndex(input.orderStatus, shipStatus);
  const confirmed = historyAt(input.history, "PAID") ?? input.placedAt;
  const packed = historyAt(input.history, "PACKED");
  const dispatched = historyAt(input.history, "SHIPPED") ?? (current >= 2 ? input.shipment?.createdAt ?? null : null);
  const delivered = input.shipment?.deliveredAt ?? null;
  const times: Array<Date | null> = [confirmed, packed, dispatched, null, null, delivered];
  const details: Array<string | null> = [
    null,
    null,
    current >= 2 ? input.shipment?.courier ?? null : null,
    null,
    null,
    null
  ];
  const events = TRACKING_STEPS.map(([id, label], index) => ({
    id,
    label,
    at: times[index] ? times[index]!.toISOString() : null,
    detail: details[index],
    state: (index < current ? "done" : index === current ? "current" : "upcoming") as TrackingEvent["state"]
  }));
  if (current === 5) {
    events[5] = { ...events[5], state: "current" };
  }
  return { currentLabel: TRACKING_STEPS[current][1], events };
}

export function deliveryStep(orderStatus?: string | null, shipmentStatus?: string | null): DeliveryStep {
  const ship = (shipmentStatus ?? "").toUpperCase();
  const status = (orderStatus ?? "").toUpperCase();
  if (ship === "DELIVERED" || status === "DELIVERED") return "DELIVERED";
  if (ship === "INTRANSIT" || ship === "OUT_FOR_DELIVERY") return "IN_TRANSIT";
  if (ship === "PICKED" || status === "SHIPPED") return "DISPATCHED";
  if (status === "PACKED") return "PACKING";
  return "AWAITING_DISPATCH";
}

export function collectionNote(input: { cod: boolean; confirmed: boolean; currency: string; totalMinor: number }): {
  dispatchApproved: boolean;
  instructions: string;
} {
  const money = (input.totalMinor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = input.currency === "USD" ? `$${money}` : input.currency === "AED" ? `AED ${money}` : `₹${money}`;
  if (!input.confirmed) {
    return { dispatchApproved: false, instructions: "Payment is not confirmed. Hold dispatch." };
  }
  if (input.cod) {
    return {
      dispatchApproved: true,
      instructions: `Collect ${amount} on delivery. A delivery scan is not settlement.`
    };
  }
  return { dispatchApproved: true, instructions: "Prepaid. Cleared to dispatch." };
}

export function feedbackAfterResponse(rating: number): "RECEIVED" | "NEEDS_ATTENTION" {
  return rating <= 3 ? "NEEDS_ATTENTION" : "RECEIVED";
}

export function feedbackMessage(input: { name: string; orderNumber: string }): string {
  const who = input.name.trim() || "there";
  return [
    `Namaste ${who}, we hope order ${input.orderNumber} reached you well.`,
    "Reply with a rating from 1 to 5 and a short note about the product and the delivery.",
    `You can also leave a Google review here: ${GOOGLE_REVIEW_URL}`
  ].join("\n");
}
