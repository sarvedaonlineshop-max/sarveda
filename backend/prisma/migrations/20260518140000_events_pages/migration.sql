-- AlterTable Event
ALTER TABLE "Event" ADD COLUMN "shortDescription" TEXT,
ADD COLUMN "enrollmentMode" "CourseEnrollmentMode" NOT NULL DEFAULT 'ENQUIRY',
ADD COLUMN "checkoutVariantId" UUID,
ADD COLUMN "wpPostId" INTEGER,
ADD COLUMN "extra" JSONB,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Event_checkoutVariantId_key" ON "Event"("checkoutVariantId");
CREATE UNIQUE INDEX "Event_wpPostId_key" ON "Event"("wpPostId");

ALTER TABLE "Event" ADD CONSTRAINT "Event_checkoutVariantId_fkey" FOREIGN KEY ("checkoutVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable CmsPage
CREATE TABLE "CmsPage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "template" TEXT,
    "imageUrl" TEXT,
    "wpPostId" INTEGER,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CmsPage_slug_key" ON "CmsPage"("slug");
CREATE UNIQUE INDEX "CmsPage_wpPostId_key" ON "CmsPage"("wpPostId");
