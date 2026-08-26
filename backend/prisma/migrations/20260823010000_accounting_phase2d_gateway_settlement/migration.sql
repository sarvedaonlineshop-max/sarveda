-- Native accounting Phase 2D — Razorpay gateway settlement tables (accounting-only)

CREATE TYPE "AccountingGatewaySettlementStatus" AS ENUM ('IMPORTED', 'PREVIEWED', 'POSTED', 'MISMATCH', 'SKIPPED', 'FAILED');

CREATE TYPE "AccountingGatewaySettlementLineType" AS ENUM ('PAYMENT', 'REFUND', 'TRANSFER', 'ADJUSTMENT', 'UNKNOWN');

CREATE TYPE "AccountingGatewaySettlementLineMappingStatus" AS ENUM ('MAPPED', 'UNMAPPED', 'DATA_GAP', 'UNMAPPED_PAYMENT', 'UNMAPPED_REFUND', 'UNKNOWN_ADJUSTMENT');

CREATE TABLE "AccountingGatewaySettlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "PaymentProvider" NOT NULL,
    "providerSettlementId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "settledAt" TIMESTAMP(3) NOT NULL,
    "utr" TEXT,
    "grossInPaise" INTEGER NOT NULL DEFAULT 0,
    "feeInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxInPaise" INTEGER NOT NULL DEFAULT 0,
    "netInPaise" INTEGER NOT NULL DEFAULT 0,
    "status" "AccountingGatewaySettlementStatus" NOT NULL DEFAULT 'IMPORTED',
    "gstItcStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED_PENDING_TAX_INVOICE',
    "sourcePayloadHash" TEXT NOT NULL,
    "rawPayload" JSONB,
    "postingEventId" UUID,
    "journalEntryId" UUID,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingGatewaySettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingGatewaySettlementLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlementId" UUID NOT NULL,
    "lineType" "AccountingGatewaySettlementLineType" NOT NULL,
    "providerEntityId" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL DEFAULT 0,
    "feeInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxInPaise" INTEGER NOT NULL DEFAULT 0,
    "debitInPaise" INTEGER NOT NULL DEFAULT 0,
    "creditInPaise" INTEGER NOT NULL DEFAULT 0,
    "providerPaymentId" TEXT,
    "providerRefundId" TEXT,
    "paymentId" UUID,
    "orderId" UUID,
    "mappingStatus" "AccountingGatewaySettlementLineMappingStatus" NOT NULL DEFAULT 'UNMAPPED',
    "rawPayload" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingGatewaySettlementLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingGatewaySettlement_provider_providerSettlementId_key" ON "AccountingGatewaySettlement"("provider", "providerSettlementId");
CREATE UNIQUE INDEX "AccountingGatewaySettlement_postingEventId_key" ON "AccountingGatewaySettlement"("postingEventId");
CREATE UNIQUE INDEX "AccountingGatewaySettlement_journalEntryId_key" ON "AccountingGatewaySettlement"("journalEntryId");
CREATE INDEX "AccountingGatewaySettlement_settledAt_idx" ON "AccountingGatewaySettlement"("settledAt");
CREATE INDEX "AccountingGatewaySettlement_status_idx" ON "AccountingGatewaySettlement"("status");
CREATE INDEX "AccountingGatewaySettlement_utr_idx" ON "AccountingGatewaySettlement"("utr");

CREATE UNIQUE INDEX "AccountingGatewaySettlementLine_settlementId_providerEntityId_key" ON "AccountingGatewaySettlementLine"("settlementId", "providerEntityId");
CREATE INDEX "AccountingGatewaySettlementLine_settlementId_idx" ON "AccountingGatewaySettlementLine"("settlementId");
CREATE INDEX "AccountingGatewaySettlementLine_providerPaymentId_idx" ON "AccountingGatewaySettlementLine"("providerPaymentId");
CREATE INDEX "AccountingGatewaySettlementLine_providerRefundId_idx" ON "AccountingGatewaySettlementLine"("providerRefundId");
CREATE INDEX "AccountingGatewaySettlementLine_paymentId_idx" ON "AccountingGatewaySettlementLine"("paymentId");
CREATE INDEX "AccountingGatewaySettlementLine_orderId_idx" ON "AccountingGatewaySettlementLine"("orderId");
CREATE INDEX "AccountingGatewaySettlementLine_mappingStatus_idx" ON "AccountingGatewaySettlementLine"("mappingStatus");

ALTER TABLE "AccountingGatewaySettlement" ADD CONSTRAINT "AccountingGatewaySettlement_postingEventId_fkey" FOREIGN KEY ("postingEventId") REFERENCES "AccountingPostingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingGatewaySettlement" ADD CONSTRAINT "AccountingGatewaySettlement_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingGatewaySettlementLine" ADD CONSTRAINT "AccountingGatewaySettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AccountingGatewaySettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
