/** Phase 5B GST ledger / reconciliation constants. */

export const GST_OUTPUT_ACCOUNT_CODES = ["2100", "2101", "2102"] as const;
export const GST_INPUT_ACCOUNT_CODES = ["2200", "2201", "2202"] as const;

export const GST_ACCOUNT_LABELS: Record<string, string> = {
  "2100": "Output CGST",
  "2101": "Output SGST",
  "2102": "Output IGST",
  "2200": "Input CGST",
  "2201": "Input SGST",
  "2202": "Input IGST"
};

export type GstReconStatus =
  | "MATCHED"
  | "MISSING_JOURNAL"
  | "MISSING_TAX_DOCUMENT"
  | "GST_DATA_GAP"
  | "AMOUNT_MISMATCH"
  | "RATE_MISMATCH"
  | "PLACE_OF_SUPPLY_MISMATCH"
  | "ITC_UNVERIFIED"
  | "PDF_JOURNAL_TAX_DIVERGENCE"
  | "SHIPPING_GST_DATA_GAP"
  | "PARTIAL_REFUND_GST_DATA_GAP"
  | "RCM_DATA_GAP"
  | "BUYER_GSTIN_MISSING"
  | "GATEWAY_GST_PROVISIONAL"
  | "TAX_CLASS_DEFAULTED"
  | "HSN_DEFAULTED";

export type GstReconScope =
  | "SALES"
  | "FULL_REFUNDS"
  | "VENDOR_BILLS"
  | "EXPENSES"
  | "GATEWAY_FEES";

export const SHIPPING_GST_POLICY = "SHIPPING_GST_DATA_GAP" as const;
