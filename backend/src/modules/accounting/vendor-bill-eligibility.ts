import { getPostingEvent } from "./posting-event.service";
import {
  VENDOR_BILL_POSTED_EVENT_TYPE,
  vendorBillPostedUniqueKey
} from "./vendor-bill.constants";
import type { VendorBillEligibility, VendorBillSnapshot } from "./vendor-bill.types";

const AMOUNT_TOLERANCE_PAISE = 2;

function expectedTotal(s: VendorBillSnapshot): number {
  return s.subtotalInPaise - s.discountInPaise + s.taxInPaise + s.adjustmentInPaise;
}

/**
 * Auto-postable when OPEN (or historically PAID — reconstruct AP recognition only).
 * DRAFT / VOID never post.
 */
export function isVendorBillEligibleForPosting(
  snapshot: VendorBillSnapshot,
  opts?: { existingPosted?: boolean }
): VendorBillEligibility {
  const warnings: string[] = [];

  if (snapshot.status === "DRAFT") {
    return {
      eligible: false,
      code: "BILL_DRAFT",
      reason: "DRAFT bills are not posted",
      warnings
    };
  }

  if (snapshot.status === "VOID") {
    return {
      eligible: false,
      code: "BILL_VOID",
      reason: "VOID bills are not posted",
      warnings
    };
  }

  if (snapshot.status !== "OPEN" && snapshot.status !== "PAID") {
    return {
      eligible: false,
      code: "BILL_STATUS_UNSUPPORTED",
      reason: `Unsupported bill status ${snapshot.status}`,
      warnings
    };
  }

  if (snapshot.status === "PAID") {
    warnings.push("HISTORICAL_PAID_BILL_AP_RECONSTRUCTION_ONLY");
  }

  if (snapshot.reverseCharge) {
    return {
      eligible: false,
      code: "RCM_DATA_GAP",
      reason: "Reverse charge vendor bills deferred — RCM journals not implemented",
      warnings
    };
  }

  if (snapshot.totalInPaise <= 0) {
    return {
      eligible: false,
      code: "BILL_ZERO_TOTAL",
      reason: "totalInPaise must be > 0",
      warnings
    };
  }

  if (!snapshot.vendorId || !snapshot.vendorName) {
    return {
      eligible: false,
      code: "MISSING_VENDOR",
      reason: "Vendor is required",
      warnings
    };
  }

  if (!snapshot.lines.length) {
    return {
      eligible: false,
      code: "MISSING_LINES",
      reason: "Bill lines are required",
      warnings
    };
  }

  if (!snapshot.billDate || Number.isNaN(snapshot.billDate.getTime())) {
    return {
      eligible: false,
      code: "MISSING_BILL_DATE",
      reason: "billDate is required",
      warnings
    };
  }

  const currency = (snapshot.vendorCurrency || "INR").toUpperCase();
  if (currency !== "INR") {
    return {
      eligible: false,
      code: "MULTI_CURRENCY_DEFERRED",
      reason: `Currency ${currency} deferred in VENDOR_BILL_POSTED_V1`,
      warnings
    };
  }

  const expected = expectedTotal(snapshot);
  if (Math.abs(expected - snapshot.totalInPaise) > AMOUNT_TOLERANCE_PAISE) {
    return {
      eligible: false,
      code: "AMOUNT_MISMATCH",
      reason: `Bill totals do not reconcile: expected ${expected}, got ${snapshot.totalInPaise}`,
      warnings
    };
  }

  const lineBaseSum = snapshot.lines.reduce((s, l) => s + l.exclusiveBaseInPaise, 0);
  if (Math.abs(lineBaseSum - snapshot.subtotalInPaise) > AMOUNT_TOLERANCE_PAISE) {
    return {
      eligible: false,
      code: "LINE_SUBTOTAL_MISMATCH",
      reason: `Line bases ${lineBaseSum} != subtotal ${snapshot.subtotalInPaise}`,
      warnings
    };
  }

  if (opts?.existingPosted) {
    return {
      eligible: false,
      code: "ALREADY_POSTED",
      reason: "VENDOR_BILL_POSTED event already POSTED",
      warnings
    };
  }

  return { eligible: true, code: "OK", warnings };
}

export async function evaluateVendorBillEligibility(
  snapshot: VendorBillSnapshot
): Promise<VendorBillEligibility> {
  const event = await getPostingEvent(
    VENDOR_BILL_POSTED_EVENT_TYPE,
    vendorBillPostedUniqueKey(snapshot.billId)
  );
  const existingPosted = event?.status === "POSTED";
  return isVendorBillEligibleForPosting(snapshot, { existingPosted });
}
