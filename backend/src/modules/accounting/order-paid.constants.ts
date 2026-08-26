import type { PaymentProvider } from "@prisma/client";

/** Version tag stored in posting metadata for algorithm traceability. */
export const ORDER_PAID_CALC_VERSION = "ORDER_PAID_V1";

export const ORDER_PAID_EVENT_TYPE = "ORDER_PAID";

export const ORDER_PAID_SOURCE_TYPE = "ORDER";

export const ORDER_PAID_DOCUMENT_TYPE = "ORDER";

/** Maximum automatic journal imbalance before fail-closed (paise). */
export const ORDER_PAID_MAX_IMBALANCE_PAISE = 2;

export const ACCOUNT_CODE = {
  CASH: "1000",
  BANK: "1010",
  RAZORPAY_CLEARING: "1020",
  STRIPE_CLEARING: "1021",
  PAYPAL_CLEARING: "1022",
  ACCOUNTS_RECEIVABLE: "1100",
  OUTPUT_CGST: "2100",
  OUTPUT_SGST: "2101",
  OUTPUT_IGST: "2102",
  PRODUCT_SALES: "4000",
  SHIPPING_INCOME: "4100",
  DISCOUNTS_CONTRA: "4200",
  GATEWAY_CHARGES: "5100"
} as const;

export const CLEARING_ACCOUNT_BY_PROVIDER: Record<PaymentProvider, string> = {
  RAZORPAY: ACCOUNT_CODE.RAZORPAY_CLEARING,
  STRIPE: ACCOUNT_CODE.STRIPE_CLEARING,
  PAYPAL: ACCOUNT_CODE.PAYPAL_CLEARING,
  COD: ACCOUNT_CODE.ACCOUNTS_RECEIVABLE
};

export const PAID_PIPELINE_ORDER_STATUSES = [
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "REFUNDED"
] as const;

export function orderPaidUniqueKey(orderId: string): string {
  return `order:${orderId}:paid`;
}
