import type { OrderStatus } from "@prisma/client";

import { PAID_PIPELINE_ORDER_STATUSES } from "./order-paid.constants";
import type { OrderPaidSnapshot } from "./order-paid-journal.types";

export type OrderEligibilityResult = {
  eligible: boolean;
  reason?: string;
  code?: string;
};

export function isOrderEligibleForOrderPaidPosting(
  snapshot: Pick<
    OrderPaidSnapshot,
    "status" | "placedAt" | "lines" | "shippingCountry" | "shippingState" | "payment" | "grandTotalInPaise"
  >
): OrderEligibilityResult {
  if (!snapshot.placedAt) {
    return { eligible: false, reason: "Order.placedAt is required", code: "MISSING_PLACED_AT" };
  }

  if (!PAID_PIPELINE_ORDER_STATUSES.includes(snapshot.status as (typeof PAID_PIPELINE_ORDER_STATUSES)[number])) {
    return {
      eligible: false,
      reason: `Order status ${snapshot.status} is not in paid pipeline`,
      code: "INVALID_ORDER_STATUS"
    };
  }

  if (!snapshot.payment) {
    return { eligible: false, reason: "Payment record missing", code: "MISSING_PAYMENT" };
  }

  if (snapshot.lines.length === 0) {
    return { eligible: false, reason: "Order has no line items", code: "MISSING_LINES" };
  }

  if (!snapshot.shippingCountry?.trim()) {
    return { eligible: false, reason: "Shipping address country required", code: "MISSING_ADDRESS" };
  }

  if (snapshot.grandTotalInPaise < 1) {
    return { eligible: false, reason: "Invalid grand total", code: "INVALID_TOTAL" };
  }

  if (snapshot.payment.provider === "COD") {
    return { eligible: true };
  }

  // CAPTURED = live paid order. REFUNDED / PARTIALLY_REFUNDED still allow ORDER_PAID
  // shadow posting so after-the-fact refund discovery can post the required sale first.
  const onlinePaidStatuses = ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
  if (
    !onlinePaidStatuses.includes(
      snapshot.payment.status as (typeof onlinePaidStatuses)[number]
    )
  ) {
    return {
      eligible: false,
      reason: `Online payment must be CAPTURED/REFUNDED/PARTIALLY_REFUNDED (got ${snapshot.payment.status})`,
      code: "PAYMENT_NOT_CAPTURED"
    };
  }

  return { eligible: true };
}

export function isCancelledUnpaidStatus(status: OrderStatus): boolean {
  return status === "PENDING_PAYMENT" || status === "CANCELLED";
}
