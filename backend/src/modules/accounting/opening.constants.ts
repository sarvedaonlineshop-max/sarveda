/** Phase 7B production opening balance constants. */
export const PRODUCTION_OPENING_EVENT_TYPE = "PRODUCTION_OPENING_BALANCE";
export const PRODUCTION_OPENING_SOURCE_TYPE = "ACCOUNTING_OPENING_BATCH";
export const PRODUCTION_OPENING_DOCUMENT_TYPE = "PRODUCTION_OPENING_BATCH";

export function productionOpeningUniqueKey(batchId: string): string {
  return `production_opening:${batchId}`;
}

export const OPENING_GST_CODES = ["2100", "2101", "2102", "2200", "2201", "2202"] as const;
export const OPENING_EQUITY_CODES = ["3000", "3100", "3900"] as const;
export const OPENING_GATEWAY_CODES: Record<string, string> = {
  RAZORPAY: "1020",
  STRIPE: "1021",
  PAYPAL: "1022",
  COD: "1100"
};

export const TEST_IDENTIFIER_RE =
  /TEST-UAT-ACC|TEST-ACC|SRV-TEST-ACC|TEST-ACC-CUTOVER|TEST-ACC-FIFO|TEST-ACC-BANK|TEST-ACC-GST/i;

export const RESERVED_CLEARING_CODES = new Set(["1020", "1021", "1022", "1210"]);
