export const ORDER_REFUNDED_PARTIAL_CALC_VERSION = "ORDER_REFUNDED_PARTIAL_V1";

export const ORDER_REFUNDED_PARTIAL_EVENT_TYPE = "ORDER_REFUNDED_PARTIAL";

export const ORDER_REFUNDED_PARTIAL_SOURCE_TYPE = "REFUND";

export const ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_ORDER = "ORDER";

export const ORDER_REFUNDED_PARTIAL_DOCUMENT_TYPE_REFUND = "REFUND";

export const ORDER_REFUNDED_PARTIAL_MAX_IMBALANCE_PAISE = 2;

export function orderRefundedPartialUniqueKey(orderId: string, refundId: string): string {
  return `order:${orderId}:refund:${refundId}`;
}
