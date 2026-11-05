ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "packingInPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "approvalNote" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "decidedByEmail" TEXT;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "enquiryThreadId" UUID;

CREATE INDEX IF NOT EXISTS "Quotation_approvalStatus_idx" ON "Quotation"("approvalStatus");
CREATE INDEX IF NOT EXISTS "Quotation_enquiryThreadId_idx" ON "Quotation"("enquiryThreadId");

CREATE TABLE IF NOT EXISTS "QuotationRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "quotationId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuotationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuotationRevision_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "QuotationRevision_quotationId_revision_idx" ON "QuotationRevision"("quotationId", "revision");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sarveda') THEN
    GRANT ALL ON TABLE "QuotationRevision" TO sarveda;
  END IF;
END $$;
