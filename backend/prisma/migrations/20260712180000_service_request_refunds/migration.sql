-- AlterTable
ALTER TABLE "OrderServiceRequest" ADD COLUMN "codRefundNote" TEXT;
ALTER TABLE "OrderServiceRequest" ADD COLUMN "refundProcessedAt" TIMESTAMP(3);
ALTER TABLE "OrderServiceRequest" ADD COLUMN "refundTotalInPaise" INTEGER;

-- AlterTable
ALTER TABLE "OrderServiceRequestItem" ADD COLUMN "refundAmountInPaise" INTEGER;
ALTER TABLE "OrderServiceRequestItem" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "OrderServiceRequestItem" ADD COLUMN "refundProviderId" TEXT;
