import type { RefundSourceType } from "@prisma/client";

import { allocateOrderDiscountPaise } from "./discount-allocation";
import { PartialRefundTaxBreakdownUnavailableError } from "./accounting-errors";
import type { PartialRefundSpec } from "./order-refunded-partial.types";
import type { OrderRefundBreakdown } from "../orders/order-refund-calculator.types";
import { gstFromInclusiveLine, lookupGstRate } from "../../utils/gst";

export function buildPartialRefundSpecFromBreakdown(opts: {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: import("@prisma/client").PaymentProvider;
  refundId: string;
  providerRefundId: string | null;
  breakdown: OrderRefundBreakdown;
  sourceType: RefundSourceType;
  sourceId: string;
  interState: boolean;
  isGstApplicable: boolean;
  accountingDate: Date;
}): PartialRefundSpec {
  const totalRefundPaise = opts.breakdown.proposedRefundAmountPaise;
  if (totalRefundPaise <= 0) {
    throw new PartialRefundTaxBreakdownUnavailableError("Refund amount must be positive");
  }

  const shippingRefundPaise = Math.min(
    opts.breakdown.refundableShippingPaise,
    totalRefundPaise
  );
  const merchandiseRefundPaise = totalRefundPaise - shippingRefundPaise;

  if (merchandiseRefundPaise > 0 && opts.breakdown.taxLines.length === 0 && opts.isGstApplicable) {
    throw new PartialRefundTaxBreakdownUnavailableError(
      "Merchandise refund requires authoritative tax line breakdown"
    );
  }

  let merchandiseTaxableRefundPaise = 0;
  let merchandiseGstRefundPaise = 0;

  if (merchandiseRefundPaise > 0) {
    if (opts.isGstApplicable) {
      const merchNetTotal = opts.breakdown.merchandiseNetPaise;
      if (merchNetTotal <= 0) {
        throw new PartialRefundTaxBreakdownUnavailableError("Merchandise net is zero");
      }
      const ratio = merchandiseRefundPaise / merchNetTotal;
      for (const tl of opts.breakdown.taxLines) {
        const lineRefund = Math.round(tl.netInclusiveInPaise * ratio);
        const extracted = gstFromInclusiveLine(lineRefund, tl.gstRatePercent);
        merchandiseTaxableRefundPaise += extracted.taxableMinor;
        merchandiseGstRefundPaise += extracted.taxMinor;
      }
      const computed = merchandiseTaxableRefundPaise + merchandiseGstRefundPaise;
      const drift = merchandiseRefundPaise - computed;
      if (Math.abs(drift) > 2) {
        merchandiseTaxableRefundPaise += drift;
      }
    } else {
      merchandiseTaxableRefundPaise = merchandiseRefundPaise;
    }
  }

  return {
    orderId: opts.orderId,
    orderNumber: opts.orderNumber,
    currency: opts.currency,
    provider: opts.provider,
    refundId: opts.refundId,
    providerRefundId: opts.providerRefundId,
    totalRefundPaise,
    merchandiseTaxableRefundPaise,
    merchandiseGstRefundPaise,
    shippingRefundPaise,
    interState: opts.interState,
    isGstApplicable: opts.isGstApplicable,
    accountingDate: opts.accountingDate,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId
  };
}

