/** Version tag for COD sale-cancellation reversal (inverts ORDER_PAID_V1). */
export const ORDER_CANCELLED_CALC_VERSION = "ORDER_CANCELLED_V1";

export const ORDER_CANCELLED_EVENT_TYPE = "ORDER_CANCELLED";

export const ORDER_CANCELLED_SOURCE_TYPE = "ORDER";

export const ORDER_CANCELLED_DOCUMENT_TYPE = "ORDER";

/** Maximum automatic journal imbalance before fail-closed (paise). */
export const ORDER_CANCELLED_MAX_IMBALANCE_PAISE = 2;

export function orderCancelledUniqueKey(orderId: string): string {
  return `order:${orderId}:cancelled`;
}
