-- Sarveda CRM foundation
-- Additive-only migration: creates new CRM types/tables and optional foreign keys.
-- No existing table is altered, renamed, dropped, or given new required columns.

CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST');
CREATE TYPE "CrmLeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'PHONE', 'EMAIL', 'REFERRAL', 'GOOGLE', 'META', 'MARKETPLACE', 'EVENT', 'OFFLINE', 'IMPORT', 'OTHER');
CREATE TYPE "CrmDealStatus" AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE "CrmStageType" AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE "CrmActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'TASK', 'QUOTATION', 'STATUS_CHANGE', 'SYSTEM');
CREATE TYPE "CrmTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CrmTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "CrmAccountKind" AS ENUM ('ORGANIZATION', 'INDIVIDUAL');

CREATE TABLE "CrmAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountNumber" TEXT,
    "kind" "CrmAccountKind" NOT NULL DEFAULT 'ORGANIZATION',
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsappPhone" TEXT,
    "gstin" TEXT,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "ownerUserId" UUID,
    "source" "CrmLeadSource",
    "notes" TEXT,
    "customFields" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmContact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contactNumber" TEXT,
    "accountId" UUID,
    "linkedUserId" UUID,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "whatsappPhone" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "preferredLanguage" TEXT,
    "ownerUserId" UUID,
    "source" "CrmLeadSource",
    "notes" TEXT,
    "customFields" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmPipeline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmPipelineStage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pipelineId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stageType" "CrmStageType" NOT NULL DEFAULT 'OPEN',
    "position" INTEGER NOT NULL DEFAULT 0,
    "probabilityPercent" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmLead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leadNumber" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "CrmLeadSource" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsappPhone" TEXT,
    "designation" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'IN',
    "ownerUserId" UUID,
    "estimatedValueInPaise" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expectedCloseDate" DATE,
    "interestSummary" TEXT,
    "attributionJson" JSONB,
    "customFields" JSONB,
    "enquiryThreadId" UUID,
    "convertedAccountId" UUID,
    "convertedContactId" UUID,
    "convertedDealId" UUID,
    "convertedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDeal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dealNumber" TEXT,
    "name" TEXT NOT NULL,
    "status" "CrmDealStatus" NOT NULL DEFAULT 'OPEN',
    "pipelineId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "accountId" UUID,
    "contactId" UUID,
    "sourceLeadId" UUID,
    "ownerUserId" UUID,
    "amountInPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "probabilityPercent" INTEGER,
    "expectedCloseDate" DATE,
    "closedAt" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "quotationId" UUID,
    "orderId" UUID,
    "notes" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDealProduct" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dealId" UUID NOT NULL,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceInPaise" INTEGER NOT NULL DEFAULT 0,
    "discountInPaise" INTEGER NOT NULL DEFAULT 0,
    "lineTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDealProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmActivity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "CrmActivityType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "accountId" UUID,
    "contactId" UUID,
    "leadId" UUID,
    "dealId" UUID,
    "enquiryThreadId" UUID,
    "quotationId" UUID,
    "orderId" UUID,
    "externalProvider" TEXT,
    "externalRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmTask" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CrmTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToUserId" UUID,
    "createdByUserId" UUID,
    "accountId" UUID,
    "contactId" UUID,
    "leadId" UUID,
    "dealId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmSequence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequenceType" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "yearMonth" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmAccount_accountNumber_key" ON "CrmAccount"("accountNumber");
CREATE INDEX "CrmAccount_name_idx" ON "CrmAccount"("name");
CREATE INDEX "CrmAccount_email_idx" ON "CrmAccount"("email");
CREATE INDEX "CrmAccount_phone_idx" ON "CrmAccount"("phone");
CREATE INDEX "CrmAccount_ownerUserId_idx" ON "CrmAccount"("ownerUserId");
CREATE INDEX "CrmAccount_isActive_idx" ON "CrmAccount"("isActive");

CREATE UNIQUE INDEX "CrmContact_contactNumber_key" ON "CrmContact"("contactNumber");
CREATE UNIQUE INDEX "CrmContact_linkedUserId_key" ON "CrmContact"("linkedUserId");
CREATE INDEX "CrmContact_accountId_idx" ON "CrmContact"("accountId");
CREATE INDEX "CrmContact_email_idx" ON "CrmContact"("email");
CREATE INDEX "CrmContact_phone_idx" ON "CrmContact"("phone");
CREATE INDEX "CrmContact_whatsappPhone_idx" ON "CrmContact"("whatsappPhone");
CREATE INDEX "CrmContact_ownerUserId_idx" ON "CrmContact"("ownerUserId");

CREATE UNIQUE INDEX "CrmPipeline_name_key" ON "CrmPipeline"("name");
CREATE INDEX "CrmPipeline_isActive_idx" ON "CrmPipeline"("isActive");
CREATE UNIQUE INDEX "CrmPipelineStage_pipelineId_name_key" ON "CrmPipelineStage"("pipelineId", "name");
CREATE INDEX "CrmPipelineStage_pipelineId_position_idx" ON "CrmPipelineStage"("pipelineId", "position");

