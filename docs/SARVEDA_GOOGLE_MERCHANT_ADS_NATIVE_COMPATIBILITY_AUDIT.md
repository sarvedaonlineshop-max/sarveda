# SARVEDA — Google Merchant / Ads Native Feed Final Compatibility Audit

**Date:** 2026-09-01  
**Mode:** READ-ONLY — no production, DNS, Merchant Center, Google Ads, WooCommerce, CTX, database, redirect, or deployment changes were made.  
**Authoritative legacy contract:** CTX India XML (`ctx_india_authoritative.xml`, 883 items) — supplied export, copied to `docs/audit/google-merchant-native-compatibility/`.  
**Native reference:** Live staging feed `GET https://sarveda-demo.xyz/api/merchant/google/products.xml` (670 items at audit time).

---

## Final verdict

# MERCHANT/ADS NATIVE COMPATIBILITY — **BLOCKED**

The current native V1 feed **cannot** replace CTX / PRODUCTS SOURCE 2 without breaking Google Ads product identity, Product Type campaign filters, catalog coverage, and feed↔landing-page consistency.

**Can we replace WooCommerce + CTX while preserving PRODUCTS SOURCE 2 identity, Product Type targeting, prices, availability, and landing pages without requiring the Ads team to rebuild campaigns?**

**No — not with the native feed as implemented today.** A **CTX-contract compatibility layer** is required before Merchant source cutover (see §8).

---

## P0 / P1 / P2 findings

| Priority | Finding | Impact |
|----------|---------|--------|
| **P0** | **`g:id` format mismatch:** CTX / MC uses **bare numeric Woo offer IDs** (e.g. `10009`, `5713`). Native feed emits **`gla_<id>`** (e.g. `gla_10009`). All **670/670** overlapping items affected. | Merchant Center would treat every item as **new** → Shopping / PMax history, performance, and targeting lost. |
| **P0** | **`g:product_type` mismatch on 665/670** overlapping items. Native builds category paths differently (leaf-first, truncated, no CTX `All` segments). Example: CTX `Sound & Musical Instruments > All > Kids > Rattles & Shakers > All` → native `Sound & Musical Instruments > All > Kids`. | **Active Ads Product Type filters miss or mis-target products** after source swap. |
| **P0** | **Catalog coverage gap: 213 / 883 CTX items absent** from native eligible feed (670 items). | **24% of advertised SKUs vanish** from feed unless CTX contract is reproduced for all 883 rows. |
| **P1** | **Price drift:** 501/670 price mismatches, 393/670 sale_price mismatches vs CTX (e.g. `5713`: CTX ₹1,229/₹945 vs native ₹1,108.80/₹990). | Feed price ≠ landing-page / policy risk; disapprovals after cutover. |
| **P1** | **Availability drift:** 294/670 availability mismatches (CTX 793 in_stock / 90 OOS vs native overlap 351 in_stock / 319 OOS). | Feed availability ≠ storefront stock for many variants. |
| **P1** | **URL contract change:** CTX uses **`/store/.../?attribute_...=`** (883/883 store URLs, 845 with attribute query). Native emits **`/product/{slug}`** without variant deep-link parity. | Landing continuity relies on 301 + PDP variant UX; **740/883** classified `VARIANT_SELECTION_LOST`. |
| **P1** | **`g:item_group_id` semantics:** CTX emits self-referential group on **38** simple offers (`item_group_id == g:id`); native omits group when parent == offer → **33** mismatches among overlap. | Grouping / reporting divergence in MC. |
| **P1** | **Missing native catalog rows:** 128 CTX items mapped as Woo offers but **no Sarveda variant**; 48 CTX items **not in mapping audit** at all. | Cannot emit native rows until import + identity backfill. |
| **P2** | **`canonical_link` + `additional_image_link`:** Present on all 883 CTX rows; **not emitted** by native V1. | Secondary MC attributes lost unless reproduced. |
| **P2** | **Image URL migration:** 670/670 overlapping items use different image URLs (Woo paths vs S3/CDN). | Usually acceptable if images equivalent; verify visually for top spend SKUs. |
| **P2** | **108 / 883 landing paths → `404`** (unmapped / NO TARGET / unresolved leaves). | Ads waste + disapproval risk on those SKUs. |

---

## 1. Native Merchant feed implementation (repository)

### Endpoint

