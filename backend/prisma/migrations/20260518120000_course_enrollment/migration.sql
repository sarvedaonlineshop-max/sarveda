-- CreateEnum
CREATE TYPE "CourseEnrollmentMode" AS ENUM ('CHECKOUT', 'ENQUIRY', 'BOTH');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "catalogHidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN "shortDescription" TEXT,
ADD COLUMN "priceUsdCents" INTEGER,
ADD COLUMN "videoUrl" TEXT,
ADD COLUMN "enrollmentMode" "CourseEnrollmentMode" NOT NULL DEFAULT 'ENQUIRY',
ADD COLUMN "checkoutVariantId" UUID,
ADD COLUMN "wpPostId" INTEGER,
ADD COLUMN "extra" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Course_checkoutVariantId_key" ON "Course"("checkoutVariantId");
CREATE UNIQUE INDEX "Course_wpPostId_key" ON "Course"("wpPostId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_checkoutVariantId_fkey" FOREIGN KEY ("checkoutVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
