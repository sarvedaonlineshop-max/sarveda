/** Phase 5C — ITC verification constants (claimability ≠ GL recognition). */

export const ITC_STATUSES = [
  "UNVERIFIED_PENDING_TAX_INVOICE",
  "ELIGIBLE",
  "BLOCKED",
  "REVERSED",
  "CLAIMED",
  "DATA_GAP"
] as const;

export type ItcStatus = (typeof ITC_STATUSES)[number];

export const ITC_SOURCE_TYPES = ["VENDOR_BILL", "EXPENSE", "GATEWAY_SETTLEMENT"] as const;
export type ItcSourceType = (typeof ITC_SOURCE_TYPES)[number];

/** Deterministic assessment codes (not statutory GSTR-2B verification). */
export const ITC_ASSESSMENT_CODES = [
  "ELIGIBLE_FOR_REVIEW",
  "MISSING_TAX_INVOICE",
  "INVALID_GSTIN",
  "MISSING_SUPPLIER_REFERENCE",
  "GST_AMOUNT_MISMATCH",
  "PLACE_OF_SUPPLY_MISMATCH",
  "RCM_DATA_GAP",
  "MISSING_POSTED_INPUT_GST",
  "GATEWAY_TAX_INVOICE_REQUIRED",
  "GATEWAY_NOT_IN_INPUT_GL",
  "DATA_GAP",
  "ZERO_TAX"
] as const;

export type ItcAssessmentCode = (typeof ITC_ASSESSMENT_CODES)[number];

export function itcEvidenceUniqueKey(sourceType: ItcSourceType, sourceId: string): string {
  return `itc:${sourceType}:${sourceId}`;
}

/** CLAIMED requires filing/period lock — unavailable until Phase 5D+. */
export const ITC_CLAIMED_UNAVAILABLE_CODE = "FILING_WORKFLOW_UNAVAILABLE";

/**
 * Gateway fee-tax stays in 5100. Future ELIGIBLE (tax invoice held) does NOT
 * auto-reclassify into 2200–2202 — that would need an explicit adjustment event
 * (not implemented in Phase 5C).
 */
export const GATEWAY_ITC_RECLASSIFICATION_BOUNDARY =
  "GATEWAY_TAX_REMAINS_IN_5100_UNTIL_EXPLICIT_RECLASSIFICATION_EVENT";
