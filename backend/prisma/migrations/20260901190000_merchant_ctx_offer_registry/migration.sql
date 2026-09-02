-- CreateEnum
CREATE TYPE "MerchantCtxClassification" AS ENUM ('PUBLISH', 'INTENTIONALLY_EXCLUDE', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "MerchantCtxOffer" (
    "wooOfferId" INTEGER NOT NULL,
    "wooParentId" INTEGER,
    "ctxProductType" TEXT NOT NULL,
    "ctxItemGroupId" TEXT,
    "ctxTitle" TEXT,
    "ctxLegacyLink" TEXT,
    "classification" "MerchantCtxClassification" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "excludeReason" TEXT,
    "manualAction" TEXT,
    "sarvedaVariantId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCtxOffer_pkey" PRIMARY KEY ("wooOfferId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCtxOffer_sarvedaVariantId_key" ON "MerchantCtxOffer"("sarvedaVariantId");

-- CreateIndex
CREATE INDEX "MerchantCtxOffer_classification_idx" ON "MerchantCtxOffer"("classification");

-- AddForeignKey
ALTER TABLE "MerchantCtxOffer" ADD CONSTRAINT "MerchantCtxOffer_sarvedaVariantId_fkey" FOREIGN KEY ("sarvedaVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
