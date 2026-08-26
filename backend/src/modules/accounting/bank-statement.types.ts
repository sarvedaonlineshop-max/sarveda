import type {
  AccountingBankStatementLineMatchStatus,
  AccountingBankStatementMatchConfidence,
  AccountingBankStatementMatchType
} from "@prisma/client";

/** Normalized ingestion contract — CSV/XLSX today, bank API feeds later. */
export type NormalizedBankTransaction = {
  rowNumber: number;
  transactionDate: Date;
  valueDate: Date | null;
  description: string;
  reference: string | null;
  debitInPaise: number;
  creditInPaise: number;
  runningBalanceInPaise: number | null;
};

export type StatementParseRowError = {
  rowNumber: number;
  code: string;
  message: string;
};

export type StatementPreviewResult = {
  bankAccountId: string;
  fileName: string;
  fileHash: string;
  currency: string;
  detectedColumns: Record<string, string | null>;
  rowCount: number;
  validRowCount: number;
  invalidRows: StatementParseRowError[];
  duplicateRowsInFile: number[];
  statementFrom: string | null;
  statementTo: string | null;
  openingBalanceInPaise: number | null;
  closingBalanceInPaise: number | null;
  debitTotalInPaise: number;
  creditTotalInPaise: number;
  sampleTransactions: Array<{
    rowNumber: number;
    transactionDate: string;
    description: string;
    reference: string | null;
    debitInPaise: number;
    creditInPaise: number;
    runningBalanceInPaise: number | null;
  }>;
  canCommit: boolean;
};

export type StatementMatchCandidate = {
  journalEntryId: string;
  entryNumber: string;
  matchType: AccountingBankStatementMatchType;
  confidence: AccountingBankStatementMatchConfidence;
  matchedAmountInPaise: number;
  bankGlAccountCode: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  evidence: string[];
};

export type StatementLineMatchSummary = {
  lineId: string;
  matchStatus: AccountingBankStatementLineMatchStatus;
  bestConfidence: AccountingBankStatementMatchConfidence | null;
  confirmedMatch: StatementMatchCandidate | null;
  candidates: StatementMatchCandidate[];
};
