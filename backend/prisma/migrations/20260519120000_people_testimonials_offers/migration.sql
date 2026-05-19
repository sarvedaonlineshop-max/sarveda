-- Vaidya / Mentor / Retreat: wpPostId + updatedAt
ALTER TABLE "Vaidya" ADD COLUMN IF NOT EXISTS "wpPostId" INTEGER;
ALTER TABLE "Vaidya" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Vaidya_wpPostId_key" ON "Vaidya"("wpPostId");

ALTER TABLE "Mentor" ADD COLUMN IF NOT EXISTS "wpPostId" INTEGER;
ALTER TABLE "Mentor" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Mentor_wpPostId_key" ON "Mentor"("wpPostId");

ALTER TABLE "Retreat" ADD COLUMN IF NOT EXISTS "wpPostId" INTEGER;
ALTER TABLE "Retreat" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "Retreat_wpPostId_key" ON "Retreat"("wpPostId");

CREATE TABLE IF NOT EXISTS "Testimonial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "role" TEXT,
    "body" TEXT,
    "imageUrl" TEXT,
    "wpPostId" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Testimonial_slug_key" ON "Testimonial"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Testimonial_wpPostId_key" ON "Testimonial"("wpPostId");

CREATE TABLE IF NOT EXISTS "Offer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "wpPostId" INTEGER,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Offer_slug_key" ON "Offer"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Offer_wpPostId_key" ON "Offer"("wpPostId");
