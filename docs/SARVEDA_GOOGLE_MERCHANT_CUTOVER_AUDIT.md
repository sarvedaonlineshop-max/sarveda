# Sarveda Google Merchant Center Cutover Audit

**Status:** READ-ONLY audit — no code, database, configuration, or environment changes were made.  
**Date:** 2026-08-31  
**Scope:** Replace WooCommerce → Google Merchant Center product sync with the new Sarveda (Next.js + Express + Prisma) stack while **preserving the existing Merchant Center and Google Ads / Shopping setup**.  
**Constraint:** Do **not** create a new Merchant Center account.

---

## 1. Executive verdict

| Question | Answer |
|----------|--------|
| Does Sarveda already sync to Google Merchant Center? | **No.** No Merchant / Content / Merchant API client, no Google Shopping XML/RSS product feed, and no “Google for WooCommerce” equivalent exists in this repo. |
| Can we keep the **same** Merchant Center + Ads? | **Yes** — feed/API destination stays the existing MC; we only change how products are supplied. |
| Can we expose a Google-compatible XML feed from Sarveda? | **Yes, architecturally** — catalog data is rich enough for a feed — but **it is not implemented yet**. |
| Can we preserve existing MC `id` values? | **Partially.** Parent Woo product IDs (`Product.wooCommerceId`) and **SKUs** are preserved. **Woo variation IDs are not stored** on `ProductVariant`. Continuity depends on what the current Woo sync uses as Merchant `id` (must confirm from MC export). |
| Lowest-risk launch path | **C → A:** temporary **compatibility feed** matching current Woo Merchant IDs/links, then stabilize as Sarveda’s permanent File(URL) feed in the **existing** MC. Direct Merchant API (B) is higher effort and not required for cutover night. |

**Tonight risk if ignored:** When `sarveda.com` DNS leaves WordPress, both **Google for WooCommerce** and the **old Woo XML File(URL)** stop updating. Shopping ads keep serving stale price/availability until Google disapproves or ads underperform. Landing pages can still work if PDP URLs match — but **catalog sync will go dark** without a Sarveda feed.

---

## 2. Current Woo / Merchant / Ads setup (stated + implied)

From the cutover brief (not re-verified inside Google UI in this audit):

1. **Google for WooCommerce** on live WP automatically syncs products into the **existing** Merchant Center.
2. That MC is linked to the **existing Google Ads** account with active Shopping campaigns.
3. There is also an existing **Merchant Center File(URL) XML** source pointing at the old Woo site.

**Implication for cutover:**

- DNS cutover kills both WP plugin sync and any feed URL hosted on WP/`sarveda.com` WordPress paths.
- Ads/MC accounts themselves do **not** need recreation — only the **product data source** must be replaced.
- Retiring both old sources must be sequenced **after** a healthy Sarveda feed (or API) is approved in the same MC.

---

## 3. What exists in the new Sarveda application

### 3.1 Product & variant schema (relevant fields)

**`Product`** (`backend/prisma/schema.prisma`):

| Field | Present | Merchant relevance |
|-------|---------|-------------------|
| `id` (UUID) | Yes | New internal ID — **not** Woo ID |
| `slug` | Yes | Landing page path `/product/{slug}` |
| `name`, `description`, `shortDescription` | Yes | title / description |
| `status` (`DRAFT`/`ACTIVE`/`ARCHIVED`), `catalogHidden`, `deletedAt` | Yes | feed inclusion rules |
| `productType` (`SIMPLE`/`VARIABLE`/`DIGITAL`) | Yes | item group handling |
| `seoTitle`, `seoDescription`, `seoKeyword` | Yes | description / SEO; not GMC-required |
| `wooCommerceId` (`Int?` unique) | Yes | **Parent** Woo product ID continuity |
| `taxClass`, `hsnCode` | Yes | tax/HSN — not GMC core |
| Brand / GTIN / MPN / `identifier_exists` | **No columns** | Gap for GMC identifiers |
| Condition | **No** | Must default (e.g. `new`) in any feed |

