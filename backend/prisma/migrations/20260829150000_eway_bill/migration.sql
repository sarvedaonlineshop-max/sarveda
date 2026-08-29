-- Additive: EWayBill + EWayBillItem (manual EBN recording; no accounting / NIC / GSP).

CREATE TYPE "EWayBillStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'GENERATED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "EWayBillSourceDocumentType" AS ENUM ('TAX_INVOICE', 'DELIVERY_CHALLAN');
CREATE TYPE "EWayBillGenerationMethod" AS ENUM ('MANUAL', 'API');
CREATE TYPE "EWayBillTransportMode" AS ENUM ('ROAD', 'RAIL', 'AIR', 'SHIP');

CREATE TABLE "EWayBill" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "shipmentId" UUID,
    "sourceDocumentType" "EWayBillSourceDocumentType" NOT NULL,
    "sourceInvoiceId" UUID,
    "sourceDeliveryChallanId" UUID,
    "sourceDocumentNumber" TEXT NOT NULL,
    "sourceDocumentDate" TIMESTAMP(3) NOT NULL,
    "ebn" TEXT,
    "ewbDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "status" "EWayBillStatus" NOT NULL DEFAULT 'PENDING',
    "transactionType" TEXT,
    "subSupplyType" TEXT,
    "subSupplyDesc" TEXT,
    "buyerGstin" TEXT,
    "transporterName" TEXT,
    "transporterId" TEXT,
    "transportDocNo" TEXT,
    "transportDocDate" TIMESTAMP(3),
    "transportMode" "EWayBillTransportMode",
    "vehicleNumber" TEXT,
    "vehicleType" TEXT,
    "approxDistanceKm" INTEGER,
    "notes" TEXT,
    "generationMethod" "EWayBillGenerationMethod" NOT NULL DEFAULT 'MANUAL',
    "provider" TEXT,
    "providerRequestId" TEXT,
    "providerResponseJson" JSONB,
    "recordedByUserId" UUID,
    "documentValueInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxableValueInPaise" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EWayBill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EWayBillItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ewayBillId" UUID NOT NULL,
    "orderItemId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'NOS',
    "taxableValueInPaise" INTEGER NOT NULL DEFAULT 0,
    "gstRatePercent" INTEGER NOT NULL DEFAULT 0,
    "cgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "igstInPaise" INTEGER NOT NULL DEFAULT 0,
    "cessInPaise" INTEGER NOT NULL DEFAULT 0,
    "lineTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EWayBillItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EWayBill_ebn_key" ON "EWayBill"("ebn");
CREATE INDEX "EWayBill_orderId_createdAt_idx" ON "EWayBill"("orderId", "createdAt");
CREATE INDEX "EWayBill_status_idx" ON "EWayBill"("status");
CREATE INDEX "EWayBill_sourceInvoiceId_idx" ON "EWayBill"("sourceInvoiceId");
CREATE INDEX "EWayBill_sourceDeliveryChallanId_idx" ON "EWayBill"("sourceDeliveryChallanId");
CREATE INDEX "EWayBill_shipmentId_idx" ON "EWayBill"("shipmentId");
CREATE INDEX "EWayBillItem_ewayBillId_idx" ON "EWayBillItem"("ewayBillId");
CREATE INDEX "EWayBillItem_orderItemId_idx" ON "EWayBillItem"("orderItemId");

ALTER TABLE "EWayBill" ADD CONSTRAINT "EWayBill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EWayBill" ADD CONSTRAINT "EWayBill_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EWayBill" ADD CONSTRAINT "EWayBill_sourceInvoiceId_fkey" FOREIGN KEY ("sourceInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EWayBill" ADD CONSTRAINT "EWayBill_sourceDeliveryChallanId_fkey" FOREIGN KEY ("sourceDeliveryChallanId") REFERENCES "DeliveryChallan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EWayBillItem" ADD CONSTRAINT "EWayBillItem_ewayBillId_fkey" FOREIGN KEY ("ewayBillId") REFERENCES "EWayBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
