import type { AccountingVendorPaymentMethod } from "@prisma/client";

export const VENDOR_PAYMENT_MADE_CALC_VERSION = "VENDOR_PAYMENT_MADE_V1";
export const VENDOR_PAYMENT_MADE_EVENT_TYPE = "VENDOR_PAYMENT_MADE";
export const VENDOR_PAYMENT_MADE_SOURCE_TYPE = "VENDOR_PAYMENT";
export const VENDOR_PAYMENT_DOCUMENT_TYPE = "VENDOR_PAYMENT";
/** Reuse bill document type from Phase 3B for links. */
export const VENDOR_BILL_DOCUMENT_TYPE = "VENDOR_BILL";

export const VENDOR_PAYMENT_MAX_IMBALANCE_PAISE = 0;

export const VENDOR_PAYMENT_ACCOUNT = {
  AP: "2000",
  BANK: "1010",
  CASH: "1000"
} as const;

export const PAYMENT_METHOD_TO_ACCOUNT: Record<AccountingVendorPaymentMethod, string> = {
  BANK_TRANSFER: VENDOR_PAYMENT_ACCOUNT.BANK,
  UPI: VENDOR_PAYMENT_ACCOUNT.BANK,
  CHEQUE: VENDOR_PAYMENT_ACCOUNT.BANK,
  CASH: VENDOR_PAYMENT_ACCOUNT.CASH
};

export function vendorPaymentMadeUniqueKey(paymentId: string): string {
  return `vendor_payment:${paymentId}`;
}

/** Non-cash methods require a UTR/reference of at least 3 characters. */
export function utrRequiredForMethod(method: AccountingVendorPaymentMethod): boolean {
  return method !== "CASH";
}
