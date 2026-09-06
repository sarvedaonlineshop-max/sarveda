import type { OrderStatus, PaymentProvider, ShipmentStatus } from "@prisma/client";

/** Shipment statuses that mean goods have left or are in carrier custody. */
export const POST_DISPATCH_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "PICKED",
  "INTRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RTO"
];

/**
 * Order.status alone is not proof of carrier custody. Admin can mark an order
 * SHIPPED while the carrier shipment row is still CREATED, so RTO/refund logic
 * must use shipment movement as the dispatch authority. DELIVERED remains
 * terminal even if tracking data is missing.
 */
export const POST_DISPATCH_ORDER_STATUSES: OrderStatus[] = ["DELIVERED"];

export type CancellationEligibilityInput = {
  status: OrderStatus;
  paymentStatus: string;
  payments?: Array<{ provider: PaymentProvider | string }>;
  shipments?: Array<{ status: ShipmentStatus | string }>;
};

export type CancellationEligibility = {
  /** Customer may submit a new cancellation request. */
  customerCanRequest: boolean;
  /** Admin may approve an immediate cancellation request (pre-dispatch only). */
  adminCanApproveCancel: boolean;
  /** Authoritative dispatch / in-transit flag. */
  dispatched: boolean;
  /** Machine-readable block reason when customer cannot request. */
  blockCode?:
    | "ORDER_TERMINAL"
    | "NOT_PAID"
    | "CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH"
    | "RTO_IN_PROGRESS";
  /** Human-readable message for customer UI. */
  customerMessage?: string;
};

export function orderIsPaidForCancellation(order: CancellationEligibilityInput): boolean {
  const provider = order.payments?.[0]?.provider;
  const isCod = provider === "COD";
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") return true;
  if (isCod) {
    return !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status);
  }
  return false;
}

export function orderIsDispatched(order: {
  status: OrderStatus;
  shipments?: Array<{ status: ShipmentStatus | string }>;
}): boolean {
  if (POST_DISPATCH_ORDER_STATUSES.includes(order.status)) return true;
  const shipments = order.shipments ?? [];
  if (
    shipments.some((s) =>
      POST_DISPATCH_SHIPMENT_STATUSES.includes(s.status as ShipmentStatus)
    )
  ) {
    return true;
  }
  return false;
}

export function orderHasRtoShipment(order: CancellationEligibilityInput): boolean {
  return (order.shipments ?? []).some((s) => s.status === "RTO");
}

/**
 * Authoritative server-side cancellation eligibility.
 * Uses carrier/shipment movement — not an admin-only SHIPPED label — to decide
 * whether cancellation is immediate or must go through RTO.
 */
export function getCancellationEligibility(
  order: CancellationEligibilityInput
): CancellationEligibility {
  const dispatched = orderIsDispatched(order);
  const rto = orderHasRtoShipment(order);
  const paid = orderIsPaidForCancellation(order);

  if (["CANCELLED", "REFUNDED"].includes(order.status)) {
    return {
      customerCanRequest: false,
      adminCanApproveCancel: false,
      dispatched,
      blockCode: "ORDER_TERMINAL",
      customerMessage: "This order is already closed."
    };
  }

  if (order.status === "DELIVERED") {
    return {
      customerCanRequest: false,
      adminCanApproveCancel: false,
      dispatched: true,
      blockCode: "ORDER_TERMINAL",
      customerMessage:
        "This order has been delivered. Returns and replacements are handled separately."
    };
  }

  if (rto) {
    return {
      customerCanRequest: false,
      adminCanApproveCancel: false,
      dispatched: true,
      blockCode: "RTO_IN_PROGRESS",
      customerMessage:
        "This shipment is already returning to Sarveda. Please contact support for help."
    };
  }

  if (!paid) {
    return {
      customerCanRequest: false,
      adminCanApproveCancel: false,
      dispatched,
      blockCode: "NOT_PAID",
      customerMessage: "Only paid orders can be cancelled online."
    };
  }

  if (dispatched) {
    return {
      // Let customer submit the request, but admin approval must start the RTO flow,
      // not immediate cancel/refund/restock. The admin RTO route intercepts this.
      customerCanRequest: true,
      adminCanApproveCancel: false,
      dispatched: true,
      blockCode: "CANCELLATION_NOT_ALLOWED_AFTER_DISPATCH",
      customerMessage:
        "This order has already been dispatched. Your request will be reviewed for return-to-origin; refund is processed after Sarveda receives the parcel back."
    };
  }

  return {
    customerCanRequest: true,
    adminCanApproveCancel: true,
    dispatched: false
  };
}

/** Adjustment-oriented cancel reasons — admin review only in Phase 1A (no auto mutation). */
export const ADJUSTMENT_CANDIDATE_REASON_CODES = new Set([
  "change_address",
  "wrong_item",
  "change_quantity"
]);

export function isAdjustmentCandidateReason(reasonCode: string | null | undefined): boolean {
  return !!reasonCode && ADJUSTMENT_CANDIDATE_REASON_CODES.has(reasonCode);
}
