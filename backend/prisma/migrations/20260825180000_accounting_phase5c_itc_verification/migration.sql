-- Phase 5C: ITC evidence + immutable status history (claimability ≠ GL recognition)

CREATE TYPE "AccountingItcStatus" AS ENUM (
  'UNVERIFIED_PENDING_TAX_INVOICE',
  'ELIGIBLE',
  'BLOCKED',
  'REVERSED',
  'CLAIMED',
  'DATA_GAP'
);

CREATE TYPE "AccountingItcSourceType" AS ENUM (
  'VENDOR_BILL',
  'EXPENSE',
  'GATEWAY_SETTLEMENT'
);

CREATE TABLE "AccountingItcEvidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceType" "AccountingItcSourceType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "documentReference" TEXT,
    "supplierGstin" TEXT,
    "supplierName" TEXT,
    "documentDate" TIMESTAMP(3),
    "taxableValueInPaise" INTEGER NOT NULL DEFAULT 0,
    "cgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "igstInPaise" INTEGER NOT NULL DEFAULT 0,
    "totalGstInPaise" INTEGER NOT NULL DEFAULT 0,
    "recognizedInInputGl" BOOLEAN NOT NULL DEFAULT false,
    "postingEventId" UUID,
    "journalEntryId" UUID,
    "status" "AccountingItcStatus" NOT NULL DEFAULT 'UNVERIFIED_PENDING_TAX_INVOICE',
    "assessmentCode" TEXT,
    "assessmentJson" JSONB,
    "evidenceWarnings" JSONB,
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" UUID,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingItcEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingItcEvidence_uniqueKey_key"
  ON "AccountingItcEvidence"("uniqueKey");

CREATE UNIQUE INDEX "AccountingItcEvidence_sourceType_sourceId_key"
  ON "AccountingItcEvidence"("sourceType", "sourceId");

CREATE INDEX "AccountingItcEvidence_status_idx"
  ON "AccountingItcEvidence"("status");

CREATE INDEX "AccountingItcEvidence_sourceType_idx"
  ON "AccountingItcEvidence"("sourceType");

CREATE INDEX "AccountingItcEvidence_documentDate_idx"
  ON "AccountingItcEvidence"("documentDate");

CREATE INDEX "AccountingItcEvidence_supplierGstin_idx"
  ON "AccountingItcEvidence"("supplierGstin");

CREATE TABLE "AccountingItcStatusHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evidenceId" UUID NOT NULL,
    "oldStatus" "AccountingItcStatus",
    "newStatus" "AccountingItcStatus" NOT NULL,
    "actorUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingItcStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountingItcStatusHistory_evidenceId_createdAt_idx"
  ON "AccountingItcStatusHistory"("evidenceId", "createdAt");

CREATE INDEX "AccountingItcStatusHistory_createdAt_idx"
  ON "AccountingItcStatusHistory"("createdAt");

ALTER TABLE "AccountingItcStatusHistory"
  ADD CONSTRAINT "AccountingItcStatusHistory_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "AccountingItcEvidence"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
