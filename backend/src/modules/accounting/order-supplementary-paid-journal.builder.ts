import type { PaymentProvider } from "@prisma/client";

import { OrderRefundedPartialJournalImbalanceError } from "./accounting-errors";
import {
  ACCOUNT_CODE,
  CLEARING_ACCOUNT_BY_PROVIDER
} from "./order-paid.constants";
import type { ProposedJournalLine } from "./order-paid-journal.types";
import {
  ORDER_SUPPLEMENTARY_PAID_CALC_VERSION,
  ORDER_SUPPLEMENTARY_PAID_EVENT_TYPE,
  ORDER_SUPPLEMENTARY_PAID_MAX_IMBALANCE_PAISE,
  orderSupplementaryPaidUniqueKey
} from "./order-supplementary-paid.constants";
import { splitOutputGstPaise } from "../../utils/gst-state";

export type SupplementaryPaidSpec = {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: PaymentProvider;
  supplementaryPaymentId: string;
  sourceId: string;
  totalAmountPaise: number;
  merchandiseTaxablePaise: number;
  merchandiseGstPaise: number;
  interState: boolean;
  isGstApplicable: boolean;
  accountingDate: Date;
};

export type OrderSupplementaryPaidJournalProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  reference: string;
  memo: string;
  currency: string;
  provider: PaymentProvider;
  lines: ProposedJournalLine[];
  totalDebitPaise: number;
  totalCreditPaise: number;
  imbalancePaise: number;
  balanced: boolean;
  supplementaryPaymentId: string;
};

const ACCOUNT_NAMES: Record<string, string> = {
  [ACCOUNT_CODE.RAZORPAY_CLEARING]: "Razorpay Clearing",
  [ACCOUNT_CODE.STRIPE_CLEARING]: "Stripe Clearing",
  [ACCOUNT_CODE.PAYPAL_CLEARING]: "PayPal Clearing",
  [ACCOUNT_CODE.PRODUCT_SALES]: "Product Sales",
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

/** Incremental sale journal for supplementary adjustment payment. */
export function buildOrderSupplementaryPaidJournal(
  spec: SupplementaryPaidSpec,
  opts?: { failOnImbalance?: boolean }
): OrderSupplementaryPaidJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const clearingCode = CLEARING_ACCOUNT_BY_PROVIDER[spec.provider];
  const journalLines: ProposedJournalLine[] = [];

  journalLines.push(
    line(
      clearingCode,
      spec.totalAmountPaise,
      0,
      "SupplementaryPaidSpec.totalAmountPaise",
      "Supplementary customer payment"
    )
  );

  if (spec.isGstApplicable) {
    if (spec.merchandiseTaxablePaise > 0) {
      journalLines.push(
        line(
          ACCOUNT_CODE.PRODUCT_SALES,
          0,
          spec.merchandiseTaxablePaise,
          "SupplementaryPaidSpec.merchandiseTaxablePaise"
        )
      );
    }
    if (spec.merchandiseGstPaise > 0) {
      const gstSplit = splitOutputGstPaise(
        spec.merchandiseGstPaise,
        spec.interState ? "INTER_STATE" : "INTRA_STATE"
      );
      if (spec.interState && gstSplit.igstInPaise > 0) {
        journalLines.push(
          line(ACCOUNT_CODE.OUTPUT_IGST, 0, gstSplit.igstInPaise, "SupplementaryPaidSpec.merchandiseGstPaise")
        );
      } else {
        if (gstSplit.cgstInPaise > 0) {
          journalLines.push(
            line(ACCOUNT_CODE.OUTPUT_CGST, 0, gstSplit.cgstInPaise, "SupplementaryPaidSpec.merchandiseGstPaise")
          );
        }
        if (gstSplit.sgstInPaise > 0) {
          journalLines.push(
            line(ACCOUNT_CODE.OUTPUT_SGST, 0, gstSplit.sgstInPaise, "SupplementaryPaidSpec.merchandiseGstPaise")
          );
        }
      }
    }
  } else if (spec.totalAmountPaise > 0) {
    journalLines.push(
      line(
        ACCOUNT_CODE.PRODUCT_SALES,
        0,
        spec.totalAmountPaise,
        "SupplementaryPaidSpec.totalAmountPaise (non-GST)"
      )
    );
  }

  const totalDebitPaise = journalLines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = journalLines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= ORDER_SUPPLEMENTARY_PAID_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new OrderRefundedPartialJournalImbalanceError(
      totalDebitPaise,
      totalCreditPaise,
      imbalancePaise
    );
  }

  const uniqueKey = orderSupplementaryPaidUniqueKey(spec.orderId, spec.supplementaryPaymentId);
  const memo = `${ORDER_SUPPLEMENTARY_PAID_CALC_VERSION} ORDER_SUPPLEMENTARY_PAID ${spec.orderNumber} adj ${spec.supplementaryPaymentId.slice(0, 8)}`;

  return {
    calcVersion: ORDER_SUPPLEMENTARY_PAID_CALC_VERSION,
    eventType: ORDER_SUPPLEMENTARY_PAID_EVENT_TYPE,
    uniqueKey,
    accountingDate: spec.accountingDate,
    reference: spec.orderNumber,
    memo,
    currency: spec.currency,
    provider: spec.provider,
    lines: journalLines,
    totalDebitPaise,
    totalCreditPaise,
    imbalancePaise,
    balanced,
    supplementaryPaymentId: spec.supplementaryPaymentId
  };
}
