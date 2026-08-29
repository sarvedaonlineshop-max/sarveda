-- Additive: DeliveryChallan + DeliveryChallanItem (logistics docs; no accounting).

CREATE TYPE "DeliveryChallanReason" AS ENUM ('SUPPLY_DELIVERY', 'JOB_WORK', 'SAMPLE', 'REPLACEMENT', 'RETURN', 'OTHER');

CREATE TYPE "DeliveryChallanStatus" AS ENUM ('ISSUED', 'CANCELLED');

CREATE TABLE "DeliveryChallan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "challanNumber" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "challanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "DeliveryChallanReason" NOT NULL DEFAULT 'SUPPLY_DELIVERY',
    "reasonOther" TEXT,
    "status" "DeliveryChallanStatus" NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "orderNumberSnapshot" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerPhone" TEXT,
    "buyerGstin" TEXT,
    "consigneeAddress" JSONB NOT NULL,
    "billToAddress" JSONB,
    "originState" TEXT,
    "originCountry" TEXT DEFAULT 'IN',
    "destinationState" TEXT,
    "destinationCountry" TEXT,
    "destinationPincode" TEXT,
    "shipmentId" UUID,
    "carrierSnapshot" TEXT,
    "awbSnapshot" TEXT,
    "trackingUrlSnapshot" TEXT,
    "taxableValueInPaise" INTEGER NOT NULL DEFAULT 0,
    "grandTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChallan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryChallanItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deliveryChallanId" UUID NOT NULL,
    "orderItemId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceInPaise" INTEGER NOT NULL DEFAULT 0,
    "lineTotalInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxableInPaise" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChallanItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryChallan_challanNumber_key" ON "DeliveryChallan"("challanNumber");
CREATE UNIQUE INDEX "DeliveryChallan_orderId_key" ON "DeliveryChallan"("orderId");
CREATE INDEX "DeliveryChallan_challanDate_idx" ON "DeliveryChallan"("challanDate");
CREATE INDEX "DeliveryChallan_status_idx" ON "DeliveryChallan"("status");
CREATE INDEX "DeliveryChallan_shipmentId_idx" ON "DeliveryChallan"("shipmentId");
CREATE INDEX "DeliveryChallanItem_deliveryChallanId_idx" ON "DeliveryChallanItem"("deliveryChallanId");
CREATE INDEX "DeliveryChallanItem_orderItemId_idx" ON "DeliveryChallanItem"("orderItemId");

ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_deliveryChallanId_fkey" FOREIGN KEY ("deliveryChallanId") REFERENCES "DeliveryChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
