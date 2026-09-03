-- Phase 4: Return economics capture + courier/vendor claims (no invented deduction formula)

CREATE TYPE "ReturnClaimStatus" AS ENUM (
  'OPEN',
  'SUBMITTED',
  'PARTIAL_RECOVERED',
  'RECOVERED',
  'REJECTED',
  'CLOSED',
  'WRITTEN_OFF'
);

CREATE TABLE IF NOT EXISTS "ReturnCaseEconomics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "customerPaidForwardShippingPaise" INTEGER,
  "actualForwardCourierCostPaise" INTEGER,
  "reversePickupCostPaise" INTEGER,
  "replacementShippingCostPaise" INTEGER,
  "merchandiseRefundPaise" INTEGER,
  "gstReversalPaise" INTEGER,
  "discountReversalPaise" INTEGER,
  "customerDeductionPaise" INTEGER,
  "customerDeductionLabel" TEXT,
  -- POLICY_DECISION_REQUIRED: reverse shipping deduction formula unresolved in Arjun SOP.
  "reverseShippingDeductionPaise" INTEGER,
  "reverseShippingDeductionPolicy" TEXT NOT NULL DEFAULT 'CONFIGURATION_PENDING',
  "inventoryWriteOffCostPaise" INTEGER,
  "otherCostPaise" INTEGER,
  "otherCostLabel" TEXT,
  "courierRecoveryPaise" INTEGER,
  "vendorRecoveryPaise" INTEGER,
  "otherRecoveryPaise" INTEGER,
  "otherRecoveryLabel" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnCaseEconomics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReturnCaseEconomics_requestId_key" ON "ReturnCaseEconomics"("requestId");
ALTER TABLE "ReturnCaseEconomics"
  ADD CONSTRAINT "ReturnCaseEconomics_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ReturnCourierClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "courierName" TEXT,
  "reason" TEXT NOT NULL,
  "claimedAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "recoveredAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "status" "ReturnClaimStatus" NOT NULL DEFAULT 'OPEN',
  "reference" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnCourierClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReturnCourierClaim_requestId_idx" ON "ReturnCourierClaim"("requestId");
CREATE INDEX IF NOT EXISTS "ReturnCourierClaim_status_idx" ON "ReturnCourierClaim"("status");
ALTER TABLE "ReturnCourierClaim"
  ADD CONSTRAINT "ReturnCourierClaim_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ReturnVendorClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "vendorId" UUID,
  "vendorNameSnapshot" TEXT,
  "reason" TEXT NOT NULL,
  "claimedAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "recoveredAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "status" "ReturnClaimStatus" NOT NULL DEFAULT 'OPEN',
  "reference" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnVendorClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReturnVendorClaim_requestId_idx" ON "ReturnVendorClaim"("requestId");
CREATE INDEX IF NOT EXISTS "ReturnVendorClaim_status_idx" ON "ReturnVendorClaim"("status");
ALTER TABLE "ReturnVendorClaim"
  ADD CONSTRAINT "ReturnVendorClaim_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
