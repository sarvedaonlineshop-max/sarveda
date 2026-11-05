-- Instagram DMs in the admin chat inbox.
ALTER TYPE "EnquirySource" ADD VALUE IF NOT EXISTS 'INSTAGRAM';

ALTER TABLE "EnquiryThread" ADD COLUMN "igUserId" TEXT;
CREATE INDEX "EnquiryThread_igUserId_idx" ON "EnquiryThread"("igUserId");

ALTER TABLE "EnquiryMessage" ADD COLUMN "igMessageMid" TEXT;
CREATE UNIQUE INDEX "EnquiryMessage_igMessageMid_key" ON "EnquiryMessage"("igMessageMid");
