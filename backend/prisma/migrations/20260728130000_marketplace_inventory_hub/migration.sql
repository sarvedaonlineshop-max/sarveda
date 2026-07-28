-- Marketplace inventory hub foundation

DO $$
BEGIN
  CREATE TYPE "MarketplaceChannelCode" AS ENUM (
    'AMAZON',
    'FLIPKART',
    'ETSY',
    'AMALA',
    'FIRSTCRY',
    'TATA_1MG',
    'SARVEDA'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MarketplaceListingStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'DELISTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MarketplaceOrderStatus" AS ENUM (
    'RECEIVED',
    'CONFIRMED',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED',
    'REFUNDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MarketplaceDataSource" AS ENUM (
    'MANUAL',
    'CSV_IMPORT',
    'EMAIL',
    'API'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MarketplaceReturnStatus" AS ENUM (
    'REQUESTED',
    'RECEIVED',
    'REFUNDED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MarketplaceChannel" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" "MarketplaceChannelCode" NOT NULL,
  "displayName" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceChannel_code_key" ON "MarketplaceChannel"("code");

CREATE TABLE IF NOT EXISTS "MarketplaceListing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channelId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "listingId" TEXT,
  "externalSku" TEXT,
  "sellerSku" TEXT,
  "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "isTracked" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channelId" UUID NOT NULL,
  "externalOrderId" TEXT NOT NULL,
  "orderDate" TIMESTAMP(3) NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "shipToCity" TEXT,
  "shipToState" TEXT,
  "shipToCountry" TEXT,
  "shipToPostalCode" TEXT,
  "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'RECEIVED',
  "source" "MarketplaceDataSource" NOT NULL DEFAULT 'MANUAL',
  "rawPayload" JSONB,
  "notes" TEXT,
  "dispatchedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceOrderItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "marketplaceOrderId" UUID NOT NULL,
  "variantId" UUID,
  "skuSnapshot" TEXT NOT NULL,
  "productNameSnapshot" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPriceInPaise" INTEGER,
  "lineTotalInPaise" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceReturn" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "marketplaceOrderId" UUID NOT NULL,
  "marketplaceOrderItemId" UUID,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT,
  "status" "MarketplaceReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "receivedAt" TIMESTAMP(3),
  "refundedAmountInPaise" INTEGER,
  "restockedToZoho" BOOLEAN NOT NULL DEFAULT false,
  "rawPayload" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceEventLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channelId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "source" "MarketplaceDataSource" NOT NULL,
  "dedupeKey" TEXT,
  "rawPayload" JSONB,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketplaceEventLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceListing_channelId_variantId_key"
  ON "MarketplaceListing"("channelId", "variantId");
CREATE INDEX IF NOT EXISTS "MarketplaceListing_channelId_status_idx"
  ON "MarketplaceListing"("channelId", "status");
CREATE INDEX IF NOT EXISTS "MarketplaceListing_variantId_status_idx"
  ON "MarketplaceListing"("variantId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceOrder_channelId_externalOrderId_key"
  ON "MarketplaceOrder"("channelId", "externalOrderId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_channelId_orderDate_idx"
  ON "MarketplaceOrder"("channelId", "orderDate" DESC);
CREATE INDEX IF NOT EXISTS "MarketplaceOrder_status_orderDate_idx"
  ON "MarketplaceOrder"("status", "orderDate" DESC);

CREATE INDEX IF NOT EXISTS "MarketplaceOrderItem_marketplaceOrderId_idx"
  ON "MarketplaceOrderItem"("marketplaceOrderId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrderItem_variantId_idx"
  ON "MarketplaceOrderItem"("variantId");
CREATE INDEX IF NOT EXISTS "MarketplaceOrderItem_skuSnapshot_idx"
  ON "MarketplaceOrderItem"("skuSnapshot");

CREATE INDEX IF NOT EXISTS "MarketplaceReturn_marketplaceOrderId_status_idx"
  ON "MarketplaceReturn"("marketplaceOrderId", "status");
CREATE INDEX IF NOT EXISTS "MarketplaceReturn_marketplaceOrderItemId_idx"
  ON "MarketplaceReturn"("marketplaceOrderItemId");

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceEventLog_channelId_dedupeKey_key"
  ON "MarketplaceEventLog"("channelId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "MarketplaceEventLog_channelId_createdAt_idx"
  ON "MarketplaceEventLog"("channelId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MarketplaceEventLog_source_createdAt_idx"
  ON "MarketplaceEventLog"("source", "createdAt" DESC);

DO $$
BEGIN
  ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "MarketplaceChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceListing"
    ADD CONSTRAINT "MarketplaceListing_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceOrder"
    ADD CONSTRAINT "MarketplaceOrder_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "MarketplaceChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceOrderItem"
    ADD CONSTRAINT "MarketplaceOrderItem_marketplaceOrderId_fkey"
    FOREIGN KEY ("marketplaceOrderId") REFERENCES "MarketplaceOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceOrderItem"
    ADD CONSTRAINT "MarketplaceOrderItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceReturn"
    ADD CONSTRAINT "MarketplaceReturn_marketplaceOrderId_fkey"
    FOREIGN KEY ("marketplaceOrderId") REFERENCES "MarketplaceOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceReturn"
    ADD CONSTRAINT "MarketplaceReturn_marketplaceOrderItemId_fkey"
    FOREIGN KEY ("marketplaceOrderItemId") REFERENCES "MarketplaceOrderItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MarketplaceEventLog"
    ADD CONSTRAINT "MarketplaceEventLog_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "MarketplaceChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "MarketplaceChannel" ("code", "displayName", "isActive")
VALUES
  ('AMAZON', 'Amazon', true),
  ('FLIPKART', 'Flipkart', true),
  ('ETSY', 'Etsy', true),
  ('AMALA', 'Amala', true),
  ('FIRSTCRY', 'FirstCry', true),
  ('TATA_1MG', 'Tata 1mg', true),
  ('SARVEDA', 'Sarveda', true)
ON CONFLICT ("code") DO NOTHING;
