-- Link product images to a specific variant (optional; null = shared gallery)
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "variantId" UUID;

ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ProductImage_variantId_idx" ON "ProductImage"("variantId");
