-- Phase 2: After-delivery return / replacement workflow

CREATE TYPE "ReturnReplacementResolution" AS ENUM (
  'RETURN_FOR_REFUND',
  'REPLACEMENT',
  'PARTIAL_REFUND',
  'KEEP_ITEM_PARTIAL_REFUND'
);

CREATE TYPE "ReturnPhysicalStatus" AS ENUM (
  'NOT_REQUIRED',
  'AWAITING_RETURN',
  'IN_TRANSIT',
  'RECEIVED',
  'INSPECTED'
);

CREATE TYPE "ReturnResolutionStatus" AS ENUM (
  'NONE',
  'REFUND_PENDING',
  'REFUND_PROCESSING',
  'REFUNDED',
  'REPLACEMENT_PENDING',
  'REPLACEMENT_SHIPPED',
  'REPLACEMENT_DELIVERED',
  'CLOSED',
  'FAILED'
);

CREATE TYPE "ReturnShippingRefundPolicy" AS ENUM (
  'SHIPPING_RETAINED',
  'SHIPPING_REFUNDABLE',
  'MANUAL_REVIEW'
);

CREATE TYPE "ReturnShipmentMode" AS ENUM (
  'MANUAL_RETURN_SHIPMENT',
  'REVERSE_PICKUP'
);

ALTER TYPE "OrderInventoryRestockSourceType" ADD VALUE IF NOT EXISTS 'CUSTOMER_RETURN_RECEIPT';

ALTER TABLE "OrderServiceRequest"
  ADD COLUMN "returnPhysicalStatus" "ReturnPhysicalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "resolutionStatus" "ReturnResolutionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "shippingRefundPolicy" "ReturnShippingRefundPolicy",
  ADD COLUMN "returnPayload" JSONB;

ALTER TABLE "OrderServiceRequestItem"
  ADD COLUMN "requestedResolution" "ReturnReplacementResolution",
  ADD COLUMN "requestedVariantId" UUID;

ALTER TABLE "OrderServiceRequest"
  ALTER COLUMN "requestIntent" SET DEFAULT 'REFUND';

CREATE TABLE "OrderReturnShipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "mode" "ReturnShipmentMode" NOT NULL DEFAULT 'MANUAL_RETURN_SHIPMENT',
  "courier" TEXT,
  "awb" TEXT,
  "trackingUrl" TEXT,
  "physicalStatus" "ReturnPhysicalStatus" NOT NULL DEFAULT 'AWAITING_RETURN',
  "receivedAt" TIMESTAMPTZ,
  "receivedByUserId" UUID,
  "disposition" "RtoDisposition",
  "dispositionAt" TIMESTAMPTZ,
  "dispositionByUserId" UUID,
  "adminNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReturnShipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderReturnShipment_requestId_key" ON "OrderReturnShipment"("requestId");
CREATE INDEX "OrderReturnShipment_orderId_idx" ON "OrderReturnShipment"("orderId");

ALTER TABLE "OrderReturnShipment"
  ADD CONSTRAINT "OrderReturnShipment_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReturnShipment"
  ADD CONSTRAINT "OrderReturnShipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderReplacementFulfillment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "requestItemId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "replacementVariantId" UUID NOT NULL,
  "qty" INTEGER NOT NULL,
  "status" "ReturnResolutionStatus" NOT NULL DEFAULT 'REPLACEMENT_PENDING',
  "outboundShipmentId" UUID,
  "reservedAt" TIMESTAMPTZ,
  "shippedAt" TIMESTAMPTZ,
  "deliveredAt" TIMESTAMPTZ,
  "commercialDeltaPaise" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReplacementFulfillment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderReplacementFulfillment_requestItemId_key" ON "OrderReplacementFulfillment"("requestItemId");
CREATE INDEX "OrderReplacementFulfillment_requestId_idx" ON "OrderReplacementFulfillment"("requestId");

ALTER TABLE "OrderReplacementFulfillment"
  ADD CONSTRAINT "OrderReplacementFulfillment_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "OrderServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReplacementFulfillment"
  ADD CONSTRAINT "OrderReplacementFulfillment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
