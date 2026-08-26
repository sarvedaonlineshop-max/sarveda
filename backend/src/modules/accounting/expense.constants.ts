/** Phase 3C2 — EXPENSE_RECORDED_V1 constants. */

export const EXPENSE_RECORDED_CALC_VERSION = "EXPENSE_RECORDED_V1";
export const EXPENSE_RECORDED_EVENT_TYPE = "EXPENSE_RECORDED";
export const EXPENSE_RECORDED_SOURCE_TYPE = "EXPENSE";
export const EXPENSE_DOCUMENT_TYPE = "EXPENSE";

export const EXPENSE_RECORDED_MAX_IMBALANCE_PAISE = 0;

export const EXPENSE_PAYMENT_ACCOUNT = {
  CASH: "1000",
  BANK: "1010"
} as const;

export const EXPENSE_GST_ACCOUNT = {
  INPUT_CGST: "2200",
  INPUT_SGST: "2201",
  INPUT_IGST: "2202"
} as const;

export const GST_ITC_STATUS_UNVERIFIED = "UNVERIFIED_PENDING_TAX_INVOICE";

/** Allowed EXPENSE-type CoA codes for expense posting (V1). */
export const ALLOWED_EXPENSE_COA_CODES = new Set([
  "5300",
  "5310",
  "5320",
  "5330",
  "5340",
  "5350",
  "5360",
  "5370",
  "5380"
]);

export function expenseRecordedUniqueKey(expenseId: string): string {
  return `expense:${expenseId}`;
}

export function normalizeExpenseMappingKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.trim().replace(/\s+/g, " ").toUpperCase();
  return n.length > 0 ? n : null;
}

export function normalizeSupplierDocumentRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const n = ref.trim().replace(/\s+/g, " ").toUpperCase();
  return n.length > 0 ? n : null;
}
