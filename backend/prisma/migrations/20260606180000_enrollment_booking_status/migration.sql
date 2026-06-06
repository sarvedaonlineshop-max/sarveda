-- CreateEnum
CREATE TYPE "DigitalAccessStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN "orderId" UUID,
ADD COLUMN "status" "DigitalAccessStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "orderId" UUID,
ADD COLUMN "status" "DigitalAccessStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Enrollment_orderId_idx" ON "Enrollment"("orderId");

-- CreateIndex
CREATE INDEX "Booking_orderId_idx" ON "Booking"("orderId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
