# SARVEDA CTX Compatibility — Lightsail Certification

**Date:** 2026-09-01  
**Phase:** Certification / reconciliation against Lightsail cutover DB  
**Scope:** `GET /api/merchant/google/products-source-2.xml` — **no Merchant Center, Ads, DNS, CTX Woo, or PRODUCTS SOURCE 2 changes made**

---

## Executive summary

| Metric | Result |
|--------|--------|
| **CTX TOTAL** | **883** |
| **PUBLISH** | **692** |
| **INTENTIONALLY EXCLUDE** | **11** |
| **MANUAL REVIEW** | **180** |
| **ACCOUNTED** | **883 / 883** |

All **692 PUBLISH** rows pass identity, product type, item group, price, availability, and variant-resolution certification against the **current Sarveda Lightsail catalog**. The remaining **180** CTX historical offers require deterministic manual reconciliation before a controlled PRODUCTS SOURCE 2 cutover.

### Decision

**BLOCKED — MANUAL RECONCILIATION REQUIRED**

The publishable subset is technically clean, but **180 / 883** CTX offers are unmapped or ambiguous. These represent live Google Ads inventory that would drop on cutover unless reconciled or intentionally excluded.

---

## 1. Target environment verified

| Check | Value |
|-------|-------|
| **API host** | Lightsail `13.204.112.165` (staging API behind `https://sarveda-demo.xyz/api/*`) |
| **DB host** | `ls-38d7ccbcac4ed3da1856692cc50fc732f88d42e1.c9oiska8wm8k.ap-south-1.rds.amazonaws.com` |
| **DB name** | `sarveda_db` |
| **DB user** | `sarveda_master_db` |
| **Products** | **202** |
| **ProductVariants** | **864** |
| **Product.wooCommerceId (parents)** | **153** |
| **ProductVariant.wooCommerceVariationId** | **703** (after identity recovery) |
| **MERCHANT_FEED_SITE_URL** | `https://sarveda.com` |
| **Cutover DB confirmation** | Same Lightsail Postgres used by staging cutover catalog per project handoff (`13.204.112.165` / `sarveda_db`) |

Counts queried live on Lightsail — not local Docker.

---

## 2. Migration applied

```bash
npx prisma migrate deploy   # on Lightsail backend
```

| Check | Result |
|-------|--------|
| Migration | `20260901190000_merchant_ctx_offer_registry` — **success** |
| Schema change | **Additive only** — new `MerchantCtxOffer` table + `MerchantCtxClassification` enum |
| Existing data | Product / ProductVariant / Order / Payment / Inventory — **unaffected** |
| Post-migration `MerchantCtxOffer` rows | **883** |

---

## 3. CTX import (883 offers)

**Source:** `docs/audit/google-merchant-native-compatibility/ctx_india_authoritative.xml`

```bash
npm run import:ctx-offers:identity   # Lightsail
```

| Step | Result |
|------|--------|
| CTX rows parsed | **883** |
| Registry upserted | **883** |
| Identity recovery writes (`wooCommerceVariationId`) | **22** (first run; conflicts skipped for 4 known collision pairs) |
| Fuzzy mapping | **None** — deterministic paths only |

**Code fix during certification:** duplicate `sarvedaVariantId` links (two CTX offers → one variant) now downgrade to `MANUAL_REVIEW` / `DUPLICATE_VARIANT_LINK` instead of failing import.

---

## 4. Full certification

```bash
MERCHANT_FEED_SITE_URL=https://sarveda.com \
CTX_CERT_API_BASE=http://127.0.0.1:5000 \
npx tsx scripts/lightsail-ctx-certification.ts
```

Also equivalent to `npm run certify:ctx-feed` logic plus Lightsail artifact generation.

**Artifacts (real Lightsail results):**

| File | Description |
|------|-------------|
| `docs/audit/google-merchant-native-compatibility/final_883_compatibility.csv` | All 883 rows with classification + cert flags |
| `docs/audit/google-merchant-native-compatibility/manual_review_remaining.csv` | 180 manual-review rows with reason + recommended action |
| `docs/audit/google-merchant-native-compatibility/lightsail_certification_summary.json` | Machine-readable summary |
| `docs/audit/google-merchant-native-compatibility/lightsail_products_source_2.xml` | Live feed snapshot from Lightsail API |

---

## 5. Final 883 buckets (exact)

| Bucket | Count |
|--------|------:|
| **PUBLISH** | **692** |
| **INTENTIONALLY_EXCLUDE** | **11** |
| **MANUAL_REVIEW** | **180** |
| **TOTAL** | **883** |

`692 + 11 + 180 = 883` ✓

---

## 6. MANUAL_REVIEW breakdown (exact)

