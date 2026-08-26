-- Phase 3D4 ops prerequisite: OrderItem-level physical restock events.
-- Distinct from monetary Refund rows. Accounting must not invent COGS from Refund.amount.

CREATE TYPE "OrderInventoryRestockDisposition" AS ENUM ('SELLABLE', 'DAMAGED', 'NON_RESTOCKABLE');

CREATE TYPE "OrderInventoryRestockSourceType" AS ENUM ('FULL_ORDER_STATUS_CHANGE', 'ADMIN_EXPLICIT');

CREATE TABLE "order_inventory_restock_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "disposition" "OrderInventoryRestockDisposition" NOT NULL,
    "inventoryIncremented" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "OrderInventoryRestockSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reason" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_inventory_restock_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_inventory_restock_events_sourceType_sourceId_orderItemId_key"
  ON "order_inventory_restock_events"("sourceType", "sourceId", "orderItemId");

CREATE INDEX "order_inventory_restock_events_orderId_createdAt_idx"
  ON "order_inventory_restock_events"("orderId", "createdAt");

CREATE INDEX "order_inventory_restock_events_orderItemId_idx"
  ON "order_inventory_restock_events"("orderItemId");

CREATE INDEX "order_inventory_restock_events_variantId_idx"
  ON "order_inventory_restock_events"("variantId");

ALTER TABLE "order_inventory_restock_events"
  ADD CONSTRAINT "order_inventory_restock_events_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_inventory_restock_events"
  ADD CONSTRAINT "order_inventory_restock_events_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
