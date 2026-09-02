import { allocateOrderDiscountPaise, nativeMerchandiseNetPaise } from "../accounting/discount-allocation";
import { capturedAmountInPaise } from "../payments/refund-sync.service";
import { gstFromInclusiveLine, lookupGstRate } from "../../utils/gst";

import type {
  OrderRefundBreakdown,
  OrderRefundCalculatorInput,
  OrderRefundTaxLineBreakdown,
  RefundCalculatorPolicy
} from "./order-refund-calculator.types";

const POLICY_LABELS: Record<RefundCalculatorPolicy, string> = {
  FULL_PRE_DISPATCH_CANCELLATION: "Full cancellation before dispatch",
  DISPATCHED_SHIPPING_RETAINED: "Product refund — shipping retained (dispatched / in transit)",
  RTO_SHIPPING_RETAINED: "Product refund — shipping retained (RTO / not delivered)",
  COD_CANCELLATION: "COD cancellation — no gateway refund"
};

function computeMerchandiseTaxLines(
  items: OrderRefundCalculatorInput["items"],
  discountInPaise: number,
  isGstApplicable: boolean
): { lines: OrderRefundTaxLineBreakdown[]; totalGstPaise: number } {
  const allocationItems = items.map((item) => ({
    lineTotalInPaise: item.lineTotalInPaise,
    unitPriceInPaise: item.unitPriceInPaise,
    qtyOrdered: item.qtyOrdered
  }));
  const { lineDiscountsPaise } = allocateOrderDiscountPaise(allocationItems, discountInPaise);

  let totalGstPaise = 0;
  const lines: OrderRefundTaxLineBreakdown[] = items.map((item, index) => {
    const discountPaise = lineDiscountsPaise[index] ?? 0;
    const netInclusiveInPaise = item.lineTotalInPaise - discountPaise;
    const rate = isGstApplicable ? lookupGstRate(item.taxClass).ratePercent : 0;
    const extracted = isGstApplicable
      ? gstFromInclusiveLine(netInclusiveInPaise, rate)
      : { taxableMinor: netInclusiveInPaise, taxMinor: 0 };
    totalGstPaise += extracted.taxMinor;
    return {
      orderItemId: item.id,
      netInclusiveInPaise,
      taxableInPaise: extracted.taxableMinor,
      gstInPaise: extracted.taxMinor,
      gstRatePercent: rate
    };
  });

  return { lines, totalGstPaise };
}

function gatewayCapturedAmountPaise(
  order: OrderRefundCalculatorInput["order"],
  payment: OrderRefundCalculatorInput["payment"]
): number {
  if (!payment || payment.provider === "COD") return 0;
  if (!["CAPTURED", "PARTIALLY_REFUNDED"].includes(payment.status)) return 0;
  return capturedAmountInPaise({
    amountInPaise: payment.amountInPaise,
    order: { grandTotalInPaise: order.grandTotalInPaise }
  });
}

/**
 * Pure refund calculator — no DB, providers, inventory, or accounting side effects.
 */
