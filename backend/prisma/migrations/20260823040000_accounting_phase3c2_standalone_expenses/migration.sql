-- Phase 3C2: standalone expense account/payment mappings + CoA opex accounts

CREATE TABLE "AccountingExpenseAccountMapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "normalizedSourceName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountingAccountCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExpenseAccountMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingExpenseAccountMapping_normalizedSourceName_key" ON "AccountingExpenseAccountMapping"("normalizedSourceName");
CREATE INDEX "AccountingExpenseAccountMapping_accountingAccountCode_idx" ON "AccountingExpenseAccountMapping"("accountingAccountCode");
CREATE INDEX "AccountingExpenseAccountMapping_isActive_idx" ON "AccountingExpenseAccountMapping"("isActive");

CREATE TABLE "AccountingExpensePaymentMapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "normalizedSourceName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "paidAccountCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExpensePaymentMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingExpensePaymentMapping_normalizedSourceName_key" ON "AccountingExpensePaymentMapping"("normalizedSourceName");
CREATE INDEX "AccountingExpensePaymentMapping_paidAccountCode_idx" ON "AccountingExpensePaymentMapping"("paidAccountCode");
CREATE INDEX "AccountingExpensePaymentMapping_isActive_idx" ON "AccountingExpensePaymentMapping"("isActive");

-- Additive EXPENSE-type CoA for recurring opex categories (idempotent seed also in seed-coa.ts)
INSERT INTO "AccountingAccount" ("id", "code", "name", "type", "description", "isSystem", "isActive", "currency", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), '5310', 'Office Expense', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5320', 'Professional Fees', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5330', 'Utilities', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5340', 'Travel', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5350', 'Repairs & Maintenance', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5360', 'Marketing / Advertising', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5370', 'Software / Subscription', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW()),
  (gen_random_uuid(), '5380', 'Misc Operating Expense', 'EXPENSE', 'Phase 3C2 opex category', true, true, 'INR', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
