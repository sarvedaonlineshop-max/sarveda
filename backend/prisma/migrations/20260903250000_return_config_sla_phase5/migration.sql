-- Phase 5: return policy configuration + audit + high-value approval gate fields

CREATE TABLE IF NOT EXISTS "ReturnPolicyConfig" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "description" TEXT,
  "updatedByUserId" UUID,
  "updatedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnPolicyConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReturnPolicyConfig_key_key" ON "ReturnPolicyConfig"("key");

CREATE TABLE IF NOT EXISTS "ReturnPolicyConfigAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "configKey" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB NOT NULL,
  "actorUserId" UUID,
  "actorEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnPolicyConfigAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReturnPolicyConfigAudit_configKey_createdAt_idx"
  ON "ReturnPolicyConfigAudit"("configKey", "createdAt");

ALTER TABLE "OrderServiceRequest"
  ADD COLUMN IF NOT EXISTS "highValueApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "highValueApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "highValueApprovedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "highValueApprovalNote" TEXT,
  ADD COLUMN IF NOT EXISTS "refundSlaDueAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "OrderServiceRequest_refundSlaDueAt_idx"
  ON "OrderServiceRequest"("refundSlaDueAt");

-- Seed default config (disabled high-value threshold = null / POLICY_DECISION_REQUIRED)
INSERT INTO "ReturnPolicyConfig" ("id", "key", "valueJson", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'return_window_days', '7'::jsonb, 'Customer return window after delivery (calendar days for eligibility; SLA uses working days)', NOW(), NOW()),
  (gen_random_uuid(), 'replacement_window_days', '7'::jsonb, 'Replacement request window after delivery', NOW(), NOW()),
  (gen_random_uuid(), 'high_value_approval_threshold_paise', 'null'::jsonb, 'POLICY_DECISION_REQUIRED — null disables automatic high-value gate', NOW(), NOW()),
  (gen_random_uuid(), 'sla_refund_working_days', '7'::jsonb, 'Target max working days to initiate refund after approval or warehouse QC', NOW(), NOW()),
  (gen_random_uuid(), 'sla_first_review_working_days', '2'::jsonb, 'Target working days request → first review', NOW(), NOW()),
  (gen_random_uuid(), 'alert_sku_return_rate_pct', '15'::jsonb, 'Flag SKUs exceeding this return rate % in lookback window', NOW(), NOW()),
  (gen_random_uuid(), 'alert_lookback_days', '90'::jsonb, 'Lookback window for analytics alerts', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
