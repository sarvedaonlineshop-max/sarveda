import { monetaryRefunds } from "./order-refunded-full-eligibility";
import type { OrderRefundContext } from "./order-refunded-full.types";
import type {
  CodOrderCancelledEligibilityResult
} from "./order-cancelled.types";

/**
 * COD sale reversal on operational cancel — only when a posted ORDER_PAID
 * journal exists and cash was never collected (payment still PENDING).
 *
 * Does not overlap ORDER_REFUNDED_FULL (online processed refunds).
 */
export function evaluateCodOrderCancelledEligibility(
  ctx: Pick<
    OrderRefundContext,
    | "provider"
    | "orderStatus"
    | "paymentStatusDetail"
    | "refunds"
    | "originalSale"
  >
): CodOrderCancelledEligibilityResult {
  if (ctx.provider !== "COD") {
    return {
      eligible: false,
      autoPostable: false,
      code: "NOT_COD",
      reason: "ORDER_CANCELLED sale reversal is only for COD orders"
    };
  }

  if (ctx.orderStatus !== "CANCELLED") {
    return {
      eligible: false,
      autoPostable: false,
      code: "ORDER_NOT_CANCELLED",
      reason: `Order status ${ctx.orderStatus} is not CANCELLED`
    };
  }

  if (ctx.paymentStatusDetail !== "PENDING") {
    return {
      eligible: false,
      autoPostable: false,
      code: "PAYMENT_NOT_UNCOLLECTED",
      reason: `COD payment status ${ctx.paymentStatusDetail} is not PENDING — do not reverse uncollected AR`
    };
  }

  if (monetaryRefunds(ctx.refunds).length > 0) {
    return {
      eligible: false,
      autoPostable: false,
      code: "MONETARY_REFUND_EXISTS",
      reason: "Monetary Refund rows exist — COD cancel reversal must not overlap refund accounting"
    };
  }

  if (!ctx.originalSale) {
    return {
      eligible: false,
      autoPostable: false,
      code: "NO_SALE_JOURNAL",
      reason: "No posted ORDER_PAID journal — nothing to reverse"
    };
  }

  if (ctx.originalSale.calcVersion !== "ORDER_PAID_V1") {
    return {
      eligible: false,
      autoPostable: false,
      code: "SALE_CALC_VERSION_UNSUPPORTED",
      reason: `Original sale calc version ${ctx.originalSale.calcVersion} is not ORDER_PAID_V1`
    };
  }

  return {
    eligible: true,
    autoPostable: true,
    code: "AUTO_POSTABLE_COD_CANCEL",
    reason: "Cancelled uncollected COD with posted ORDER_PAID journal"
  };
}
