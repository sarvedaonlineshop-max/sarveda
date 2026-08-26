import { sellerStateCode } from "../../utils/gst";

import { isPlausibleGstin } from "./vendor-bill-journal.builder";
import { GST_ITC_STATUS_UNVERIFIED } from "./expense.constants";
import type { ExpenseGstDiagnostics, ExpenseSnapshot } from "./expense.types";

function normalizeStateToken(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  return v.trim().toLowerCase();
}

/**
 * Jurisdiction for expense GST:
 * Prefer sourceOfSupply vs destinationOfSupply / SELLER_STATE;
 * fall back to vendor billing state vs SELLER_STATE.
 * Contradictory signals → UNKNOWN + GST_DATA_GAP.
 */
export function resolveExpenseGst(
  snapshot: ExpenseSnapshot,
  taxInPaise: number
): ExpenseGstDiagnostics {
  const dataGapCodes: string[] = [];
  if (taxInPaise <= 0) {
    return {
      jurisdiction: "NONE",
      gstRecognized: false,
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 0,
      taxInPaise: 0,
      itcStatus: GST_ITC_STATUS_UNVERIFIED,
      dataGapCodes
    };
  }

  const currency = (snapshot.currency || "INR").toUpperCase();
  const country = (snapshot.vendorBillingCountry || "IN").toUpperCase();
  if (currency !== "INR" || (snapshot.vendorId && country !== "IN")) {
    dataGapCodes.push("GST_DATA_GAP", "NON_INR_OR_NON_IN");
  }

  const inv =
    snapshot.invoiceNumber?.trim() ||
    snapshot.referenceNumber?.trim() ||
    null;
  if (!inv) {
    dataGapCodes.push("GST_DATA_GAP", "MISSING_INVOICE_OR_REFERENCE");
  }

  if (snapshot.vendorId && !isPlausibleGstin(snapshot.vendorGstin)) {
    dataGapCodes.push("GST_DATA_GAP", "MISSING_OR_INVALID_GSTIN");
  }

  const seller = normalizeStateToken(sellerStateCode());
  if (!seller) {
    dataGapCodes.push("GST_DATA_GAP", "MISSING_SELLER_STATE");
  }

  const source = normalizeStateToken(snapshot.sourceOfSupply);
  const dest =
    normalizeStateToken(snapshot.destinationOfSupply) ||
    normalizeStateToken(snapshot.vendorBillingState) ||
    seller;
  const vendorState = normalizeStateToken(snapshot.vendorBillingState);

  let supplyState: string | null = null;
  if (source) {
    supplyState = source;
    if (vendorState && vendorState !== source) {
      dataGapCodes.push("GST_DATA_GAP", "CONTRADICTORY_SUPPLY_STATE");
    }
  } else if (vendorState) {
    supplyState = vendorState;
  } else {
    dataGapCodes.push("GST_DATA_GAP", "MISSING_SUPPLY_STATE");
  }

  if (!dest) {
    dataGapCodes.push("GST_DATA_GAP", "MISSING_DESTINATION_STATE");
  }

  if (dataGapCodes.includes("GST_DATA_GAP")) {
    return {
      jurisdiction: "UNKNOWN",
      gstRecognized: false,
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 0,
      taxInPaise,
      itcStatus: GST_ITC_STATUS_UNVERIFIED,
      dataGapCodes: [...new Set(dataGapCodes)]
    };
  }

  const intra = supplyState === dest;
  if (intra) {
    const half = Math.floor(taxInPaise / 2);
    const other = taxInPaise - half;
    return {
      jurisdiction: "INTRA_STATE",
      gstRecognized: true,
      cgstInPaise: half,
      sgstInPaise: other,
      igstInPaise: 0,
      taxInPaise,
      itcStatus: GST_ITC_STATUS_UNVERIFIED,
      dataGapCodes: []
    };
  }

  return {
    jurisdiction: "INTER_STATE",
    gstRecognized: true,
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: taxInPaise,
    taxInPaise,
    itcStatus: GST_ITC_STATUS_UNVERIFIED,
    dataGapCodes: []
  };
}
