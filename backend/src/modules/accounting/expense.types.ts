export type ExpenseDuplicateClass =
  | "NO_DUPLICATE"
  | "POSSIBLE_DUPLICATE_BILL_EXPENSE"
  | "DUPLICATE_SUPPLIER_DOCUMENT";

export type ExpenseEligibilityCode =
  | "ELIGIBLE"
  | "DRAFT"
  | "EXPENSE_ACCOUNT_UNMAPPED"
  | "PAYMENT_ACCOUNT_UNMAPPED"
  | "GST_DATA_GAP"
  | "RCM_DATA_GAP"
  | "DUPLICATE_RISK"
  | "MULTI_CURRENCY_DEFERRED"
  | "AMOUNT_SEMANTICS_INVALID"
  | "INVALID_EXPENSE_COA"
  | "INVALID_PAYMENT_ACCOUNT"
  | "ALREADY_POSTED"
  | "ERROR"
  | "DATA_GAP";

export type ExpenseSnapshot = {
  expenseId: string;
  expenseDate: Date;
  status: "DRAFT" | "RECORDED";
  expenseAccount: string;
  mappedExpenseAccountCode: string | null;
  paidThrough: string | null;
  mappedPaymentAccountCode: string | null;
  mappedPaymentBankAccountId: string | null;
  resolvedPaymentGlAccountCode: string | null;
  amountInPaise: number;
  taxInPaise: number;
  taxInclusive: boolean;
  currency: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorGstin: string | null;
  vendorBillingState: string | null;
  vendorBillingCountry: string | null;
  invoiceNumber: string | null;
  referenceNumber: string | null;
  expenseType: string;
  hsnSac: string | null;
  gstTreatment: string | null;
  sourceOfSupply: string | null;
  destinationOfSupply: string | null;
  reverseCharge: boolean;
  notes: string | null;
  sourceFingerprint: string;
  updatedAt: Date;
};

export type ExpenseEligibility = {
  eligible: boolean;
  code: ExpenseEligibilityCode;
  reason?: string;
  warnings: string[];
  requiresDuplicateAck?: boolean;
};

export type ExpenseJournalLineProposal = {
  accountCode: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo: string;
};

export type ExpenseGstDiagnostics = {
  jurisdiction: "NONE" | "INTRA_STATE" | "INTER_STATE" | "UNKNOWN";
  gstRecognized: boolean;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  taxInPaise: number;
  itcStatus: string;
  dataGapCodes: string[];
};

export type ExpenseAmountSemantics = {
  netExpenseInPaise: number;
  taxInPaise: number;
  grossPaymentInPaise: number;
  taxInclusive: boolean;
};

export type ExpenseJournalProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  currency: string;
  memo: string;
  balanced: boolean;
  totalDebitPaise: number;
  totalCreditPaise: number;
  imbalancePaise: number;
  lines: ExpenseJournalLineProposal[];
  diagnostics: {
    amount: ExpenseAmountSemantics;
    gst: ExpenseGstDiagnostics;
    expenseAccountCode: string;
    paymentAccountCode: string;
    duplicateClass: ExpenseDuplicateClass;
    duplicateBillIds: string[];
    warnings: string[];
  };
  reconciliationMetadata: Record<string, unknown>;
};
