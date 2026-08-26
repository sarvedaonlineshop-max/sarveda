import { gstFromInclusiveLine, lookupGstRate } from "../../utils/gst";
import {
  resolvePlaceOfSupply,
  SHIPPING_GST_POLICY,
  splitOutputGstPaise,
  type SupplyType
} from "../../utils/gst-state";

import {
  allocateOrderDiscountPaise,
  nativeMerchandiseNetPaise,
  zohoEffectiveMerchandiseNetPaise
} from "./discount-allocation";
import {
  ACCOUNT_CODE,
  CLEARING_ACCOUNT_BY_PROVIDER,
  ORDER_PAID_CALC_VERSION,
  ORDER_PAID_EVENT_TYPE,
  ORDER_PAID_MAX_IMBALANCE_PAISE,
  orderPaidUniqueKey
} from "./order-paid.constants";
import { OrderPaidJournalImbalanceError } from "./accounting-errors";
import type {
  OrderPaidJournalProposal,
  OrderPaidLineSnapshot,
  OrderPaidSnapshot,
  OrderPaidTaxLineSnapshot,
  ProposedJournalLine
} from "./order-paid-journal.types";

const ACCOUNT_NAMES: Record<string, string> = {
  [ACCOUNT_CODE.RAZORPAY_CLEARING]: "Razorpay Clearing",
  [ACCOUNT_CODE.STRIPE_CLEARING]: "Stripe Clearing",
  [ACCOUNT_CODE.PAYPAL_CLEARING]: "PayPal Clearing",
  [ACCOUNT_CODE.ACCOUNTS_RECEIVABLE]: "Accounts Receivable",
  [ACCOUNT_CODE.PRODUCT_SALES]: "Product Sales",
  [ACCOUNT_CODE.SHIPPING_INCOME]: "Shipping Income",
  [ACCOUNT_CODE.DISCOUNTS_CONTRA]: "Discounts (Contra Revenue)",
  [ACCOUNT_CODE.OUTPUT_CGST]: "Output CGST",
  [ACCOUNT_CODE.OUTPUT_SGST]: "Output SGST",
  [ACCOUNT_CODE.OUTPUT_IGST]: "Output IGST"
};

const DEFAULT_HSN = () => process.env.DEFAULT_HSN_CODE?.trim() || "9205";

function splitGst(taxPaise: number, interState: boolean) {
  const supplyType: SupplyType = interState ? "INTER_STATE" : "INTRA_STATE";
  const s = splitOutputGstPaise(taxPaise, supplyType);
  return { cgst: s.cgstInPaise, sgst: s.sgstInPaise, igst: s.igstInPaise };
}

