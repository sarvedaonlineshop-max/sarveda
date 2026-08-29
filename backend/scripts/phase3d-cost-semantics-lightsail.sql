-- READ-ONLY Phase 3D cost semantics investigation (Lightsail)

\echo '=== variant_monetary_population ==='
SELECT
  COUNT(*) AS total_variants,
  COUNT(*) FILTER (WHERE "costInPaise" IS NOT NULL AND "costInPaise" > 0) AS cost_gt0,
  COUNT(*) FILTER (WHERE "mrpInPaise" > 0) AS mrp_inr_gt0,
  COUNT(*) FILTER (WHERE "saleInPaise" > 0) AS sale_inr_gt0,
  COUNT(*) FILTER (WHERE "mrpUsdCents" IS NOT NULL AND "mrpUsdCents" > 0) AS mrp_usd_gt0,
  COUNT(*) FILTER (WHERE "saleUsdCents" IS NOT NULL AND "saleUsdCents" > 0) AS sale_usd_gt0,
  COUNT(*) FILTER (WHERE "mrpAedFils" IS NOT NULL AND "mrpAedFils" > 0) AS mrp_aed_gt0,
  COUNT(*) FILTER (WHERE "saleAedFils" IS NOT NULL AND "saleAedFils" > 0) AS sale_aed_gt0,
  COUNT(*) FILTER (WHERE "mrpGbpPence" IS NOT NULL AND "mrpGbpPence" > 0) AS mrp_gbp_gt0,
  COUNT(*) FILTER (WHERE "saleGbpPence" IS NOT NULL AND "saleGbpPence" > 0) AS sale_gbp_gt0
FROM "ProductVariant";

\echo '=== physical_stocked_coverage ==='
SELECT
  COUNT(*) AS physical_stocked_skus,
  COUNT(*) FILTER (WHERE pv."costInPaise" IS NOT NULL AND pv."costInPaise" > 0) AS with_cost,
  COUNT(*) FILTER (WHERE pv."saleInPaise" > 0) AS with_sale_inr,
  COUNT(*) FILTER (WHERE pv."saleUsdCents" IS NOT NULL AND pv."saleUsdCents" > 0) AS with_sale_usd,
  COUNT(*) FILTER (WHERE pv."saleAedFils" IS NOT NULL AND pv."saleAedFils" > 0) AS with_sale_aed
FROM "ProductVariant" pv
JOIN "Inventory" i ON i."variantId" = pv.id
JOIN "Product" p ON p.id = pv."productId"
WHERE i."onHand" > 0
  AND p."productType" IN ('SIMPLE','VARIABLE')
  AND p."catalogHidden" = false
  AND pv.sku NOT LIKE 'COURSE-%'
  AND pv.sku NOT LIKE 'EVENT-%';

\echo '=== other_tables ==='
SELECT 'MarketplaceListing' AS tbl, COUNT(*)::text AS cnt FROM "MarketplaceListing"
UNION ALL SELECT 'PurchaseOrder', COUNT(*)::text FROM "PurchaseOrder"
UNION ALL SELECT 'PurchaseReceipt', COUNT(*)::text FROM "PurchaseReceipt";

\echo '=== ProductVariant money columns ==='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ProductVariant'
  AND (column_name ILIKE '%cost%' OR column_name ILIKE '%mrp%' OR column_name ILIKE '%sale%' OR column_name ILIKE '%usd%' OR column_name ILIKE '%aed%' OR column_name ILIKE '%gbp%')
ORDER BY column_name;

\echo '=== sample_physical_skus ==='
SELECT pv.sku,
  i."onHand",
  pv."costInPaise",
  pv."mrpInPaise",
  pv."saleInPaise",
  pv."mrpUsdCents",
  pv."saleUsdCents",
  pv."mrpAedFils",
  pv."saleAedFils"
FROM "ProductVariant" pv
JOIN "Inventory" i ON i."variantId" = pv.id
JOIN "Product" p ON p.id = pv."productId"
WHERE i."onHand" > 0
  AND p."productType" IN ('SIMPLE','VARIABLE')
  AND pv.sku NOT LIKE 'COURSE-%'
ORDER BY i."onHand" DESC
LIMIT 10;

\echo '=== cost_gt0_skus_if_any ==='
SELECT sku, "costInPaise", "saleInPaise", "mrpInPaise"
FROM "ProductVariant"
WHERE "costInPaise" IS NOT NULL AND "costInPaise" > 0
LIMIT 20;

\echo '=== inventory_table_columns ==='
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='Inventory' ORDER BY column_name;
