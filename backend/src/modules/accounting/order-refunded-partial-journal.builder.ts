import type { PaymentProvider } from "@prisma/client";

import { OrderRefundedPartialJournalImbalanceError } from "./accounting-errors";
import { ACCOUNT_CODE, CLEARING_ACCOUNT_BY_PROVIDER } from "./order-paid.constants";
import type { ProposedJournalLine } from "./order-paid-journal.types";
import {
  ORDER_REFUNDED_PARTIAL_CALC_VERSION,
  ORDER_REFUNDED_PARTIAL_EVENT_TYPE,
  ORDER_REFUNDED_PARTIAL_MAX_IMBALANCE_PAISE,
  orderRefundedPartialUniqueKey
} from "./order-refunded-partial.constants";
import type {
  OrderRefundedPartialJournalProposal,
  PartialRefundSpec
} from "./order-refunded-partial.types";
import { splitOutputGstPaise } from "../../utils/gst-state";

const ACCOUNT_NAMES: Record<string, string> = {
  [ACCOUNT_CODE.RAZORPAY_CLEARING]: "Razorpay Clearing",
  [ACCOUNT_CODE.STRIPE_CLEARING]: "Stripe Clearing",
  [ACCOUNT_CODE.PAYPAL_CLEARING]: "PayPal Clearing",
  [ACCOUNT_CODE.PRODUCT_SALES]: "Product Sales",
  [ACCOUNT_CODE.SHIPPING_INCOME]: "Shipping Income",
  [ACCOUNT_CODE.OUTPUT_CGST]: "Output CGST",
  [ACCOUNT_CODE.OUTPUT_SGST]: "Output SGST",
  [ACCOUNT_CODE.OUTPUT_IGST]: "Output IGST"
};

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
 * Pure ORDER_REFUNDED_PARTIAL journal builder — reverses only the refunded economic slice.
 */
export function buildOrderRefundedPartialJournal(
  spec: PartialRefundSpec,
  opts?: { failOnImbalance?: boolean }
): OrderRefundedPartialJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const clearingCode = CLEARING_ACCOUNT_BY_PROVIDER[spec.provider];
  const journalLines: ProposedJournalLine[] = [];

  journalLines.push(
    line(
      clearingCode,
      0,
      spec.totalRefundPaise,
      "PartialRefundSpec.totalRefundPaise",
      "Partial refund to customer"
    )
  );

  if (spec.isGstApplicable) {
    if (spec.merchandiseTaxableRefundPaise > 0) {
      journalLines.push(
        line(
          ACCOUNT_CODE.PRODUCT_SALES,
          spec.merchandiseTaxableRefundPaise,
          0,
          "PartialRefundSpec.merchandiseTaxableRefundPaise"
        )
      );
    }
    if (spec.merchandiseGstRefundPaise > 0) {
      const gstSplit = splitOutputGstPaise(
        spec.merchandiseGstRefundPaise,
        spec.interState ? "INTER_STATE" : "INTRA_STATE"
      );
      if (spec.interState && gstSplit.igstInPaise > 0) {
        journalLines.push(
          line(ACCOUNT_CODE.OUTPUT_IGST, gstSplit.igstInPaise, 0, "PartialRefundSpec.merchandiseGstRefundPaise")
        );
      } else {
        if (gstSplit.cgstInPaise > 0) {
          journalLines.push(
            line(ACCOUNT_CODE.OUTPUT_CGST, gstSplit.cgstInPaise, 0, "PartialRefundSpec.merchandiseGstRefundPaise")
          );
        }
        if (gstSplit.sgstInPaise > 0) {
          journalLines.push(
            line(ACCOUNT_CODE.OUTPUT_SGST, gstSplit.sgstInPaise, 0, "PartialRefundSpec.merchandiseGstRefundPaise")
          );
        }
      }
    }
  } else if (spec.merchandiseTaxableRefundPaise > 0) {
    journalLines.push(
      line(
        ACCOUNT_CODE.PRODUCT_SALES,
        spec.totalRefundPaise - spec.shippingRefundPaise,
        0,
        "PartialRefundSpec.merchandise (non-GST)"
      )
    );
  }

  if (spec.shippingRefundPaise > 0) {
    journalLines.push(
      line(
        ACCOUNT_CODE.SHIPPING_INCOME,
        spec.shippingRefundPaise,
        0,
        "PartialRefundSpec.shippingRefundPaise"
      )
    );
  }

  const totalDebitPaise = journalLines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = journalLines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= ORDER_REFUNDED_PARTIAL_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new OrderRefundedPartialJournalImbalanceError(
      totalDebitPaise,
      totalCreditPaise,
      imbalancePaise
    );
  }

  const uniqueKey = orderRefundedPartialUniqueKey(spec.orderId, spec.refundId);
  const memo = `${ORDER_REFUNDED_PARTIAL_CALC_VERSION} ORDER_REFUNDED_PARTIAL ${spec.orderNumber} refund ${spec.refundId.slice(0, 8)}`;

  return {
    calcVersion: ORDER_REFUNDED_PARTIAL_CALC_VERSION,
    eventType: ORDER_REFUNDED_PARTIAL_EVENT_TYPE,
    uniqueKey,
    accountingDate: spec.accountingDate,
    reference: spec.orderNumber,
    memo,
    currency: spec.currency,
    provider: spec.provider,
    postingEventKey: uniqueKey,
    lines: journalLines,
    totalDebitPaise,
    totalCreditPaise,
    imbalancePaise,
    balanced,
    refundId: spec.refundId,
    providerRefundId: spec.providerRefundId,
    diagnostics: {
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      totalRefundPaise: spec.totalRefundPaise,
      merchandiseTaxableRefundPaise: spec.merchandiseTaxableRefundPaise,
      merchandiseGstRefundPaise: spec.merchandiseGstRefundPaise,
      shippingRefundPaise: spec.shippingRefundPaise,
      interState: spec.interState,
      clearingReconciliationLabel: "UNSETTLED_PROVISIONAL"
    },
    reconciliationMetadata: {
      calcVersion: ORDER_REFUNDED_PARTIAL_CALC_VERSION,
      orderId: spec.orderId,
      orderNumber: spec.orderNumber,
      refundId: spec.refundId,
      providerRefundId: spec.providerRefundId,
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      refundAmountInPaise: spec.totalRefundPaise
    }
  };
}
