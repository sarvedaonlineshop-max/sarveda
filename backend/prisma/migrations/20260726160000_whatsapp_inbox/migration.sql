-- WhatsApp shared inbox: new enquiry source + WA metadata on threads/messages

ALTER TYPE "EnquirySource" ADD VALUE IF NOT EXISTS 'WHATSAPP';

ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "waPhone" TEXT;
ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "lastCustomerMessageAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "EnquiryThread_waPhone_idx" ON "EnquiryThread"("waPhone");

ALTER TABLE "EnquiryMessage" ADD COLUMN IF NOT EXISTS "waMessageSid" TEXT;
ALTER TABLE "EnquiryMessage" ADD COLUMN IF NOT EXISTS "waStatus" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "EnquiryMessage_waMessageSid_key" ON "EnquiryMessage"("waMessageSid");
