export type ReconciliationSnapshot = {
  bankAccountId: string;
  glAccountCode: string;
  periodStart: string;
  periodEnd: string;
  bookOpeningBalanceInPaise: number;
  bookDebitTotalInPaise: number;
  bookCreditTotalInPaise: number;
  bookClosingBalanceInPaise: number;
  statementOpeningBalanceInPaise: number | null;
  statementClosingBalanceInPaise: number | null;
  differenceInPaise: number;
  matchedExactCount: number;
  matchedManualCount: number;
  matchedCategorizedCount: number;
  matchedAmountInPaise: number;
  ignoredCount: number;
  ignoredAmountInPaise: number;
  unresolvedCount: number;
  unresolvedAmountInPaise: number;
  lineCount: number;
  reconciledAt: string;
  reconciledByUserId: string | null;
};

export type BookBalancePeriod = {
  bookOpeningBalanceInPaise: number;
  bookDebitTotalInPaise: number;
  bookCreditTotalInPaise: number;
  bookClosingBalanceInPaise: number;
};

export type GatewayControlStatus =
  | "CLEAR"
  | "OUTSTANDING"
  | "DATA_GAP"
  | "SETTLEMENT_NOT_CONFIGURED"
  | "REVIEW_REQUIRED";

export type GatewayControlRow = {
  provider: "RAZORPAY" | "STRIPE" | "PAYPAL" | "COD";
  glCode: string;
  glName: string;
  balanceInPaise: number;
  debitTotalInPaise: number;
  creditTotalInPaise: number;
  postedSourceCount: number;
  lastSettlementAt: string | null;
  lastSettlementUtr: string | null;
  status: GatewayControlStatus;
  warnings: string[];
};
