COPY (
SELECT
  p.slug AS slug,
  p.name AS name,
  coalesce(p."wooCommerceId"::text, '') AS woo_id,
  p.status::text AS status,
  p."productType"::text AS product_type,
  coalesce(p."hsnCode", '') AS hsn_code,
  coalesce(p."taxClass", '') AS tax_class,
  length(coalesce(p.description, '')) AS desc_len,
  length(coalesce(p."shortDescription", '')) AS short_len,
  coalesce(p."videoUrl", '') AS video_url,
  coalesce(p."audioUrl", '') AS audio_url,
  (SELECT count(*)::int FROM "ProductVariant" v WHERE v."productId"=p.id) AS variant_count,
  (SELECT count(*)::int FROM "ProductImage" i WHERE i."productId"=p.id AND i."variantId" IS NULL) AS product_images,
  (SELECT count(*)::int FROM "ProductImage" i WHERE i."productId"=p.id AND i."variantId" IS NOT NULL) AS variant_images,
  (SELECT count(*)::int FROM "AccordionItem" a WHERE a."productId"=p.id) AS accordion_count,
  (SELECT count(*)::int FROM "VariantShippingRate" r JOIN "ProductVariant" v ON v.id=r."variantId" WHERE v."productId"=p.id) AS shipping_rate_rows,
  coalesce(array_length(p."relatedArticleSlugs", 1), 0) AS article_slug_count,
  (SELECT count(*)::int FROM "ProductRelation" pr WHERE pr."fromProductId"=p.id) AS relation_count,
  p."catalogHidden"::text AS catalog_hidden
FROM "Product" p
WHERE p."deletedAt" IS NULL
ORDER BY p.slug
) TO STDOUT WITH CSV HEADER;
