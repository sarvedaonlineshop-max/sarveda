import { isPlausibleGstin } from "./vendor-bill-journal.builder";
import type { ItcAssessmentCode } from "./itc.constants";
import type { ItcAssessmentResult } from "./itc.types";

/**
 * Deterministic ITC eligibility assessment — NOT GSTR-2B matching.
 * Never returns auto-ELIGIBLE status; at best ELIGIBLE_FOR_REVIEW for admin verify.
 */
export function assessVendorBillItc(input: {
  reverseCharge: boolean;
  taxInPaise: number;
  referenceNumber: string | null | undefined;
  vendorGstin: string | null | undefined;
  vendorBillingState: string | null | undefined;
  gstRecognizedInJournal: boolean;
  journalCgst: number;
  journalSgst: number;
  journalIgst: number;
  snapshotCgst: number;
  snapshotSgst: number;
  snapshotIgst: number;
  jurisdiction: string | null | undefined;
  postingDataGapCodes: string[];
}): ItcAssessmentResult {
  const warnings: string[] = [...input.postingDataGapCodes];
  const details: Record<string, unknown> = {
    reverseCharge: input.reverseCharge,
    jurisdiction: input.jurisdiction
  };

  if (input.reverseCharge) {
    return {
      assessmentCode: "RCM_DATA_GAP",
      warnings: [...new Set([...warnings, "RCM_DATA_GAP"])],
      suggestedStatus: "BLOCKED",
      eligibleForAdminVerify: false,
      details
    };
  }

  if (input.taxInPaise <= 0) {
    return {
      assessmentCode: "ZERO_TAX",
      warnings,
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details
    };
  }

  if (!input.gstRecognizedInJournal) {
    return {
      assessmentCode: "MISSING_POSTED_INPUT_GST",
      warnings: [...new Set([...warnings, "MISSING_POSTED_INPUT_GST"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details
    };
  }

  if (!input.referenceNumber?.trim()) {
    return {
      assessmentCode: "MISSING_SUPPLIER_REFERENCE",
      warnings: [...new Set([...warnings, "MISSING_SUPPLIER_REFERENCE", "MISSING_TAX_INVOICE"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details
    };
  }

  if (!isPlausibleGstin(input.vendorGstin)) {
    return {
      assessmentCode: "INVALID_GSTIN",
      warnings: [...new Set([...warnings, "INVALID_GSTIN", "MISSING_OR_INVALID_GSTIN"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details
    };
  }

  if (
    input.postingDataGapCodes.includes("PLACE_OF_SUPPLY_MISMATCH") ||
    input.jurisdiction === "UNKNOWN"
  ) {
    return {
      assessmentCode: "PLACE_OF_SUPPLY_MISMATCH",
      warnings: [...new Set([...warnings, "PLACE_OF_SUPPLY_MISMATCH"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details
    };
  }

  const tol = 2;
  if (
    Math.abs(input.journalCgst - input.snapshotCgst) > tol ||
    Math.abs(input.journalSgst - input.snapshotSgst) > tol ||
    Math.abs(input.journalIgst - input.snapshotIgst) > tol
  ) {
    return {
      assessmentCode: "GST_AMOUNT_MISMATCH",
      warnings: [...new Set([...warnings, "GST_AMOUNT_MISMATCH"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {
        ...details,
        journal: { cgst: input.journalCgst, sgst: input.journalSgst, igst: input.journalIgst },
        snapshot: { cgst: input.snapshotCgst, sgst: input.snapshotSgst, igst: input.snapshotIgst }
      }
    };
  }

  return {
    assessmentCode: "ELIGIBLE_FOR_REVIEW",
    warnings,
    suggestedStatus: "UNVERIFIED_PENDING_TAX_INVOICE",
    eligibleForAdminVerify: true,
    details
  };
}

export function assessExpenseItc(input: {
  reverseCharge: boolean;
  taxInPaise: number;
  invoiceOrReference: string | null | undefined;
  vendorId: string | null | undefined;
  vendorGstin: string | null | undefined;
  gstRecognizedInJournal: boolean;
  journalCgst: number;
  journalSgst: number;
  journalIgst: number;
  snapshotCgst: number;
  snapshotSgst: number;
  snapshotIgst: number;
  postingDataGapCodes: string[];
  hsnSac: string | null | undefined;
}): ItcAssessmentResult {
  const warnings: string[] = [...input.postingDataGapCodes];
  if (!input.hsnSac?.trim()) warnings.push("HSN_SAC_MISSING");

  if (input.reverseCharge) {
    return {
      assessmentCode: "RCM_DATA_GAP",
      warnings: [...new Set([...warnings, "RCM_DATA_GAP"])],
      suggestedStatus: "BLOCKED",
      eligibleForAdminVerify: false,
      details: { reverseCharge: true }
    };
  }

  if (input.taxInPaise <= 0) {
    return {
      assessmentCode: "ZERO_TAX",
      warnings,
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {}
    };
  }

  if (!input.gstRecognizedInJournal) {
    return {
      assessmentCode: "MISSING_POSTED_INPUT_GST",
      warnings: [...new Set([...warnings, "MISSING_POSTED_INPUT_GST"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {}
    };
  }

  if (!input.invoiceOrReference?.trim()) {
    return {
      assessmentCode: "MISSING_TAX_INVOICE",
      warnings: [...new Set([...warnings, "MISSING_INVOICE_OR_REFERENCE"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {}
    };
  }

  if (input.vendorId && !isPlausibleGstin(input.vendorGstin)) {
    return {
      assessmentCode: "INVALID_GSTIN",
      warnings: [...new Set([...warnings, "INVALID_GSTIN"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {}
    };
  }

  const tol = 2;
  if (
    Math.abs(input.journalCgst - input.snapshotCgst) > tol ||
    Math.abs(input.journalSgst - input.snapshotSgst) > tol ||
    Math.abs(input.journalIgst - input.snapshotIgst) > tol
  ) {
    return {
      assessmentCode: "GST_AMOUNT_MISMATCH",
      warnings: [...new Set([...warnings, "GST_AMOUNT_MISMATCH"])],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {}
    };
  }

  if (input.postingDataGapCodes.includes("GST_DATA_GAP")) {
    return {
      assessmentCode: "DATA_GAP",
      warnings: [...new Set(warnings)],
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: {}
    };
  }

  return {
    assessmentCode: "ELIGIBLE_FOR_REVIEW",
    warnings: [...new Set(warnings)],
    suggestedStatus: "UNVERIFIED_PENDING_TAX_INVOICE",
    eligibleForAdminVerify: true,
    details: {}
  };
}

export function assessGatewayItc(input: {
  taxInPaise: number;
  feeInPaise: number;
  settlementPosted: boolean;
}): ItcAssessmentResult {
  const warnings = ["GATEWAY_GST_PROVISIONAL", "GATEWAY_NOT_IN_INPUT_GL"];
  if (input.taxInPaise <= 0) {
    return {
      assessmentCode: "ZERO_TAX",
      warnings,
      suggestedStatus: "DATA_GAP",
      eligibleForAdminVerify: false,
      details: { feeInPaise: input.feeInPaise, taxInPaise: input.taxInPaise }
    };
  }
  return {
    assessmentCode: "GATEWAY_TAX_INVOICE_REQUIRED",
    warnings: [...warnings, "UNVERIFIED_PENDING_TAX_INVOICE"],
    suggestedStatus: "UNVERIFIED_PENDING_TAX_INVOICE",
    /** Admin may mark ELIGIBLE only as “tax invoice held” — does NOT reclassify 5100→220x. */
    eligibleForAdminVerify: input.settlementPosted,
    details: {
      feeInPaise: input.feeInPaise,
      taxInPaise: input.taxInPaise,
      posting: "fee+tax → 5100",
      note: "ELIGIBLE does not move amounts into Input GST GL in Phase 5C"
    }
  };
}

export function primaryAssessmentCode(codes: ItcAssessmentCode[]): ItcAssessmentCode {
  const priority: ItcAssessmentCode[] = [
    "RCM_DATA_GAP",
    "MISSING_POSTED_INPUT_GST",
    "GST_AMOUNT_MISMATCH",
    "PLACE_OF_SUPPLY_MISMATCH",
    "INVALID_GSTIN",
    "MISSING_SUPPLIER_REFERENCE",
    "MISSING_TAX_INVOICE",
    "GATEWAY_TAX_INVOICE_REQUIRED",
    "GATEWAY_NOT_IN_INPUT_GL",
    "DATA_GAP",
    "ZERO_TAX",
    "ELIGIBLE_FOR_REVIEW"
  ];
  for (const p of priority) {
    if (codes.includes(p)) return p;
  }
  return codes[0] ?? "DATA_GAP";
}
