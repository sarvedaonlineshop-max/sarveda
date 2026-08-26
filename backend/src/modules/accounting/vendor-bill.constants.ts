/** Phase 3B — VENDOR_BILL_POSTED_V1 constants. */

export const VENDOR_BILL_POSTED_CALC_VERSION = "VENDOR_BILL_POSTED_V1";

export const VENDOR_BILL_POSTED_EVENT_TYPE = "VENDOR_BILL_POSTED";

export const VENDOR_BILL_POSTED_SOURCE_TYPE = "VENDOR_BILL";

export const VENDOR_BILL_DOCUMENT_TYPE = "VENDOR_BILL";

export const PURCHASE_ORDER_DOCUMENT_TYPE = "PURCHASE_ORDER";

/** Max imbalance before fail-closed (paise). */
export const VENDOR_BILL_POSTED_MAX_IMBALANCE_PAISE = 2;

export const GST_ITC_STATUS_UNVERIFIED = "UNVERIFIED_PENDING_TAX_INVOICE";

export const PURCHASE_ACCOUNT_CODE = {
  INVENTORY_PURCHASES_CLEARING: "1210",
  ACCOUNTS_PAYABLE: "2000",
  INPUT_CGST: "2200",
  INPUT_SGST: "2201",
  INPUT_IGST: "2202",
  OPERATING_EXPENSE: "5300"
} as const;

export function vendorBillPostedUniqueKey(billId: string): string {
  return `vendor_bill:${billId}`;
}

export function normalizeSupplierReference(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const n = ref.trim().replace(/\s+/g, " ").toUpperCase();
  return n.length > 0 ? n : null;
}
