/** Phase 2D Razorpay settlement shadow posting. */

export const PAYMENT_GATEWAY_SETTLED_CALC_VERSION = "PAYMENT_GATEWAY_SETTLED_V1";

export const PAYMENT_GATEWAY_SETTLED_EVENT_TYPE = "PAYMENT_GATEWAY_SETTLED";

export const PAYMENT_GATEWAY_SETTLED_SOURCE_TYPE = "GATEWAY_SETTLEMENT";

export const PAYMENT_GATEWAY_SETTLED_DOCUMENT_TYPE = "GATEWAY_SETTLEMENT";

export const PAYMENT_GATEWAY_SETTLED_MAX_IMBALANCE_PAISE = 2;

export const GST_ITC_STATUS_UNVERIFIED = "UNVERIFIED_PENDING_TAX_INVOICE";

export function razorpaySettlementUniqueKey(settlementId: string): string {
  return `provider:razorpay:settlement:${settlementId}`;
}
