-- CreateEnum
CREATE TYPE "AccountClosureApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "EnquirySubjectCategory" ADD VALUE 'PRODUCT';

-- CreateTable
CREATE TABLE "AccountClosureApproval" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AccountClosureApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "AccountClosureApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountClosureApproval_userId_createdAt_idx" ON "AccountClosureApproval"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountClosureApproval_status_createdAt_idx" ON "AccountClosureApproval"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountClosureApproval" ADD CONSTRAINT "AccountClosureApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
