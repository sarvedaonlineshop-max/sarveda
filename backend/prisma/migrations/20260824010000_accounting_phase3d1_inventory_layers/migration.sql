-- Phase 3D1: accounting-owned inventory cost layers + opening batch

CREATE TYPE "AccountingInventoryCostLayerSourceType" AS ENUM ('OPENING', 'PURCHASE_RECEIPT', 'RETURN_RESTOCK');
CREATE TYPE "AccountingInventoryCostLayerStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'VOID');
CREATE TYPE "AccountingInventoryOpeningBatchStatus" AS ENUM ('DRAFT', 'VALIDATED', 'POSTED', 'VOID');

CREATE TABLE "AccountingInventoryOpeningBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchNumber" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "valuationSource" TEXT NOT NULL,
    "sourceDocumentRef" TEXT,
    "preparedBy" TEXT,
    "reviewedBy" TEXT,
    "status" "AccountingInventoryOpeningBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalValueInPaise" INTEGER NOT NULL DEFAULT 0,
    "sourceFileName" TEXT,
    "sourcePayloadHash" TEXT NOT NULL,
    "allowQuantityMismatch" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" UUID,
    "postingEventId" UUID,
    "createdByUserId" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingInventoryOpeningBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingInventoryOpeningBatchItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "openingQuantity" INTEGER NOT NULL,
    "unitCostInPaise" INTEGER NOT NULL,
    "totalCostInPaise" INTEGER NOT NULL,
    "operationalOnHand" INTEGER NOT NULL,
    "quantityMismatch" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT NOT NULL,
    "notes" TEXT,
    "validationErrors" JSONB,
    "costLayerId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingInventoryOpeningBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingInventoryCostLayer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variantId" UUID NOT NULL,
    "sourceType" "AccountingInventoryCostLayerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" UUID,
    "quantityOriginal" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "unitCostInPaise" INTEGER NOT NULL,
    "totalCostInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "status" "AccountingInventoryCostLayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "openingBatchItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingInventoryCostLayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingInventoryCostConsumption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "costLayerId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "orderId" UUID,
    "orderItemId" UUID,
    "quantityConsumed" INTEGER NOT NULL,
    "unitCostInPaise" INTEGER NOT NULL,
    "totalCostInPaise" INTEGER NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "postingEventId" UUID,
    "journalEntryId" UUID,
    "sourceFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingInventoryCostConsumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingInventoryOpeningBatch_batchNumber_key" ON "AccountingInventoryOpeningBatch"("batchNumber");
CREATE UNIQUE INDEX "AccountingInventoryOpeningBatch_journalEntryId_key" ON "AccountingInventoryOpeningBatch"("journalEntryId");
CREATE UNIQUE INDEX "AccountingInventoryOpeningBatch_postingEventId_key" ON "AccountingInventoryOpeningBatch"("postingEventId");
CREATE INDEX "AccountingInventoryOpeningBatch_status_idx" ON "AccountingInventoryOpeningBatch"("status");
CREATE INDEX "AccountingInventoryOpeningBatch_effectiveDate_idx" ON "AccountingInventoryOpeningBatch"("effectiveDate");

CREATE UNIQUE INDEX "AccountingInventoryOpeningBatchItem_batchId_variantId_key" ON "AccountingInventoryOpeningBatchItem"("batchId", "variantId");
CREATE UNIQUE INDEX "AccountingInventoryOpeningBatchItem_batchId_sku_key" ON "AccountingInventoryOpeningBatchItem"("batchId", "sku");
CREATE INDEX "AccountingInventoryOpeningBatchItem_batchId_idx" ON "AccountingInventoryOpeningBatchItem"("batchId");
CREATE INDEX "AccountingInventoryOpeningBatchItem_variantId_idx" ON "AccountingInventoryOpeningBatchItem"("variantId");

CREATE UNIQUE INDEX "AccountingInventoryCostLayer_openingBatchItemId_key" ON "AccountingInventoryCostLayer"("openingBatchItemId");
CREATE UNIQUE INDEX "AccountingInventoryCostLayer_sourceType_sourceId_sourceLineId_sourceFingerprint_key" ON "AccountingInventoryCostLayer"("sourceType", "sourceId", "sourceLineId", "sourceFingerprint");
CREATE INDEX "AccountingInventoryCostLayer_variantId_status_effectiveAt_createdAt_id_idx" ON "AccountingInventoryCostLayer"("variantId", "status", "effectiveAt", "createdAt", "id");
CREATE INDEX "AccountingInventoryCostLayer_variantId_quantityRemaining_idx" ON "AccountingInventoryCostLayer"("variantId", "quantityRemaining");
CREATE INDEX "AccountingInventoryCostLayer_sourceType_sourceId_idx" ON "AccountingInventoryCostLayer"("sourceType", "sourceId");

CREATE INDEX "AccountingInventoryCostConsumption_costLayerId_idx" ON "AccountingInventoryCostConsumption"("costLayerId");
CREATE INDEX "AccountingInventoryCostConsumption_variantId_idx" ON "AccountingInventoryCostConsumption"("variantId");
CREATE INDEX "AccountingInventoryCostConsumption_orderId_idx" ON "AccountingInventoryCostConsumption"("orderId");
CREATE INDEX "AccountingInventoryCostConsumption_orderItemId_idx" ON "AccountingInventoryCostConsumption"("orderItemId");

ALTER TABLE "AccountingInventoryOpeningBatch" ADD CONSTRAINT "AccountingInventoryOpeningBatch_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingInventoryOpeningBatchItem" ADD CONSTRAINT "AccountingInventoryOpeningBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AccountingInventoryOpeningBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingInventoryOpeningBatchItem" ADD CONSTRAINT "AccountingInventoryOpeningBatchItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountingInventoryCostLayer" ADD CONSTRAINT "AccountingInventoryCostLayer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingInventoryCostLayer" ADD CONSTRAINT "AccountingInventoryCostLayer_openingBatchItemId_fkey" FOREIGN KEY ("openingBatchItemId") REFERENCES "AccountingInventoryOpeningBatchItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingInventoryCostConsumption" ADD CONSTRAINT "AccountingInventoryCostConsumption_costLayerId_fkey" FOREIGN KEY ("costLayerId") REFERENCES "AccountingInventoryCostLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingInventoryCostConsumption" ADD CONSTRAINT "AccountingInventoryCostConsumption_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