**`ProductVariant`:**

| Field | Present | Merchant relevance |
|-------|---------|-------------------|
| `id` (UUID) | Yes | New ID — not Woo variation ID |
| `sku` (unique) | Yes | Strong candidate for Merchant `id` / `mpn` fallback |
| `mrpInPaise` / `saleInPaise` | Yes | INR price / sale_price |
| `mrpUsdCents` / `saleUsdCents` | Yes | USD |
| `mrpGbpPence` / `saleGbpPence` | Yes | GBP |
| `mrpAedFils` / `saleAedFils` | Yes | AED (extra; MC feed may ignore unless configured) |
| `weightGrams` | Yes | shipping weight |
| `status` ACTIVE/INACTIVE | Yes | availability / exclusion |
| `inventory.onHand` / `reserved` | Yes | availability = `(onHand - reserved) > 0` |
| Woo **variation** ID | **Not stored** | Critical continuity gap if MC `id` = variation ID |
| GTIN / MPN / brand | **Not stored** | Gap |

**`ProductImage`:** product-level and optional `variantId`; `url`, `altText`, `position`, `isPrimary`.

**`Category` / `ProductCategory`:** slugs/names; storefront URL `/product-category/{slug}`.

**`VariantShippingRate`:** per variant × country (`IN`, `US`, `GB`, `OTHER`) with standard/expedited/COD amounts (integer minor units) + `estimatedDays`.

### 3.2 Staging catalog coverage (read-only query, Lightsail DB)

Observed at audit time (ACTIVE catalog):

| Metric | Count |
|--------|------:|
| Active products | 200 |
| Products with `wooCommerceId` | 153 |
| Active variants | 839 |
| Active variants with INR MRP &gt; 0 | 839 |
| With USD prices | 802 |
| With GBP prices | 793 |
| Shipping rate rows by country | IN/US/GB/OTHER ≈ 818 each |
| Product images | 4120 |
| Products with `seoTitle` | 153 |

**Gaps:** ~47 active products lack `wooCommerceId` (newer / non-migrated). Any MC continuity strategy based solely on Woo IDs will miss those unless they use SKU or new IDs.

### 3.3 Identifiers — what is preserved from Woo

| Identifier | Preserved? | Where |
|------------|------------|--------|
| Woo **product** post ID | Yes (most migrated) | `Product.wooCommerceId` |
| Woo **variation** ID | **No** | Not in schema |
| SKU | Yes | `ProductVariant.sku` (canonical ops key; see `data/compare/README_MASTER.md`) |
| Slug | Yes (with intentional redirects) | `Product.slug` + `frontend/next.config.js` redirects for renames |
| User / order Woo IDs | Yes (unrelated to MC) | `User.wooCommerceId`, `Order.wooCommerceId` |

**Google for WooCommerce** commonly sets Merchant item `id` to:

- Woo product ID (simple), or  
- Woo **variation** ID (variable), or  
- **SKU** if “use SKU as ID” (or equivalent) is enabled.

**Action before choosing feed `id` mapping:** Export current Merchant Center products (`id`, `item_group_id`, `link`, `sku` if present) and compare to Sarveda `wooCommerceId` / `sku`. This audit cannot see the live MC export.

### 3.4 Title, description, brand, GTIN, MPN

| Attribute | Sarveda source | Notes |
|-----------|----------------|-------|
| Title | `Product.name` (SEO title separate) | Feed should use storefront title, not necessarily `seoTitle` |
| Description | `description` / `shortDescription` / `seoDescription` | HTML present; feed must strip/sanitize |
| Brand | **Hardcoded** `"Sarveda"` in JSON-LD only (`frontend/lib/seo-product.ts`) | No DB brand field |
| GTIN | **Missing** | Will need `identifier_exists=false` (or populate later) for many handmade/custom SKUs |
| MPN | **Missing** as dedicated field | SKU often acceptable as MPN for custom goods |

