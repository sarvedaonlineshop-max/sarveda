-- Phase 3B: add Inventory Purchases Clearing (accounting CoA only)

INSERT INTO "AccountingAccount" (
  "id",
  "code",
  "name",
  "type",
  "currency",
  "isActive",
  "isSystem",
  "description",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  '1210',
  'Inventory Purchases Clearing',
  'ASSET',
  'INR',
  true,
  true,
  'Supplier-billed inventory cost pending Phase 3D receipt/cost-layer capitalization. Do not treat as finished Inventory Asset.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "AccountingAccount" WHERE "code" = '1210'
);
