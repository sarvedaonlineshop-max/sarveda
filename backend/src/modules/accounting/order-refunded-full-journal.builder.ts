import { CLEARING_ACCOUNT_BY_PROVIDER } from "./order-paid.constants";
import type { ProposedJournalLine } from "./order-paid-journal.types";
import { OrderRefundedFullJournalImbalanceError } from "./accounting-errors";
import {
  ORDER_REFUNDED_FULL_CALC_VERSION,
  ORDER_REFUNDED_FULL_EVENT_TYPE,
  ORDER_REFUNDED_FULL_MAX_IMBALANCE_PAISE,
  orderRefundedFullUniqueKey
} from "./order-refunded-full.constants";
import type {
  OrderRefundedFullJournalProposal,
  OriginalSaleJournalSnapshot,
  RefundRowSnapshot
} from "./order-refunded-full.types";
import type { PaymentProvider } from "@prisma/client";

function invertLine(line: ProposedJournalLine): ProposedJournalLine {
  return {
    accountCode: line.accountCode,
    accountName: line.accountName,
    debitInPaise: line.creditInPaise,
    creditInPaise: line.debitInPaise,
    amountSource: `invert:${line.amountSource}`,
    lineMemo: line.lineMemo
      ? `Refund reverse: ${line.lineMemo}`
      : `Refund reverse of ${line.accountCode}`
  };
}

export type BuildOrderRefundedFullInput = {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: PaymentProvider;
  accountingDate: Date;
  refund: RefundRowSnapshot;
  originalSale: OriginalSaleJournalSnapshot;
};

/**
 * Pure ORDER_REFUNDED_FULL journal builder — no DB writes.
 * Inverts posted ORDER_PAID_V1 lines exactly (economic reverse).
 */
export function buildOrderRefundedFullJournal(
  input: BuildOrderRefundedFullInput,
  opts?: { failOnImbalance?: boolean }
): OrderRefundedFullJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const { originalSale, refund, orderId, orderNumber, currency, provider, accountingDate } =
    input;

  if (originalSale.lines.length === 0) {
    throw new OrderRefundedFullJournalImbalanceError(0, 0, 0);
  }

  const lines = originalSale.lines.map(invertLine);
  const totalDebitPaise = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = lines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= ORDER_REFUNDED_FULL_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new OrderRefundedFullJournalImbalanceError(
      totalDebitPaise,
      totalCreditPaise,
      imbalancePaise
    );
  }

  const clearingCode = CLEARING_ACCOUNT_BY_PROVIDER[provider];
  const saleClearingDebit =
    originalSale.lines.find((l) => l.accountCode === clearingCode)?.debitInPaise ?? 0;
  const refundClearingCredit =
    lines.find((l) => l.accountCode === clearingCode)?.creditInPaise ?? 0;

  const uniqueKey = orderRefundedFullUniqueKey(orderId);
  const memo = `${ORDER_REFUNDED_FULL_CALC_VERSION} ORDER_REFUNDED_FULL ${orderNumber} (reverse ${originalSale.calcVersion})`;

  return {
    calcVersion: ORDER_REFUNDED_FULL_CALC_VERSION,
    eventType: ORDER_REFUNDED_FULL_EVENT_TYPE,
    uniqueKey,
    accountingDate,
    reference: orderNumber,
    memo,
    currency,
    provider,
    postingEventKey: uniqueKey,
    lines,
    totalDebitPaise,
    totalCreditPaise,
    imbalancePaise,
    balanced,
    originalSaleUniqueKey: originalSale.uniqueKey,
    originalJournalEntryId: originalSale.journalEntryId,
    originalCalcVersion: originalSale.calcVersion,
    refundId: refund.id,
    providerRefundId: refund.providerRefundId,
    diagnostics: {
      reversedFromSale: true,
      originalDiagnostics: originalSale.diagnostics,
      clearingAccountCode: clearingCode,
      saleClearingDebitPaise: saleClearingDebit,
      refundClearingCreditPaise: refundClearingCredit,
      clearingReconciliationLabel: "UNSETTLED_PROVISIONAL"
    },
    reconciliationMetadata: {
      calcVersion: ORDER_REFUNDED_FULL_CALC_VERSION,
      orderId,
      orderNumber,
      refundId: refund.id,
      providerRefundId: refund.providerRefundId,
      originalUniqueKey: originalSale.uniqueKey,
      originalJournalEntryId: originalSale.journalEntryId,
      originalCalcVersion: originalSale.calcVersion,
      paymentProvider: provider,
      refundAmountInPaise: refund.amountInPaise,
      accountingDateSource: "Refund.createdAt"
    }
  };
}
