ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "crmOwnerUserId" UUID;
ALTER TABLE "EnquiryThread" ADD COLUMN IF NOT EXISTS "crmOwnerAssigned" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EnquiryThread_crmOwnerUserId_fkey'
  ) THEN
    ALTER TABLE "EnquiryThread"
      ADD CONSTRAINT "EnquiryThread_crmOwnerUserId_fkey"
      FOREIGN KEY ("crmOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EnquiryThread_crmOwnerUserId_idx" ON "EnquiryThread"("crmOwnerUserId");
