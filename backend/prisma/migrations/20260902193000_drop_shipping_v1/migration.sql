-- Drop shipping V1: fulfilment policy on variant + order-line warehouse/dropship snapshot.

ALTER TABLE "ProductVariant" ADD COLUMN "dropShipEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem" ADD COLUMN "warehouseFulfillmentQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "dropShipFulfillmentQty" INTEGER NOT NULL DEFAULT 0;

-- Existing orders: treat full qty as warehouse fulfilment (pre-dropship behaviour).
UPDATE "OrderItem"
SET "warehouseFulfillmentQty" = "qtyOrdered"
WHERE "warehouseFulfillmentQty" = 0 AND "dropShipFulfillmentQty" = 0;
