-- Per-order courier preference and zone snapshot
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "preferredCourier" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingZone" TEXT;

-- Per line-item warehouse (PickupLocation)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "pickupLocationId" UUID;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_pickupLocationId_fkey"
  FOREIGN KEY ("pickupLocationId") REFERENCES "PickupLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "OrderItem_pickupLocationId_idx" ON "OrderItem"("pickupLocationId");
