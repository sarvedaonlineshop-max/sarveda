-- Per-variant video + product-level option axis display order.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "variantAxisOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
