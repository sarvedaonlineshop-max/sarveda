-- Partial unique index: one Refund row per gateway providerRefundId when present.
CREATE UNIQUE INDEX IF NOT EXISTS "Refund_providerRefundId_uidx" ON "Refund" ("providerRefundId") WHERE "providerRefundId" IS NOT NULL;

-- Speed up refundable-capacity sums per payment.
CREATE INDEX IF NOT EXISTS "Refund_paymentId_status_idx" ON "Refund" ("paymentId", "status");
