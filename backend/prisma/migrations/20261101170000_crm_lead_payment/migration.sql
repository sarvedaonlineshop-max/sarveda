CREATE TABLE IF NOT EXISTS "CrmLeadPayment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "enquiryThreadId" UUID NOT NULL,
  "quotationId" UUID,
  "orderId" UUID,
  "method" TEXT NOT NULL DEFAULT 'PREPAID',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "totalInPaise" INTEGER NOT NULL,
  "dueAt" TIMESTAMP(3),
  "paymentLinkUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmLeadPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadPayment_enquiryThreadId_key" ON "CrmLeadPayment"("enquiryThreadId");
CREATE INDEX IF NOT EXISTS "CrmLeadPayment_orderId_idx" ON "CrmLeadPayment"("orderId");
CREATE INDEX IF NOT EXISTS "CrmLeadPayment_quotationId_idx" ON "CrmLeadPayment"("quotationId");

CREATE TABLE IF NOT EXISTS "CrmLeadPaymentReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leadPaymentId" UUID NOT NULL,
  "amountInPaise" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "recordedByEmail" TEXT,
  "verifiedByEmail" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "orderPaymentId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmLeadPaymentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadPaymentReceipt_orderPaymentId_key" ON "CrmLeadPaymentReceipt"("orderPaymentId");
CREATE INDEX IF NOT EXISTS "CrmLeadPaymentReceipt_leadPaymentId_createdAt_idx" ON "CrmLeadPaymentReceipt"("leadPaymentId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmLeadPaymentReceipt_leadPaymentId_fkey') THEN
    ALTER TABLE "CrmLeadPaymentReceipt"
      ADD CONSTRAINT "CrmLeadPaymentReceipt_leadPaymentId_fkey"
      FOREIGN KEY ("leadPaymentId") REFERENCES "CrmLeadPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sarveda') THEN
    GRANT ALL ON TABLE "CrmLeadPayment" TO sarveda;
    GRANT ALL ON TABLE "CrmLeadPaymentReceipt" TO sarveda;
  END IF;
END $$;
