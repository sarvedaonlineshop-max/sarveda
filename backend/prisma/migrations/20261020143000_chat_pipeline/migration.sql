-- Additive only. Do not rewrite existing chat rows.
DO $$ BEGIN
  CREATE TYPE "CrmChatPipeline" AS ENUM ('NEW', 'CONTACTED', 'ONGOING', 'FOLLOWUP', 'WON', 'LOST', 'UNQUALIFIED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CrmChatCategory" AS ENUM ('PRODUCTS', 'COURSES', 'DELIVERY', 'PAYMENT', 'REFUND', 'B2B', 'OTHERS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "crmPipeline" "CrmChatPipeline" NOT NULL DEFAULT 'NEW';
ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "crmCategory" "CrmChatCategory";
CREATE INDEX IF NOT EXISTS "EnquiryThread_crmPipeline_idx" ON "EnquiryThread"("crmPipeline");

CREATE TABLE IF NOT EXISTS "CrmChatNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "authorUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmChatNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmChatNote_threadId_createdAt_idx" ON "CrmChatNote"("threadId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmChatNote_threadId_fkey') THEN
    ALTER TABLE "CrmChatNote" ADD CONSTRAINT "CrmChatNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EnquiryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmChatNote_authorUserId_fkey') THEN
    ALTER TABLE "CrmChatNote" ADD CONSTRAINT "CrmChatNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
