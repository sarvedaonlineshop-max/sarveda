-- AlterTable
ALTER TABLE "OrderServiceRequest" ALTER COLUMN "reasonCode" DROP NOT NULL;
ALTER TABLE "OrderServiceRequest" ALTER COLUMN "reasonLabel" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OrderServiceRequestItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "qtySelected" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "otherMessage" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderServiceRequestItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "OrderServiceRequestPhoto" ADD COLUMN "requestItemId" UUID;

-- CreateIndex
CREATE INDEX "OrderServiceRequestItem_requestId_idx" ON "OrderServiceRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "OrderServiceRequestItem_orderItemId_idx" ON "OrderServiceRequestItem"("orderItemId");

-- CreateIndex
CREATE INDEX "OrderServiceRequestPhoto_requestItemId_idx" ON "OrderServiceRequestPhoto"("requestItemId");

-- AddForeignKey
ALTER TABLE "OrderServiceRequestItem" ADD CONSTRAINT "OrderServiceRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderServiceRequestPhoto" ADD CONSTRAINT "OrderServiceRequestPhoto_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "OrderServiceRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
