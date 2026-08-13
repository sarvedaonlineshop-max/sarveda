-- Staging prices for Admin Products XL View (SKU-keyed; not live on storefront until merged).

CREATE TABLE "product_xl_staging_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" TEXT NOT NULL,
    "variantId" UUID,
    "mrpInPaise" INTEGER NOT NULL,
    "saleInPaise" INTEGER NOT NULL,
    "mrpUsdCents" INTEGER,
    "saleUsdCents" INTEGER,
    "mrpAedFils" INTEGER,
    "saleAedFils" INTEGER,
    "mrpGbpPence" INTEGER,
    "saleGbpPence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_xl_staging_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_xl_staging_prices_sku_key" ON "product_xl_staging_prices"("sku");

CREATE INDEX "product_xl_staging_prices_variantId_idx" ON "product_xl_staging_prices"("variantId");