function computePdfBasisTax(
  lines: OrderPaidLineSnapshot[],
  isGstApplicable: boolean,
  interState: boolean
) {
  if (!isGstApplicable) {
    return { taxablePaise: 0, gstTotalPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
  }

  let taxablePaise = 0;
  let gstTotalPaise = 0;
  for (const line of lines) {
    const rate = lookupGstRate(line.taxClass).ratePercent;
    const extracted = gstFromInclusiveLine(line.lineTotalInPaise, rate);
    taxablePaise += extracted.taxableMinor;
    gstTotalPaise += extracted.taxMinor;
  }
  const split = splitGst(gstTotalPaise, interState);
  return {
    taxablePaise,
    gstTotalPaise,
    cgstPaise: split.cgst,
    sgstPaise: split.sgst,
    igstPaise: split.igst
  };
}

function line(
  accountCode: string,
  debitInPaise: number,
  creditInPaise: number,
  amountSource: string,
  lineMemo?: string
): ProposedJournalLine {
  return {
    accountCode,
    accountName: ACCOUNT_NAMES[accountCode] ?? accountCode,
    debitInPaise,
    creditInPaise,
    amountSource,
    lineMemo
  };
}

/**
 * Pure ORDER_PAID journal builder — no DB writes.
 * Implements ORDER_PAID_V1 mathematics (unchanged).
 * Phase 5B: POS normalization, immutable tax snapshot diagnostics, shipping DATA_GAP warning.
 */
export function buildOrderPaidJournal(
  snapshot: OrderPaidSnapshot,
  opts?: { failOnImbalance?: boolean }
): OrderPaidJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const isGstApplicable =
    snapshot.shippingCountry.trim().toUpperCase() === "IN" && snapshot.currency === "INR";

  const warnings: string[] = [];
  let taxPostingBlock: { code: string; reason: string } | null = null;
  let interState = false;
  let supplyType: OrderPaidJournalProposal["diagnostics"]["supplyType"] = "NON_GST";
  let sellerStateRaw: string | null = null;
  let sellerStateCode: string | null = null;
  let placeOfSupplyRaw: string | null = snapshot.shippingState || null;
  let placeOfSupplyCode: string | null = null;
  let sellerGstin: string | null = null;
  let placeOfSupplyError: string | null = null;

  if (isGstApplicable) {
    const pos = resolvePlaceOfSupply({ placeOfSupplyRaw: snapshot.shippingState });
    if (!pos.ok) {
      placeOfSupplyError = pos.code;
      supplyType = "DATA_GAP";
      taxPostingBlock = { code: pos.code, reason: pos.reason };
      warnings.push(pos.code);
    } else {
      sellerStateRaw = pos.sellerStateRaw;
      sellerStateCode = pos.sellerStateCode;
      placeOfSupplyRaw = pos.placeOfSupplyRaw;
      placeOfSupplyCode = pos.placeOfSupplyCode;
      sellerGstin = pos.sellerGstin;
      supplyType = pos.supplyType;
      interState = pos.supplyType === "INTER_STATE";
    }
  }

  const buyerGstin = snapshot.buyerGstin?.trim() || null;
  if (!buyerGstin) warnings.push("BUYER_GSTIN_MISSING");

  const clearingCode = CLEARING_ACCOUNT_BY_PROVIDER[snapshot.payment.provider];
  const allocationItems = snapshot.lines.map((l) => ({
    lineTotalInPaise: l.lineTotalInPaise,
    unitPriceInPaise: l.unitPriceInPaise,
    qtyOrdered: l.qtyOrdered
  }));

  const { lineDiscountsPaise } = allocateOrderDiscountPaise(
    allocationItems,
    snapshot.discountInPaise
  );

  let preDiscountTaxablePaise = 0;
  let postDiscountTaxablePaise = 0;
  let outputGstTotalPaise = 0;
  const defaultHsn = DEFAULT_HSN();

  const lineAllocations: OrderPaidTaxLineSnapshot[] = snapshot.lines.map((item, index) => {
    const discountPaise = lineDiscountsPaise[index] ?? 0;
    const netInclusivePaise = item.lineTotalInPaise - discountPaise;
    const rateLookup = lookupGstRate(item.taxClass);
    const rate = isGstApplicable ? rateLookup.ratePercent : 0;
    if (isGstApplicable && rateLookup.defaulted) {
      warnings.push("TAX_CLASS_DEFAULTED");
    }
    const pre = isGstApplicable
      ? gstFromInclusiveLine(item.lineTotalInPaise, rate)
      : { taxableMinor: item.lineTotalInPaise, taxMinor: 0 };
    const post = isGstApplicable
      ? gstFromInclusiveLine(netInclusivePaise, rate)
      : { taxableMinor: netInclusivePaise, taxMinor: 0 };

    preDiscountTaxablePaise += pre.taxableMinor;
    postDiscountTaxablePaise += post.taxableMinor;
    outputGstTotalPaise += post.taxMinor;

    const hsnProduct = item.hsnCode?.trim() || null;
    const hsnSource = hsnProduct ? ("PRODUCT" as const) : ("DEFAULT" as const);
    if (!hsnProduct && isGstApplicable) warnings.push("HSN_DEFAULTED");

    const component = isGstApplicable
      ? splitOutputGstPaise(post.taxMinor, interState ? "INTER_STATE" : "INTRA_STATE")
      : { cgstInPaise: 0, sgstInPaise: 0, igstInPaise: 0 };

    return {
      orderItemId: item.orderItemId,
      productId: item.productId ?? null,
      variantId: item.variantId ?? null,
      sku: item.skuSnapshot,
      grossInclusiveInPaise: item.lineTotalInPaise,
      allocatedDiscountInPaise: discountPaise,
      discountPaise,
      netInclusiveInPaise: netInclusivePaise,
      taxableValueInPaise: post.taxableMinor,
      gstRate: rate,
      gstRatePercent: rate,
      taxClassRaw: item.taxClass,
      taxClassDefaulted: rateLookup.defaulted,
      totalTaxInPaise: post.taxMinor,
      cgstInPaise: component.cgstInPaise,
      sgstInPaise: component.sgstInPaise,
      igstInPaise: component.igstInPaise,
      hsnSac: hsnProduct,
      hsnSacResolved: hsnProduct || defaultHsn,
      hsnSource,
      preTaxablePaise: pre.taxableMinor,
      postTaxablePaise: post.taxableMinor,
      postTaxPaise: post.taxMinor
    };
  });

  // Align line component sums to order-level split (residual on last GST line)
  if (isGstApplicable && !taxPostingBlock && lineAllocations.length > 0) {
    const gstSplitOrder = splitGst(outputGstTotalPaise, interState);
    const sumC = lineAllocations.reduce((s, l) => s + l.cgstInPaise, 0);
    const sumS = lineAllocations.reduce((s, l) => s + l.sgstInPaise, 0);
    const sumI = lineAllocations.reduce((s, l) => s + l.igstInPaise, 0);
    const last = [...lineAllocations].reverse().find((l) => l.totalTaxInPaise > 0) ?? lineAllocations[lineAllocations.length - 1]!;
    last.cgstInPaise += gstSplitOrder.cgst - sumC;
    last.sgstInPaise += gstSplitOrder.sgst - sumS;
    last.igstInPaise += gstSplitOrder.igst - sumI;
  }

  const discountTaxableContraPaise = preDiscountTaxablePaise - postDiscountTaxablePaise;
  const gstSplit = taxPostingBlock
    ? { cgst: 0, sgst: 0, igst: 0 }
    : splitGst(outputGstTotalPaise, interState);

  const shippingGstWarning = snapshot.shippingInPaise > 0;
  if (shippingGstWarning) warnings.push(SHIPPING_GST_POLICY);

  const journalLines: ProposedJournalLine[] = [];

  journalLines.push(
    line(
      clearingCode,
      snapshot.grandTotalInPaise,
      0,
      "Order.grandTotalInPaise",
      snapshot.payment.provider === "COD" ? "COD sale recognised (not cash received)" : undefined
    )
  );

  if (isGstApplicable && !taxPostingBlock) {
    if (discountTaxableContraPaise > 0) {
      journalLines.push(
        line(
          ACCOUNT_CODE.DISCOUNTS_CONTRA,
          discountTaxableContraPaise,
          0,
          "preDiscountTaxable - postDiscountTaxable"
        )
      );
    }
    journalLines.push(
      line(ACCOUNT_CODE.PRODUCT_SALES, 0, preDiscountTaxablePaise, "sum(gross line taxable)")
    );
    if (interState && gstSplit.igst > 0) {
      journalLines.push(line(ACCOUNT_CODE.OUTPUT_IGST, 0, gstSplit.igst, "post-discount IGST"));
    } else {
      if (gstSplit.cgst > 0) {
        journalLines.push(line(ACCOUNT_CODE.OUTPUT_CGST, 0, gstSplit.cgst, "post-discount CGST"));
      }
      if (gstSplit.sgst > 0) {
        journalLines.push(line(ACCOUNT_CODE.OUTPUT_SGST, 0, gstSplit.sgst, "post-discount SGST"));
      }
    }
  } else if (!isGstApplicable) {
    if (snapshot.discountInPaise > 0) {
      journalLines.push(
        line(
          ACCOUNT_CODE.DISCOUNTS_CONTRA,
          snapshot.discountInPaise,
          0,
          "Order.discountInPaise (non-GST)"
        )
      );
    }
    journalLines.push(
      line(ACCOUNT_CODE.PRODUCT_SALES, 0, snapshot.subtotalInPaise, "Order.subtotalInPaise")
    );
  }

  if (snapshot.shippingInPaise > 0 && !taxPostingBlock) {
    journalLines.push(
      line(ACCOUNT_CODE.SHIPPING_INCOME, 0, snapshot.shippingInPaise, "Order.shippingInPaise")
    );
  }

  // If tax blocked, still build a dry-run unbalanced/skipped journal for preview diagnostics only
  if (taxPostingBlock) {
    journalLines.length = 0;
    journalLines.push(
      line(clearingCode, snapshot.grandTotalInPaise, 0, "Order.grandTotalInPaise (tax blocked)")
    );
  }

  const totalDebitPaise = journalLines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = journalLines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced =
    !taxPostingBlock && Math.abs(imbalancePaise) <= ORDER_PAID_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !taxPostingBlock && !balanced) {
    throw new OrderPaidJournalImbalanceError(totalDebitPaise, totalCreditPaise, imbalancePaise);
  }

  const pdfBasis = computePdfBasisTax(
    snapshot.lines,
    isGstApplicable && !taxPostingBlock,
    interState
  );
  const pdfJournalTaxDivergencePaise = isGstApplicable && !taxPostingBlock
    ? pdfBasis.gstTotalPaise - outputGstTotalPaise
    : 0;
  if (pdfJournalTaxDivergencePaise !== 0) {
    warnings.push("PDF_JOURNAL_TAX_DIVERGENCE");
  }

  const nativeNet = nativeMerchandiseNetPaise(allocationItems, snapshot.discountInPaise);
  const zohoNet = zohoEffectiveMerchandiseNetPaise(
    snapshot.lines.map((l) => ({
      unitPriceInPaise: l.unitPriceInPaise,
      qtyOrdered: l.qtyOrdered
    })),
    snapshot.discountInPaise
  );

  const uniqueKey = orderPaidUniqueKey(snapshot.orderId);
  const memo = `${ORDER_PAID_CALC_VERSION} ORDER_PAID ${snapshot.orderNumber} (${snapshot.payment.provider})`;

  return {
    calcVersion: ORDER_PAID_CALC_VERSION,
    eventType: ORDER_PAID_EVENT_TYPE,
    uniqueKey,
    accountingDate: snapshot.placedAt,
    reference: snapshot.orderNumber,
    memo,
    currency: snapshot.currency,
    provider: snapshot.payment.provider,
    postingEventKey: uniqueKey,
    lines: journalLines,
    totalDebitPaise,
    totalCreditPaise,
    imbalancePaise,
    balanced,
    taxPostingBlock,
    diagnostics: {
      isGstApplicable,
      interState,
      supplyType,
      sellerStateRaw,
      sellerStateCode,
      placeOfSupplyRaw,
      placeOfSupplyCode,
      sellerGstin,
      buyerGstin,
      buyerGstinMissing: !buyerGstin,
      placeOfSupplyError,
      preDiscountTaxablePaise,
      postDiscountTaxablePaise,
      discountTaxableContraPaise,
      outputCgstPaise: gstSplit.cgst,
      outputSgstPaise: gstSplit.sgst,
      outputIgstPaise: gstSplit.igst,
      outputGstTotalPaise: taxPostingBlock ? 0 : outputGstTotalPaise,
      netProductRevenuePaise: postDiscountTaxablePaise,
      shippingPaise: snapshot.shippingInPaise,
      shippingGstPolicy: SHIPPING_GST_POLICY,
      shippingGstWarning,
      warnings: [...new Set(warnings)],
      taxSnapshotVersion: "ORDER_PAID_TAX_SNAPSHOT_V1",
      lineAllocations,
      pdfBasis,
      pdfJournalTaxDivergencePaise,
      zohoParity: {
        nativeMerchandiseNetPaise: nativeNet,
        zohoMerchandiseNetPaise: zohoNet,
        merchandiseVariancePaise: nativeNet - zohoNet
      }
    },
    reconciliationMetadata: {
      calcVersion: ORDER_PAID_CALC_VERSION,
      taxSnapshotVersion: "ORDER_PAID_TAX_SNAPSHOT_V1",
      orderId: snapshot.orderId,
      orderNumber: snapshot.orderNumber,
      paymentId: snapshot.payment.id,
      paymentProvider: snapshot.payment.provider,
      paymentStatus: snapshot.payment.status,
      supplyType,
      sellerStateCode,
      placeOfSupplyCode
    }
  };
}
