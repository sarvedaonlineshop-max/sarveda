-- Digital checkout offers (course/event) — separate from storefront Product catalog.

CREATE TYPE "DigitalCheckoutKind" AS ENUM ('COURSE', 'EVENT');

CREATE TABLE "DigitalCheckoutOffer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "DigitalCheckoutKind" NOT NULL,
    "courseId" UUID,
    "eventId" UUID,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mrpInPaise" INTEGER NOT NULL,
    "saleInPaise" INTEGER NOT NULL,
    "mrpUsdCents" INTEGER,
    "saleUsdCents" INTEGER,
    "taxClass" TEXT NOT NULL DEFAULT 'gst-5',
    "imageUrl" TEXT,
    "checkoutVariantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalCheckoutOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalCheckoutOffer_courseId_key" ON "DigitalCheckoutOffer"("courseId");
CREATE UNIQUE INDEX "DigitalCheckoutOffer_eventId_key" ON "DigitalCheckoutOffer"("eventId");
CREATE UNIQUE INDEX "DigitalCheckoutOffer_sku_key" ON "DigitalCheckoutOffer"("sku");
CREATE UNIQUE INDEX "DigitalCheckoutOffer_checkoutVariantId_key" ON "DigitalCheckoutOffer"("checkoutVariantId");

ALTER TABLE "DigitalCheckoutOffer" ADD CONSTRAINT "DigitalCheckoutOffer_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalCheckoutOffer" ADD CONSTRAINT "DigitalCheckoutOffer_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalCheckoutOffer" ADD CONSTRAINT "DigitalCheckoutOffer_checkoutVariantId_fkey"
  FOREIGN KEY ("checkoutVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
