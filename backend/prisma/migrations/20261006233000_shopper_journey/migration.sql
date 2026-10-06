CREATE TABLE "ShopperJourney" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorKey" VARCHAR(160) NOT NULL,
    "cartAt" TIMESTAMP(3) NOT NULL,
    "checkoutAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3),
    "orderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopperJourney_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopperJourney_orderId_key" ON "ShopperJourney"("orderId");
CREATE INDEX "ShopperJourney_actorKey_purchasedAt_idx" ON "ShopperJourney"("actorKey", "purchasedAt");
CREATE INDEX "ShopperJourney_cartAt_idx" ON "ShopperJourney"("cartAt");
CREATE INDEX "ShopperJourney_checkoutAt_idx" ON "ShopperJourney"("checkoutAt");