| Code | Reason | Count |
|------|--------|------:|
| **A** | Same product exists, historical Woo identity missing | **0** |
| **B** | Same product exists, variant renamed | **2** |
| **C** | Same product exists, attributes renamed | **0** |
| **D** | Same product exists, variant structure changed | **97** |
| **E** | Product exists but specific old variant deliberately dropped | **0** |
| **F** | Product renamed | **2** |
| **G** | Product genuinely absent from Sarveda | **29** |
| **H** | Ambiguous multiple Sarveda matches | **2** |
| **I** | Inactive / Draft product | **0** |
| **J** | Historical CTX / Woo anomaly (incl. missing audit row) | **48** |
| **K** | Other | **0** |
| | **TOTAL MANUAL_REVIEW** | **180** |

Primary clusters:

- **D (97):** Parent product exists on Sarveda but Woo offer cannot be matched 1:1 to a current variant (attribute / structure migration).
- **J (48):** CTX offer missing from `merchant_woo_sarveda_mapping.tsv` or other export/import anomaly.
- **G (29):** No Sarveda parent product for historical Woo parent ID.

Full row-level detail: `manual_review_remaining.csv` (sorted by reason).

---

## 7. Safe automatic recovery

| Action | Count |
|--------|------:|
| `wooCommerceVariationId` identity recovery (high/medium mapping) | **22** |
| Additional fuzzy / name-based recovery | **0** (by design) |
| Duplicate variant link conflicts → MANUAL_REVIEW | handled in classifier |

No unsafe 1:N or name-similarity mappings applied.

---

## 8. Intentional catalog changes (acknowledged)

For **PUBLISH** rows, differences from historical CTX are **expected** where Sarveda catalog intentionally changed:

| Metric | Count (of 692 PUBLISH) |
|--------|----------------------:|
| Price differs from CTX (Sarveda is authority) | **679** |
| Availability differs from CTX (Sarveda is authority) | **300** |

These are **not** certification failures.

---

## 9. Price certification (PUBLISH vs current Sarveda)

| Check | Result |
|-------|--------|
| PUBLISH items | **692** |
| Feed price vs storefront price | **692 / 692 match (100%)** |
| Required CTX price equality | **Not required** |
| Intentional CTX price differences | **679** (reported separately) |

---

## 10. Availability certification (PUBLISH vs current Sarveda)

| Check | Result |
|-------|--------|
| PUBLISH items | **692** |
| Feed availability vs storefront inventory | **692 / 692 match (100%)** |
| Required CTX stock equality | **Not required** |
| Intentional CTX availability differences | **300** (reported separately) |

---

## 11. ID continuity (PUBLISH)

| Metric | Result |
|--------|--------|
| `g:id` exact match vs CTX | **692 / 692** |
| Mismatches | **0** |
| Duplicate IDs in feed | **0** |
| Non-numeric ID violations | **0** |

**Required: 0 mismatches, 0 duplicates — PASS**

---

## 12. Product type continuity (PUBLISH)

| Metric | Result |
|--------|--------|
| `g:product_type` exact match vs CTX | **692 / 692** |
| Mismatches | **0** |
| Missing product_type | **0** |

**P0 — PASS** (Ads filters PRODUCTS SOURCE 2 by Product Type)

---

## 13. Item group continuity (PUBLISH)

| Metric | Result |
|--------|--------|
| `g:item_group_id` exact match vs CTX semantics | **692 / 692** |
| Mismatches | **0** |

---

## 14. Landing page + variant certification (PUBLISH)

Certification method: Lightsail product API resolution + feed link structure validation for all **692** PUBLISH rows.

| Metric | Result |
|--------|--------|
| PUBLISH items tested | **692** |
| Correct product (slug resolves) | **692** |
| Correct variant (`?offer=` / wooCommerceVariationId) | **692** |
| Wrong variant | **0** |
| 404 / unresolved slug | **0** |
| Feed links include `?offer=<historicalWooOfferId>` | **692 / 692** |

**Spot HTTP check (10 spread samples on `sarveda-demo.xyz`, same slugs):** **10 / 10 HTTP 200**, **0** 404.

> Feed links target `https://sarveda.com/product/{slug}?offer={id}` per `MERCHANT_FEED_SITE_URL`. Full external HTTP crawl against production DNS was not run (legacy WP still on `sarveda.com`). Staging PDP `?offer=` preselection is deployed on Lightsail backend; frontend `?offer=` handler is in repo — verify on Vercel before production DNS cutover.

**Required before cutover: 0 wrong variants, 0 unexplained 404s among PUBLISH — PASS on Lightsail catalog/API**

---

## 15. INTENTIONALLY EXCLUDED items (11)

