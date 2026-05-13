-- Order-level visibility when automatic shipment creation fails (e.g. Delhivery API).
ALTER TABLE "Order" ADD COLUMN "shippingLastError" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingLastErrorAt" TIMESTAMP(3);
