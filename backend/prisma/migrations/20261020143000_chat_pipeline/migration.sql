CREATE TYPE "CrmChatPipeline" AS ENUM ('NEW', 'CONTACTED', 'ONGOING', 'FOLLOWUP', 'WON', 'LOST', 'UNQUALIFIED');
CREATE TYPE "CrmChatCategory" AS ENUM ('PRODUCTS', 'COURSES', 'DELIVERY', 'PAYMENT', 'REFUND', 'B2B', 'OTHERS');

ALTER TABLE "EnquiryThread" ADD COLUMN "crmPipeline" "CrmChatPipeline" NOT NULL DEFAULT 'NEW';
ALTER TABLE "EnquiryThread" ADD COLUMN "crmCategory" "CrmChatCategory";
CREATE INDEX "EnquiryThread_crmPipeline_idx" ON "EnquiryThread"("crmPipeline");

CREATE TABLE "CrmChatNote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "authorUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmChatNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CrmChatNote_threadId_createdAt_idx" ON "CrmChatNote"("threadId", "createdAt");
ALTER TABLE "CrmChatNote" ADD CONSTRAINT "CrmChatNote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EnquiryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmChatNote" ADD CONSTRAINT "CrmChatNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "EnquiryThread" t
SET "crmPipeline" = 'CONTACTED'
WHERE EXISTS (
  SELECT 1 FROM "EnquiryMessage" m
  WHERE m."threadId" = t.id
    AND m."authorType" = 'ADMIN'
    AND m."authorName" <> 'Sarveda Assistant'
);

UPDATE "EnquiryThread" t
SET "crmPipeline" = CASE l.status
  WHEN 'QUALIFIED' THEN 'ONGOING'::"CrmChatPipeline"
  WHEN 'UNQUALIFIED' THEN 'UNQUALIFIED'::"CrmChatPipeline"
  WHEN 'CONVERTED' THEN 'WON'::"CrmChatPipeline"
  WHEN 'LOST' THEN 'LOST'::"CrmChatPipeline"
  WHEN 'CONTACTED' THEN 'CONTACTED'::"CrmChatPipeline"
  ELSE t."crmPipeline"
END
FROM "CrmLead" l
WHERE l."enquiryThreadId" = t.id
  AND l.status IN ('QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST', 'CONTACTED');