| Item | Value |
|------|--------|
| Route | `GET /api/merchant/google/products.xml` |
| Mount | `app.use("/api/merchant", merchantRoutes)` in `backend/src/app.ts` |
| Handler | `backend/src/modules/merchant/merchant.controller.ts` → `buildGoogleMerchantFeed()` |
| Auth | None (public File URL) |
| Cache | `Cache-Control: public, max-age=900` |
| Response header | `X-Sarveda-Merchant-Feed-Items` = eligible count |

### Generator

`backend/src/modules/merchant/googleMerchantFeed.ts` — eligibility, field mapping, RSS 2.0 XML render.

### Eligibility logic (native V1)

A variant is included only if **all** of:

1. `ProductVariant.wooCommerceVariationId IS NOT NULL` (historical identity)
2. `Product.status === ACTIVE`, `ProductVariant.status === ACTIVE`
3. Not `catalogHidden`, not `DIGITAL`, not soft-deleted
4. Valid slug, title, **saleInPaise > 0**, resolvable **HTTPS** image
5. For variable grouping: parent `Product.wooCommerceId` present when needed

Excluded reasons tracked in diagnostics: `NULL_IDENTITY`, `INACTIVE_PRODUCT`, `INACTIVE_VARIANT`, `CATALOG_HIDDEN`, `DIGITAL_PRODUCT`, `DELETED_PRODUCT`, `MISSING_SLUG`, `INVALID_PRICE`, `MISSING_IMAGE`, `MISSING_TITLE`, `VARIABLE_MISSING_PARENT_WOO_ID`.

### Variant handling

- One feed row per **sellable offer** (Woo variation ID or simple product ID stored on variant).
- Variable products: title suffix from attribute values; optional `g:color` / `g:size`.

### Active / inactive filtering

- **Product + variant must be ACTIVE.** Staging cert: **11** backfilled historical offers excluded (2 draft products + 9 inactive variants).

### Stock filtering

- **No stock-based exclusion.** OOS items remain in feed with `g:availability=out_of_stock` (computed from `max(0, onHand - reserved)`).

### Country / currency

- **INR only** (`MERCHANT_FEED_CURRENCY = "INR"`). India CTX contract aligned on currency; no multi-country rows in V1.

### ID generation

```typescript
g:id = merchantIdFromWooOfferId(wooCommerceVariationId)
// => "gla_" + wooCommerceVariationId
```

**CTX contract uses bare numeric `g:id`** — this is the single largest identity blocker.

### Item group generation

```typescript
// Emit g:item_group_id when Product.wooCommerceId !== wooCommerceVariationId
itemGroupId = String(Product.wooCommerceId)
```

CTX also emits `item_group_id` equal to `g:id` on **simple** products (38 rows) — native **omits** group in that case.

### Product Type generation

```typescript
productTypePath(categories) // up to 3 category names joined " > " (leaf order from DB join)
```

**Not** sourced from Woo/CTX hierarchy strings. Does not preserve CTX `All` segments or depth.

### URL generation

```typescript
link = `${siteOrigin}/product/${Product.slug}`
```

`siteOrigin` from `MERCHANT_FEED_SITE_URL` → `NEXT_PUBLIC_SITE_URL` → `FRONTEND_URL`.  
**No** `/store/` paths, **no** `attribute_*` query strings, **no** `canonical_link`.

### Image URLs

Variant image → shared product gallery → absolute HTTPS via CDN env (`AWS_CLOUDFRONT_URL` / `NEXT_PUBLIC_MEDIA_CDN_URL`).

### Price / sale price

- Authority: `ProductVariant.saleInPaise`, `mrpInPaise`
- On sale: `g:price` = MRP, `g:sale_price` = sale (Google advertises sale = PDP price)
- Format: `"NNNN.NN INR"`

### Brand / identifier_exists

- `g:brand` = constant `"Sarveda"`
- `g:identifier_exists` = `no` (no GTIN/MPN in schema)

### Prior certification baseline

Staging Lightsail DB (Aug 2026): **864** variants → **681** with identity → **670** eligible. Documented in `docs/SARVEDA_NATIVE_GOOGLE_MERCHANT_FEED_V1.md` and `docs/audit/merchant_production_feed_validation.json`.

---

## 2. CTX India feed as legacy production contract

| Metric | CTX authoritative file | Notes |
|--------|------------------------|-------|
| Total items | **883** | 883 unique `g:id` |
| Availability | **793** in_stock, **90** out_of_stock | User-reported 806/77 may be different export snapshot |
| Unique `item_group_id` | **159** | |
| Distinct `product_type` | **63** | |
| `g:id` format | **883/883 numeric** | No `gla_` prefix |
| Links | **883/883** `/store/...` | **845** with `attribute_` query params |
| `canonical_link` | **883/883** present | |
| `additional_image_link` | **883/883** present | |

