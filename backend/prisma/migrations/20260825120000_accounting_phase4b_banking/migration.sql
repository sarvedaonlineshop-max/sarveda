-- Phase 4B: Banking & cash registry + transfers

CREATE TYPE "AccountingBankAccountType" AS ENUM ('BANK', 'CASH', 'PETTY_CASH');
CREATE TYPE "AccountingBankTransferKind" AS ENUM ('INTERNAL_TRANSFER', 'CASH_DEPOSIT', 'CASH_WITHDRAWAL');
CREATE TYPE "AccountingBankTransferStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

CREATE TABLE "AccountingBankAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "maskedAccountNumber" TEXT,
    "ifsc" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "glAccountCode" TEXT NOT NULL,
    "accountType" "AccountingBankAccountType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "statementImportEnabled" BOOLEAN NOT NULL DEFAULT false,
    "razorpaySettlementTarget" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingBankAccount_glAccountCode_key" ON "AccountingBankAccount"("glAccountCode");
CREATE INDEX "AccountingBankAccount_accountType_idx" ON "AccountingBankAccount"("accountType");
CREATE INDEX "AccountingBankAccount_isActive_idx" ON "AccountingBankAccount"("isActive");
CREATE INDEX "AccountingBankAccount_razorpaySettlementTarget_idx" ON "AccountingBankAccount"("razorpaySettlementTarget");

CREATE TABLE "AccountingBankTransfer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transferNumber" TEXT NOT NULL,
    "transferDate" DATE NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "transferKind" "AccountingBankTransferKind" NOT NULL,
    "sourceBankAccountId" UUID NOT NULL,
    "destinationBankAccountId" UUID NOT NULL,
    "reference" TEXT,
    "memo" TEXT,
    "status" "AccountingBankTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "sourcePayloadHash" TEXT NOT NULL,
    "postingEventId" UUID,
    "journalEntryId" UUID,
    "createdByUserId" UUID,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingBankTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingBankTransfer_transferNumber_key" ON "AccountingBankTransfer"("transferNumber");
CREATE UNIQUE INDEX "AccountingBankTransfer_postingEventId_key" ON "AccountingBankTransfer"("postingEventId");
CREATE UNIQUE INDEX "AccountingBankTransfer_journalEntryId_key" ON "AccountingBankTransfer"("journalEntryId");
CREATE INDEX "AccountingBankTransfer_transferDate_idx" ON "AccountingBankTransfer"("transferDate");
CREATE INDEX "AccountingBankTransfer_status_idx" ON "AccountingBankTransfer"("status");
CREATE INDEX "AccountingBankTransfer_sourceBankAccountId_idx" ON "AccountingBankTransfer"("sourceBankAccountId");
CREATE INDEX "AccountingBankTransfer_destinationBankAccountId_idx" ON "AccountingBankTransfer"("destinationBankAccountId");

ALTER TABLE "AccountingGatewaySettlement" ADD COLUMN "targetBankAccountId" UUID;
CREATE INDEX "AccountingGatewaySettlement_targetBankAccountId_idx" ON "AccountingGatewaySettlement"("targetBankAccountId");

ALTER TABLE "AccountingVendorPayment" ADD COLUMN "bankAccountId" UUID;
CREATE INDEX "AccountingVendorPayment_bankAccountId_idx" ON "AccountingVendorPayment"("bankAccountId");

ALTER TABLE "AccountingExpensePaymentMapping" ADD COLUMN "bankAccountId" UUID;
CREATE INDEX "AccountingExpensePaymentMapping_bankAccountId_idx" ON "AccountingExpensePaymentMapping"("bankAccountId");

ALTER TABLE "AccountingGatewaySettlement" ADD CONSTRAINT "AccountingGatewaySettlement_targetBankAccountId_fkey" FOREIGN KEY ("targetBankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingVendorPayment" ADD CONSTRAINT "AccountingVendorPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingExpensePaymentMapping" ADD CONSTRAINT "AccountingExpensePaymentMapping_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingBankTransfer" ADD CONSTRAINT "AccountingBankTransfer_sourceBankAccountId_fkey" FOREIGN KEY ("sourceBankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingBankTransfer" ADD CONSTRAINT "AccountingBankTransfer_destinationBankAccountId_fkey" FOREIGN KEY ("destinationBankAccountId") REFERENCES "AccountingBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingBankTransfer" ADD CONSTRAINT "AccountingBankTransfer_postingEventId_fkey" FOREIGN KEY ("postingEventId") REFERENCES "AccountingPostingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingBankTransfer" ADD CONSTRAINT "AccountingBankTransfer_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
