export type RazorpaySettlementHeader = {
  id: string;
  entity?: string;
  amount: number;
  status?: string;
  fees?: number;
  tax?: number;
  utr?: string | null;
  created_at: number;
};

export type RazorpaySettlementReconLine = {
  entity_id: string;
  type: string;
  debit?: number;
  credit?: number;
  amount?: number;
  currency?: string;
  fee?: number;
  tax?: number;
  settled?: boolean;
  created_at?: number;
  settled_at?: number;
  settlement_id?: string;
  settlement_utr?: string | null;
  payment_id?: string | null;
  order_id?: string | null;
  description?: string | null;
  [key: string]: unknown;
};

export type SettlementLineMappingStatus =
  | "MAPPED"
  | "UNMAPPED"
  | "DATA_GAP"
  | "UNMAPPED_PAYMENT"
  | "UNMAPPED_REFUND"
  | "UNKNOWN_ADJUSTMENT";

export type SettlementLineType =
  | "PAYMENT"
  | "REFUND"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "UNKNOWN";

export type MappedSettlementLine = {
  lineType: SettlementLineType;
  providerEntityId: string;
  amountInPaise: number;
  feeInPaise: number;
  taxInPaise: number;
  debitInPaise: number;
  creditInPaise: number;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  paymentId: string | null;
  orderId: string | null;
  mappingStatus: SettlementLineMappingStatus;
  rawPayload: Record<string, unknown>;
  sortOrder: number;
};

export type SettlementImportBundle = {
  provider: "RAZORPAY";
  providerSettlementId: string;
  currency: string;
  settledAt: Date;
  utr: string | null;
  grossInPaise: number;
  feeInPaise: number;
  taxInPaise: number;
  netInPaise: number;
  sourcePayloadHash: string;
  header: RazorpaySettlementHeader;
  reconLines: RazorpaySettlementReconLine[];
  mappedLines: MappedSettlementLine[];
};

export type SettlementJournalDiagnostics = {
  paymentClearingReleasePaise: number;
  refundClearingRecoveryPaise: number;
  adjustmentNetPaise: number;
  feeInPaise: number;
  taxInPaise: number;
  feeAndTaxExpensedPaise: number;
  feeTaxMode?: "FEE_INCLUSIVE_OF_TAX" | "TAX_EXCLUSIVE" | "UNKNOWN";
  netBankPaise: number;
  expectedDebitPaise: number;
  expectedCreditPaise: number;
  arithmeticIdentityHolds: boolean;
  unexplainedLines: Array<{ providerEntityId: string; lineType: string; mappingStatus: string }>;
  gstItcStatus: string;
};

export type ProposedSettlementJournalLine = {
  accountCode: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo: string;
  amountSource: string;
};

export type SettlementJournalProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  currency: string;
  memo: string;
  balanced: boolean;
  imbalancePaise: number;
  totalDebitPaise: number;
  totalCreditPaise: number;
  lines: ProposedSettlementJournalLine[];
  diagnostics: SettlementJournalDiagnostics;
  providerSettlementId: string;
  utr: string | null;
};
