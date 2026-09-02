# SARVEDA NATIVE GOOGLE MERCHANT FEED V1

**Date:** 2026-08-31  
**Environment validated:** Lightsail staging API (`13.204.112.165`) + staging Postgres (681 identity backfill present)  
**Stop point:** Feed endpoint + staging validation only. Merchant Center / Ads / old Woo sources **unchanged**.

---

## Authoritative data model (inspected)

| Feed need | Source |
|-----------|--------|
| Title | `Product.name` (+ variant attribute values for VARIABLE / grouped offers) |
| Description | `Product.description` (HTML stripped), else `shortDescription`, else title |
| Link | `{MERCHANT_FEED_SITE_URL\|\|NEXT_PUBLIC_SITE_URL\|\|FRONTEND_URL}/product/{Product.slug}` |
| Image | Variant `ProductImage` if present, else primary shared product image (absolute HTTPS) |
| Selling price | `ProductVariant.saleInPaise` (commerce authority). If `mrpInPaise > saleInPaise`: `g:price`=MRP, `g:sale_price`=sale (Google advertises sale = landing page). |
| Availability | `max(0, Inventory.onHand - reserved)` → `in_stock` / `out_of_stock` |
| Identity | `g:id` = `gla_` + `ProductVariant.wooCommerceVariationId` |
| Group | `g:item_group_id` = `Product.wooCommerceId` when parent ≠ offer id |
| Brand | Constant **Sarveda** (no brand column) |
| GTIN / MPN | **Not in schema** → `g:identifier_exists=no` |
| Shipping | **Not in feed** — Merchant Center account shipping |
| Google taxonomy ID | **Not emitted** (no verified mapping) |
| `g:product_type` | Optional category names when present |

**Missing Merchant attributes (documented):** GTIN, MPN, native brand field, `google_product_category`, per-item shipping, multi-currency feed rows (V1 = **INR** only).

---

## Checklist

| # | Item | Result |
|---|------|--------|
| **A** | Feed endpoint | `GET /api/merchant/google/products.xml` |
| **B** | Feed format | Google Merchant RSS 2.0 XML, `xmlns:g="http://base.google.com/ns/1.0"`, UTF-8 |
| **C** | Public GET accessible | **YES** (no login) |
| **D** | Authentication required | **NO** |
| **E** | Environment validated | Lightsail staging |
| **F** | Total variants | **864** |
| **G** | Historical identity variants | **681** |
| **H** | Eligible V1 feed items | **670** |
| **I** | Excluded NULL identity | **183** |
| **J** | Excluded inactive | **11** (2 DRAFT products + 9 INACTIVE variants among backfilled set) |
| **K** | Excluded missing image | **0** |
| **L** | Excluded invalid/missing price | **0** |
| **M** | Other exclusions | **0** (among historical set beyond J) |
| **N** | Variable / grouped feed items | **637** (`item_group_id` present) |
| **O** | Simple feed items | **33** (no `item_group_id`) |
| **P** | Historical `g:id` exact matches | **670 / 670** in-feed vs backfill artifact (**0** mismatches) |
| **Q** | Historical `g:id` mismatches | **0** |
| **R** | `item_group_id` exact matches | **637 / 637** |
| **S** | `item_group_id` mismatches | **0** |
| **T** | Canonical product links | Staging feed uses configured origin `https://sarveda-demo.xyz/product/{slug}` via `MERCHANT_FEED_SITE_URL`. Production must set `MERCHANT_FEED_SITE_URL=https://sarveda.com`. |
| **U** | Old `/store` links emitted | **0** |
| **V** | `sarveda-demo.xyz` in production configuration | **MUST BE 0** when `MERCHANT_FEED_SITE_URL=https://sarveda.com` (staging currently uses demo by design) |
| **W** | Price consistency | **PASS** (unit tests: `saleInPaise` / MRP+sale_price; live samples use variant paise) |
| **X** | Availability consistency | **PASS** (onHand−reserved; OOS sample `gla_5944`) |
| **Y** | Image validity | **PASS** (670/670 `https://` absolute) |
| **Z** | XML validation | **PASS** (namespace, escaping, live 200 `application/xml`) |
| **AA** | Deterministic output | **PASS** (sort by `wooCommerceId`, then `wooCommerceVariationId`) |
| **AB** | TypeScript | Backend `tsc` **PASS** |
| **AC** | Tests | `test/commerce/google-merchant-feed.test.ts` **19/19 PASS** |
| **AD** | Production build | Staging `npm run build` **PASS**; frontend not required |
| **AE** | Merchant Center changed | **NO** |
| **AF** | Google Ads changed | **NO** |
| **AG** | Old Woo source changed | **NO** |
| **AH** | Payments/orders/accounting changed | **NO** |
| **AI** | Ready for production deployment | **YES** (after prod identity migration/backfill + `MERCHANT_FEED_SITE_URL=https://sarveda.com`) |
| **AJ** | Ready to connect to existing Merchant Center | **NO** — wait for review + production deploy sequence |
| **AK** | Remaining blockers | 1) Production DB not migrated/backfilled. 2) Set production `MERCHANT_FEED_SITE_URL`. 3) 11 inactive historical offers omitted (expected). 4) 183 NULL-identity variants still unpublished (Phase 4). 5) 163 residual Merchant recon rows. 6) Do not attach feed URL to MC until approved. |

