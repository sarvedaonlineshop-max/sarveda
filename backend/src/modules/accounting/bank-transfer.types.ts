import type {
  AccountingBankTransferKind,
  AccountingBankTransferStatus
} from "@prisma/client";

export type BankTransferSnapshot = {
  transferId: string;
  transferNumber: string;
  transferDate: Date;
  amountInPaise: number;
  currency: string;
  transferKind: AccountingBankTransferKind;
  sourceBankAccountId: string;
  sourceGlAccountCode: string;
  sourceAccountName: string;
  destinationBankAccountId: string;
  destinationGlAccountCode: string;
  destinationAccountName: string;
  reference: string | null;
  memo: string | null;
  status: AccountingBankTransferStatus;
  sourcePayloadHash: string;
  updatedAt: Date;
};

export type BankTransferJournalLine = {
  accountCode: string;
  debitInPaise: number;
  creditInPaise: number;
  lineMemo: string;
  amountSource: string;
};

export type BankTransferJournalProposal = {
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
  lines: BankTransferJournalLine[];
  diagnostics: Record<string, unknown>;
  reconciliationMetadata: Record<string, unknown>;
};

export type BankOpeningBalanceProposal = {
  calcVersion: string;
  eventType: string;
  uniqueKey: string;
  accountingDate: Date;
  currency: string;
  memo: string;
  balanced: boolean;
  lines: BankTransferJournalLine[];
  bankAccountId: string;
  glAccountCode: string;
  openingAmountInPaise: number;
};
