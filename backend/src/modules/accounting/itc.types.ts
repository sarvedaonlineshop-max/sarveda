import type { ItcAssessmentCode, ItcSourceType, ItcStatus } from "./itc.constants";

export type ItcAssessmentResult = {
  assessmentCode: ItcAssessmentCode;
  warnings: string[];
  /** Suggested initial / discover status — never auto-ELIGIBLE. */
  suggestedStatus: Extract<
    ItcStatus,
    "UNVERIFIED_PENDING_TAX_INVOICE" | "DATA_GAP" | "BLOCKED"
  >;
  eligibleForAdminVerify: boolean;
  details: Record<string, unknown>;
};

export type ItcEvidenceDraft = {
  sourceType: ItcSourceType;
  sourceId: string;
  uniqueKey: string;
  documentReference: string | null;
  supplierGstin: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  taxableValueInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalGstInPaise: number;
  recognizedInInputGl: boolean;
  postingEventId: string | null;
  journalEntryId: string | null;
  assessment: ItcAssessmentResult;
};

export type ItcSummaryBucket = {
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalGstInPaise: number;
  count: number;
};

export type ItcSummary = {
  recognizedInputGst: ItcSummaryBucket;
  eligibleInputGst: ItcSummaryBucket;
  blockedInputGst: ItcSummaryBucket;
  unverifiedInputGst: ItcSummaryBucket;
  dataGapInputGst: ItcSummaryBucket;
  reversedInputGst: ItcSummaryBucket;
  claimedInputGst: ItcSummaryBucket;
  gatewayProvisionalGst: ItcSummaryBucket;
  note: string;
};
