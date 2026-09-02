# SARVEDA — Final SEO Migration / Cutover Compatibility Audit

**Date:** 2026-09-02  
**Mode:** READ-ONLY — no production, DNS, WordPress, Vercel config, GSC, Merchant Center, Ads, redirects, DB, or deployment changes were made.  
**Old (SEO authority):** `https://sarveda.com` (WordPress / WooCommerce)  
**New (native):** `https://sarveda-demo.xyz` (Next.js on Vercel → Lightsail API)

**Artifacts:** `docs/audit/seo-final-cutover/`

| File | Purpose |
|------|---------|
| `old_url_inventory.csv` | Normalized WP/Yoast URL inventory |
| `seo_url_mapping.csv` | Old → new classification |
| `redirect_matrix.csv` | Critical redirect HTTP checks |
| `product_seo_parity.csv` | Product URL continuity |
| `category_seo_mapping.csv` | Category URL continuity |
| `seo_http_validation.csv` | Live HTTP matrix |
| `seo_cutover_summary.json` | Machine-readable gate summary |
| `run_seo_cutover_audit.py` | Re-runnable read-only audit script |

---

## Verdict

# **B. READY AFTER SMALL FIXES**

Native product PDP continuity for the majority of historical `/store/...` landings **already works**. Cutover is **not blocked on Merchant**, domain rename, or wholesale URL redesign.

**Before DNS cutover, implement:**

1. **P0** — 301 nested Woo category URLs → leaf `/product-category/{slug}`
2. **P1** — Map the **14** Yoast product-sitemap leaves that still 404 on native

**At cutover (ops, not missing SEO engineering):** set `NEXT_PUBLIC_SITE_URL=https://sarveda.com`, redeploy, then verify robots/sitemap/canonicals on apex.

---

## Executive numbers

| Gate | Value |
|------|------:|
| **OLD_URLS_DISCOVERED** | **351** |
| **EXACT_URL_MATCHES** | **0** (WP product sitemap is `/store/...`, not `/product/...`) |
| **301_REDIRECTS_REQUIRED (gaps)** | **39** (23 nested cats + 14 unmapped products + 2 audited unresolved) |
| **301_REDIRECTS_ALREADY_WORKING** | **147/149** audited store leaves + **51** `next.config` permanent rules + **144/160** Yoast product leaves mapped |
| **BROKEN_REDIRECTS (sample)** | **4** (2 unresolved leaves, 1 nested category sample, 1 fake blog slug) |
| **UNRESOLVED_404S** | 23 nested categories + 14 unmapped products + 2 intentional leaves |
| **PRODUCTS_SEO_SAFE** | **144/160** mapped (**90%**); **14** need aliases |
| **CATEGORIES_SEO_SAFE** | Leaf pages OK; **nested paths NOT safe until P0** |
| **CANONICAL_READY** | Code ready; **depends on SITE_URL cutover** |
| **SITEMAP_READY** | Code ready; empty on demo until production host |
| **ROBOTS_READY** | Code ready; demo correctly `Disallow: /` |
| **STRUCTURED_DATA_READY** | Product + Breadcrumb JSON-LD present |
| **MERCHANT_LANDING_SEO_READY** | Yes (`?offer=` 200; canonical strips query) |
| **P0_COUNT** | **1** |
| **P1_COUNT** | **4** |
| **P2_COUNT** | **3** |

---

## 1. Old WordPress SEO URL surface

Yoast sitemap index (`https://sarveda.com/sitemap_index.xml`) exposes **22** child sitemaps.

Audited primary inventories:

| Type | Count | Source |
|------|------:|--------|
| Products | 161 | `product-sitemap.xml` — **all `/store/...` deep URLs** (plus `/store/` root) |
| Product categories | 27 | `product_cat-sitemap.xml` — mostly nested `/product-category/{parent}/{child}/` |
| Pages | 38 | `page-sitemap.xml` |
| Posts / insights | 64 | `post-sitemap.xml` |
| Courses | 15 | `course-sitemap.xml` |
| Events | 38 | `event-sitemap.xml` |
| + homepage, shop, robots, sitemap, cart/checkout/account | 8 | manual |

**SEO authority fact:** Live Woo product URLs in Search land primarily as **`/store/{category}/.../{leaf}/`**, not `/product/{slug}`. Native continuity therefore depends on the legacy store 301 layer (already implemented for most leaves).

Repo evidence reused: `docs/SARVEDA_LEGACY_WOO_URL_COMPATIBILITY_IMPLEMENTATION.md`, `frontend/lib/legacy-woo-product-url.ts`, `frontend/middleware.ts`.

