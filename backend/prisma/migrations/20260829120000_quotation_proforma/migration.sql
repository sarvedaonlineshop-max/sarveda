-- Additive: Quotation + QuotationItem (pre-sale commercial docs; no accounting).

CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED', 'CONVERTED');

CREATE TABLE "Quotation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quoteNumber" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID,
    "customerName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "buyerGstin" TEXT,
    "billingAddress" JSONB NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalInPaise" INTEGER NOT NULL,
    "discountInPaise" INTEGER NOT NULL DEFAULT 0,
    "shippingInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxInPaise" INTEGER NOT NULL DEFAULT 0,
    "grandTotalInPaise" INTEGER NOT NULL,
    "taxPreviewMode" TEXT,
    "cgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstInPaise" INTEGER NOT NULL DEFAULT 0,
    "igstInPaise" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "terms" TEXT,
    "notes" TEXT,
    "convertedOrderId" UUID,
    "quotePdfUrl" TEXT,
    "proformaPdfUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "proformaIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quotation_quoteNumber_key" ON "Quotation"("quoteNumber");
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");
CREATE INDEX "Quotation_createdAt_idx" ON "Quotation"("createdAt");
CREATE INDEX "Quotation_customerName_idx" ON "Quotation"("customerName");
CREATE INDEX "Quotation_email_idx" ON "Quotation"("email");
CREATE INDEX "Quotation_validUntil_idx" ON "Quotation"("validUntil");

CREATE TABLE "QuotationItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotationId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceInPaise" INTEGER NOT NULL,
    "discountInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxClass" TEXT,
    "taxRatePercent" INTEGER NOT NULL DEFAULT 0,
    "taxableInPaise" INTEGER NOT NULL DEFAULT 0,
    "taxInPaise" INTEGER NOT NULL DEFAULT 0,
    "lineTotalInPaise" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");
CREATE INDEX "QuotationItem_variantId_idx" ON "QuotationItem"("variantId");

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
