-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EnquiryFollowUpStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EnquiryFollowUp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "EnquiryFollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" UUID NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnquiryFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EnquiryFollowUp_threadId_dueAt_idx" ON "EnquiryFollowUp"("threadId", "dueAt" DESC);
CREATE INDEX IF NOT EXISTS "EnquiryFollowUp_status_dueAt_idx" ON "EnquiryFollowUp"("status", "dueAt");
CREATE INDEX IF NOT EXISTS "EnquiryFollowUp_assignedAdminId_status_dueAt_idx" ON "EnquiryFollowUp"("assignedAdminId", "status", "dueAt");

DO $$ BEGIN
  ALTER TABLE "EnquiryFollowUp" ADD CONSTRAINT "EnquiryFollowUp_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "EnquiryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "EnquiryFollowUp" ADD CONSTRAINT "EnquiryFollowUp_assignedAdminId_fkey"
    FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "EnquiryFollowUp" ADD CONSTRAINT "EnquiryFollowUp_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "EnquiryFollowUp" ADD CONSTRAINT "EnquiryFollowUp_completedByAdminId_fkey"
    FOREIGN KEY ("completedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