Example continuity requirement (user spec):

- CTX `g:id = 10009` → must remain **`10009`**, not UUID and not renamed without explicit migration plan.
- CTX `g:item_group_id = 10008` → must remain **`10008`** for that variation family.

Native staging for same offer (`10009`): `g:id = gla_10009`, `item_group_id = 10008` — **group OK, id format wrong**.

---

## 3. Exhaustive 883-row reconciliation

Every CTX item is classified exactly once in:

`docs/audit/google-merchant-native-compatibility/reconciliation_883.csv`  
`docs/audit/google-merchant-native-compatibility/reconciliation_883.json`

### Primary classification counts

| Classification | Count |
|----------------|------:|
| `MATCH_FIELD_DIFFERENCE` | 670 |
| `MISSING_NATIVE_VARIANT` | 128 |
| `MISSING_NATIVE_PRODUCT` | 48 |
| `INTENTIONALLY_EXCLUDED` | 26 |
| `NATIVE_INACTIVE` | 11 |
| **Total** | **883** |

**670** rows overlap the native eligible feed but **zero** are `EXACT_MATCH` under CTX semantics (structural contract differences on every overlapping row).

### Field-level tags (670 overlap)

| Tag | Count / 670 |
|-----|------------:|
| `ID_MISMATCH` | 670 |
| `URL_MISMATCH` | 670 |
| `IMAGE_MISMATCH` | 670 |
| `PRODUCT_TYPE_MISMATCH` | 665 |
| `PRICE_MISMATCH` | 501 |
| `SALE_PRICE_MISMATCH` | 393 |
| `AVAILABILITY_MISMATCH` | 294 |
| `ITEM_GROUP_ID_MISMATCH` | 33 |

Regenerate: `python3 docs/audit/google-merchant-native-compatibility/reconcile_ctx_native.py`

---

## 4. Why 883 (CTX) vs ~670 (native) — numerical reconciliation

```
CTX total:                         883
Native eligible (staging feed):    670
Gap:                               213
Check: 670 + 213 = 883             ✓
```

### Gap breakdown (213 CTX items not in native feed)

| Cause | Count | Classification |
|-------|------:|----------------|
| Woo offer in audit but **no Sarveda variant** (mostly `unmatched`) | **128** | `MISSING_NATIVE_VARIANT` |
| CTX offer **not in** `merchant_woo_sarveda_mapping.tsv` | **48** | `MISSING_NATIVE_PRODUCT` |
| Mapped + variant exists but **not identity-backfilled** / outside 681 identity set | **26** | `INTENTIONALLY_EXCLUDED` |
| Identity backfilled but **excluded** (inactive product/variant) | **11** | `NATIVE_INACTIVE` |
| **Total not in native feed** | **213** | |

### Native-side scope (why native stops at 670, not 883)

| Stage | Count | Explanation |
|-------|------:|-------------|
| Sarveda variants in staging DB | 864 | Imported catalog scope |
| With `wooCommerceVariationId` | 681 | Identity backfill complete |
| **Eligible after V1 rules** | **670** | 11 inactive + various catalog gaps |
| CTX advertised offers | 883 | Superset of staging import + Woo-only offers |

**The ~670 figure is not “missing variants math error”** — it is the **eligible subset** of **681** backfilled identities under native V1 rules, while **CTX advertises 883 Woo offers** still live in WooCommerce today.

Additional context:

- **183** variants in DB have **NULL** `wooCommerceVariationId` (never in any identity-aware native feed).
- CTX includes **~202** offers not in the **681** backfill TSV (newer Woo SKUs, unmatched rows, medium-confidence-only mappings).
- Older MC mapping audit (`merchant_woo_sarveda_mapping.tsv`) covered **844** rows vs **883** CTX — **39** more offers in current CTX export.

---

## 5. Product Type — release-critical comparison

| Metric | Value |
|--------|------:|
| Distinct CTX `product_type` | **63** |
| Distinct native `product_type` (670 overlap) | **58** |
| Exact string match (overlap) | **5 / 670** |
| Changed strings (overlap) | **665 / 670** |
| CTX-only product types (not seen in native overlap) | **58** |
| Native-only product types (among overlap) | **53** |