---

## 2. Old → new URL classification

| Class | Meaning | Where we stand |
|-------|---------|----------------|
| **A EXACT_SAME_URL** | Same public path | Leaf categories (3 in sitemap shape); `/product/{slug}` after redirect |
| **B REDIRECT_301_TO_EQUIVALENT** | Correct permanent redirect | Most `/store/.../{leaf}/` → `/product/{slug}`; policies; `/shop`→`/store`; `/product-category/all`→`/store` |
| **C REDIRECT_301_TO_PARENT_OR_BEST_MATCH** | Soft match | Not used as default (avoid homepage dumps) |
| **D INTENTIONALLY_REMOVED_410** | Gone for good | Not yet applied |
| **E SHOULD_REMAIN_404** | No safe target | `elemental-chimes`, `box-tanpura` (audited) |
| **F NEW_PAGE_MISSING** | Need mapping/content | **14** Yoast product leaves; nested categories until P0 |
| **G AMBIGUOUS_MANUAL_REVIEW** | Human decision | Some renamed bottles / flutes among the 14 |

### Query-string preservation (already implemented)

Preserved across legacy product 301s: `gclid`, `gbraid`, `wbraid`, `utm_*`, `fbclid`, `attribute_*`.  
Blocked: `redirect`, `return`, `next`, `url`, `callback`.

---

## 3. Product SEO continuity

### What matters

> Does old SEO authority reach the **correct current** product?

| Metric | Result |
|--------|--------|
| Yoast product URLs | 161 (`/store/...`) |
| Mapped to native PDP | **144** via exact/known/alias |
| Unmapped leaves | **14** |
| Intentional unresolved | 2 (`elemental-chimes`, `box-tanpura`) |
| Store listing root `/store/` | Native `/store` = shop listing (OK) |

**GET validation (authoritative):**

```
/store/sound-musical-instruments/percussion/ocean-drums/
  → 308 (strip slash) → 301 → /product/ocean-drums → 200

/store/.../engraved-flat-wind-tibetan-gong-for-meditation-sound-therapy/
  → 301 → /product/wind-gong-etched → 200
```

Legitimate commerce differences (price, title, variant set, images) are **not** treated as SEO blockers when the landing product is correct.

### Unmapped Yoast leaves (P1)

`crescent-zafu-cushion-compact`, `engraved-copper-water-bottles`, `cotton-yoga-mat7-chakras`, `natural-bamboo-xylophone-with-5-keys`, `artistic-egg-shakers`, `copper-bottle-black-with-7-chakras-vintage`, `shruthi-thali-gong-plates`, `tuned-pipe`, `copper-bottle-curved-copper-diamond-groove`, `crystal-bowl-o-rings-support-rings`, `overtone-flute`, `overtone-flute-2`, `printed-copper-water-bottles`, `copper-bottle-with-7-chakras-plain`

Example known native near-matches (manual alias candidates):  
`shruthi-thali-gong-plates` → `gong-plates-shruti-plates-plain`;  
`copper-bottle-with-7-chakras-plain` → `7-chakras-plain-copper-bottles`.

---

## 4. Category / Product Type SEO

**Do not confuse** Merchant `g:product_type` with public category URLs.

| Old pattern | Native leaf | Status |
|-------------|-------------|--------|
| `/product-category/crystal-bowls/` | `/product-category/crystal-bowls` | OK (trailing slash 308) |
| `/product-category/sound-musical-instruments/crystal-bowls/` | leaf exists | **404 today — P0** |
| `/product-category/all` | `/store` | **301 working** |
| Nested eco/yoga/sound children (23) | matching leaf slugs exist | **Need nested→leaf 301** |

After P0 redirects, **CATEGORIES_SEO_SAFE = yes** (all 27 Yoast category URLs resolve).

Native category `seoTitle` / description fields are largely empty → **P2** content port, not URL breakage.

---

## 5. Redirect certification

| Mechanism | Role |
|-----------|------|
| `frontend/middleware.ts` | `/store/.../{leaf}` → 301 `/product/{slug}`; `/shop?category=` → category |
| `frontend/lib/legacy-woo-product-url.ts` | 140 known slugs + 68 aliases + query allowlist |
| `frontend/next.config.js` | ~51 permanent redirects (policies, old category prefixes, renamed PDPs, `/shop`→`/store`) |

Observed issues:

