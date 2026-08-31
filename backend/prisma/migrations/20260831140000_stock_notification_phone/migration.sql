-- AlterTable
ALTER TABLE "StockNotification" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockNotification_notifiedAt_variantId_idx" ON "StockNotification"("notifiedAt", "variantId");
