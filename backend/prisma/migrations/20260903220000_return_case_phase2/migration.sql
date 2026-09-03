-- Phase 2: Return Case architecture on OrderServiceRequest

-- Enums
CREATE TYPE "ReturnRootCause" AS ENUM (
  'CUSTOMER',
  'SARVEDA_DISPATCH',
  'SARVEDA_LISTING_CONTENT',
  'PRODUCT_VENDOR_QC',
  'LOGISTICS_COURIER',
  'UNDETERMINED'
);

CREATE TYPE "ReturnResponsibleTeam" AS ENUM (
  'DISPATCH',
  'PRODUCT_QC',
  'CONTENT',
  'LOGISTICS',
  'CUSTOMER_CARE',
  'MANAGER',
  'VENDOR',
  'UNASSIGNED'
);

CREATE TYPE "ReturnCaseChannel" AS ENUM (
  'WEBSITE',
  'AMAZON',
  'OTHER_MARKETPLACE',
  'MANUAL'
);

CREATE TYPE "OrderServiceRequestEventType" AS ENUM (
  'CASE_CREATED',
  'EVIDENCE_ADDED',
  'MORE_INFO_REQUESTED',
  'MORE_INFO_PROVIDED',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
  'ROOT_CAUSE_SET',
  'PICKUP_REQUESTED',
  'CUSTOMER_SELF_SHIP_SUBMITTED',
  'ITEM_RECEIVED',
  'QC_PERFORMED',
  'DISPOSITION_SELECTED',
  'REFUND_APPROVED',
  'REFUND_INITIATED',
  'REFUND_COMPLETED',
  'REPLACEMENT_INITIATED',
  'REPLACEMENT_SHIPPED',
  'REPLACEMENT_DELIVERED',
  'MISSING_PART_SHIPPED',
  'CLAIM_OPENED',
  'CLAIM_CLOSED',
  'CASE_CLOSED',
  'NOTE_ADDED',
  'STATUS_CHANGED'
);

ALTER TYPE "OrderServiceRequestStatus" ADD VALUE IF NOT EXISTS 'MORE_INFO_REQUIRED';
ALTER TYPE "ReturnReplacementResolution" ADD VALUE IF NOT EXISTS 'MISSING_PART';
ALTER TYPE "ReturnResolutionStatus" ADD VALUE IF NOT EXISTS 'MISSING_PART_PENDING';
ALTER TYPE "ReturnResolutionStatus" ADD VALUE IF NOT EXISTS 'MISSING_PART_SHIPPED';

-- Case fields on OrderServiceRequest
ALTER TABLE "OrderServiceRequest"
  ADD COLUMN IF NOT EXISTS "caseNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "channel" "ReturnCaseChannel" NOT NULL DEFAULT 'WEBSITE',
  ADD COLUMN IF NOT EXISTS "secondaryReasonCode" TEXT,
  ADD COLUMN IF NOT EXISTS "secondaryReasonLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "rootCause" "ReturnRootCause",
  ADD COLUMN IF NOT EXISTS "rootCauseNote" TEXT,
  ADD COLUMN IF NOT EXISTS "responsibleTeam" "ReturnResponsibleTeam",
  ADD COLUMN IF NOT EXISTS "responsibleUserId" UUID,
  ADD COLUMN IF NOT EXISTS "responsibleUserEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "declarationsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "declarationsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moreInfoPrompt" TEXT,
  ADD COLUMN IF NOT EXISTS "moreInfoRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moreInfoResponse" TEXT,
  ADD COLUMN IF NOT EXISTS "moreInfoRespondedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "slaPausedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundInitiatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundProviderReference" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "offeredResolution" "ReturnReplacementResolution",
  ADD COLUMN IF NOT EXISTS "finalResolution" "ReturnReplacementResolution";

-- Backfill case numbers for existing rows (stable, deterministic from id prefix)
UPDATE "OrderServiceRequest"
SET "caseNumber" = 'RC-LEGACY-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 10))
WHERE "caseNumber" IS NULL;

ALTER TABLE "OrderServiceRequest" ALTER COLUMN "caseNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "OrderServiceRequest_caseNumber_key" ON "OrderServiceRequest"("caseNumber");
CREATE INDEX IF NOT EXISTS "OrderServiceRequest_channel_idx" ON "OrderServiceRequest"("channel");
CREATE INDEX IF NOT EXISTS "OrderServiceRequest_rootCause_idx" ON "OrderServiceRequest"("rootCause");
CREATE INDEX IF NOT EXISTS "OrderServiceRequest_type_status_idx" ON "OrderServiceRequest"("type", "status");

-- Photo mime/kind for video support
ALTER TABLE "OrderServiceRequestPhoto"
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "mediaKind" TEXT NOT NULL DEFAULT 'IMAGE';

-- Append-only case event log
CREATE TABLE IF NOT EXISTS "OrderServiceRequestEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "eventType" "OrderServiceRequestEventType" NOT NULL,
  "message" TEXT,
  "payloadJson" JSONB,
  "actorUserId" UUID,
  "actorEmail" TEXT,
  "actorRole" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderServiceRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderServiceRequestEvent_requestId_createdAt_idx"
  ON "OrderServiceRequestEvent"("requestId", "createdAt");

ALTER TABLE "OrderServiceRequestEvent"
  ADD CONSTRAINT "OrderServiceRequestEvent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
