-- CreateEnum
CREATE TYPE "OrderServiceRequestType" AS ENUM ('CANCEL_BEFORE_DELIVERY', 'REFUND_AFTER_DELIVERY');

-- CreateEnum
CREATE TYPE "OrderServiceRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrderServiceRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" UUID,
    "customerEmail" TEXT NOT NULL,
    "type" "OrderServiceRequestType" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "otherMessage" TEXT,
    "message" TEXT,
    "status" "OrderServiceRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderServiceRequestPhoto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderServiceRequestPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderServiceRequest_orderId_idx" ON "OrderServiceRequest"("orderId");

-- CreateIndex
CREATE INDEX "OrderServiceRequest_status_idx" ON "OrderServiceRequest"("status");

-- CreateIndex
CREATE INDEX "OrderServiceRequest_orderNumber_idx" ON "OrderServiceRequest"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderServiceRequest_customerEmail_idx" ON "OrderServiceRequest"("customerEmail");

-- CreateIndex
CREATE INDEX "OrderServiceRequestPhoto_requestId_idx" ON "OrderServiceRequestPhoto"("requestId");

-- AddForeignKey
ALTER TABLE "OrderServiceRequest" ADD CONSTRAINT "OrderServiceRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderServiceRequestPhoto" ADD CONSTRAINT "OrderServiceRequestPhoto_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
