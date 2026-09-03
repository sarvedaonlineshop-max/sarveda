-- Phase 3: Warehouse QC dispositions + quarantine + QC line splits

ALTER TYPE "OrderInventoryRestockDisposition" ADD VALUE IF NOT EXISTS 'REPACK';
ALTER TYPE "OrderInventoryRestockDisposition" ADD VALUE IF NOT EXISTS 'QUARANTINE';
ALTER TYPE "OrderInventoryRestockDisposition" ADD VALUE IF NOT EXISTS 'WRITE_OFF';
ALTER TYPE "OrderInventoryRestockDisposition" ADD VALUE IF NOT EXISTS 'RETURN_TO_VENDOR';

ALTER TABLE "Inventory"
  ADD COLUMN IF NOT EXISTS "quarantineOnHand" INTEGER NOT NULL DEFAULT 0;

-- Per-case warehouse receipt quantities (expected lines)
CREATE TABLE IF NOT EXISTS "OrderReturnReceiptLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "orderItemId" UUID NOT NULL,
  "qtyExpected" INTEGER NOT NULL,
  "qtyReceived" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3),
  "receivedByUserId" UUID,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReturnReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderReturnReceiptLine_requestId_orderItemId_key"
  ON "OrderReturnReceiptLine"("requestId", "orderItemId");
CREATE INDEX IF NOT EXISTS "OrderReturnReceiptLine_requestId_idx"
  ON "OrderReturnReceiptLine"("requestId");

ALTER TABLE "OrderReturnReceiptLine"
  ADD CONSTRAINT "OrderReturnReceiptLine_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReturnReceiptLine"
  ADD CONSTRAINT "OrderReturnReceiptLine_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- QC disposition lines (supports mixed outcomes + wrong/extra SKU)
CREATE TABLE IF NOT EXISTS "OrderReturnQcLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "orderItemId" UUID,
  "expectedSkuSnapshot" TEXT,
  "receivedVariantId" UUID,
  "receivedSkuSnapshot" TEXT,
  "isUnexpectedSku" BOOLEAN NOT NULL DEFAULT false,
  "quantity" INTEGER NOT NULL,
  "disposition" "OrderInventoryRestockDisposition" NOT NULL,
  "note" TEXT,
  "vendorId" UUID,
  "vendorNameSnapshot" TEXT,
  "restockEventId" UUID,
  "releasedToSellableAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReturnQcLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderReturnQcLine_restockEventId_key"
  ON "OrderReturnQcLine"("restockEventId");
CREATE INDEX IF NOT EXISTS "OrderReturnQcLine_requestId_idx"
  ON "OrderReturnQcLine"("requestId");
CREATE INDEX IF NOT EXISTS "OrderReturnQcLine_orderItemId_idx"
  ON "OrderReturnQcLine"("orderItemId");

ALTER TABLE "OrderReturnQcLine"
  ADD CONSTRAINT "OrderReturnQcLine_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Optional CoA for inventory write-off (idempotent insert)
INSERT INTO "AccountingAccount" ("id", "code", "name", "type", "description", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), '5400', 'Inventory Write-off / Shrinkage', 'EXPENSE',
  'Returned/damaged inventory written off at authoritative cost (Phase 3 returns QC).',
  true, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AccountingAccount" WHERE "code" = '5400');
