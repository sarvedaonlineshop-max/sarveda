ALTER TABLE "EnquiryThread" ADD COLUMN "crmOwnerUserId" UUID;
ALTER TABLE "EnquiryThread" ADD CONSTRAINT "EnquiryThread_crmOwnerUserId_fkey" FOREIGN KEY ("crmOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EnquiryThread_crmOwnerUserId_crmPipeline_idx" ON "EnquiryThread"("crmOwnerUserId", "crmPipeline");

UPDATE "EnquiryThread" t
SET "crmOwnerUserId" = sub."adminUserId"
FROM (
  SELECT DISTINCT ON ("threadId") "threadId", "adminUserId"
  FROM "EnquiryMessage"
  WHERE "authorType" = 'ADMIN'
    AND "adminUserId" IS NOT NULL
    AND "authorName" <> 'Sarveda Assistant'
  ORDER BY "threadId", "createdAt" DESC
) sub
WHERE sub."threadId" = t.id
  AND t."crmOwnerUserId" IS NULL;
