-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_sortOrder_idx" ON "Product"("sortOrder");

-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_position_idx" ON "ProductCategory"("categoryId", "position");

-- Backfill global sortOrder from current updatedAt desc ranking
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "updatedAt" DESC) - 1)::integer AS rn
  FROM "Product"
)
UPDATE "Product" p
SET "sortOrder" = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

-- Backfill per-category position from the same product ranking
WITH ranked AS (
  SELECT
    pc."productId",
    pc."categoryId",
    (ROW_NUMBER() OVER (PARTITION BY pc."categoryId" ORDER BY p."updatedAt" DESC) - 1)::integer AS rn
  FROM "ProductCategory" pc
  INNER JOIN "Product" p ON p.id = pc."productId"
)
UPDATE "ProductCategory" pc
SET "position" = ranked.rn
FROM ranked
WHERE pc."productId" = ranked."productId"
  AND pc."categoryId" = ranked."categoryId";