### 3.5 Price & sale price

- Stored as **integers** (paise / cents / pence / fils) — good for feed precision.
- Zone pricing: `IN`→INR, `US`/`OTHER`→USD, `GB`→GBP (`frontend/lib/currency.ts`).
- Sale vs MRP: `saleInPaise` vs `mrpInPaise` (and USD/GBP analogs).
- JSON-LD Offer currently exposes **INR only** for default variant — storefront is multi-currency; MC usually needs **one primary feed currency per feed / target country**.

**Price mismatch risk after cutover:** High if MC still shows Woo prices while Sarveda site shows updated MASTER/Zoho prices — until a Sarveda feed refreshes MC.

### 3.6 Inventory / availability

- Available units: `max(0, onHand - reserved)`.
- Storefront OOS disables ATC and shows Notify Me.
- Stock updates via admin, XL import, Zoho webhook, PO receive, etc.

**Availability mismatch risk:** Same as price — MC stays on last Woo sync until Sarveda feed/API updates.

### 3.7 Images

- S3 / CDN URLs on `ProductImage.url` (staging uses `sarveda-media`).
- Variant-specific images supported (`variantId`).
- Feed must emit absolute HTTPS image URLs; confirm production CDN host remains reachable after DNS cutover.

### 3.8 Product URLs / slugs (landing pages)

- Canonical PDP: **`https://sarveda.com/product/{slug}`** — same pattern as Woo (`CLAUDE.md` SEO rules; `frontend/app/product/[slug]/page.tsx`).
- Trailing slash normalized; several **slug rename 301s** in `frontend/next.config.js` (e.g. old artistic copper bottle slug → new slug).
- Listing: `/store` is the public storefront alias; `/shop` redirects to `/store` (internal shop page still exists).
- Categories: `/product-category/{slug}` preserved.

**URL continuity:** For products whose **slug did not change**, Merchant `link` values pointing at `/product/{slug}` should keep working after DNS cutover **as soon as** the new app serves `sarveda.com`.

**Broken-link risks:**

1. Slugs changed without a redirect (partially mitigated by known redirects — not proven exhaustive vs MC links).  
2. `NEXT_PUBLIC_SITE_URL` / canonical host mis-set → wrong absolute URLs in sitemap/JSON-LD (feed must hardcode production host).  
3. Variant deep-links: Woo sometimes used `?attribute_*=` or variation URLs; Sarveda PDP is slug-based with client variant selection — usually OK if MC link is parent PDP.

### 3.9 Categories / product types

- Categories in DB with hierarchy; feed can map to Google `product_type` (breadcrumb path) and optionally `google_product_category` (**not stored** — would be manual mapping or omitted initially).

### 3.10 Shipping data for GMC

- Rich per-variant, per-country shipping amounts exist (`VariantShippingRate`).
- GMC can use feed shipping attributes **or** MC account shipping settings.
- Lowest cutover risk: rely on **existing MC shipping settings** initially; add feed shipping later once amounts/currency mapping are validated.

### 3.11 Currency & countries

- App sells IN / US / GB / worldwide (OTHER→USD).
- Typical approach: **primary India INR feed** (or whatever the current MC primary target is) first; add supplemental feeds for US/GB later if Ads structure requires them.
- Confirm existing MC target countries before designing multi-feed.

### 3.12 SEO / product metadata

- Per-product Yoast-migrated SEO fields; JSON-LD Product + Offer (INR); sitemap includes `/product/{slug}` **only when** `isProductionSite()` (`hostname` is `sarveda.com` / `www`) — see `frontend/app/sitemap.ts`.
- SEO metadata ≠ Merchant feed; helpful for organic, not a substitute for GMC sync.

### 3.13 Google Merchant / Shopping / feed / API in codebase

