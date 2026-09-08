-- CreateTable
CREATE TABLE "InventoryStockRevision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variantId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "sku" TEXT NOT NULL,
    "previousOnHand" INTEGER NOT NULL,
    "newOnHand" INTEGER NOT NULL,
    "increased" INTEGER NOT NULL DEFAULT 0,
    "decreased" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actorLabel" TEXT,
    "orderId" UUID,
    "orderNumber" TEXT,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStockRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryStockRevision_createdAt_idx" ON "InventoryStockRevision"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryStockRevision_variantId_createdAt_idx" ON "InventoryStockRevision"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryStockRevision_sku_createdAt_idx" ON "InventoryStockRevision"("sku", "createdAt");
