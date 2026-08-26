-- Launch cutover archive tables (pre-go-live orders + marketplace ops)

CREATE TYPE "LegacyOrderSource" AS ENUM ('D2C', 'MARKETPLACE');

CREATE TABLE "LegacyOrderArchive" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dedupeKey" TEXT NOT NULL,
    "source" "LegacyOrderSource" NOT NULL,
    "channelCode" TEXT,
    "externalOrderId" TEXT,
    "orderNumber" TEXT,
    "originalOrderId" UUID,
    "originalMarketplaceOrderId" UUID,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "status" TEXT NOT NULL,
    "paymentProvider" TEXT,
    "paymentStatus" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "discountInPaise" INTEGER NOT NULL DEFAULT 0,
    "shippingInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxInPaise" INTEGER NOT NULL DEFAULT 0,
    "grandTotalInPaise" INTEGER NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "placedAt" TIMESTAMP(3),
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "linePreview" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "items" JSONB NOT NULL,
    "payments" JSONB,
    "shipments" JSONB,
    "wooCommerceId" INTEGER,
    "zohoInvoiceId" TEXT,
    "zohoInvoiceNo" TEXT,
    "notes" TEXT,
    "rawSnapshot" JSONB,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyOrderArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyOrderArchive_dedupeKey_key" ON "LegacyOrderArchive"("dedupeKey");
CREATE INDEX "LegacyOrderArchive_orderDate_idx" ON "LegacyOrderArchive"("orderDate" DESC);
CREATE INDEX "LegacyOrderArchive_source_orderDate_idx" ON "LegacyOrderArchive"("source", "orderDate" DESC);
CREATE INDEX "LegacyOrderArchive_channelCode_orderDate_idx" ON "LegacyOrderArchive"("channelCode", "orderDate" DESC);
CREATE INDEX "LegacyOrderArchive_orderNumber_idx" ON "LegacyOrderArchive"("orderNumber");
CREATE INDEX "LegacyOrderArchive_customerEmail_idx" ON "LegacyOrderArchive"("customerEmail");
CREATE INDEX "LegacyOrderArchive_originalOrderId_idx" ON "LegacyOrderArchive"("originalOrderId");
CREATE INDEX "LegacyOrderArchive_originalMarketplaceOrderId_idx" ON "LegacyOrderArchive"("originalMarketplaceOrderId");

CREATE TABLE "LegacyMarketplaceOrderArchive" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "originalMarketplaceOrderId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "channelCode" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "shipToCity" TEXT,
    "shipToState" TEXT,
    "shipToCountry" TEXT,
    "shipToPostalCode" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "grandTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "items" JSONB NOT NULL,
    "returns" JSONB,
    "rawPayload" JSONB,
    "notes" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyMarketplaceOrderArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyMarketplaceOrderArchive_originalMarketplaceOrderId_key" ON "LegacyMarketplaceOrderArchive"("originalMarketplaceOrderId");
CREATE INDEX "LegacyMarketplaceOrderArchive_channelCode_orderDate_idx" ON "LegacyMarketplaceOrderArchive"("channelCode", "orderDate" DESC);
CREATE INDEX "LegacyMarketplaceOrderArchive_orderDate_idx" ON "LegacyMarketplaceOrderArchive"("orderDate" DESC);
CREATE INDEX "LegacyMarketplaceOrderArchive_externalOrderId_idx" ON "LegacyMarketplaceOrderArchive"("externalOrderId");
