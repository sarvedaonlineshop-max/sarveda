-- Return case controlled refund override (audit fields; calculated amount preserved).
ALTER TABLE "OrderServiceRequest"
  ADD COLUMN IF NOT EXISTS "calculatedRefundPaise" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedOverrideRefundPaise" INTEGER,
  ADD COLUMN IF NOT EXISTS "overrideDifferencePaise" INTEGER,
  ADD COLUMN IF NOT EXISTS "overrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideActorId" UUID,
  ADD COLUMN IF NOT EXISTS "overrideActorEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overrideGoodwillPaise" INTEGER;
