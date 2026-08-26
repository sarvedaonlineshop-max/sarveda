-- Phase 4C: bank statement import + conservative matching (evidence only)

CREATE TYPE "AccountingBankStatementImportStatus" AS ENUM ('IMPORTED', 'FAILED');
CREATE TYPE "AccountingBankStatementLineMatchStatus" AS ENUM (
  'UNMATCHED',
  'MATCHED_EXACT',
  'MATCHED_MANUAL',
  'POSSIBLE',
  'DUPLICATE',
  'REVIEW_REQUIRED'
);
CREATE TYPE "AccountingBankStatementMatchConfidence" AS ENUM ('EXACT', 'HIGH', 'POSSIBLE');
CREATE TYPE "AccountingBankStatementMatchStatus" AS ENUM ('CANDIDATE', 'CONFIRMED', 'REJECTED');
CREATE TYPE "AccountingBankStatementMatchType" AS ENUM (
  'RAZORPAY_SETTLEMENT',
  'VENDOR_PAYMENT',
  'EXPENSE',
  'BANK_TRANSFER',
  'BANK_OPENING',
  'JOURNAL_OTHER'
);

CREATE TABLE "AccountingBankStatementImport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bankAccountId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "statementFrom" DATE,
  "statementTo" DATE,
  "openingBalanceInPaise" INTEGER,
  "closingBalanceInPaise" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "importStatus" "AccountingBankStatementImportStatus" NOT NULL DEFAULT 'IMPORTED',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "debitTotalInPaise" INTEGER NOT NULL DEFAULT 0,
  "creditTotalInPaise" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "importedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3),

  CONSTRAINT "AccountingBankStatementImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingBankStatementImport_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingBankStatementImport_bankAccountId_fileHash_key"
  ON "AccountingBankStatementImport"("bankAccountId", "fileHash");
CREATE INDEX "AccountingBankStatementImport_bankAccountId_idx"
  ON "AccountingBankStatementImport"("bankAccountId");
CREATE INDEX "AccountingBankStatementImport_importStatus_idx"
  ON "AccountingBankStatementImport"("importStatus");
CREATE INDEX "AccountingBankStatementImport_committedAt_idx"
  ON "AccountingBankStatementImport"("committedAt");

CREATE TABLE "AccountingBankStatementLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "statementImportId" UUID NOT NULL,
  "bankAccountId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "transactionDate" DATE NOT NULL,
  "valueDate" DATE,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "debitInPaise" INTEGER NOT NULL DEFAULT 0,
  "creditInPaise" INTEGER NOT NULL DEFAULT 0,
  "runningBalanceInPaise" INTEGER,
  "transactionFingerprint" TEXT NOT NULL,
  "matchStatus" "AccountingBankStatementLineMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountingBankStatementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingBankStatementLine_statementImportId_fkey"
    FOREIGN KEY ("statementImportId") REFERENCES "AccountingBankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountingBankStatementLine_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingBankStatementLine_bankAccountId_transactionFingerprint_key"
  ON "AccountingBankStatementLine"("bankAccountId", "transactionFingerprint");
CREATE INDEX "AccountingBankStatementLine_statementImportId_idx"
  ON "AccountingBankStatementLine"("statementImportId");
CREATE INDEX "AccountingBankStatementLine_bankAccountId_idx"
  ON "AccountingBankStatementLine"("bankAccountId");
CREATE INDEX "AccountingBankStatementLine_transactionDate_idx"
  ON "AccountingBankStatementLine"("transactionDate");
CREATE INDEX "AccountingBankStatementLine_matchStatus_idx"
  ON "AccountingBankStatementLine"("matchStatus");
CREATE INDEX "AccountingBankStatementLine_reference_idx"
  ON "AccountingBankStatementLine"("reference");

CREATE TABLE "AccountingBankStatementMatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "statementLineId" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "matchType" "AccountingBankStatementMatchType" NOT NULL,
  "confidence" "AccountingBankStatementMatchConfidence" NOT NULL,
  "status" "AccountingBankStatementMatchStatus" NOT NULL DEFAULT 'CANDIDATE',
  "matchedAmountInPaise" INTEGER NOT NULL,
  "bankGlAccountCode" TEXT NOT NULL,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "evidenceJson" JSONB,
  "matchedByUserId" UUID,
  "matchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountingBankStatementMatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingBankStatementMatch_statementLineId_fkey"
    FOREIGN KEY ("statementLineId") REFERENCES "AccountingBankStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountingBankStatementMatch_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccountingBankStatementMatch_statementLineId_idx"
  ON "AccountingBankStatementMatch"("statementLineId");
CREATE INDEX "AccountingBankStatementMatch_journalEntryId_idx"
  ON "AccountingBankStatementMatch"("journalEntryId");
CREATE INDEX "AccountingBankStatementMatch_status_idx"
  ON "AccountingBankStatementMatch"("status");
CREATE INDEX "AccountingBankStatementMatch_confidence_idx"
  ON "AccountingBankStatementMatch"("confidence");
