# SARVEDA CTX-COMPATIBILITY NATIVE FEED V1

**Date:** 2026-09-01  
**Reference audit:** `docs/SARVEDA_GOOGLE_MERCHANT_ADS_NATIVE_COMPATIBILITY_AUDIT.md`  
**Scope:** Implementation + local/staging certification artifacts. **No** Merchant Center, Google Ads, DNS, Woo, or CTX source URL changes.

---

## Final verdict

# **READY AFTER MANUAL MAPPING**

The CTX-compatibility feed is implemented and unit-tested. **All 883 CTX rows are accounted for** in the registry model. Staging/production certification requires:

1. `npx prisma migrate deploy` on Lightsail Postgres  
2. `npm run import:ctx-offers` (optionally `import:ctx-offers:identity` for medium-confidence recovery)  
3. `npm run certify:ctx-feed`  
4. Resolve **~176 MANUAL_REVIEW** offers before PRODUCTS SOURCE 2 cutover  

**Not** `READY FOR PRODUCTS SOURCE 2 CUTOVER` until manual mapping rows are cleared and staging certification shows **0 Product Type / ID mismatches on published offers**.

---

## What was built

### New endpoint (generic feed unchanged)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/merchant/google/products.xml` | Existing generic native feed (`gla_<id>`) — **unchanged** |
| `GET /api/merchant/google/products-source-2.xml` | **NEW** CTX / PRODUCTS SOURCE 2 compatibility feed |

Response headers on compatibility feed:

- `X-Sarveda-Merchant-Feed-Items` — published XML item count  
- `X-Sarveda-Merchant-Ctx-Registry-Total` — registry rows (883 after import)  
- `X-Sarveda-Merchant-Ctx-Publish-Classified` — `PUBLISH` classification count  

### Core modules

| File | Role |
|------|------|
| `backend/src/modules/merchant/ctxCompatibilityFeed.ts` | Feed builder + XML render + in-memory certification |
| `backend/src/modules/merchant/ctxOfferRegistry.ts` | Parse CTX XML, 883-row registry, classify PUBLISH / EXCLUDE / MANUAL_REVIEW |
| `backend/src/modules/merchant/merchantVariantLink.ts` | Numeric ID links, `?offer=` URLs, item_group semantics |
| `backend/src/modules/merchant/merchant.controller.ts` | Handler `googleProductsSource2Xml` |
| `frontend/lib/merchant-variant-selection.ts` | PDP preselection via `?offer=` + legacy `attribute_*` |
| `frontend/components/product/ProductDetailExperience.tsx` | Applies URL params on load |

### Schema

Migration: `backend/prisma/migrations/20260901190000_merchant_ctx_offer_registry/migration.sql`

Model `MerchantCtxOffer` (883-row accounting):

- `wooOfferId` (PK) — historical CTX `g:id`  
- `ctxProductType` — **exact CTX string** (not recomputed from categories)  
- `ctxItemGroupId`, `ctxTitle`, `ctxLegacyLink`  
- `classification`: `PUBLISH` \| `INTENTIONALLY_EXCLUDE` \| `MANUAL_REVIEW`  
- `sarvedaVariantId` (optional FK, unique)  
- `excludeReason`, `manualAction`, `notes`  

### Scripts

```bash
cd backend
npm run import:ctx-offers              # load ctx_india_authoritative.xml + classify
npm run import:ctx-offers:identity       # same + optional wooCommerceVariationId recovery
MERCHANT_FEED_SITE_URL=https://sarveda.com npm run certify:ctx-feed
```

---

## Compatibility contract (implemented)

| Requirement | Implementation |
|-------------|----------------|
| **g:id** | Bare numeric Woo offer ID (`10009`, not `gla_10009`) |
| **g:item_group_id** | Exact CTX value from registry (`ctxItemGroupId`), including simple self-group rows |
| **g:product_type** | Exact CTX string from registry — **never** from Sarveda categories |
| **Price / sale_price** | Current Sarveda `saleInPaise` / `mrpInPaise` (storefront authority) |
| **Availability** | `max(0, onHand - reserved)` — storefront authority |
| **link** | `https://sarveda.com/product/{slug}?offer={wooOfferId}` |
| **canonical_link** | `https://sarveda.com/product/{slug}` |
| **image_link / additional_image_link** | Sarveda CDN images (HTTPS) |
| **brand / condition / identifier_exists** | Sarveda / new / no |

---

## 883-row accounting

After `import:ctx-offers`, every CTX row exists in `MerchantCtxOffer`.

### Expected classification on **Lightsail staging catalog** (from audit + medium recovery)

