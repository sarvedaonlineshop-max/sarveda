import type { OrderStatus, PaymentStatus } from "@prisma/client";

/** Creating a new carrier label (Shiprocket / Delhivery) — not once already shipped/delivered. */
export const CREATE_SHIPMENT_ORDER_STATUSES = new Set<OrderStatus>(["PAID", "PROCESSING", "PACKED"]);

/** Pulling tracking updates from carrier APIs (includes shipped/delivered while still reconcilable). */
export const TRACK_SYNC_ORDER_STATUSES = new Set<OrderStatus>([
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED"
]);

/**
 * Recording an AWB that was booked outside Sarveda. Includes SHIPPED, because an order split
 * across parcels keeps gaining labels after the first one has already moved the order on.
 */
export const RECORD_LABEL_ORDER_STATUSES = new Set<OrderStatus>([
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED"
]);

export type OrderPaymentCheck = {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  payments?: Array<{ provider: string }>;
};

/**
 * India COD: order is confirmed (PAID+) but payment row stays PENDING until cash is collected
 * on delivery. Allow label create + tracking across the full fulfilment pipeline — not only
 * while status is still exactly PAID (ops usually Mark Processing before creating a label).
 */
export function isCodOrderReadyToShip(order: OrderPaymentCheck): boolean {
  const hasCodPayment = (order.payments ?? []).some((p) => p.provider === "COD");
  return (
    hasCodPayment &&
    order.paymentStatus === "PENDING" &&
    TRACK_SYNC_ORDER_STATUSES.has(order.status)
  );
}

export function assertPaymentEligibleForShipping(
  order: OrderPaymentCheck
): { ok: true } | { ok: false; error: string; code: string } {
  // CAPTURED = full pay held; PARTIALLY_REFUNDED = remaining goods may still ship.
  if (order.paymentStatus === "CAPTURED" || order.paymentStatus === "PARTIALLY_REFUNDED") {
    return { ok: true };
  }
  if (isCodOrderReadyToShip(order)) {
    return { ok: true };
  }
  if (order.paymentStatus === "PENDING") {
    const hasCodPayment = (order.payments ?? []).some((p) => p.provider === "COD");
    if (hasCodPayment) {
      return {
        ok: false,
        error: `COD order is not in a shippable status (current: ${order.status}). Move it to Paid, Processing, or Packed first.`,
        code: "PAYMENT_NOT_CAPTURED"
      };
    }
    return {
      ok: false,
      error: `Payment must be captured before shipping (current: ${order.paymentStatus}). Use admin Sync payment (Razorpay) if the gateway shows paid.`,
      code: "PAYMENT_NOT_CAPTURED"
    };
  }
  return {
    ok: false,
    error: `Payment must be captured before shipping (current: ${order.paymentStatus}). Use admin Sync payment (Razorpay) if the gateway shows paid.`,
    code: "PAYMENT_NOT_CAPTURED"
  };
}

/** New AWB / pickup booking — paid pipeline only, before ship-complete states. */
export function assertOrderEligibleForCreatingShipment(order: OrderPaymentCheck): {
  ok: true;
} | { ok: false; error: string; code: string } {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return {
      ok: false,
      error: "Cancelled or refunded orders cannot create carrier labels.",
      code: "ORDER_STATE"
    };
  }
  if (order.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      error: "Unpaid orders cannot be shipped. Reconcile Razorpay payment or wait for capture.",
      code: "ORDER_UNPAID"
    };
  }
  if (!CREATE_SHIPMENT_ORDER_STATUSES.has(order.status)) {
    return {
      ok: false,
      error: `New labels can only be created for Paid, Processing, or Packed orders (current: ${order.status}). For shipped or delivered orders, use tracking sync only.`,
      code: "ORDER_STATE"
    };
  }
  return assertPaymentEligibleForShipping(order);
}

/** Recording an externally booked AWB — same money rules, but allowed once already shipped. */
export function assertOrderEligibleForRecordingLabel(order: OrderPaymentCheck): {
  ok: true;
} | { ok: false; error: string; code: string } {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return {
      ok: false,
      error: "Cancelled or refunded orders cannot take new labels.",
      code: "ORDER_STATE"
    };
  }
  if (order.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      error: "Unpaid orders cannot be shipped. Reconcile Razorpay payment or wait for capture.",
      code: "ORDER_UNPAID"
    };
  }
  if (!RECORD_LABEL_ORDER_STATUSES.has(order.status)) {
    return {
      ok: false,
      error: `Labels can only be added to Paid, Processing, Packed, or Shipped orders (current: ${order.status}).`,
      code: "ORDER_STATE"
    };
  }
  return assertPaymentEligibleForShipping(order);
}

/** Tracking sync from carrier (Shiprocket / Delhivery) — broader than label creation. */
export function assertOrderEligibleForTrackingSync(order: OrderPaymentCheck): {
  ok: true;
} | { ok: false; error: string; code: string } {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return {
      ok: false,
      error: "Cancelled or refunded orders cannot sync carrier tracking.",
      code: "ORDER_STATE"
    };
  }
  if (order.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      error: "Unpaid orders cannot sync carrier tracking.",
      code: "ORDER_UNPAID"
    };
  }
  if (!TRACK_SYNC_ORDER_STATUSES.has(order.status)) {
    return {
      ok: false,
      error: `Order status ${order.status} does not allow carrier tracking sync.`,
      code: "ORDER_STATE"
    };
  }
  return assertPaymentEligibleForShipping(order);
}
