import type {
  AccountingVendorPaymentMethod,
  AccountingVendorPaymentStatus
} from "@prisma/client";

export type VendorPaymentAllocationInput = {
  vendorBillId: string;
  amountInPaise: number;
};

export type VendorPaymentAllocationSnapshot = {
  vendorBillId: string;
  billNumber: string;
  amountInPaise: number;
  nativeOutstandingBeforeInPaise: number;
};

export type VendorPaymentSnapshot = {
  paymentId: string;
  paymentNumber: string;
  vendorId: string;
  vendorName: string;
  paymentDate: Date;
  amountInPaise: number;
  currency: string;
  paymentMethod: AccountingVendorPaymentMethod;
  paidAccountCode: string;
  creditGlAccountCode: string;
  bankAccountId: string | null;
  utr: string | null;
  notes: string | null;
  status: AccountingVendorPaymentStatus;
  sourcePayloadHash: string;
  allocations: VendorPaymentAllocationSnapshot[];
  updatedAt: Date;
};

export type VendorPaymentJournalLine = {
  accountCode: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo: string;
  amountSource: string;
};

export type VendorPaymentJournalProposal = {
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
  lines: VendorPaymentJournalLine[];
  diagnostics: {
    apDebitInPaise: number;
    cashBankCreditInPaise: number;
    paidAccountCode: string;
    creditGlAccountCode: string;
    bankAccountId: string | null;
    paymentMethod: AccountingVendorPaymentMethod;
    allocationCount: number;
    warnings: string[];
  };
  reconciliationMetadata: Record<string, unknown>;
};
