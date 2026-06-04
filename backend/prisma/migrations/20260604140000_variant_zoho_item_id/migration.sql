ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "zohoItemId" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "ProductVariant_zohoItemId_idx" ON "ProductVariant"("zohoItemId");