| Issue | Severity |
|-------|----------|
| Nested `/product-category/parent/child` → 404 | **P0** |
| Trailing-slash store URLs: **308 then 301** (chain) | P2 |
| Next permanent redirects often surface as **308** (Next.js behavior) | Acceptable; still permanent |
| No 302 soft-redirects found in samples | Good |
| Unresolved audited leaves → 404 (not homepage) | Correct intentional behavior |

---

## 6. Canonical audit

Code (`frontend/lib/site.ts` + PDP `generateMetadata`):

- Canonical = `canonical(\`/product/${slug}\`)` → **clean path, no `?offer=` / UTM**
- Verified on demo: `/product/ocean-drums?offer=10009&utm_source=google` still canonicalizes to PDP path only

**Current demo host in canonical:** `https://sarveda-frontend.vercel.app/...`  
**Current robots meta on demo:** `noindex, nofollow` (correct for non-production `isProductionSite()`)

**After `NEXT_PUBLIC_SITE_URL=https://sarveda.com` + redeploy, expect:**

| Page | Canonical |
|------|-----------|
| Home | `https://sarveda.com/` |
| PDP | `https://sarveda.com/product/{slug}` |
| Category | `https://sarveda.com/product-category/{slug}` |
| Merchant `?offer=` | same clean PDP canonical |
| Tracking params | same clean PDP canonical |

No `sarveda-demo.xyz` / `vercel.app` canonicals once SITE_URL is apex.

---

## 7. Robots + sitemap

| | Demo today | Production after SITE_URL |
|--|------------|---------------------------|
| `/robots.txt` | `Disallow: /` | Allow `/`; disallow admin/api/cart/checkout/profile/chat |
| `/sitemap.xml` | **0 URLs** (gated) | Products, categories, courses, events, CMS, blog, etc. on `sarveda.com` only |

Sitemap code intentionally excludes transactional junk and does not emit `?offer=` URLs.

**Gap (P3):** sitemap lists `/shop` while public UX redirects `/shop`→`/store`.

WP’s 22 sitemaps (tags, shipping class, zoom, testimonials…) need not be rebuilt 1:1 — monitor GSC for soft-404s on retired taxonomies.

---

## 8. Structured data

Native PDP emits:

- `Product` + `Offer` (INR, availability, SKU, brand Sarveda) via `productJsonLd`
- `BreadcrumbList` via `breadcrumbJsonLd`

Offer URL uses `absoluteUrl(/product/{slug})` — will become apex after SITE_URL cutover.

No duplicate Product schema blocks observed beyond Product + Breadcrumb (2 JSON-LD blocks).

---

## 9. Search Console cutover checklist (do not change GSC in this audit)

Same verified **`sarveda.com`** property continues (hosting move, not domain change).

After DNS + SITE_URL redeploy:

1. Confirm HTTPS + apex/`www` attachment on Vercel  
2. Fetch `/robots.txt` → crawl allowed  
3. Fetch `/sitemap.xml` → non-empty, apex hosts only  
4. Submit/resubmit sitemap in GSC  
5. URL Inspection on: home, 3 PDPs, 3 nested-old-category URLs (should 301→leaf), 2 legacy `/store/...` PDPs  
6. Monitor Coverage: 404 spikes, redirect errors, “duplicate without user-selected canonical”  
7. 24h / 7d: top landing pages, Core Web Vitals if available  

---

## 10. Merchant + SEO interaction

| Behavior | Status |
|----------|--------|
| Feed links `https://sarveda.com/product/{slug}?offer={id}` | By design |
| Native PDP returns 200 with `?offer=` | Verified |
| Canonical ignores `?offer=` | Verified (path-only) |
| Numeric historical offer IDs | Supported |
| `sv_{uuid}` native IDs | Code in repo; ensure frontend deploy includes resolver |
| Organic should not index offer variants as separate URLs | Canonical + (prod) indexable clean PDP |

Merchant Center can keep using query deep links; organic consolidates to clean PDP.

---

## 11. SEO content parity (not pixel-perfect)

| Area | Class |
|------|-------|
| Nested category URL 301s | **P0** |
| 14 unmapped product leaves | **P1** |
| SITE_URL / robots / sitemap activation | **P1** (cutover ops) |
| Category intro copy / meta | **P2** |
| Trailing-slash redirect chain | **P2** |
| `elemental-chimes` / `box-tanpura` | **P2** |
| Blog/insights (64 WP posts) | Assume migrated if `/[slug]` exists; spot-check high traffic in GSC (**P2/P3**) |
| Reviews aggregate in Product schema | Optional enhancement (**P3**) |

