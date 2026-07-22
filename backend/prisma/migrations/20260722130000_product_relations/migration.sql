-- Curated product relations for PDP "Complete Your Journey" / upsells
CREATE TYPE "ProductRelationType" AS ENUM ('PAIR_WITH', 'UPSELL', 'CROSS_SELL');

CREATE TABLE "ProductRelation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromProductId" UUID NOT NULL,
    "toProductId" UUID NOT NULL,
    "type" "ProductRelationType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductRelation_fromProductId_toProductId_type_key" ON "ProductRelation"("fromProductId", "toProductId", "type");
CREATE INDEX "ProductRelation_fromProductId_type_position_idx" ON "ProductRelation"("fromProductId", "type", "position");

ALTER TABLE "ProductRelation" ADD CONSTRAINT "ProductRelation_fromProductId_fkey" FOREIGN KEY ("fromProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductRelation" ADD CONSTRAINT "ProductRelation_toProductId_fkey" FOREIGN KEY ("toProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
