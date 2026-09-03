-- Phase 1A: immutable per-line refund breakdown. Historical refunds remain unallocated.
CREATE TABLE "RefundAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "refundId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "eligibleItemValuePaise" INTEGER NOT NULL,
    "merchandiseTaxablePaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "discountReversedPaise" INTEGER NOT NULL DEFAULT 0,
    "forwardShippingPaise" INTEGER NOT NULL DEFAULT 0,
    "reverseShippingDeductedPaise" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionPaise" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionLabel" TEXT,
    "approvedRefundPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundAllocation_refundId_orderItemId_key" ON "RefundAllocation"("refundId", "orderItemId");
CREATE INDEX "RefundAllocation_orderItemId_idx" ON "RefundAllocation"("orderItemId");

ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
