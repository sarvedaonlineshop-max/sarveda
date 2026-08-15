-- Per-variant audio sample (Woo product_audio_N linked by size/type title).
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "audioUrl" TEXT;
