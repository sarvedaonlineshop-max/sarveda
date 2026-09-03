export type RefundCalculatorPolicy =
  | "FULL_PRE_DISPATCH_CANCELLATION"
  | "DISPATCHED_SHIPPING_RETAINED"
  | "RTO_SHIPPING_RETAINED"
  | "COD_CANCELLATION";

export type RefundCalculatorUnavailableCode =
  | "REFUND_BREAKDOWN_UNAVAILABLE"
  | "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED"
  | "PARTIAL_REFUND_ACCOUNTING_REVIEW_REQUIRED"
  | "NO_CAPTURED_PAYMENT"
  | "FULLY_REFUNDED";

export type OrderRefundTaxLineBreakdown = {
  orderItemId: string;
  netInclusiveInPaise: number;
  taxableInPaise: number;
  gstInPaise: number;
  gstRatePercent: number;
};

export type OrderRefundBreakdown = {
  capturedAmountPaise: number;
  customerPaidAmountPaise: number;
  alreadyRefundedAmountPaise: number;
  remainingRefundableAmountPaise: number;

  merchandiseGrossPaise: number;
  merchandiseDiscountPaise: number;
  merchandiseNetPaise: number;

  shippingGrossPaise: number;
  shippingDiscountPaise: number;
  shippingNetPaise: number;

  taxMerchandisePaise: number;
  taxShippingPaise: number;
  taxLines: OrderRefundTaxLineBreakdown[];

  refundableMerchandisePaise: number;
  refundableShippingPaise: number;
  retainedShippingPaise: number;

  proposedRefundAmountPaise: number;
  policyMaximumRefundableAmountPaise: number;

  /** True only when a NEW gateway refund may still be executed. */
  refundEligible: boolean;

  policy: RefundCalculatorPolicy;
  explanation: string;
  warnings: string[];
  unavailableCode?: RefundCalculatorUnavailableCode;
  unavailableReason?: string;
};

export type OrderRefundCalculatorItem = {
  id: string;
  lineTotalInPaise: number;
  unitPriceInPaise: number;
  qtyOrdered: number;
  taxClass?: string | null;
};

export type OrderRefundCalculatorPayment = {
  id: string;
  provider: string;
  status: string;
  amountInPaise: number;
  refundedInPaise: number;
};

export type OrderRefundCalculatorOrder = {
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  grandTotalInPaise: number;
  currency: string;
};

export type OrderRefundCalculatorInput = {
  order: OrderRefundCalculatorOrder;
  items: OrderRefundCalculatorItem[];
  payment: OrderRefundCalculatorPayment | null;
  policy: RefundCalculatorPolicy;
  isGstApplicable?: boolean;
};
