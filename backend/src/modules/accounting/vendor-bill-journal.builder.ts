import { sellerStateCode } from "../../utils/gst";
import { resolvePlaceOfSupply } from "../../utils/gst-state";

import { VendorBillJournalImbalanceError } from "./accounting-errors";
import {
  GST_ITC_STATUS_UNVERIFIED,
  PURCHASE_ACCOUNT_CODE,
  VENDOR_BILL_POSTED_CALC_VERSION,
  VENDOR_BILL_POSTED_EVENT_TYPE,
  VENDOR_BILL_POSTED_MAX_IMBALANCE_PAISE,
  normalizeSupplierReference,
  vendorBillPostedUniqueKey
} from "./vendor-bill.constants";
import type {
  VendorBillJournalProposal,
  VendorBillLineSnapshot,
  VendorBillSnapshot
} from "./vendor-bill.types";

/** India GSTIN basic shape check (15 chars). */
export function isPlausibleGstin(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  const g = gstin.trim().toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g);
}

function allocateProRata(
  lines: VendorBillLineSnapshot[],
  poolInPaise: number
): Map<string, number> {
  const out = new Map<string, number>();
  const bases = lines.map((l) => ({ id: l.id, base: l.exclusiveBaseInPaise }));
  const totalBase = bases.reduce((s, b) => s + b.base, 0);
  if (totalBase <= 0 || poolInPaise === 0) {
    for (const l of lines) out.set(l.id, 0);
    return out;
  }

  let allocated = 0;
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i]!;
    if (i === bases.length - 1) {
      out.set(b.id, poolInPaise - allocated);
    } else {
      const share = Math.round((poolInPaise * b.base) / totalBase);
      out.set(b.id, share);
      allocated += share;
    }
  }
  return out;
}

/**
 * Net base after document discount + adjustment (excludes tax).
 * Purchases arithmetic: total = subtotal − discount + tax + adjustment
 * ⇒ netBase = total − tax = subtotal − discount + adjustment
 */
export function computeNetBillBase(snapshot: VendorBillSnapshot): number {
  return snapshot.subtotalInPaise - snapshot.discountInPaise + snapshot.adjustmentInPaise;
}