---

## 12. Live HTTP matrix (representative)

See `seo_http_validation.csv` + `redirect_matrix.csv`.

Highlights:

| Path | Demo result |
|------|-------------|
| Legacy store product (GET) | 308→301→PDP 200 |
| Nested category | **404** |
| Leaf category | 200 |
| `/shop` | → `/store` 200 |
| `/privacy-policy` | → `/privacy` 200 |
| `/product/...?offer=` | 200, clean canonical |
| Unresolved store leaf | 404 (not homepage) |

---

## 13. Cutover SEO runbook

### BEFORE DNS

1. Implement **P0** nested category 301s  
2. Implement **P1** aliases for 14 Yoast product leaves  
3. Deploy frontend (includes `?offer=sv_` resolver + redirects) to the Vercel project that will serve apex  
4. Attach `sarveda.com` / `www` to Vercel (no DNS flip yet)  
5. Prepare env: `NEXT_PUBLIC_SITE_URL=https://sarveda.com`  
6. Keep WordPress live; do not touch mail DNS  

### AT DNS CUTOVER

1. Set `NEXT_PUBLIC_SITE_URL=https://sarveda.com` → **redeploy frontend**  
2. Ensure backend `FRONTEND_URL` apex-first / CORS  
3. Update Google OAuth callback to apex  
4. Flip **web** DNS only → Vercel  
5. Do **not** change Merchant PRODUCTS SOURCE 2 yet beyond planned dual-source soak  

### IMMEDIATELY AFTER DNS

1. `https://sarveda.com/robots.txt` allows crawl  
2. `https://sarveda.com/sitemap.xml` non-empty, apex only  
3. Spot-check canonicals on home + 3 PDPs = `sarveda.com`  
4. Spot-check nested old category URL → 301 → leaf 200  
5. Spot-check `/store/.../{leaf}/` → `/product/{slug}`  
6. Spot-check `?offer=` PDP + clean canonical  
7. GSC: submit sitemap; inspect representative URLs  

### FIRST 24 HOURS

- Watch GSC coverage / server logs for 404 spikes on `/store/` and `/product-category/`  
- Confirm no demo/vercel canonicals in live HTML  
- Merchant soak continues in parallel (separate from organic)  

### FIRST 7 DAYS

- Review top organic landing pages vs pre-cutover  
- Fix any newly discovered leaf 404s with aliases (do not homepage-redirect)  
- Optionally port category SEO copy (P2)  

---

## 14. Rollback safety

- WordPress remains on DO until soak ends  
- SEO redirects live **only on the Next.js/Vercel app**  
- Restoring DNS web records to WordPress restores old URLs immediately  
- Native 301 rules do **not** write into WordPress or prevent rollback  
- Keep mail DNS untouched throughout  

---

## Findings summary

### P0 (fix before launch)

1. **Nested category 404s** — 23 Yoast category URLs

### P1

1. **14 unmapped product leaves** from Yoast product sitemap  
2. **SITE_URL / canonical host** must be apex at cutover redeploy  
3. **Robots allow** only when production host detected  
4. **Sitemap emit** only when production host detected  

### P2 / P3

Redirect chain polish; two intentional unresolved leaves; category copy; sitemap `/shop` vs `/store`; ignore low-value WP taxonomies.

---

## Final gate table

```
OLD_URLS_DISCOVERED:                 351
EXACT_URL_MATCHES:                   0 (WP products are /store/...)
301_REDIRECTS_REQUIRED:              39 gap items
301_REDIRECTS_ALREADY_WORKING:       147/149 store leaves + 144/160 Yoast products + 51 config rules
BROKEN_REDIRECTS:                    4 (sample)
UNRESOLVED_404S:                     23 nested cats + 14 products + 2 intentional
PRODUCTS_SEO_SAFE:                   90% mapped (14 remaining)
CATEGORIES_SEO_SAFE:                 NO until P0 (then YES)
CANONICAL_READY:                     YES (code) / needs SITE_URL at cutover
SITEMAP_READY:                       YES (code) / empty until production host
ROBOTS_READY:                        YES (code) / staging disallow today
STRUCTURED_DATA_READY:               YES
MERCHANT_LANDING_SEO_READY:          YES
P0_COUNT:                            1
P1_COUNT:                            4
P2_COUNT:                            3
```

---

# **B. READY AFTER SMALL FIXES**

**SARVEDA FINAL SEO MIGRATION / CUTOVER AUDIT — COMPLETE**
