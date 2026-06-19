-- Delhivery One parity fields for pickup facilities
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "delhiveryPickupName" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'IN';
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "defaultPickupSlot" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "workingDays" JSONB;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnSameAsPickup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnLine1" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnLine2" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnCity" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnState" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnPostalCode" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN IF NOT EXISTS "returnCountry" TEXT;
