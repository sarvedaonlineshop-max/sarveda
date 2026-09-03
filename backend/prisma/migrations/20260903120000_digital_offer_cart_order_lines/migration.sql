-- Detach digital course/event checkout from ProductVariant on cart/order lines.
ALTER TABLE "CartItem" ALTER COLUMN "variantId" DROP NOT NULL;
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "digitalOfferId" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_digitalOfferId_key" ON "CartItem"("cartId", "digitalOfferId");
CREATE INDEX IF NOT EXISTS "CartItem_digitalOfferId_idx" ON "CartItem"("digitalOfferId");
DO $$ BEGIN
  ALTER TABLE "CartItem"
    ADD CONSTRAINT "CartItem_digitalOfferId_fkey"
    FOREIGN KEY ("digitalOfferId") REFERENCES "DigitalCheckoutOffer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrderItem" ALTER COLUMN "variantId" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "digitalOfferId" UUID;
CREATE INDEX IF NOT EXISTS "OrderItem_digitalOfferId_idx" ON "OrderItem"("digitalOfferId");
DO $$ BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_digitalOfferId_fkey"
    FOREIGN KEY ("digitalOfferId") REFERENCES "DigitalCheckoutOffer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
