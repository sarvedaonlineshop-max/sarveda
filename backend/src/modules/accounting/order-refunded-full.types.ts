import type { OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";

import type {
  OrderPaidTaxDiagnostics,
  ProposedJournalLine
} from "./order-paid-journal.types";

export type RefundRowSnapshot = {
  id: string;
  paymentId: string;
  amountInPaise: number;
  status: string;
  providerRefundId: string | null;
  reason: string | null;
  createdAt: Date;
};

export type OriginalSaleJournalSnapshot = {
  postingEventId: string;
  uniqueKey: string;
  journalEntryId: string;
  journalEntryNumber: string;
  calcVersion: string;
  lines: ProposedJournalLine[];
  diagnostics: OrderPaidTaxDiagnostics | null;
  reconciliationMetadata: Record<string, unknown> | null;
};

export type OrderRefundContext = {
  orderId: string;
  orderNumber: string;
  currency: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  grandTotalInPaise: number;
  provider: PaymentProvider;
  paymentId: string;
  paymentAmountInPaise: number;
  paymentStatusDetail: PaymentStatus;
  refundedInPaise: number;
  refunds: RefundRowSnapshot[];
  zohoInvoiceId: string | null;
  zohoInvoiceNo: string | null;
  zohoCreditNoteId: string | null;
  zohoCreditNoteNumber: string | null;
  /** Order placement / accounting date for cutover boundary checks. */
  orderPlacedAt: Date;
  originalSale: OriginalSaleJournalSnapshot | null;
};

export type FullRefundEligibilityCode =
  | "AUTO_POSTABLE_FULL"
  | "SALE_JOURNAL_REQUIRED"
  | "PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED"
  | "MANUAL_ACCOUNTING_REVIEW_REQUIRED"
  | "UNPOSTED_PARTIAL"
  | "MULTIPLE_REFUNDS_UNALLOCATED"
  | "CUMULATIVE_FULL_BUT_UNALLOCATED"
  | "DATA_GAP"
  | "ERROR"
  | "COD_NOT_AUTO_POSTABLE"
  | "MISSING_PROVIDER_REFUND_ID"
  | "REFUND_AMOUNT_EXCEEDS_TOTAL"
  | "INCONSISTENT_PAYMENT_STATUS"
  | "NO_AUTHORITATIVE_REFUND"
  | "REFUND_NOT_PROCESSED"
  | "PROVIDER_NOT_SUPPORTED";

export type FullRefundEligibilityResult = {
  eligible: boolean;
  autoPostable: boolean;
  code: FullRefundEligibilityCode;
  reason: string;
  /** Set when a single full refund row is the candidate. */
  candidateRefundId?: string;
  authoritativeRefundCount: number;
  monetaryRefundCount: number;
  monetaryRefundTotalPaise: number;
};

export type OrderRefundedFullJournalProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  reference: string;
  memo: string;
  currency: string;
  provider: PaymentProvider;
  postingEventKey: string;
  lines: ProposedJournalLine[];
  totalDebitPaise: number;
  totalCreditPaise: number;
  imbalancePaise: number;
  balanced: boolean;
  originalSaleUniqueKey: string;
  originalJournalEntryId: string;
  originalCalcVersion: string;
  refundId: string;
  providerRefundId: string | null;
  diagnostics: {
    reversedFromSale: true;
    originalDiagnostics: OrderPaidTaxDiagnostics | null;
    clearingAccountCode: string | null;
    saleClearingDebitPaise: number;
    refundClearingCreditPaise: number;
    clearingReconciliationLabel: "UNSETTLED_PROVISIONAL";
  };
  reconciliationMetadata: Record<string, unknown>;
};
