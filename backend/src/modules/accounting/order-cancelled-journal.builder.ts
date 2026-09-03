import { CLEARING_ACCOUNT_BY_PROVIDER } from "./order-paid.constants";
import { OrderCancelledJournalImbalanceError } from "./accounting-errors";
import { invertPostedSaleLines } from "./journal-invert";
import {
  ORDER_CANCELLED_CALC_VERSION,
  ORDER_CANCELLED_EVENT_TYPE,
  ORDER_CANCELLED_MAX_IMBALANCE_PAISE,
  orderCancelledUniqueKey
} from "./order-cancelled.constants";
import type { OrderCancelledJournalProposal } from "./order-cancelled.types";
import type { OriginalSaleJournalSnapshot } from "./order-refunded-full.types";
import type { PaymentProvider } from "@prisma/client";

export type BuildOrderCancelledInput = {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: PaymentProvider;
  accountingDate: Date;
  originalSale: OriginalSaleJournalSnapshot;
};

/**
 * Pure ORDER_CANCELLED journal builder — no DB writes.
 * Inverts posted ORDER_PAID_V1 lines exactly (economic reverse of uncollected COD sale).
 */
export function buildOrderCancelledJournal(
  input: BuildOrderCancelledInput,
  opts?: { failOnImbalance?: boolean }
): OrderCancelledJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const { originalSale, orderId, orderNumber, currency, provider, accountingDate } = input;

  if (originalSale.lines.length === 0) {
    throw new OrderCancelledJournalImbalanceError(0, 0, 0);
  }

  const lines = invertPostedSaleLines(originalSale.lines, "Cancel reverse");
  const totalDebitPaise = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditPaise = lines.reduce((s, l) => s + l.creditInPaise, 0);
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced = Math.abs(imbalancePaise) <= ORDER_CANCELLED_MAX_IMBALANCE_PAISE;

  if (failOnImbalance && !balanced) {
    throw new OrderCancelledJournalImbalanceError(
      totalDebitPaise,
      totalCreditPaise,
      imbalancePaise
    );
  }

  const clearingCode = CLEARING_ACCOUNT_BY_PROVIDER[provider];
  const saleClearingDebit =
    originalSale.lines.find((l) => l.accountCode === clearingCode)?.debitInPaise ?? 0;
  const cancelClearingCredit =
    lines.find((l) => l.accountCode === clearingCode)?.creditInPaise ?? 0;

  const uniqueKey = orderCancelledUniqueKey(orderId);
  const memo = `${ORDER_CANCELLED_CALC_VERSION} ORDER_CANCELLED ${orderNumber} (reverse ${originalSale.calcVersion})`;

  return {
    calcVersion: ORDER_CANCELLED_CALC_VERSION,
    eventType: ORDER_CANCELLED_EVENT_TYPE,
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
    diagnostics: {
      reversedFromSale: true,
      originalDiagnostics: originalSale.diagnostics,
      clearingAccountCode: clearingCode,
      saleClearingDebitPaise: saleClearingDebit,
      cancelClearingCreditPaise: cancelClearingCredit
    },
    reconciliationMetadata: {
      calcVersion: ORDER_CANCELLED_CALC_VERSION,
      orderId,
      orderNumber,
      originalUniqueKey: originalSale.uniqueKey,
      originalJournalEntryId: originalSale.journalEntryId,
      originalCalcVersion: originalSale.calcVersion,
      paymentProvider: provider,
      accountingDateSource: "OrderStatusHistory.CANCELLED"
    }
  };
}
