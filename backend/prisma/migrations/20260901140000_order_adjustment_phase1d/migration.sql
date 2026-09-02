-- Phase 1D: Pre-dispatch adjustment request workflow

CREATE TYPE "OrderServiceRequestIntent" AS ENUM (
  'CANCEL',
  'REFUND',
  'CHANGE_ADDRESS',
  'CHANGE_ITEM_VARIANT',
  'CHANGE_QUANTITY'
);

CREATE TYPE "OrderServiceRequestExecutionStatus" AS ENUM (
  'NOT_APPLICABLE',
  'PENDING',
  'BLOCKED_AFTER_DISPATCH',
  'COMMERCIAL_REVIEW_REQUIRED',
  'ADDITIONAL_PAYMENT_REQUIRED',
  'REFUND_REQUIRED',
  'ACCOUNTING_REVIEW_REQUIRED',
  'EXECUTED',
  'FAILED'
);

ALTER TYPE "OrderServiceRequestType" ADD VALUE 'ADJUST_BEFORE_DELIVERY';
ALTER TYPE "OrderServiceRequestStatus" ADD VALUE 'NEEDS_DISCUSSION';
ALTER TYPE "OrderServiceRequestStatus" ADD VALUE 'CONVERTED_TO_CANCELLATION';
ALTER TYPE "OrderInventoryRestockSourceType" ADD VALUE 'ORDER_ADJUSTMENT';

ALTER TABLE "OrderServiceRequest" ADD COLUMN "requestIntent" "OrderServiceRequestIntent" NOT NULL DEFAULT 'CANCEL';
ALTER TABLE "OrderServiceRequest" ADD COLUMN "adjustmentPayload" JSONB;
ALTER TABLE "OrderServiceRequest" ADD COLUMN "executionStatus" "OrderServiceRequestExecutionStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "OrderServiceRequest" ADD COLUMN "commercialDeltaPaise" INTEGER;
ALTER TABLE "OrderServiceRequest" ADD COLUMN "commercialClassification" TEXT;
ALTER TABLE "OrderServiceRequest" ADD COLUMN "executionSourceId" TEXT;
ALTER TABLE "OrderServiceRequest" ADD COLUMN "executedAt" TIMESTAMP(3);
ALTER TABLE "OrderServiceRequest" ADD COLUMN "executionError" TEXT;
ALTER TABLE "OrderServiceRequest" ADD COLUMN "reviewedByUserId" UUID;

CREATE UNIQUE INDEX "OrderServiceRequest_executionSourceId_key" ON "OrderServiceRequest"("executionSourceId");