| Capability | Status |
|------------|--------|
| Google Merchant Center File(URL) feed endpoint | **Not implemented** |
| RSS/Atom product feed | **Not implemented** |
| Content API for Shopping | **Not implemented** |
| Merchant API | **Not implemented** |
| Google for WooCommerce bridge | **Not applicable** (no WP) |
| Admin “push to Google” | **Not implemented** |

**Conclusion:** Sarveda can **host** a feed, but someone must **build and register** it; nothing is ready to point MC at today.

### 3.14 Google Ads / GA4 / GTM / conversions (ecommerce-adjacent)

| Capability | Status | Evidence |
|------------|--------|----------|
| GA4 (`gtag`) | Implemented when `NEXT_PUBLIC_GA4_ID` set + `NODE_ENV=production` | `frontend/app/layout.tsx` |
| Meta Pixel | Implemented when `NEXT_PUBLIC_META_PIXEL_ID` set | same |
| GTM | **Not implemented** | Direct gtag |
| Google Ads conversion tag / AW- | **Not found** as separate tag | Purchase via GA4 `purchase` in `frontend/lib/analytics.ts` (`item_id` = **SKU** snapshot) |
| Order attribution (first/last touch) | Separate Sarveda feature; independent of GMC | docs / `AttributionProvider` |

Shopping campaign continuity is primarily **Merchant product sync + landing URLs**, not GA4. Still set production GA4 on Vercel for measurement after cutover.

---

## 4. Architecture comparison for preserving Shopping continuity

### Goals

1. Keep **existing** Merchant Center + Ads.  
2. Keep existing MC product `id`s where safely possible (history, ROAS, disapprovals).  
3. Avoid price / availability mismatch.  
4. Avoid broken landing URLs after DNS cutover.  
5. Avoid **duplicate** MC products (new IDs for same SKUs).  
6. Retire Woo plugin sync + old XML safely.

### Option A — New Sarveda XML/File(URL) feed → existing MC

| Pros | Cons |
|------|------|
| Fits current MC “File(URL)” pattern | **Not built yet** |
| No new MC account | Must match `id` strategy or risk duplicates |
| Easy to schedule fetch in MC | Need stable public HTTPS URL on/after cutover |
| Lowest long-term ops cost vs API | Multi-currency may need supplemental feeds |

### Option B — Direct Merchant API / Content API

| Pros | Cons |
|------|------|
| Near-real-time updates | **Not built**; OAuth, quotas, error handling |
| Fine-grained patches | Higher launch risk tonight |
| Good long-term | Overkill for cutover if File(URL) already used |

### Option C — Temporary compatibility feed matching old Woo identifiers

| Pros | Cons |
|------|------|
| Best chance to **update in place** same MC rows | Requires knowing current MC `id` scheme |
| Prevents duplicates if IDs match | Variation-ID scheme needs Woo variation ID map we **don’t have** in DB |
| Can be the first version of Option A | ~47 products without `wooCommerceId` need SKU/`id` policy |

### Option D — Other safer patterns discovered

1. **Keep Woo alive on a temporary hostname** only for G4W/XML until Sarveda feed is live — DNS for `sarveda.com` still moves; feed host stays WP. Operationally messy; SSL/host allowlists; still temporary.  
2. **Pause Shopping campaigns** for cutover window — protects spend from bad landings/stale prices; revenue hit.  
3. **SKU-as-id migration inside MC** (if current IDs are Woo numeric) — Google’s ID change is painful; prefer matching existing IDs first.

---

## 5. Recommended lowest-risk approach

### Recommendation: **C then A** (compatibility File(URL) feed in the **existing** MC)

**Do not choose B for tonight.**  
**Do not create a new Merchant Center.**

#### Phase plan