function resolveGst(snapshot: VendorBillSnapshot): VendorBillJournalProposal["diagnostics"]["gst"] {
  const dataGapCodes: string[] = [];
  const tax = snapshot.taxInPaise;
  const country = (snapshot.vendorBillingCountry || "IN").toUpperCase();
  const ref = normalizeSupplierReference(snapshot.referenceNumber);
  const currency = (snapshot.vendorCurrency || "INR").toUpperCase();

  if (tax <= 0) {
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

  if (currency !== "INR" || country !== "IN") {
    dataGapCodes.push("GST_DATA_GAP");
    dataGapCodes.push("NON_INR_OR_NON_IN");
  }
  if (!isPlausibleGstin(snapshot.vendorGstin)) {
    dataGapCodes.push("GST_DATA_GAP");
    dataGapCodes.push("MISSING_OR_INVALID_GSTIN");
  }
  if (!ref) {
    dataGapCodes.push("GST_DATA_GAP");
    dataGapCodes.push("MISSING_SUPPLIER_REFERENCE");
  }
  if (!snapshot.vendorBillingState?.trim()) {
    dataGapCodes.push("GST_DATA_GAP");
    dataGapCodes.push("MISSING_VENDOR_STATE");
  }

  const pos = resolvePlaceOfSupply({
    placeOfSupplyRaw: snapshot.vendorBillingState,
    sellerState: sellerStateCode()
  });
  if (!pos.ok) {
    dataGapCodes.push("GST_DATA_GAP");
    dataGapCodes.push(pos.code);
  }

  if (dataGapCodes.includes("GST_DATA_GAP")) {
    return {
      jurisdiction: "UNKNOWN",
      gstRecognized: false,
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 0,
      taxInPaise: tax,
      itcStatus: GST_ITC_STATUS_UNVERIFIED,
      dataGapCodes: [...new Set(dataGapCodes)]
    };
  }

  const intra = pos.ok && pos.supplyType === "INTRA_STATE";
  if (intra) {
    const half = Math.floor(tax / 2);
    const other = tax - half;
    return {
      jurisdiction: "INTRA_STATE",
      gstRecognized: true,
      cgstInPaise: half,
      sgstInPaise: other,
      igstInPaise: 0,
      taxInPaise: tax,
      itcStatus: GST_ITC_STATUS_UNVERIFIED,
      dataGapCodes: []
    };
  }

  return {
    jurisdiction: "INTER_STATE",
    gstRecognized: true,
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: tax,
    taxInPaise: tax,
    itcStatus: GST_ITC_STATUS_UNVERIFIED,
    dataGapCodes: []
  };
}

export type BillLineNetAllocation = {
  billLineId: string;
  variantId: string | null;
  classification: VendorBillLineSnapshot["classification"];
  quantity: number;
  rateInPaise: number;
  allocatedBaseInPaise: number;
  netUnitCostInPaise: number;
};

/**
 * Net stock/service base per bill line after document discount + adjustment (excludes tax).
 * Used by VENDOR_BILL_POSTED_V1 and INVENTORY_PURCHASE_CAPITALIZED_V1.
 */
export function computeBillLineNetAllocations(snapshot: VendorBillSnapshot): BillLineNetAllocation[] {
  const discountShares = allocateProRata(snapshot.lines, snapshot.discountInPaise);
  const adjustmentShares = allocateProRata(snapshot.lines, snapshot.adjustmentInPaise);

  const lineAllocations = snapshot.lines.map((l) => {
    const allocatedBase =
      l.exclusiveBaseInPaise - (discountShares.get(l.id) ?? 0) + (adjustmentShares.get(l.id) ?? 0);
    return {
      billLineId: l.id,
      variantId: l.variantId,
      classification: l.classification,
      quantity: l.quantity,
      rateInPaise: l.rateInPaise,
      allocatedBaseInPaise: allocatedBase,
      netUnitCostInPaise: l.quantity > 0 ? Math.round(allocatedBase / l.quantity) : 0
    };
  });

  const allocatedSum = lineAllocations.reduce((s, a) => s + a.allocatedBaseInPaise, 0);
  const netBase = computeNetBillBase(snapshot);
  const residual = netBase - allocatedSum;
  if (residual !== 0 && lineAllocations.length > 0) {
    const last = lineAllocations[lineAllocations.length - 1]!;
    last.allocatedBaseInPaise += residual;
    last.netUnitCostInPaise =
      last.quantity > 0 ? Math.round(last.allocatedBaseInPaise / last.quantity) : 0;
  }

  return lineAllocations;
}

/**
 * Pure VENDOR_BILL_POSTED_V1 journal builder — no DB writes.
 *
 * Stock lines → Dr 1210; non-stock → Dr 5300; never 1200 / 5000.
 * Tax → provisional Input GST only when evidence permits; else fail-closed on post
 * (builder marks unbalanced / gst gap for tax>0 without recognition).
 */
export function buildVendorBillPostedJournal(
  snapshot: VendorBillSnapshot,
  opts?: { failOnImbalance?: boolean; failOnGstDataGap?: boolean }
): VendorBillJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const failOnGstDataGap = opts?.failOnGstDataGap ?? true;
  const warnings: string[] = [];

  const netBase = computeNetBillBase(snapshot);

  if (snapshot.adjustmentInPaise !== 0) {
    warnings.push("ADJUSTMENT_UNCLASSIFIED");
  }

  const lineAllocations = computeBillLineNetAllocations(snapshot).map((a) => ({
    billLineId: a.billLineId,
    classification: a.classification,
    allocatedBaseInPaise: a.allocatedBaseInPaise
  }));

  let stockClearing = 0;
  let expense = 0;
  const stockLineIds: string[] = [];
  const expenseLineIds: string[] = [];
  for (const a of lineAllocations) {
    if (a.classification === "STOCK") {
      stockClearing += a.allocatedBaseInPaise;
      stockLineIds.push(a.billLineId);
    } else {
      expense += a.allocatedBaseInPaise;
      expenseLineIds.push(a.billLineId);
    }
  }

  const gst = resolveGst(snapshot);
  if (gst.dataGapCodes.length) {
    warnings.push(...gst.dataGapCodes.filter((c) => c === "GST_DATA_GAP" || c.startsWith("MISSING")));
  }

  if (snapshot.taxInPaise > 0 && !gst.gstRecognized && failOnGstDataGap) {
    throw new VendorBillJournalImbalanceError(
      0,
      0,
      snapshot.taxInPaise,
      {
        reason: "GST_DATA_GAP",
        dataGapCodes: gst.dataGapCodes,
        note: "Tax present but provisional Input GST evidence insufficient — fail closed (no jurisdiction guess)"
      }
    );
  }

  const journalLines: VendorBillJournalProposal["lines"] = [];

  if (stockClearing > 0) {
    journalLines.push({
      accountCode: PURCHASE_ACCOUNT_CODE.INVENTORY_PURCHASES_CLEARING,
      debitInPaise: stockClearing,
      creditInPaise: 0,
      lineMemo: `Inventory purchases clearing ${snapshot.billNumber}`,
      amountSource: "bill.stock.net_base",
      billLineIds: stockLineIds
    });
  } else if (stockClearing < 0) {
    journalLines.push({
      accountCode: PURCHASE_ACCOUNT_CODE.INVENTORY_PURCHASES_CLEARING,
      debitInPaise: 0,
      creditInPaise: Math.abs(stockClearing),
      lineMemo: `Inventory purchases clearing credit ${snapshot.billNumber}`,
      amountSource: "bill.stock.net_base",
      billLineIds: stockLineIds
    });
  }

  if (expense > 0) {
    journalLines.push({
      accountCode: PURCHASE_ACCOUNT_CODE.OPERATING_EXPENSE,
      debitInPaise: expense,
      creditInPaise: 0,
      lineMemo: `Purchase/operating expense ${snapshot.billNumber}`,
      amountSource: "bill.non_stock.net_base",
      billLineIds: expenseLineIds
    });
  } else if (expense < 0) {
    journalLines.push({
      accountCode: PURCHASE_ACCOUNT_CODE.OPERATING_EXPENSE,
      debitInPaise: 0,
      creditInPaise: Math.abs(expense),
      lineMemo: `Purchase/operating expense credit ${snapshot.billNumber}`,
      amountSource: "bill.non_stock.net_base",
      billLineIds: expenseLineIds
    });
  }

  if (gst.gstRecognized) {
    if (gst.cgstInPaise > 0) {
      journalLines.push({
        accountCode: PURCHASE_ACCOUNT_CODE.INPUT_CGST,
        debitInPaise: gst.cgstInPaise,
        creditInPaise: 0,
        lineMemo: "Provisional Input CGST (ITC unverified)",
        amountSource: "bill.tax.cgst"
      });
    }
    if (gst.sgstInPaise > 0) {
      journalLines.push({
        accountCode: PURCHASE_ACCOUNT_CODE.INPUT_SGST,
        debitInPaise: gst.sgstInPaise,
        creditInPaise: 0,
        lineMemo: "Provisional Input SGST (ITC unverified)",
        amountSource: "bill.tax.sgst"
      });
    }
    if (gst.igstInPaise > 0) {
      journalLines.push({
        accountCode: PURCHASE_ACCOUNT_CODE.INPUT_IGST,
        debitInPaise: gst.igstInPaise,
        creditInPaise: 0,
        lineMemo: "Provisional Input IGST (ITC unverified)",
        amountSource: "bill.tax.igst"
      });
    }
  }

  journalLines.push({
    accountCode: PURCHASE_ACCOUNT_CODE.ACCOUNTS_PAYABLE,
    debitInPaise: 0,
    creditInPaise: snapshot.totalInPaise,
    lineMemo: `AP ${snapshot.vendorName} ${snapshot.billNumber}`,
    amountSource: "bill.total"
  });

  const totalDebitPaise = journalLines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = journalLines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= VENDOR_BILL_POSTED_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new VendorBillJournalImbalanceError(totalDebitPaise, totalCreditPaise, imbalancePaise);
  }

  return {
    calcVersion: VENDOR_BILL_POSTED_CALC_VERSION,
    eventType: VENDOR_BILL_POSTED_EVENT_TYPE,
    uniqueKey: vendorBillPostedUniqueKey(snapshot.billId),
    accountingDate: snapshot.billDate,
    currency: "INR",
    memo: `${VENDOR_BILL_POSTED_CALC_VERSION} ${snapshot.billNumber} ${snapshot.vendorName}`,
    balanced,
    imbalancePaise,
    totalDebitPaise,
    totalCreditPaise,
    lines: journalLines,
    diagnostics: {
      stockClearingInPaise: stockClearing,
      expenseInPaise: expense,
      apCreditInPaise: snapshot.totalInPaise,
      discountInPaise: snapshot.discountInPaise,
      adjustmentInPaise: snapshot.adjustmentInPaise,
      adjustmentPolicy: snapshot.adjustmentInPaise !== 0 ? "ALLOCATED_PRO_RATA" : "NONE",
      warnings: [...new Set(warnings)],
      gst,
      lineAllocations
    },
    reconciliationMetadata: {
      billId: snapshot.billId,
      billNumber: snapshot.billNumber,
      referenceNumber: snapshot.referenceNumber,
      vendorId: snapshot.vendorId,
      purchaseOrderId: snapshot.purchaseOrderId,
      sourceFingerprint: snapshot.sourceFingerprint,
      opsStatus: snapshot.status,
      opsPaidInPaise: snapshot.paidInPaise,
      itcStatus: gst.itcStatus,
      calcVersion: VENDOR_BILL_POSTED_CALC_VERSION
    }
  };
}
