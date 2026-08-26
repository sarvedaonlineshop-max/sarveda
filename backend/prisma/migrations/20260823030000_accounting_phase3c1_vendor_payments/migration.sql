-- Phase 3C1: accounting-owned vendor payments + bill allocations

CREATE TYPE "AccountingVendorPaymentMethod" AS ENUM ('BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH');

CREATE TYPE "AccountingVendorPaymentStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

CREATE TABLE "AccountingVendorPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paymentNumber" TEXT NOT NULL,
    "vendorId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" "AccountingVendorPaymentMethod" NOT NULL,
    "paidAccountCode" TEXT NOT NULL,
    "utr" TEXT,
    "notes" TEXT,
    "status" "AccountingVendorPaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "sourcePayloadHash" TEXT NOT NULL,
    "postingEventId" UUID,
    "journalEntryId" UUID,
    "createdByUserId" UUID,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingVendorPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingVendorPaymentAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paymentId" UUID NOT NULL,
    "vendorBillId" UUID NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingVendorPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingVendorPayment_paymentNumber_key" ON "AccountingVendorPayment"("paymentNumber");
CREATE UNIQUE INDEX "AccountingVendorPayment_postingEventId_key" ON "AccountingVendorPayment"("postingEventId");
CREATE UNIQUE INDEX "AccountingVendorPayment_journalEntryId_key" ON "AccountingVendorPayment"("journalEntryId");
CREATE INDEX "AccountingVendorPayment_vendorId_idx" ON "AccountingVendorPayment"("vendorId");
CREATE INDEX "AccountingVendorPayment_paymentDate_idx" ON "AccountingVendorPayment"("paymentDate");
CREATE INDEX "AccountingVendorPayment_status_idx" ON "AccountingVendorPayment"("status");

CREATE UNIQUE INDEX "AccountingVendorPaymentAllocation_paymentId_vendorBillId_key" ON "AccountingVendorPaymentAllocation"("paymentId", "vendorBillId");
CREATE INDEX "AccountingVendorPaymentAllocation_paymentId_idx" ON "AccountingVendorPaymentAllocation"("paymentId");
CREATE INDEX "AccountingVendorPaymentAllocation_vendorBillId_idx" ON "AccountingVendorPaymentAllocation"("vendorBillId");

ALTER TABLE "AccountingVendorPayment" ADD CONSTRAINT "AccountingVendorPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingVendorPayment" ADD CONSTRAINT "AccountingVendorPayment_postingEventId_fkey" FOREIGN KEY ("postingEventId") REFERENCES "AccountingPostingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingVendorPayment" ADD CONSTRAINT "AccountingVendorPayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingVendorPaymentAllocation" ADD CONSTRAINT "AccountingVendorPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AccountingVendorPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
