COPY (
SELECT
  p.slug AS product_slug,
  v.sku AS sku,
  v."isDefault"::text AS is_default,
  v.status::text AS status,
  v."mrpInPaise" AS mrp_paise,
  v."saleInPaise" AS sale_paise,
  coalesce(v."mrpUsdCents"::text, '') AS mrp_usd_cents,
  coalesce(v."saleUsdCents"::text, '') AS sale_usd_cents,
  coalesce(v."videoUrl", '') AS video_url,
  (SELECT count(*)::int FROM "ProductImage" i WHERE i."variantId"=v.id) AS variant_images,
  coalesce((
    SELECT string_agg(pa.slug || '=' || av.value, ';' ORDER BY pa.slug)
    FROM "VariantAttributeValue" vv
    JOIN "AttributeValue" av ON av.id=vv."attributeValueId"
    JOIN "ProductAttribute" pa ON pa.id=av."attributeId"
    WHERE vv."variantId"=v.id
  ), '') AS attrs,
  (SELECT count(*)::int FROM "VariantShippingRate" r WHERE r."variantId"=v.id) AS shipping_rows
FROM "ProductVariant" v
JOIN "Product" p ON p.id=v."productId"
WHERE p."deletedAt" IS NULL
ORDER BY p.slug, v.sku
) TO STDOUT WITH CSV HEADER;