---

## Implementation files

| File | Role |
|------|------|
| `backend/src/modules/merchant/googleMerchantFeed.ts` | Eligibility, pricing, XML render, continuity helpers |
| `backend/src/modules/merchant/merchant.controller.ts` | Public GET handler |
| `backend/src/modules/merchant/merchant.routes.ts` | `/google/products.xml` |
| `backend/src/app.ts` | `app.use("/api/merchant", merchantRoutes)` |
| `backend/scripts/diagnose-merchant-feed.ts` | Internal diagnostics vs backfill TSV |
| `backend/test/commerce/google-merchant-feed.test.ts` | Unit tests |
| `docs/audit/merchant_feed_v1_diagnostics.json` | Staging diagnostics snapshot |

### Commands

```bash
# Diagnostics (staging)
cd backend && MERCHANT_FEED_SITE_URL=https://sarveda-demo.xyz npm run diagnose:merchant-feed

# Live feed
curl -sS https://<api-host>/api/merchant/google/products.xml | head
```

Cache: `Cache-Control: public, max-age=900, stale-while-revalidate=900`.

---

## Sample XML (sanitized staging)

### 1) Simple historical (`gla_5713`)

```xml
<item>
  <g:id>gla_5713</g:id>
  <title>Handheld Natural Coconut Shaker</title>
  <description>The Handheld Coconut Shaker is a percussion instrument...</description>
  <link>https://sarveda-demo.xyz/product/handheld-natural-coconut-shaker</link>
  <g:image_link>https://sarveda-media.s3.amazonaws.com/media/wp/uploads/2022/07/Coconut-Shaker-Handle-SIngle.png</g:image_link>
  <g:availability>in_stock</g:availability>
  <g:condition>new</g:condition>
  <g:price>1108.80 INR</g:price>
  <g:sale_price>990.00 INR</g:sale_price>
  <g:brand>Sarveda</g:brand>
  <g:identifier_exists>no</g:identifier_exists>
</item>
```

(No `item_group_id`.)

### 2) Variable / grouped historical (`gla_7810`)

```xml
<item>
  <g:id>gla_7810</g:id>
  <title>Copper Tongue Cleaner - Pack of 2 / Straight</title>
  <link>https://sarveda-demo.xyz/product/Copper-Tongue-Cleaner</link>
  <g:availability>in_stock</g:availability>
  <g:price>299.00 INR</g:price>
  <g:sale_price>265.00 INR</g:sale_price>
  <g:item_group_id>5042</g:item_group_id>
  <g:brand>Sarveda</g:brand>
  <g:identifier_exists>no</g:identifier_exists>
</item>
```

### 3) Out of stock (`gla_5944`)

```xml
<item>
  <g:id>gla_5944</g:id>
  <title>Curved Hammered Copper Bottles - Vintage / With Brush</title>
  <link>https://sarveda-demo.xyz/product/copper-bottle-curved-vintage-hammered</link>
  <g:availability>out_of_stock</g:availability>
  <g:item_group_id>5495</g:item_group_id>
  ...
</item>
```

---

## Production sequence (do not execute MC changes)

1. Deploy additive `wooCommerceVariationId` migration to production  
2. `backfill:merchant-identity:dry` against production; verify UUID targets  
3. `backfill:merchant-identity:apply` on production  
4. Deploy feed endpoint  
5. Set `MERCHANT_FEED_SITE_URL=https://sarveda.com`  
6. Validate production feed URL (item count, `gla_*`, links, prices)  
7. Confirm legacy `/store` 301s  
8. **Only then** configure existing Merchant Center File(URL) to fetch native feed  

Do **not** assume staging UUIDs write to production.

---

## Shipping / locale notes

- **Shipping:** Merchant Center account-level (not per-item in V1)  
- **Language:** `en`  
- **Currency emitted:** `INR`  
- **Countries / feed labels:** unchanged in Merchant Center (configure at source level later)

---

SARVEDA NATIVE GOOGLE MERCHANT FEED V1 COMPLETE — READY FOR MERCHANT CENTER CUTOVER REVIEW