Full per-item strings: `docs/audit/google-merchant-native-compatibility/product_type_670.json`

### Example (offer `10009`)

| Source | `product_type` |
|--------|----------------|
| CTX | `Sound & Musical Instruments > All > Singing Bowls & Bells > All` |
| Native | `Singing Bowls & Bells > All > Sound & Musical Instruments` |

**No normalization was applied in this audit.** Strings are compared literally as required for Ads filters.

**Release requirement:** Native replacement feed must emit **byte-identical** CTX `product_type` strings (or Ads must rebuild all Product Type filters before cutover).

---

## 6. Landing-page continuity

Integrated with legacy URL certification (`docs/audit/release-certification/legacy_url_exhaustive.json`, `frontend/lib/legacy-woo-product-url.ts`) — not duplicated blindly.

| Landing class | Count / 883 | Meaning |
|---------------|------------:|---------|
| `VARIANT_SELECTION_LOST` | **740** | `/store/` URL 301s to `/product/{slug}` but **attribute query not auto-selected** on native PDP |
| `404` | **108** | No audited slug target (`NO TARGET`, unmapped, unresolved leaves) |
| `SAFE_REDIRECT` | **35** | `/store/` → `/product/{slug}` without attribute query |
| `EXACT_NATIVE_DESTINATION` | **0** | No CTX link already matches native PDP URL |

Known certified failures still apply (e.g. `non-printed-copper-water-bottles` → wrong alias target; `/product/singing-bowl-with-7-chakra-healing-from-sound-therapy/` → 404 without redirect).

**Cutover note:** CTX `<link>` URLs will **not** resolve identically post-cutover; they depend on **301 program + PDP variant UX**. Feed `<link>` should continue to match what Ads/MC expect until deliberate URL migration is approved.

---

## 7. Price and availability continuity

Compared CTX values vs native staging feed for **670** overlapping offers.

| Field | Mismatches |
|-------|----------:|
| `g:price` | 501 |
| `g:sale_price` | 393 |
| `g:availability` | 294 |

Example **`5713`** (Handheld Coconut Shaker):

| | CTX | Native staging |
|---|-----|----------------|
| Price / sale | ₹1,229.00 / ₹945.00 | ₹1,108.80 / ₹990.00 |
| Availability | in_stock | in_stock |

Prior release certification validated **native feed ↔ public product API** consistency for 670 items (R01–R30). This audit adds: **CTX ↔ native** is **not** aligned on price/stock for most overlapping SKUs — likely Woo CTX export lag vs Sarveda DB authority + tax/rounding rules.

**Requirement before MC swap:** For each of 883 CTX IDs, either (a) native feed matches **CTX snapshot** exactly, or (b) landing page + DB are updated first and Ads accepts deliberate price/stock change.

---

## 8. Safest replacement architecture

### Recommendation: **Option A+ — CTX-contract XML from native backend**

**Do not** point PRODUCTS SOURCE 2 at the current V1 native feed.

Implement a **CTX compatibility feed mode** (separate route or env flag) that reproduces the **exact CTX XML contract**:

1. **`g:id` = bare numeric Woo offer ID** (not `gla_` prefix)
2. **`g:item_group_id`** matching CTX semantics (including simple self-group rows)
3. **`g:product_type`** copied from preserved Woo/CTX strings (new DB column or sidecar map — **do not recompute from categories**)
4. **883-row coverage** — every CTX ID must map to a native sellable row or explicit `out_of_stock` placeholder with stable ID
5. **`<link>` / `canonical_link` policy** — decide with Ads: keep `/store/` URLs via 301-compatible hosts until MC link update approved, or migrate links in feed + MC together
6. **`price` / `sale_price` / `availability`** from same source as storefront API (with CTX-formatting)
7. **`additional_image_link`** if MC diagnostics require parity

**Option B (adapt existing V1 feed)** only works if V1 is extended with A–G above. V1 alone is insufficient.

**Do not create a new Merchant Center account or new ID universe.**

---

## 9. Cutover plan (future — not executed in this audit)

### Phase 0 — Preconditions (BLOCKED until P0 cleared)

- [ ] CTX compatibility feed emits **883** rows, **numeric IDs**
- [ ] **63** product types preserved literally
- [ ] Diff report vs CTX: **0 unexplained P0 mismatches**
- [ ] Landing program: 108 `404` rows resolved or delisted from Ads

### Phase 1 — Native feed certification

