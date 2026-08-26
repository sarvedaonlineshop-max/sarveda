-- Product-wise coupon flag + account closure requests
ALTER TABLE "Product" ADD COLUMN "productCouponEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AccountClosureRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountClosureRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountClosureRequest_userId_createdAt_idx" ON "AccountClosureRequest"("userId", "createdAt");

ALTER TABLE "AccountClosureRequest" ADD CONSTRAINT "AccountClosureRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
