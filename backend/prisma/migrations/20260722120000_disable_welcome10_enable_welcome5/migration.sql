-- Disable legacy WELCOME10; keep WELCOME5 as the only first-order welcome offer.
UPDATE "Coupon"
SET "isActive" = false
WHERE "code" = 'WELCOME10';

INSERT INTO "Coupon" (
  "id",
  "code",
  "type",
  "value",
  "minOrderInPaise",
  "maxUsageTotal",
  "maxUsagePerUser",
  "usageCount",
  "validFrom",
  "validUntil",
  "isActive",
  "description",
  "createdAt"
)
VALUES (
  gen_random_uuid(),
  'WELCOME5',
  'PERCENTAGE',
  5,
  0,
  NULL,
  1,
  0,
  NULL,
  NULL,
  true,
  'Welcome 5% off your first order',
  NOW()
)
ON CONFLICT ("code") DO UPDATE SET
  "type" = EXCLUDED."type",
  "value" = EXCLUDED."value",
  "maxUsagePerUser" = EXCLUDED."maxUsagePerUser",
  "isActive" = true,
  "description" = EXCLUDED."description";
