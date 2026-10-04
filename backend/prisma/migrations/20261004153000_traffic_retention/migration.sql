CREATE TABLE "TrafficDay" (
    "day" DATE NOT NULL,
    "people" INTEGER NOT NULL,
    "storefrontPageLoads" INTEGER NOT NULL,
    "missingPages" INTEGER NOT NULL,
    "checkoutPeople" INTEGER NOT NULL,
    "checkoutOpens" INTEGER NOT NULL,
    "cartAdds" INTEGER NOT NULL,
    "ordersConfirmed" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficDay_pkey" PRIMARY KEY ("day")
);

CREATE TABLE "CheckoutVisit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day" DATE NOT NULL,
    "clientIp" VARCHAR(64) NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "utm" VARCHAR(240),
    "bought" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CheckoutVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckoutVisitItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visitId" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "inCart" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CheckoutVisitItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorageDay" (
    "day" DATE NOT NULL,
    "diskUsedBytes" BIGINT NOT NULL,
    "diskTotalBytes" BIGINT NOT NULL,
    "databaseBytes" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageDay_pkey" PRIMARY KEY ("day")
);

CREATE UNIQUE INDEX "day_clientIp" ON "CheckoutVisit"("day", "clientIp");
CREATE INDEX "CheckoutVisit_day_idx" ON "CheckoutVisit"("day");
CREATE UNIQUE INDEX "CheckoutVisitItem_visitId_slug_key" ON "CheckoutVisitItem"("visitId", "slug");

ALTER TABLE "CheckoutVisitItem" ADD CONSTRAINT "CheckoutVisitItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "CheckoutVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
