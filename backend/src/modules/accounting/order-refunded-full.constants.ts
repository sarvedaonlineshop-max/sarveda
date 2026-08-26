/** Version tag for full-refund reversal algorithm (inverts ORDER_PAID_V1). */
export const ORDER_REFUNDED_FULL_CALC_VERSION = "ORDER_REFUNDED_FULL_V1";

export const ORDER_REFUNDED_FULL_EVENT_TYPE = "ORDER_REFUNDED_FULL";

export const ORDER_REFUNDED_FULL_SOURCE_TYPE = "ORDER";

export const ORDER_REFUNDED_FULL_DOCUMENT_TYPE_ORDER = "ORDER";

export const ORDER_REFUNDED_FULL_DOCUMENT_TYPE_REFUND = "REFUND";

/** Refund.statuses treated as money-authoritative for shadow posting. */
export const AUTHORITATIVE_REFUND_STATUSES = ["processed"] as const;

/** Maximum automatic journal imbalance before fail-closed (paise). */
export const ORDER_REFUNDED_FULL_MAX_IMBALANCE_PAISE = 2;

export function orderRefundedFullUniqueKey(orderId: string): string {
  return `order:${orderId}:refunded_full`;
}
