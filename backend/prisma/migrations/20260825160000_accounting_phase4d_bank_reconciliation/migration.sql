-- Phase 4D: bank reconciliation + statement line categorization + CoA 5390/4500

CREATE TYPE "AccountingBankReconciliationStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'RECONCILED',
  'REOPENED'
);

CREATE TYPE "AccountingBankStatementLineCategory" AS ENUM (
  'BANK_CHARGE',
  'BANK_INTEREST',
  'IGNORE',
  'UNKNOWN',
  'POSSIBLE_DUPLICATE_GATEWAY_FEE'
);

ALTER TYPE "AccountingBankStatementLineMatchStatus" ADD VALUE 'IGNORED';
ALTER TYPE "AccountingBankStatementLineMatchStatus" ADD VALUE 'MATCHED_CATEGORIZED';

ALTER TYPE "AccountingBankStatementMatchType" ADD VALUE 'BANK_CHARGE';
ALTER TYPE "AccountingBankStatementMatchType" ADD VALUE 'BANK_INTEREST';

CREATE TABLE "AccountingBankReconciliation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bankAccountId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementImportId" UUID,
    "statementOpeningBalanceInPaise" INTEGER,
    "statementClosingBalanceInPaise" INTEGER,
    "bookOpeningBalanceInPaise" INTEGER NOT NULL DEFAULT 0,
    "bookClosingBalanceInPaise" INTEGER NOT NULL DEFAULT 0,
    "bookDebitTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "bookCreditTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "differenceInPaise" INTEGER NOT NULL DEFAULT 0,
    "status" "AccountingBankReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "snapshotJson" JSONB,
    "reconciledAt" TIMESTAMP(3),
    "reconciledByUserId" UUID,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" UUID,
    "reopenReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingBankReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingBankReconciliation_bank_period_key"
  ON "AccountingBankReconciliation"("bankAccountId", "periodStart", "periodEnd");

CREATE INDEX "AccountingBankReconciliation_bankAccountId_idx"
  ON "AccountingBankReconciliation"("bankAccountId");

CREATE INDEX "AccountingBankReconciliation_status_idx"
  ON "AccountingBankReconciliation"("status");

CREATE INDEX "AccountingBankReconciliation_periodEnd_idx"
  ON "AccountingBankReconciliation"("periodEnd");

ALTER TABLE "AccountingBankReconciliation"
  ADD CONSTRAINT "AccountingBankReconciliation_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "AccountingBankAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingBankReconciliation"
  ADD CONSTRAINT "AccountingBankReconciliation_statementImportId_fkey"
  FOREIGN KEY ("statementImportId") REFERENCES "AccountingBankStatementImport"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingBankStatementLine"
  ADD COLUMN "category" "AccountingBankStatementLineCategory",
  ADD COLUMN "categoryNote" TEXT,
  ADD COLUMN "categorizedAt" TIMESTAMP(3),
  ADD COLUMN "categorizedByUserId" UUID,
  ADD COLUMN "reconciliationId" UUID;

CREATE INDEX "AccountingBankStatementLine_category_idx"
  ON "AccountingBankStatementLine"("category");

CREATE INDEX "AccountingBankStatementLine_reconciliationId_idx"
  ON "AccountingBankStatementLine"("reconciliationId");

ALTER TABLE "AccountingBankStatementLine"
  ADD CONSTRAINT "AccountingBankStatementLine_reconciliationId_fkey"
  FOREIGN KEY ("reconciliationId") REFERENCES "AccountingBankReconciliation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CoA extensions for bank charge expense and interest income
INSERT INTO "AccountingAccount" ("id", "code", "name", "type", "currency", "isActive", "isSystem", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), '5390', 'Bank Charges Expense', 'EXPENSE', 'INR', true, true, 'Phase 4D bank statement charge categorization', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '4500', 'Interest Income', 'REVENUE', 'INR', true, true, 'Phase 4D bank interest categorization', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
