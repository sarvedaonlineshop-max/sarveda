import type { PaymentProvider } from "@prisma/client";

import type { ProposedJournalLine } from "./order-paid-journal.types";
import type { OriginalSaleJournalSnapshot } from "./order-refunded-full.types";

export type CodOrderCancelledEligibilityCode =
  | "AUTO_POSTABLE_COD_CANCEL"
  | "NOT_COD"
  | "ORDER_NOT_CANCELLED"
  | "PAYMENT_NOT_UNCOLLECTED"
  | "NO_SALE_JOURNAL"
  | "SALE_CALC_VERSION_UNSUPPORTED"
  | "MONETARY_REFUND_EXISTS"
  | "ALREADY_REVERSED_AS_REFUND";

export type CodOrderCancelledEligibilityResult = {
  eligible: boolean;
  autoPostable: boolean;
  code: CodOrderCancelledEligibilityCode;
  reason: string;
};

export type OrderCancelledJournalProposal = {
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
  diagnostics: {
    reversedFromSale: true;
    originalDiagnostics: OriginalSaleJournalSnapshot["diagnostics"];
    clearingAccountCode: string | null;
    saleClearingDebitPaise: number;
    cancelClearingCreditPaise: number;
  };
  reconciliationMetadata: Record<string, unknown>;
};
