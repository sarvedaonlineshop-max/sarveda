import type { PaymentProvider, RefundSourceType } from "@prisma/client";

import type { ProposedJournalLine } from "./order-paid-journal.types";

export type PartialRefundSpec = {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: PaymentProvider;
  refundId: string;
  providerRefundId: string | null;
  totalRefundPaise: number;
  merchandiseTaxableRefundPaise: number;
  merchandiseGstRefundPaise: number;
  shippingRefundPaise: number;
  interState: boolean;
  isGstApplicable: boolean;
  accountingDate: Date;
  sourceType: RefundSourceType;
  sourceId: string;
};

export type OrderRefundedPartialJournalProposal = {
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
  refundId: string;
  providerRefundId: string | null;
  diagnostics: Record<string, unknown>;
  reconciliationMetadata: Record<string, unknown>;
};
