-- Phase 1E: Partial refund settlement + supplementary payment foundation

CREATE TYPE "RefundSourceType" AS ENUM (
  'ORDER_ADJUSTMENT',
  'RTO',
  'ADMIN_MANUAL',
  'SERVICE_REQUEST',
  'FULL_CANCELLATION'
);

CREATE TYPE "RefundSettlementStage" AS ENUM (
  'RESERVED',
  'GATEWAY_SUCCEEDED',
  'ACCOUNTING_POSTED',
  'ZOHO_SYNCED',
  'COMPLETE',
  'FAILED'
);

CREATE TYPE "SupplementaryPaymentPurpose" AS ENUM ('ORDER_ADJUSTMENT');

CREATE TYPE "SupplementaryPaymentStatus" AS ENUM (
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED'
);

ALTER TYPE "OrderServiceRequestExecutionStatus" ADD VALUE 'REFUND_PROCESSING';
ALTER TYPE "OrderServiceRequestExecutionStatus" ADD VALUE 'PAYMENT_PENDING';
ALTER TYPE "OrderServiceRequestExecutionStatus" ADD VALUE 'PAYMENT_CAPTURED';

ALTER TABLE "Refund" ADD COLUMN "sourceType" "RefundSourceType";
ALTER TABLE "Refund" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "Refund" ADD COLUMN "settlementStage" "RefundSettlementStage" NOT NULL DEFAULT 'RESERVED';
ALTER TABLE "Refund" ADD COLUMN "settlementError" TEXT;
ALTER TABLE "Refund" ADD COLUMN "accountingPostedAt" TIMESTAMP(3);
ALTER TABLE "Refund" ADD COLUMN "zohoCreditNoteId" TEXT;
ALTER TABLE "Refund" ADD COLUMN "zohoCreditNoteNumber" TEXT;
ALTER TABLE "Refund" ADD COLUMN "zohoSyncError" TEXT;

CREATE INDEX "Refund_sourceType_sourceId_idx" ON "Refund"("sourceType", "sourceId");

CREATE TABLE "OrderSupplementaryPayment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orderId" UUID NOT NULL,
  "purpose" "SupplementaryPaymentPurpose" NOT NULL DEFAULT 'ORDER_ADJUSTMENT',
  "sourceId" TEXT NOT NULL,
  "amountInPaise" INTEGER NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "providerOrderId" TEXT,
  "providerPaymentId" TEXT,
  "status" "SupplementaryPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "capturedAt" TIMESTAMP(3),
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderSupplementaryPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderSupplementaryPayment_sourceId_key" ON "OrderSupplementaryPayment"("sourceId");
CREATE INDEX "OrderSupplementaryPayment_orderId_status_idx" ON "OrderSupplementaryPayment"("orderId", "status");

ALTER TABLE "OrderSupplementaryPayment"
  ADD CONSTRAINT "OrderSupplementaryPayment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
