-- MAN-008: per-line shipping policy + review decisions on return case items.
CREATE TYPE "ReturnLineReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED');

ALTER TYPE "OrderServiceRequestStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPROVED';

ALTER TABLE "OrderServiceRequestItem"
  ADD COLUMN IF NOT EXISTS "shippingRefundPolicy" "ReturnShippingRefundPolicy",
  ADD COLUMN IF NOT EXISTS "reviewDecision" "ReturnLineReviewDecision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "reviewedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "customerFacingNote" TEXT,
  ADD COLUMN IF NOT EXISTS "internalReviewNote" TEXT,
  ADD COLUMN IF NOT EXISTS "moreInfoPrompt" TEXT;

CREATE INDEX IF NOT EXISTS "OrderServiceRequestItem_reviewDecision_idx"
  ON "OrderServiceRequestItem"("reviewDecision");
