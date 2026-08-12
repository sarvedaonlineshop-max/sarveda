-- Historical Zoho Books invoices (all marketplaces) — isolated from Order tables
CREATE TABLE IF NOT EXISTS "ZohoHistoricalInvoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zohoInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "issuedDate" DATE,
    "dueDate" DATE,
    "status" TEXT NOT NULL,
    "customerName" TEXT,
    "customerIdZoho" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchangeRate" DOUBLE PRECISION,
    "subtotalInMinor" INTEGER NOT NULL DEFAULT 0,
    "discountInMinor" INTEGER NOT NULL DEFAULT 0,
    "shippingInMinor" INTEGER NOT NULL DEFAULT 0,
    "taxInMinor" INTEGER NOT NULL DEFAULT 0,
    "totalInMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceInMinor" INTEGER NOT NULL DEFAULT 0,
    "reportingTotalInInrPaise" INTEGER NOT NULL DEFAULT 0,
    "salesChannelRaw" TEXT,
    "marketplaceRaw" TEXT,
    "channelNormalized" TEXT NOT NULL,
    "ecomOrderId" TEXT,
    "ecomInvoiceNo" TEXT,
    "salesOrderNumber" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingCountry" TEXT,
    "billingPostalCode" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingCountry" TEXT,
    "notes" TEXT,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZohoHistoricalInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ZohoHistoricalInvoice_zohoInvoiceId_key" ON "ZohoHistoricalInvoice"("zohoInvoiceId");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoice_invoiceDate_idx" ON "ZohoHistoricalInvoice"("invoiceDate");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoice_channelNormalized_invoiceDate_idx" ON "ZohoHistoricalInvoice"("channelNormalized", "invoiceDate");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoice_status_invoiceDate_idx" ON "ZohoHistoricalInvoice"("status", "invoiceDate");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoice_currency_invoiceDate_idx" ON "ZohoHistoricalInvoice"("currency", "invoiceDate");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoice_invoiceNumber_idx" ON "ZohoHistoricalInvoice"("invoiceNumber");

CREATE TABLE IF NOT EXISTS "ZohoHistoricalInvoiceLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "lineIndex" INTEGER NOT NULL DEFAULT 0,
    "itemName" TEXT,
    "itemDesc" TEXT,
    "sku" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPriceInMinor" INTEGER NOT NULL DEFAULT 0,
    "lineTotalInMinor" INTEGER NOT NULL DEFAULT 0,
    "discountInMinor" INTEGER NOT NULL DEFAULT 0,
    "taxName" TEXT,
    "taxPercent" DOUBLE PRECISION,
    "taxAmountInMinor" INTEGER NOT NULL DEFAULT 0,
    "hsnSac" TEXT,

    CONSTRAINT "ZohoHistoricalInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ZohoHistoricalInvoiceLine_invoiceId_lineIndex_key" ON "ZohoHistoricalInvoiceLine"("invoiceId", "lineIndex");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoiceLine_sku_idx" ON "ZohoHistoricalInvoiceLine"("sku");
CREATE INDEX IF NOT EXISTS "ZohoHistoricalInvoiceLine_invoiceId_idx" ON "ZohoHistoricalInvoiceLine"("invoiceId");

DO $$ BEGIN
  ALTER TABLE "ZohoHistoricalInvoiceLine"
    ADD CONSTRAINT "ZohoHistoricalInvoiceLine_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "ZohoHistoricalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
