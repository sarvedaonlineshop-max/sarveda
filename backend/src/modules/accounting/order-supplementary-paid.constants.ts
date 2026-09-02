export const ORDER_SUPPLEMENTARY_PAID_CALC_VERSION = "ORDER_SUPPLEMENTARY_PAID_V1";

export const ORDER_SUPPLEMENTARY_PAID_EVENT_TYPE = "ORDER_SUPPLEMENTARY_PAID";

export const ORDER_SUPPLEMENTARY_PAID_SOURCE_TYPE = "SUPPLEMENTARY_PAYMENT";

export const ORDER_SUPPLEMENTARY_PAID_DOCUMENT_TYPE = "SUPPLEMENTARY_PAYMENT";

export const ORDER_SUPPLEMENTARY_PAID_MAX_IMBALANCE_PAISE = 2;

export function orderSupplementaryPaidUniqueKey(orderId: string, supplementaryPaymentId: string): string {
  return `order:${orderId}:supplementary:${supplementaryPaymentId}`;
}
