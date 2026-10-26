UPDATE "EnquiryThread" SET "crmPipeline" = 'ONGOING' WHERE "crmPipeline" = 'CONTACTED';
UPDATE "EnquiryThread" SET "crmPipeline" = 'COMPLETED' WHERE "crmPipeline" = 'WON';
UPDATE "EnquiryThread" SET "crmPipeline" = 'NOT_INTERESTED' WHERE "crmPipeline" = 'LOST';

ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "crmCategories" "CrmChatCategory"[] NOT NULL DEFAULT ARRAY[]::"CrmChatCategory"[];

UPDATE "EnquiryThread"
SET "crmCategories" = ARRAY["crmCategory"]
WHERE "crmCategory" IS NOT NULL
  AND cardinality("crmCategories") = 0;

CREATE TABLE IF NOT EXISTS "CrmChatCollaborator" (
  "threadId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmChatCollaborator_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE INDEX IF NOT EXISTS "CrmChatCollaborator_userId_idx" ON "CrmChatCollaborator"("userId");

ALTER TABLE "CrmChatCollaborator"
  DROP CONSTRAINT IF EXISTS "CrmChatCollaborator_threadId_fkey";
ALTER TABLE "CrmChatCollaborator"
  ADD CONSTRAINT "CrmChatCollaborator_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "EnquiryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmChatCollaborator"
  DROP CONSTRAINT IF EXISTS "CrmChatCollaborator_userId_fkey";
ALTER TABLE "CrmChatCollaborator"
  ADD CONSTRAINT "CrmChatCollaborator_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
