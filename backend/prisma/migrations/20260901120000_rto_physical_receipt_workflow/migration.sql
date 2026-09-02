-- Phase 1C: RTO physical receipt + disposition workflow

CREATE TYPE "RtoDisposition" AS ENUM ('RESTOCKABLE', 'DAMAGED_NON_RESTOCKABLE', 'NEEDS_REVIEW');

CREATE TYPE "RtoRefundWorkflowStatus" AS ENUM (
  'NOT_APPLICABLE',
  'PENDING',
  'ACCOUNTING_REVIEW_REQUIRED',
  'READY_FOR_REFUND',
  'PROCESSING',
  'REFUNDED',
  'FAILED'
);

ALTER TYPE "OrderInventoryRestockSourceType" ADD VALUE 'RTO_PHYSICAL_RECEIPT';

ALTER TABLE "Shipment" ADD COLUMN "rtoReceivedAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "rtoReceivedByUserId" UUID;
ALTER TABLE "Shipment" ADD COLUMN "rtoDisposition" "RtoDisposition";
ALTER TABLE "Shipment" ADD COLUMN "rtoDispositionAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "rtoDispositionByUserId" UUID;
ALTER TABLE "Shipment" ADD COLUMN "rtoRefundWorkflowStatus" "RtoRefundWorkflowStatus";
ALTER TABLE "Shipment" ADD COLUMN "rtoRefundLastError" TEXT;
