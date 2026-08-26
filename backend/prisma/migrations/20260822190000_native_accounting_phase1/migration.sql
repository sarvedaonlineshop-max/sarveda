-- Native accounting Phase 1 — accounting-only objects (no commerce table changes)

CREATE TYPE "AccountingAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "AccountingJournalStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');
CREATE TYPE "AccountingPostingEventStatus" AS ENUM ('PENDING', 'RETRYING', 'POSTED', 'FAILED', 'SKIPPED');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "AccountingAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountingAccountType" NOT NULL,
    "parentId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "zohoAccountId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingJournalEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entryNumber" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "memo" TEXT,
    "status" "AccountingJournalStatus" NOT NULL DEFAULT 'DRAFT',
    "postedAt" TIMESTAMP(3),
    "postedByUserId" UUID,
    "totalDebitInPaise" INTEGER NOT NULL DEFAULT 0,
    "totalCreditInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingJournalLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journalEntryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "debitInPaise" INTEGER NOT NULL DEFAULT 0,
    "creditInPaise" INTEGER NOT NULL DEFAULT 0,
    "lineMemo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "documentLinkId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingJournalLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountingJournalLine_nonneg_check" CHECK ("debitInPaise" >= 0 AND "creditInPaise" >= 0),
    CONSTRAINT "AccountingJournalLine_debit_credit_xor_check" CHECK (
        ("debitInPaise" > 0 AND "creditInPaise" = 0) OR ("creditInPaise" > 0 AND "debitInPaise" = 0)
    )
);

CREATE TABLE "AccountingPostingEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "payloadJson" JSONB,
    "status" "AccountingPostingEventStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "journalEntryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPostingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingDocumentLink" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentType" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "zohoDocumentId" TEXT,
    "zohoDocumentType" TEXT,

    CONSTRAINT "AccountingDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPeriod" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingSequence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequenceType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "yearMonth" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingAuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingAccount_code_key" ON "AccountingAccount"("code");
CREATE INDEX "AccountingAccount_type_idx" ON "AccountingAccount"("type");
CREATE INDEX "AccountingAccount_isActive_idx" ON "AccountingAccount"("isActive");
CREATE INDEX "AccountingAccount_parentId_idx" ON "AccountingAccount"("parentId");

CREATE UNIQUE INDEX "AccountingJournalEntry_entryNumber_key" ON "AccountingJournalEntry"("entryNumber");
CREATE INDEX "AccountingJournalEntry_entryDate_idx" ON "AccountingJournalEntry"("entryDate");
CREATE INDEX "AccountingJournalEntry_status_idx" ON "AccountingJournalEntry"("status");
CREATE INDEX "AccountingJournalEntry_postedAt_idx" ON "AccountingJournalEntry"("postedAt");

CREATE INDEX "AccountingJournalLine_journalEntryId_idx" ON "AccountingJournalLine"("journalEntryId");
CREATE INDEX "AccountingJournalLine_accountId_idx" ON "AccountingJournalLine"("accountId");

CREATE UNIQUE INDEX "AccountingPostingEvent_journalEntryId_key" ON "AccountingPostingEvent"("journalEntryId");
CREATE UNIQUE INDEX "AccountingPostingEvent_eventType_uniqueKey_key" ON "AccountingPostingEvent"("eventType", "uniqueKey");
CREATE INDEX "AccountingPostingEvent_status_idx" ON "AccountingPostingEvent"("status");
CREATE INDEX "AccountingPostingEvent_createdAt_idx" ON "AccountingPostingEvent"("createdAt");
CREATE INDEX "AccountingPostingEvent_sourceType_sourceId_idx" ON "AccountingPostingEvent"("sourceType", "sourceId");

CREATE UNIQUE INDEX "AccountingDocumentLink_documentType_documentId_journalEntryId_key" ON "AccountingDocumentLink"("documentType", "documentId", "journalEntryId");
CREATE INDEX "AccountingDocumentLink_documentType_documentId_idx" ON "AccountingDocumentLink"("documentType", "documentId");

CREATE UNIQUE INDEX "AccountingPeriod_startDate_endDate_key" ON "AccountingPeriod"("startDate", "endDate");
CREATE INDEX "AccountingPeriod_status_idx" ON "AccountingPeriod"("status");

CREATE UNIQUE INDEX "AccountingSequence_sequenceType_yearMonth_key" ON "AccountingSequence"("sequenceType", "yearMonth");

CREATE INDEX "AccountingAuditLog_entityType_entityId_idx" ON "AccountingAuditLog"("entityType", "entityId");
CREATE INDEX "AccountingAuditLog_createdAt_idx" ON "AccountingAuditLog"("createdAt");

ALTER TABLE "AccountingAccount" ADD CONSTRAINT "AccountingAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingJournalLine" ADD CONSTRAINT "AccountingJournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingJournalLine" ADD CONSTRAINT "AccountingJournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingJournalLine" ADD CONSTRAINT "AccountingJournalLine_documentLinkId_fkey" FOREIGN KEY ("documentLinkId") REFERENCES "AccountingDocumentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingPostingEvent" ADD CONSTRAINT "AccountingPostingEvent_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingDocumentLink" ADD CONSTRAINT "AccountingDocumentLink_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
