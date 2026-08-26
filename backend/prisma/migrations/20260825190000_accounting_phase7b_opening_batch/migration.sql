-- Phase 7B: Production opening batch + staging tables

CREATE TYPE "AccountingOpeningBatchStatus" AS ENUM ('DRAFT', 'VALIDATED', 'POSTED', 'CANCELLED');
CREATE TYPE "AccountingOpeningMatchStatus" AS ENUM ('EXACT', 'MANUAL_MATCH', 'NEW_SKU', 'LEGACY_ONLY', 'UNKNOWN');
CREATE TYPE "AccountingOpeningReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AccountingOpeningBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchNumber" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "status" "AccountingOpeningBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "description" TEXT,
    "createdByUserId" UUID,
    "validatedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "totalDebitInPaise" INTEGER NOT NULL DEFAULT 0,
    "totalCreditInPaise" INTEGER NOT NULL DEFAULT 0,
    "validationSummary" JSONB,
    "sourceFingerprint" TEXT,
    "arApprovedZero" BOOLEAN NOT NULL DEFAULT false,
    "equity3900Reason" TEXT,
    "equity3900Reviewer" TEXT,
    "equity3900Approved" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" UUID,
    "postingEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingOpeningBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingOpeningBatch_batchNumber_key" ON "AccountingOpeningBatch"("batchNumber");
CREATE UNIQUE INDEX "AccountingOpeningBatch_journalEntryId_key" ON "AccountingOpeningBatch"("journalEntryId");
CREATE UNIQUE INDEX "AccountingOpeningBatch_postingEventId_key" ON "AccountingOpeningBatch"("postingEventId");
CREATE INDEX "AccountingOpeningBatch_status_idx" ON "AccountingOpeningBatch"("status");
CREATE INDEX "AccountingOpeningBatch_effectiveDate_idx" ON "AccountingOpeningBatch"("effectiveDate");

ALTER TABLE "AccountingOpeningBatch" ADD CONSTRAINT "AccountingOpeningBatch_journalEntryId_fkey"
  FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningSkuMapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "newSarvedaSku" TEXT NOT NULL,
    "legacySku" TEXT,
    "productName" TEXT,
    "variantLabel" TEXT,
    "matchStatus" "AccountingOpeningMatchStatus" NOT NULL DEFAULT 'UNKNOWN',
    "openingQty" INTEGER NOT NULL DEFAULT 0,
    "unitCostInPaise" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "variantId" UUID,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningSkuMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningSkuMapping_batchId_newSarvedaSku_key" ON "AccountingOpeningSkuMapping"("batchId", "newSarvedaSku");
CREATE INDEX "AccountingOpeningSkuMapping_batchId_idx" ON "AccountingOpeningSkuMapping"("batchId");
ALTER TABLE "AccountingOpeningSkuMapping" ADD CONSTRAINT "AccountingOpeningSkuMapping_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningInventoryLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "variantId" UUID,
    "quantity" INTEGER NOT NULL,
    "unitCostInPaise" INTEGER NOT NULL,
    "totalCostInPaise" INTEGER NOT NULL,
    "operationalOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityMismatch" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "costLayerId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningInventoryLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningInventoryLine_batchId_sku_key" ON "AccountingOpeningInventoryLine"("batchId", "sku");
CREATE INDEX "AccountingOpeningInventoryLine_batchId_idx" ON "AccountingOpeningInventoryLine"("batchId");
ALTER TABLE "AccountingOpeningInventoryLine" ADD CONSTRAINT "AccountingOpeningInventoryLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningBankLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "maskedAccountNumber" TEXT,
    "ifsc" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'BANK',
    "glAccountCode" TEXT NOT NULL,
    "openingBookBalanceInPaise" INTEGER NOT NULL,
    "statementBalanceInPaise" INTEGER,
    "source" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningBankLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningBankLine_batchId_glAccountCode_key" ON "AccountingOpeningBankLine"("batchId", "glAccountCode");
CREATE INDEX "AccountingOpeningBankLine_batchId_idx" ON "AccountingOpeningBankLine"("batchId");
ALTER TABLE "AccountingOpeningBankLine" ADD CONSTRAINT "AccountingOpeningBankLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningGatewayLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "glAccountCode" TEXT NOT NULL,
    "unsettledAmountInPaise" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ASSET',
    "sourceReference" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningGatewayLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningGatewayLine_batchId_provider_key" ON "AccountingOpeningGatewayLine"("batchId", "provider");
CREATE INDEX "AccountingOpeningGatewayLine_batchId_idx" ON "AccountingOpeningGatewayLine"("batchId");
ALTER TABLE "AccountingOpeningGatewayLine" ADD CONSTRAINT "AccountingOpeningGatewayLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningApLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorId" UUID,
    "billNumber" TEXT NOT NULL,
    "billDate" DATE,
    "dueDate" DATE,
    "outstandingInPaise" INTEGER NOT NULL,
    "gstComponentInPaise" INTEGER NOT NULL DEFAULT 0,
    "tdsInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reference" TEXT,
    "source" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "remainingOutstandingInPaise" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningApLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningApLine_batchId_vendorName_billNumber_key" ON "AccountingOpeningApLine"("batchId", "vendorName", "billNumber");
CREATE INDEX "AccountingOpeningApLine_batchId_idx" ON "AccountingOpeningApLine"("batchId");
ALTER TABLE "AccountingOpeningApLine" ADD CONSTRAINT "AccountingOpeningApLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningArLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerId" UUID,
    "invoiceReference" TEXT NOT NULL,
    "invoiceDate" DATE,
    "dueDate" DATE,
    "outstandingInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningArLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningArLine_batchId_invoiceReference_key" ON "AccountingOpeningArLine"("batchId", "invoiceReference");
CREATE INDEX "AccountingOpeningArLine_batchId_idx" ON "AccountingOpeningArLine"("batchId");
ALTER TABLE "AccountingOpeningArLine" ADD CONSTRAINT "AccountingOpeningArLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningGstLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "accountCode" TEXT NOT NULL,
    "balanceInPaise" INTEGER NOT NULL,
    "source" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningGstLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningGstLine_batchId_accountCode_key" ON "AccountingOpeningGstLine"("batchId", "accountCode");
CREATE INDEX "AccountingOpeningGstLine_batchId_idx" ON "AccountingOpeningGstLine"("batchId");
ALTER TABLE "AccountingOpeningGstLine" ADD CONSTRAINT "AccountingOpeningGstLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingOpeningEquityLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "accountCode" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "reason" TEXT,
    "reviewStatus" "AccountingOpeningReviewStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingOpeningEquityLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingOpeningEquityLine_batchId_accountCode_key" ON "AccountingOpeningEquityLine"("batchId", "accountCode");
CREATE INDEX "AccountingOpeningEquityLine_batchId_idx" ON "AccountingOpeningEquityLine"("batchId");
ALTER TABLE "AccountingOpeningEquityLine" ADD CONSTRAINT "AccountingOpeningEquityLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountingOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