| Bucket | Count | Action |
|--------|------:|--------|
| **PUBLISH** | **~696** | 670 identity-backed + ~26 medium-confidence mapped variants |
| **INTENTIONALLY_EXCLUDE** | **~11** | Inactive Sarveda product/variant (do not publish) |
| **MANUAL_REVIEW** | **~176** | 128 unmatched + 48 no mapping row + 2 ambiguous — require catalog/import work |
| **Total accounted** | **883** | ✓ |

### Local dev DB (empty catalog) certification snapshot

```json
{
  "ctx_total": 883,
  "accounted": 883,
  "published": 0,
  "manual_review": 883,
  "registry_rows_in_db": 883
}
```

This is expected on an empty local Postgres — **not** a feed defect.

Artifact: `docs/audit/google-merchant-native-compatibility/final_883_compatibility.csv`

---

## Identity recovery

Deterministic resolution order (no fuzzy name matching):

1. `ProductVariant.wooCommerceVariationId === wooOfferId`  
2. Registry `sarvedaVariantId`  
3. Mapping TSV: `high` confidence  
4. Mapping TSV: `medium` + `parent_plus_attr_values` or `parent_plus_attributes`  

Optional: `npm run import:ctx-offers:identity` writes `wooCommerceVariationId` for high/medium mapping rows when no conflict.

**Never** fabricates variants for unmatched Woo offers.

---

## Variant landing pages

### Feed links

All variable offers use `?offer=<wooOfferId>` for deterministic PDP preselection.

### Storefront

`ProductDetailExperience` reads:

- `?offer=<wooCommerceVariationId>` (primary)  
- Legacy `?attribute_*=` / `?attribute_pa_*=` (301 redirect compatibility)  

Unit tests: `frontend/lib/merchant-variant-selection.test.ts` (run via vitest if configured).

### Variant-link resolution target

For every **PUBLISH** row, certification CSV column `variant_link_resolves=yes` when link contains `offer={g:id}` and slug is present.

**Audit baseline fix:** Previously **740/883** were `VARIANT_SELECTION_LOST`; compatibility feed + PDP `?offer=` addresses this for published offers.

---

## Automated tests

| Suite | Result |
|-------|--------|
| `backend/test/commerce/ctx-compatibility-feed.test.ts` | **6/6 PASS** |
| `backend/test/commerce/google-merchant-feed.test.ts` | **19/19 PASS** (regression) |
| Backend `tsc --noEmit` | **PASS** |
| Frontend `tsc --noEmit` | **PASS** |

Tests cover: numeric IDs, exact CTX product_type passthrough, RSS namespace, canonical/additional image tags, item_group semantics, offer URL format.

---

## Staging certification checklist (required before cutover)

On Lightsail (`13.204.112.165`) after deploy:

1. `npx prisma migrate deploy`  
2. `MERCHANT_FEED_SITE_URL=https://sarveda.com npm run import:ctx-offers:identity`  
3. `MERCHANT_FEED_SITE_URL=https://sarveda.com npm run certify:ctx-feed`  
4. Verify `GET /api/merchant/google/products-source-2.xml` returns ~696 items  
5. Confirm certification metrics for **published** rows only:  
   - `published_id_exact_matches` = published count  
   - `published_product_type_exact_matches` = published count  
   - `published_group_exact_matches` = published count  
   - `published_variant_link_resolves` = published count  
6. Re-run release-certification price/availability rules against new feed + public product API  

---

## P0 / P1 remaining (pre-cutover)

| Priority | Item |
|----------|------|
| **P1** | **~176 MANUAL_REVIEW** CTX offers — import missing variants or confirm discontinued |
| **P1** | Staging certification run on Lightsail (local empty DB cannot validate publish counts) |
| **P1** | Resolve **108** legacy landing `404` paths from prior audit (separate from feed, affects old URLs) |
| **P2** | Optional: backfill remaining medium-confidence identities via `--apply-identity` on staging |

---

## Explicit non-actions (this phase)

- ❌ PRODUCTS SOURCE 2 URL not changed  
- ❌ CTX / Woo feed not disabled  
- ❌ Merchant Center / Google Ads not modified  
- ❌ DNS not changed  

---

## Evidence artifacts

| Path | Description |
|------|-------------|
| `docs/audit/google-merchant-native-compatibility/final_883_compatibility.csv` | 883-row certification export |
| `docs/audit/google-merchant-native-compatibility/final_883_summary.json` | Aggregate counts |
| `docs/audit/google-merchant-native-compatibility/ctx_india_authoritative.xml` | Legacy CTX contract |
| `docs/audit/google-merchant-native-compatibility/reconciliation_883.csv` | Prior audit reconciliation |

---

**SARVEDA CTX-COMPATIBILITY NATIVE FEED V1 COMPLETE — READY FOR REVIEW**