CREATE UNIQUE INDEX "CrmLead_leadNumber_key" ON "CrmLead"("leadNumber");
CREATE UNIQUE INDEX "CrmLead_enquiryThreadId_key" ON "CrmLead"("enquiryThreadId");
CREATE UNIQUE INDEX "CrmLead_convertedDealId_key" ON "CrmLead"("convertedDealId");
CREATE INDEX "CrmLead_status_idx" ON "CrmLead"("status");
CREATE INDEX "CrmLead_source_idx" ON "CrmLead"("source");
CREATE INDEX "CrmLead_ownerUserId_status_idx" ON "CrmLead"("ownerUserId", "status");
CREATE INDEX "CrmLead_email_idx" ON "CrmLead"("email");
CREATE INDEX "CrmLead_phone_idx" ON "CrmLead"("phone");
CREATE INDEX "CrmLead_nextFollowUpAt_idx" ON "CrmLead"("nextFollowUpAt");
CREATE INDEX "CrmLead_createdAt_idx" ON "CrmLead"("createdAt");

CREATE UNIQUE INDEX "CrmDeal_dealNumber_key" ON "CrmDeal"("dealNumber");
CREATE INDEX "CrmDeal_pipelineId_stageId_idx" ON "CrmDeal"("pipelineId", "stageId");
CREATE INDEX "CrmDeal_ownerUserId_status_idx" ON "CrmDeal"("ownerUserId", "status");
CREATE INDEX "CrmDeal_accountId_idx" ON "CrmDeal"("accountId");
CREATE INDEX "CrmDeal_contactId_idx" ON "CrmDeal"("contactId");
CREATE INDEX "CrmDeal_sourceLeadId_idx" ON "CrmDeal"("sourceLeadId");
CREATE INDEX "CrmDeal_expectedCloseDate_idx" ON "CrmDeal"("expectedCloseDate");
CREATE INDEX "CrmDeal_quotationId_idx" ON "CrmDeal"("quotationId");
CREATE INDEX "CrmDeal_orderId_idx" ON "CrmDeal"("orderId");

CREATE INDEX "CrmDealProduct_dealId_sortOrder_idx" ON "CrmDealProduct"("dealId", "sortOrder");
CREATE INDEX "CrmDealProduct_variantId_idx" ON "CrmDealProduct"("variantId");

CREATE INDEX "CrmActivity_accountId_occurredAt_idx" ON "CrmActivity"("accountId", "occurredAt");
CREATE INDEX "CrmActivity_contactId_occurredAt_idx" ON "CrmActivity"("contactId", "occurredAt");
CREATE INDEX "CrmActivity_leadId_occurredAt_idx" ON "CrmActivity"("leadId", "occurredAt");
CREATE INDEX "CrmActivity_dealId_occurredAt_idx" ON "CrmActivity"("dealId", "occurredAt");
CREATE INDEX "CrmActivity_actorUserId_occurredAt_idx" ON "CrmActivity"("actorUserId", "occurredAt");
CREATE INDEX "CrmActivity_type_occurredAt_idx" ON "CrmActivity"("type", "occurredAt");
CREATE INDEX "CrmActivity_enquiryThreadId_idx" ON "CrmActivity"("enquiryThreadId");
CREATE INDEX "CrmActivity_quotationId_idx" ON "CrmActivity"("quotationId");
CREATE INDEX "CrmActivity_orderId_idx" ON "CrmActivity"("orderId");

CREATE INDEX "CrmTask_assignedToUserId_status_dueAt_idx" ON "CrmTask"("assignedToUserId", "status", "dueAt");
CREATE INDEX "CrmTask_leadId_idx" ON "CrmTask"("leadId");
CREATE INDEX "CrmTask_dealId_idx" ON "CrmTask"("dealId");
CREATE INDEX "CrmTask_contactId_idx" ON "CrmTask"("contactId");
CREATE INDEX "CrmTask_accountId_idx" ON "CrmTask"("accountId");

CREATE UNIQUE INDEX "CrmSequence_sequenceType_yearMonth_key" ON "CrmSequence"("sequenceType", "yearMonth");

ALTER TABLE "CrmAccount" ADD CONSTRAINT "CrmAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_enquiryThreadId_fkey" FOREIGN KEY ("enquiryThreadId") REFERENCES "EnquiryThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedAccountId_fkey" FOREIGN KEY ("convertedAccountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedContactId_fkey" FOREIGN KEY ("convertedContactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_convertedDealId_fkey" FOREIGN KEY ("convertedDealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "CrmPipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmPipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDealProduct" ADD CONSTRAINT "CrmDealProduct_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmDealProduct" ADD CONSTRAINT "CrmDealProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_enquiryThreadId_fkey" FOREIGN KEY ("enquiryThreadId") REFERENCES "EnquiryThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_probabilityPercent_check" CHECK ("probabilityPercent" >= 0 AND "probabilityPercent" <= 100);
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_probabilityPercent_check" CHECK ("probabilityPercent" IS NULL OR ("probabilityPercent" >= 0 AND "probabilityPercent" <= 100));
ALTER TABLE "CrmDealProduct" ADD CONSTRAINT "CrmDealProduct_quantity_check" CHECK ("quantity" > 0);
