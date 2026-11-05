ALTER TABLE "CrmChatNote" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'NOTE';

CREATE TABLE IF NOT EXISTS "CrmDeliveryFeedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orderId" UUID NOT NULL,
  "enquiryThreadId" UUID,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "rating" INTEGER,
  "response" TEXT,
  "consent" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDeliveryFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmDeliveryFeedback_orderId_key" ON "CrmDeliveryFeedback"("orderId");
CREATE INDEX IF NOT EXISTS "CrmDeliveryFeedback_status_scheduledFor_idx" ON "CrmDeliveryFeedback"("status", "scheduledFor");

CREATE TABLE IF NOT EXISTS "CrmIssue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "orderId" UUID,
  "orderNumber" TEXT,
  "enquiryThreadId" UUID,
  "sku" TEXT,
  "productName" TEXT,
  "supplier" TEXT,
  "ownerEmail" TEXT,
  "summary" TEXT NOT NULL,
  "correctiveAction" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIssue_sourceKey_key" ON "CrmIssue"("sourceKey");
CREATE INDEX IF NOT EXISTS "CrmIssue_orderId_idx" ON "CrmIssue"("orderId");
CREATE INDEX IF NOT EXISTS "CrmIssue_enquiryThreadId_idx" ON "CrmIssue"("enquiryThreadId");
CREATE INDEX IF NOT EXISTS "CrmIssue_status_idx" ON "CrmIssue"("status");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sarveda') THEN
    GRANT ALL ON TABLE "CrmDeliveryFeedback" TO sarveda;
    GRANT ALL ON TABLE "CrmIssue" TO sarveda;
  END IF;
END $$;
