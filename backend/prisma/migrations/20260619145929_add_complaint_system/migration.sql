-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ComplaintEventType" AS ENUM ('COMMENT', 'STATUS_CHANGE', 'REOPENED', 'ATTACHMENT_ADDED', 'CREATED');

-- CreateEnum
CREATE TYPE "ComplaintAuthorType" AS ENUM ('MEMBER', 'ADMIN');

-- DropIndex
DROP INDEX "ContactSubmission_email_createdAt_idx";

-- DropIndex
DROP INDEX "ContactSubmission_orderNumber_idx";

-- DropIndex
DROP INDEX "OrderItem_pickupLocationId_idx";

-- DropIndex
DROP INDEX "ProductImage_variantId_idx";

-- DropIndex
DROP INDEX "ProductVariant_zohoItemId_idx";

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Mentor" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Offer" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Retreat" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Testimonial" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Vaidya" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Complaint" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "raisedByEmail" TEXT NOT NULL,
    "raisedByName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "complaintId" UUID NOT NULL,
    "type" "ComplaintEventType" NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "authorType" "ComplaintAuthorType" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintAttachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "complaintId" UUID,
    "eventId" UUID,
    "type" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintWhitelist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComplaintWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_raisedByEmail_idx" ON "Complaint"("raisedByEmail");

-- CreateIndex
CREATE INDEX "Complaint_priority_idx" ON "Complaint"("priority");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaintId_idx" ON "ComplaintEvent"("complaintId");

-- CreateIndex
CREATE INDEX "ComplaintAttachment_complaintId_idx" ON "ComplaintAttachment"("complaintId");

-- CreateIndex
CREATE INDEX "ComplaintAttachment_eventId_idx" ON "ComplaintAttachment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintWhitelist_email_key" ON "ComplaintWhitelist"("email");

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ComplaintEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
