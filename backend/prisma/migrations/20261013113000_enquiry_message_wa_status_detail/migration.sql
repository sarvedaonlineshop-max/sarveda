-- Persist WhatsApp/Exotel delivery failure reasons for admin chat ticks.
ALTER TABLE "EnquiryMessage" ADD COLUMN IF NOT EXISTS "waStatusDetail" TEXT;
