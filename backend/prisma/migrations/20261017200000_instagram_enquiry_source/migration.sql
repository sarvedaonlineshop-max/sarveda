-- Instagram DMs in the admin chat inbox.
ALTER TYPE "EnquirySource" ADD VALUE IF NOT EXISTS 'INSTAGRAM';

ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "igUserId" TEXT;
CREATE INDEX IF NOT EXISTS "EnquiryThread_igUserId_idx" ON "EnquiryThread"("igUserId");

ALTER TABLE "EnquiryMessage" ADD COLUMN IF NOT EXISTS "igMessageMid" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "EnquiryMessage_igMessageMid_key" ON "EnquiryMessage"("igMessageMid");