| CTX g:id | Legacy variant / product | Reason | Sarveda slug |
|----------|--------------------------|--------|--------------|
| 6823 | Mantra singing bowl / Green 4" | INACTIVE_VARIANT | singing-bowls-with-sacred-mantra-printed |
| 6828 | Mantra singing bowl / Red 4" | INACTIVE_VARIANT | singing-bowls-with-sacred-mantra-printed |
| 6831 | Mantra singing bowl / Black 4" | INACTIVE_VARIANT | singing-bowls-with-sacred-mantra-printed |
| 7288 | Mantra singing bowl / Black 5.5" | INACTIVE_VARIANT | singing-bowls-with-sacred-mantra-printed |
| 7290 | Mantra singing bowl / Gold 5.5" | INACTIVE_VARIANT | singing-bowls-with-sacred-mantra-printed |
| 7791 | Silk ring cushion / 16cm Brown | INACTIVE_VARIANT | singing-bowls-silk-ring-cushion-accessories |
| 9984 | Joint/knee cut bowl / 8in | INACTIVE_VARIANT | joint-knee-cut-bowl |
| 42317 | Caxixi (simple) | INACTIVE_PRODUCT | caxixi |
| 42340 | 8-keys wooden xylophone (simple) | INACTIVE_PRODUCT | 8-keys-wooden-xylophone |
| 45296 | Gong stand / Light Large | INACTIVE_VARIANT | gong-stand |
| 48760 | Pulse tubes / Big | INACTIVE_VARIANT | pulse-tubes |

These are **not** recreated for Google — Sarveda inactive/dropped catalog is authoritative.

---

## 16. Manual review artifact

**File:** `docs/audit/google-merchant-native-compatibility/manual_review_remaining.csv`

Columns: `legacy_g_id`, `legacy_item_group_id`, `legacy_title`, `legacy_product_type`, `legacy_link`, `legacy_attributes`, `legacy_price`, `candidate_sarveda_product`, `candidate_sarveda_variant`, `candidate_slug`, `candidate_current_price`, `candidate_status`, `reason`, `recommended_action`, `confidence`, `notes`

**180 rows**, sorted by reason then product group.

---

## 17. Final 883 artifact

**File:** `docs/audit/google-merchant-native-compatibility/final_883_compatibility.csv`

**883 rows** from live Lightsail DB — not local placeholders.

---

## 18. Live feed statistics

**Endpoint:** `GET /api/merchant/google/products-source-2.xml`

| Source | HTTP | Content-Type | Items |
|--------|------|--------------|------:|
| Lightsail `127.0.0.1:5000` | **200** | `application/xml; charset=utf-8` | **692** |
| Staging `https://sarveda-demo.xyz/api/...` | **200** | `application/xml; charset=utf-8` | **692** |

| Stat | Value |
|------|------:|
| Item count | **692** |
| Unique `g:id` | **692** |
| Duplicate IDs | **0** |
| Numeric-ID violations | **0** |
| `product_type` missing | **0** |
| Product type mismatches vs CTX (PUBLISH) | **0** |
| Item group mismatches (PUBLISH) | **0** |
| Links with `?offer=` | **692 / 692** |
| Invalid / 404 links (API slug resolution) | **0** |
| Variant-resolution failures (PUBLISH) | **0** |
| Price ↔ storefront mismatches (PUBLISH) | **0** |
| Availability ↔ storefront mismatches (PUBLISH) | **0** |
| Missing `g:image_link` | **0** |

Legacy feed unchanged: `GET /api/merchant/google/products.xml` (~670 native GLA items).

---

## 19. Cutover status

**No cutover performed.**

- Merchant Center — **unchanged**
- Google Ads PRODUCTS SOURCE 2 URL — **unchanged**
- CTX Woo feed — **unchanged**
- DNS — **unchanged**

---

## 20. Certification scorecard

```
CTX TOTAL:                    883
PUBLISH:                      692
INTENTIONALLY EXCLUDE:         11
MANUAL REVIEW:                180
ACCOUNTED:                  883/883

ID CONTINUITY:              692/692 (0 mismatches, 0 duplicates)
PRODUCT TYPE CONTINUITY:    692/692 (0 mismatches)
ITEM GROUP CONTINUITY:      692/692 (0 mismatches)
VARIANT LANDING RESOLUTION: 692/692 (0 wrong variant, 0 API 404)
PRICE ↔ NEW SARVEDA:        692/692 (100%)
AVAILABILITY ↔ NEW SARVEDA: 692/692 (100%)
```

### Decision

**BLOCKED — MANUAL RECONCILIATION REQUIRED**

Resolve or intentionally exclude the **180 MANUAL_REVIEW** CTX offers (especially **97** variant-structure changes and **48** historical anomalies) before switching PRODUCTS SOURCE 2 to the native compatibility feed.

The **692-item PUBLISH subset** is certified and ready for controlled cutover once manual review policy is approved for the remaining **191** non-publish rows (180 manual + 11 excluded).

---

**SARVEDA CTX COMPATIBILITY LIGHTSAIL CERTIFICATION COMPLETE — READY FOR REVIEW**