1. **Export** current MC products (`id`, `item_group_id`, `link`, `title`, `price`, `availability`, optional `sku`).  
2. **Classify** `id` format:
   - If IDs ≈ SKUs → map feed `id` = `ProductVariant.sku`.  
   - If IDs ≈ parent Woo IDs → map simple products to `Product.wooCommerceId`; for variables, determine whether MC uses parent + `item_group_id` or variation IDs.  
   - If IDs ≈ Woo **variation** IDs → **blocked** until a variation-ID mapping is recovered from Woo DB / G4W export / historical feed file.  
3. **Implement** (post-audit work) a public feed, e.g. `GET https://sarveda.com/api/feeds/google-merchant.xml` (or Next route), including only `ACTIVE`, non-`catalogHidden`, non-deleted sellable variants.  
4. **Register** that URL as a **new File(URL)** primary source in the **existing** MC (or replace the old URL in place once validated).  
5. Wait for fetch + processing; spot-check price, availability, link.  
6. **Disable** Google for WooCommerce sync and **remove/disable** the old Woo XML source only after Sarveda feed is healthy (no mass “new” duplicates).  
7. Optional later: Merchant API for near-real-time; supplemental US/GB feeds.

#### Feed field sketch (for implementers — not built)

| GMC attribute | Suggested Sarveda mapping |
|---------------|---------------------------|
| `id` | Match current MC (SKU or `wooCommerceId` / recovered variation id) |
| `item_group_id` | Parent `wooCommerceId` or parent product UUID/slug key — **must match current MC** |
| `title` | `Product.name` + variant attribute label |
| `description` | Plaintext from description/shortDescription |
| `link` | `https://sarveda.com/product/{slug}` |
| `image_link` | Primary image absolute URL |
| `additional_image_link` | Other images |
| `availability` | `in_stock` / `out_of_stock` from inventory |
| `price` / `sale_price` | Zone currency for feed target (likely INR) |
| `brand` | `Sarveda` |
| `condition` | `new` |
| `gtin` / `mpn` / `identifier_exists` | Prefer SKU as MPN; `identifier_exists=false` if no GTIN |
| `shipping` | Optional; else MC account settings |
| `product_type` | Category path |

---

## 6. Risk register (Shopping continuity)

| Risk | Severity | Mitigation |
|------|----------|------------|
| No Sarveda feed at DNS cutover | **Critical** | Build/register feed ASAP; or keep temporary Woo feed host; or pause Shopping |
| MC `id` = Woo variation ID (not in DB) | **Critical** | Recover map from Woo/MC export before replacing IDs |
| Duplicate products (new UUID/SKU ids) | **High** | Never invent new `id`s until old rows are expired/removed deliberately |
| Price mismatch | **High** | Sarveda feed must use live DB sale/MRP; fetch schedule ≤ daily (ideally few hours) |
| Availability mismatch | **High** | Same; include OOS variants as `out_of_stock` rather than dropping if MC expects stable ids |
| Broken landing URLs | **High** | Verify MC `link` slugs vs DB + redirects; set production site URL |
| Image host / mixed content | Medium | Absolute HTTPS CDN URLs |
| Missing GTIN disapprovals | Medium | `identifier_exists=false` + brand/MPN policy |
| Multi-currency Ads | Medium | Confirm MC targets; add supplemental feeds after IN stable |
| GA4 / Ads conversion gaps | Lower for Shopping listings | Ensure `NEXT_PUBLIC_GA4_ID` on production; Ads tag later if needed |

---

## 7. BEFORE vs AFTER `sarveda.com` DNS cutover

### MUST complete BEFORE (or as hard gates at cutover)

| Item | Why |
|------|-----|
| New app serves `sarveda.com` / `www` correctly (TLS, host, `NEXT_PUBLIC_SITE_URL`) | Landing pages + canonical/sitemap |
| PDP URLs `/product/{slug}` resolve for SKUs in Shopping | Prevent broken ads |
| Known slug 301s deployed | Renamed products |
| **Plan locked** for Merchant data source (C→A) | Avoid flying blind |
| MC product export pulled for `id`/`link` analysis | ID continuity |
| Decision: pause Shopping **or** temporary feed host **or** Sarveda feed live | Catalog sync cannot silently die |
| Production GA4 env (if using same property) | Measurement continuity |
| Confirm image CDN remains public | Feed + PDP |

