-- Phase 3D1 supplementary read-only stats (Lightsail)
SELECT 'paid_orders_with_items' AS metric, COUNT(DISTINCT o.id)::text AS value
FROM "Order" o
JOIN "OrderItem" oi ON oi."orderId" = o.id
WHERE o."paymentStatus" IN ('CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED')
  AND o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
UNION ALL
SELECT 'paid_orders_without_items', COUNT(*)::text
FROM "Order" o
WHERE o."paymentStatus" IN ('CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED')
  AND o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
  AND NOT EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = o.id)
UNION ALL
SELECT 'srv_paid_orders', COUNT(*)::text
FROM "Order"
WHERE "orderNumber" LIKE 'SRV-%'
  AND "paymentStatus" IN ('CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED')
UNION ALL
SELECT 'woo_paid_orders', COUNT(*)::text
FROM "Order"
WHERE "orderNumber" LIKE 'WOO-%'
  AND "paymentStatus" IN ('CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED')
UNION ALL
SELECT 'physical_variants_stock_no_cost', COUNT(*)::text
FROM "ProductVariant" pv
JOIN "Inventory" i ON i."variantId" = pv.id
WHERE i."onHand" > 0
  AND (pv."costInPaise" IS NULL OR pv."costInPaise" = 0)
  AND pv.sku NOT LIKE 'COURSE-%'
UNION ALL
SELECT 'course_variants_stock_no_cost', COUNT(*)::text
FROM "ProductVariant" pv
JOIN "Inventory" i ON i."variantId" = pv.id
WHERE i."onHand" > 0
  AND (pv."costInPaise" IS NULL OR pv."costInPaise" = 0)
  AND pv.sku LIKE 'COURSE-%'
UNION ALL
SELECT 'physical_onhand_sum', COALESCE(SUM(i."onHand"), 0)::text
FROM "Inventory" i
JOIN "ProductVariant" pv ON pv.id = i."variantId"
WHERE pv.sku NOT LIKE 'COURSE-%'
UNION ALL
SELECT 'course_onhand_sum', COALESCE(SUM(i."onHand"), 0)::text
FROM "Inventory" i
JOIN "ProductVariant" pv ON pv.id = i."variantId"
WHERE pv.sku LIKE 'COURSE-%'
UNION ALL
SELECT 'variants_onhand_gt0', COUNT(*)::text
FROM "Inventory"
WHERE "onHand" > 0;
