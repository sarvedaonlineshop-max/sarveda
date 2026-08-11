-- Cost (INR) + AED/Dinar pricing for admin XL catalog sheet
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "costInPaise" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "mrpAedFils" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "saleAedFils" INTEGER;