### SHOULD complete BEFORE if at all possible (same night / hours before)

| Item | Why |
|------|-----|
| First Sarveda Google XML feed deployed + added in **existing** MC | Prevents stale price/availability |
| Spot-check 20 Shopping landing URLs from MC export against new site | Broken link prevention |
| Document which products lack `wooCommerceId` | Feed inclusion rules |

### SAFE TO COMPLETE AFTER launch

| Item | Why |
|------|-----|
| Full GTIN backfill / google_product_category taxonomy | Quality, not cutover blocker if policy set |
| Supplemental US/GB feeds | After primary feed healthy |
| Merchant API automation (Option B) | Optimization |
| Disable Google for WooCommerce + delete old Woo File(URL) | **Only after** Sarveda source is primary and healthy |
| Feed shipping attributes vs MC shipping UI tuning | Can iterate |
| Dedicated Google Ads AW- conversion tag beyond GA4 | Measurement polish |
| Variant-level image perfection in feed | Iterative |

### Explicitly DO NOT do at cutover

- Create a **new** Merchant Center account.  
- Upload a feed with **new** random UUIDs as `id` while old products remain (duplicates).  
- Delete all MC products “to start clean” without Ads/Shopping impact analysis.  
- Point MC at staging (`sarveda-demo.xyz`) as a **permanent** production feed (OK only as brief validation if links are rewritten carefully — prefer production host).

---

## 8. Answers to the audit questions (checklist)

| # | Question | Finding |
|---|----------|---------|
| 1 | Product/variant schema | Rich commerce schema; no GMC-specific tables |
| 2 | SKU / Woo IDs | SKU yes; parent `wooCommerceId` yes; **variation Woo ID no** |
| 3 | Title/description/brand/GTIN/MPN | Title/desc yes; brand hardcoded in JSON-LD; GTIN/MPN columns **absent** |
| 4 | Regular/sale price | Multi-currency integer money fields present |
| 5 | Inventory | `onHand`/`reserved` present |
| 6 | Images | Product + variant images on S3/CDN |
| 7 | URLs/slugs | `/product/{slug}` preserved; some 301 renames |
| 8 | Categories | Present; Google taxonomy not stored |
| 9 | Shipping for GMC | Per-country variant rates present; unused by any feed today |
| 10 | Currency/countries | IN/US/GB/OTHER zones |
| 11 | SEO metadata | Present; separate from GMC |
| 12 | Existing GMC/feed/API | **None in Sarveda** |
| 13 | Ads/GA4/GTM | GA4 + Meta; no GTM; no AW- tag found |
| 14 | URL match to MC | Likely for unchanged slugs; verify via MC export |
| 15 | Can expose Google XML from Sarveda? | **Yes, after implementation** — not present now |

---

## 9. Suggested immediate next actions (human / next workstream — not done in this audit)

1. Download Merchant Center product export + note File(URL) and G4W source status.  
2. Diff 50 rows: MC `id` vs Sarveda `sku` / `wooCommerceId`.  
3. Schedule feed implementation (Option C→A) as a dedicated task — **blocked on ID mapping**.  
4. Cutover runbook line item: “Shopping: pause **or** feed live.”  
5. After feed healthy: retire Woo G4W + old XML.

---

## 10. Document control

- **Type:** Read-only audit  
- **Code changes:** None  
- **DB changes:** None (staging counts were read-only)  
- **Env changes:** None  
- **Owner for follow-up:** Engineering + whoever administers Google Merchant / Ads (Arjun / agency)

---

SARVEDA GOOGLE MERCHANT CUTOVER AUDIT COMPLETE — READY FOR REVIEW
