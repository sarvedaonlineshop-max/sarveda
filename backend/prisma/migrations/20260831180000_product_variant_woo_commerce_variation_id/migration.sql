-- Additive: historical Woo offer identity for Merchant continuity (gla_<id>).
-- Variable offers → Woo variation ID; simple offers → Woo product ID on the Sarveda variant.
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "wooCommerceVariationId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_wooCommerceVariationId_key"
  ON "ProductVariant"("wooCommerceVariationId");