1. Deploy compatibility feed to production origin (`MERCHANT_FEED_SITE_URL=https://sarveda.com`)
2. Run `reconcile_ctx_native.py` against production snapshot — target **≥883 EXACT_MATCH** on identity + product_type + price fields
3. Re-run release-certification price/inventory rules (R01–R30) on new feed

### Phase 2 — Feed URL accessibility

1. Verify `GET https://sarveda.com/api/merchant/google/products.xml` (or dedicated CTX-compat path) — 200, `application/xml`, HTTPS, no auth
2. Confirm fetch size ~CTX parity (~883 items)
3. Allowlist in WAF / rate limits for Google fetchers

### Phase 3 — ID / product_type validation

1. Export MC diagnostics after **test fetch** on staging MC (if available) — zero ID drift
2. Ads team confirms Product Type filters unchanged (screenshot filter rules vs feed distinct values)

### Phase 4 — Landing-page validation

1. Re-run legacy URL exhaustive cert on all CTX `<link>` paths
2. Spot-check top 50 spend SKUs: feed link → final PDP + variant + price

### Phase 5 — DNS / storefront cutover

1. Cut DNS to native storefront (existing runbook)
2. Keep Woo CTX feed URL live until Phase 6 succeeds

### Phase 6 — Merchant source update

1. In existing MC → PRODUCTS SOURCE 2 → update feed URL to native CTX-compat endpoint
2. **Do not** add a second primary source
3. Fetch now → monitor processing errors 24–48h

### Phase 7 — Diagnostics monitoring

1. MC: disapprovals, price mismatch, link mismatch, missing IDs
2. Compare item count **883** stable
3. Native `X-Sarveda-Merchant-Feed-Items` header + daily reconciliation job

### Phase 8 — Ads confirmation

1. Ads team: PMax / Shopping serving, no “not eligible” spike
2. Product Type segment counts stable week-over-week

### Rollback criteria

- MC item count drops **>2%** vs 883 baseline
- **Any** P0 ID rename detected
- Product Type filter audience collapses **>5%**
- Widespread price / availability mismatch flags
- Landing 404 rate on feed URLs **>1%**

### Rollback procedure

1. Revert PRODUCTS SOURCE 2 URL to **last known-good CTX/Woo XML URL** (keep Woo feed hosting alive until +30 days post-cutover)
2. Pause native feed route if it causes duplicate sources
3. Restore DNS only if storefront itself regressed (separate rollback)
4. Post-mortem + fix compatibility feed before retry

---

## 10. Summary answer for Ads / leadership

| Question | Answer |
|----------|--------|
| Replace CTX without rebuilding campaigns? | **No** today |
| Root cause of 883 vs 670? | CTX = full Woo advertised set; native = **670 eligible** subset of **681** backfilled IDs in staging DB + **213** offers missing/inactive/unmapped |
| Biggest blockers? | **Numeric ID format**, **Product Type strings**, **213 missing rows**, **price/availability drift** |
| Safest path? | **CTX-contract compatibility feed** from native backend, then swap PRODUCTS SOURCE 2 URL |
| Current native V1 usable as-is? | **No** for PRODUCTS SOURCE 2 cutover |

---

## Evidence index

| Path | Description |
|------|-------------|
| `docs/audit/google-merchant-native-compatibility/INDEX.json` | Artifact manifest |
| `docs/audit/google-merchant-native-compatibility/ctx_india_authoritative.xml` | Legacy CTX feed (883) |
| `docs/audit/google-merchant-native-compatibility/native_staging_feed_670.xml` | Native feed snapshot |
| `docs/audit/google-merchant-native-compatibility/reconciliation_883.csv` | **883-row reconciliation** |
| `docs/audit/google-merchant-native-compatibility/reconciliation_883.json` | Full JSON reconciliation |
| `docs/audit/google-merchant-native-compatibility/summary.json` | Aggregates + product types |
| `docs/audit/google-merchant-native-compatibility/product_type_670.json` | Product type per overlap row |
| `docs/audit/merchant_woo_sarveda_mapping.tsv` | Woo ↔ Sarveda mapping audit |
| `docs/audit/merchant_identity_backfilled.tsv` | 681 identity backfill pairs |
| `docs/audit/release-certification/legacy_url_exhaustive.json` | Landing URL cert |
| `docs/SARVEDA_NATIVE_GOOGLE_MERCHANT_FEED_V1.md` | Native V1 implementation cert |

---

*Audit completed 2026-09-01. No code, configuration, or production systems were modified.*