export function calculateOrderRefund(input: OrderRefundCalculatorInput): OrderRefundBreakdown {
  const { order, items, payment, policy } = input;
  const warnings: string[] = [];
  const isGstApplicable =
    input.isGstApplicable ??
    (order.currency === "INR" && order.grandTotalInPaise > 0);

  const customerPaidAmountPaise = order.grandTotalInPaise;
  const capturedAmountPaise = gatewayCapturedAmountPaise(order, payment);
  const alreadyRefundedAmountPaise = payment?.refundedInPaise ?? 0;
  const remainingRefundableAmountPaise = Math.max(
    0,
    capturedAmountPaise - alreadyRefundedAmountPaise
  );

  const merchandiseGrossPaise = order.subtotalInPaise;
  const merchandiseDiscountPaise = order.discountInPaise;
  const merchandiseNetPaise = nativeMerchandiseNetPaise(
    items.map((item) => ({
      lineTotalInPaise: item.lineTotalInPaise,
      unitPriceInPaise: item.unitPriceInPaise,
      qtyOrdered: item.qtyOrdered
    })),
    order.discountInPaise
  );

  const shippingGrossPaise = order.shippingInPaise;
  const shippingDiscountPaise = 0;
  const shippingNetPaise = order.shippingInPaise;

  const componentsSumPaise = merchandiseNetPaise + shippingNetPaise + order.taxInPaise;
  if (componentsSumPaise !== order.grandTotalInPaise) {
    return {
      capturedAmountPaise,
      customerPaidAmountPaise,
      alreadyRefundedAmountPaise,
      remainingRefundableAmountPaise,
      merchandiseGrossPaise,
      merchandiseDiscountPaise,
      merchandiseNetPaise,
      shippingGrossPaise,
      shippingDiscountPaise,
      shippingNetPaise,
      taxMerchandisePaise: 0,
      taxShippingPaise: 0,
      taxLines: [],
      refundableMerchandisePaise: 0,
      refundableShippingPaise: 0,
      retainedShippingPaise: 0,
      proposedRefundAmountPaise: 0,
      policyMaximumRefundableAmountPaise: 0,
      policy,
      explanation: POLICY_LABELS[policy],
      warnings,
      unavailableCode: "REFUND_BREAKDOWN_UNAVAILABLE",
      unavailableReason: `Order components (${componentsSumPaise} paise) do not reconcile to grand total (${order.grandTotalInPaise} paise)`
    };
  }

  const { lines: taxLines, totalGstPaise: taxMerchandisePaise } = computeMerchandiseTaxLines(
    items,
    order.discountInPaise,
    isGstApplicable
  );
  const taxShippingPaise = 0;

  if (policy === "COD_CANCELLATION") {
    return {
      capturedAmountPaise: 0,
      customerPaidAmountPaise,
      alreadyRefundedAmountPaise: 0,
      remainingRefundableAmountPaise: 0,
      merchandiseGrossPaise,
      merchandiseDiscountPaise,
      merchandiseNetPaise,
      shippingGrossPaise,
      shippingDiscountPaise,
      shippingNetPaise,
      taxMerchandisePaise,
      taxShippingPaise,
      taxLines,
      refundableMerchandisePaise: merchandiseNetPaise,
      refundableShippingPaise: shippingNetPaise,
      retainedShippingPaise: 0,
      proposedRefundAmountPaise: 0,
      policyMaximumRefundableAmountPaise: 0,
      policy,
      explanation:
        "COD order — no online payment was captured. Stock/fulfilment cancellation only; any cash settlement is manual.",
      warnings
    };
  }

  if (capturedAmountPaise <= 0) {
    return {
      capturedAmountPaise,
      customerPaidAmountPaise,
      alreadyRefundedAmountPaise,
      remainingRefundableAmountPaise: 0,
      merchandiseGrossPaise,
      merchandiseDiscountPaise,
      merchandiseNetPaise,
      shippingGrossPaise,
      shippingDiscountPaise,
      shippingNetPaise,
      taxMerchandisePaise,
      taxShippingPaise,
      taxLines,
      refundableMerchandisePaise: 0,
      refundableShippingPaise: 0,
      retainedShippingPaise: 0,
      proposedRefundAmountPaise: 0,
      policyMaximumRefundableAmountPaise: 0,
      policy,
      explanation: POLICY_LABELS[policy],
      warnings,
      unavailableCode: "NO_CAPTURED_PAYMENT",
      unavailableReason: "No captured gateway payment on this order"
    };
  }

  if (policy === "FULL_PRE_DISPATCH_CANCELLATION") {
    const proposedRefundAmountPaise = remainingRefundableAmountPaise;
    return {
      capturedAmountPaise,
      customerPaidAmountPaise,
      alreadyRefundedAmountPaise,
      remainingRefundableAmountPaise,
      merchandiseGrossPaise,
      merchandiseDiscountPaise,
      merchandiseNetPaise,
      shippingGrossPaise,
      shippingDiscountPaise,
      shippingNetPaise,
      taxMerchandisePaise,
      taxShippingPaise,
      taxLines,
      refundableMerchandisePaise: merchandiseNetPaise,
      refundableShippingPaise: shippingNetPaise,
      retainedShippingPaise: 0,
      proposedRefundAmountPaise,
      policyMaximumRefundableAmountPaise: remainingRefundableAmountPaise,
      policy,
      explanation:
        "Full refund of the remaining captured amount (merchandise after discount + customer shipping charge).",
      warnings
    };
  }

  if (
    policy === "DISPATCHED_SHIPPING_RETAINED" ||
    policy === "RTO_SHIPPING_RETAINED"
  ) {
    warnings.push("PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED");
    const policyMaximumRefundableAmountPaise = Math.min(
      merchandiseNetPaise,
      remainingRefundableAmountPaise
    );
    const proposedRefundAmountPaise = policyMaximumRefundableAmountPaise;
    return {
      capturedAmountPaise,
      customerPaidAmountPaise,
      alreadyRefundedAmountPaise,
      remainingRefundableAmountPaise,
      merchandiseGrossPaise,
      merchandiseDiscountPaise,
      merchandiseNetPaise,
      shippingGrossPaise,
      shippingDiscountPaise,
      shippingNetPaise,
      taxMerchandisePaise,
      taxShippingPaise,
      taxLines,
      refundableMerchandisePaise: merchandiseNetPaise,
      refundableShippingPaise: 0,
      retainedShippingPaise: shippingNetPaise,
      proposedRefundAmountPaise,
      policyMaximumRefundableAmountPaise,
      policy,
      explanation:
        policy === "RTO_SHIPPING_RETAINED"
          ? "Refund merchandise value paid by customer; retain the customer shipping charge. Preview only — RTO receipt workflow required before execution (Phase 1C)."
          : "Refund merchandise value paid by customer; retain the customer shipping charge. Does not reopen customer self-cancel after dispatch.",
      warnings
    };
  }

  return {
    capturedAmountPaise,
    customerPaidAmountPaise,
    alreadyRefundedAmountPaise,
    remainingRefundableAmountPaise,
    merchandiseGrossPaise,
    merchandiseDiscountPaise,
    merchandiseNetPaise,
    shippingGrossPaise,
    shippingDiscountPaise,
    shippingNetPaise,
    taxMerchandisePaise,
    taxShippingPaise,
    taxLines,
    refundableMerchandisePaise: 0,
    refundableShippingPaise: 0,
    retainedShippingPaise: 0,
    proposedRefundAmountPaise: 0,
    policyMaximumRefundableAmountPaise: 0,
    policy,
    explanation: POLICY_LABELS[policy],
    warnings,
    unavailableCode: "REFUND_BREAKDOWN_UNAVAILABLE",
    unavailableReason: `Unknown policy ${policy}`
  };
}

/** Hard cap for manual/partial refund amounts — never exceeds gateway remainder or policy max. */
export function capRefundAmountToPolicy(
  breakdown: OrderRefundBreakdown,
  requestedAmountPaise: number
): { allowedAmountPaise: number; capped: boolean } {
  const ceiling = Math.min(
    breakdown.remainingRefundableAmountPaise,
    breakdown.policyMaximumRefundableAmountPaise > 0
      ? breakdown.policyMaximumRefundableAmountPaise
      : breakdown.remainingRefundableAmountPaise
  );
  if (requestedAmountPaise <= ceiling) {
    return { allowedAmountPaise: requestedAmountPaise, capped: false };
  }
  return { allowedAmountPaise: ceiling, capped: true };
}