/** Build partial refund spec for a single order line delta (adjustment qty/variant decrease). */
export function buildPartialRefundSpecForLineDelta(opts: {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: import("@prisma/client").PaymentProvider;
  refundId: string;
  providerRefundId: string | null;
  sourceType: RefundSourceType;
  sourceId: string;
  interState: boolean;
  isGstApplicable: boolean;
  accountingDate: Date;
  refundMerchandisePaise: number;
  orderItem: {
    id: string;
    lineTotalInPaise: number;
    unitPriceInPaise: number;
    qtyOrdered: number;
    taxClass?: string | null;
  };
  orderDiscountInPaise: number;
  allItems: Array<{
    lineTotalInPaise: number;
    unitPriceInPaise: number;
    qtyOrdered: number;
  }>;
}): PartialRefundSpec {
  const totalRefundPaise = opts.refundMerchandisePaise;
  if (totalRefundPaise <= 0) {
    throw new PartialRefundTaxBreakdownUnavailableError("Adjustment refund delta must be positive");
  }

  let merchandiseTaxableRefundPaise = totalRefundPaise;
  let merchandiseGstRefundPaise = 0;

  if (opts.isGstApplicable) {
    const { lineDiscountsPaise } = allocateOrderDiscountPaise(opts.allItems, opts.orderDiscountInPaise);
    const itemIndex = opts.allItems.findIndex(
      (_, i) =>
        opts.allItems[i]?.lineTotalInPaise === opts.orderItem.lineTotalInPaise &&
        opts.allItems[i]?.qtyOrdered === opts.orderItem.qtyOrdered
    );
    const lineDiscount = itemIndex >= 0 ? (lineDiscountsPaise[itemIndex] ?? 0) : 0;
    const lineNet = opts.orderItem.lineTotalInPaise - lineDiscount;
    if (lineNet <= 0) {
      throw new PartialRefundTaxBreakdownUnavailableError("Line net after discount is zero");
    }
    const ratio = Math.min(1, totalRefundPaise / lineNet);
    const refundInclusive = Math.round(lineNet * ratio);
    const rate = lookupGstRate(opts.orderItem.taxClass).ratePercent;
    const extracted = gstFromInclusiveLine(refundInclusive, rate);
    merchandiseTaxableRefundPaise = extracted.taxableMinor;
    merchandiseGstRefundPaise = extracted.taxMinor;
    const drift = totalRefundPaise - (merchandiseTaxableRefundPaise + merchandiseGstRefundPaise);
    if (Math.abs(drift) > 2) {
      merchandiseTaxableRefundPaise += drift;
    }
  }

  return {
    orderId: opts.orderId,
    orderNumber: opts.orderNumber,
    currency: opts.currency,
    provider: opts.provider,
    refundId: opts.refundId,
    providerRefundId: opts.providerRefundId,
    totalRefundPaise,
    merchandiseTaxableRefundPaise,
    merchandiseGstRefundPaise,
    shippingRefundPaise: 0,
    interState: opts.interState,
    isGstApplicable: opts.isGstApplicable,
    accountingDate: opts.accountingDate,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId
  };
}

/** Admin manual partial refund — scales remaining refundable breakdown to fixed amount. */
export function buildPartialRefundSpecForFixedAmount(opts: {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: import("@prisma/client").PaymentProvider;
  refundId: string;
  providerRefundId: string | null;
  sourceType: RefundSourceType;
  sourceId: string;
  interState: boolean;
  isGstApplicable: boolean;
  accountingDate: Date;
  amountInPaise: number;
  breakdown: OrderRefundBreakdown;
}): PartialRefundSpec {
  const remaining = opts.breakdown.remainingRefundableAmountPaise;
  if (opts.amountInPaise <= 0 || opts.amountInPaise > remaining) {
    throw new PartialRefundTaxBreakdownUnavailableError(
      `Amount ${opts.amountInPaise} exceeds remaining refundable ${remaining}`
    );
  }

  const totalRefundPaise = opts.amountInPaise;
  const ratio = remaining > 0 ? totalRefundPaise / remaining : 1;

  const shippingRefundPaise = Math.min(
    Math.round(opts.breakdown.refundableShippingPaise * ratio),
    totalRefundPaise
  );
  const merchandiseRefundPaise = totalRefundPaise - shippingRefundPaise;

  if (merchandiseRefundPaise > 0 && opts.breakdown.taxLines.length === 0 && opts.isGstApplicable) {
    throw new PartialRefundTaxBreakdownUnavailableError(
      "Merchandise refund requires authoritative tax line breakdown"
    );
  }

  let merchandiseTaxableRefundPaise = 0;
  let merchandiseGstRefundPaise = 0;

  if (merchandiseRefundPaise > 0) {
    if (opts.isGstApplicable) {
      const merchNetTotal = opts.breakdown.merchandiseNetPaise;
      if (merchNetTotal <= 0) {
        throw new PartialRefundTaxBreakdownUnavailableError("Merchandise net is zero");
      }
      const merchRatio = merchandiseRefundPaise / merchNetTotal;
      for (const tl of opts.breakdown.taxLines) {
        const lineRefund = Math.round(tl.netInclusiveInPaise * merchRatio);
        const extracted = gstFromInclusiveLine(lineRefund, tl.gstRatePercent);
        merchandiseTaxableRefundPaise += extracted.taxableMinor;
        merchandiseGstRefundPaise += extracted.taxMinor;
      }
      const computed = merchandiseTaxableRefundPaise + merchandiseGstRefundPaise;
      const drift = merchandiseRefundPaise - computed;
      if (Math.abs(drift) > 2) {
        merchandiseTaxableRefundPaise += drift;
      }
    } else {
      merchandiseTaxableRefundPaise = merchandiseRefundPaise;
    }
  }

  return {
    orderId: opts.orderId,
    orderNumber: opts.orderNumber,
    currency: opts.currency,
    provider: opts.provider,
    refundId: opts.refundId,
    providerRefundId: opts.providerRefundId,
    totalRefundPaise,
    merchandiseTaxableRefundPaise,
    merchandiseGstRefundPaise,
    shippingRefundPaise,
    interState: opts.interState,
    isGstApplicable: opts.isGstApplicable,
    accountingDate: opts.accountingDate,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId
  };
}
