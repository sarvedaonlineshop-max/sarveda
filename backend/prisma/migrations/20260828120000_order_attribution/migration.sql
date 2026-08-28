-- Additive only: OrderAttribution 1:1 with Order (informational; no backfill).

CREATE TABLE "OrderAttribution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "sourceType" TEXT,
    "firstSource" TEXT,
    "firstMedium" TEXT,
    "firstCampaign" TEXT,
    "firstReferrer" VARCHAR(2048),
    "firstLandingPage" VARCHAR(2048),
    "lastSource" TEXT,
    "lastMedium" TEXT,
    "lastCampaign" TEXT,
    "lastReferrer" VARCHAR(2048),
    "lastLandingPage" VARCHAR(2048),
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "referringDomain" TEXT,
    "landingPath" TEXT,
    "deviceType" TEXT,
    "sessionPageViews" INTEGER,
    "sessionStartedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAttribution_orderId_key" ON "OrderAttribution"("orderId");

CREATE INDEX "OrderAttribution_sourceType_idx" ON "OrderAttribution"("sourceType");

CREATE INDEX "OrderAttribution_utmCampaign_idx" ON "OrderAttribution"("utmCampaign");

CREATE INDEX "OrderAttribution_capturedAt_idx" ON "OrderAttribution"("capturedAt");

ALTER TABLE "OrderAttribution" ADD CONSTRAINT "OrderAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
