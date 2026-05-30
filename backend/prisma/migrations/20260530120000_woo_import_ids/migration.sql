-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wooCommerceId" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "wooCommerceId" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "wooLegacyMeta" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_wooCommerceId_key" ON "User"("wooCommerceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_wooCommerceId_key" ON "Order"("wooCommerceId");
