# SEO Critical Files

This file lists SEO-critical files in the frontend and how to modify them safely.

## Core SEO Foundation

### `frontend/app/layout.tsx`
- **Purpose:** Global metadata defaults (title template, `metadataBase`, default OpenGraph, default Twitter, global robots behavior).
- **Do not change carelessly:**
  - `metadataBase` source (`getSiteUrl()`)
  - default OG/Twitter image fallback (`/og-default.jpg`)
  - global robots behavior tied to environment
- **Risk if broken:** Canonicals/OG/Twitter can point to wrong host or lose previews site-wide.

### `frontend/lib/site.ts`
- **Purpose:** Canonical URL builder helpers and production-site detection.
- **Do not change carelessly:**
  - `canonical()`
  - `absoluteUrl()`
  - `isProductionSite()`
- **Risk if broken:** Wrong canonical URLs, empty/incorrect sitemap behavior, incorrect robots indexing behavior.

## Crawl and Discovery

### `frontend/app/sitemap.ts`
- **Purpose:** Generates all sitemap URLs (static + dynamic content URLs).
- **Do not change carelessly:**
  - production guard checks
  - route mapping for products/categories/content
  - static routes that must always be present
- **Risk if broken:** Important pages drop from sitemap and discovery slows.

### `frontend/app/robots.ts`
- **Purpose:** Global robots policy.
- **Do not change carelessly:**
  - production vs non-production crawling rules
- **Risk if broken:** Site can be unintentionally deindexed or over-crawled.

## URL Continuity and Redirect Safety

### `frontend/next.config.js`
- **Purpose:** Central redirects and rewrites.
- **Do not change carelessly:**
  - `redirects()` SEO mapping rules (legacy/WooCommerce compatibility)
  - `rewrites()` API proxy rules
- **Risk if broken:** Broken legacy URLs, ranking loss from missing 301s, or API failures from rewrite regressions.

## Product SEO and Structured Data

### `frontend/app/product/[slug]/page.tsx`
- **Purpose:** Product page metadata (`generateMetadata`) and product SEO behavior.
- **Do not change carelessly:**
  - canonical generation
  - OpenGraph product configuration
  - Twitter image fallback logic
- **Risk if broken:** Product pages lose rich previews or canonical correctness.

### `frontend/lib/seo-product.ts`
- **Purpose:** Product JSON-LD schema generation (Product/Breadcrumb data helpers).
- **Do not change carelessly:**
  - description sanitization (`stripHtml`)
  - `inLanguage`
  - offer availability/price structure
- **Risk if broken:** Invalid or low-quality structured data for product rich results.

## Intentional Noindex Surfaces

These files intentionally enforce non-indexing and should remain noindex unless business requirements change.

- `frontend/app/checkout/page.tsx`
- `frontend/app/cart/page.tsx`
- `frontend/app/login/layout.tsx`
- `frontend/app/signup/layout.tsx`
- `frontend/app/profile/page.tsx`
- `frontend/app/chat/page.tsx`
- `frontend/app/search/layout.tsx`

**Risk if broken:** Thin/private/transactional pages may get indexed.

## Media SEO Defaults

### `frontend/public/og-default.jpg`
- **Purpose:** Fallback social image for pages without specific OG media.
- **Do not change carelessly:**
  - file existence and path
  - dimensions/quality assumptions used in metadata
- **Risk if broken:** Broken social previews across many URLs.

## Safe Change Rules (Must Follow)

1. Use `canonical()` / `absoluteUrl()` helpers; never hardcode production host in page metadata.
2. Keep URL structures stable; if changed, add permanent redirect in `next.config.js`.
3. Add sitemap entries for every new indexable route.
4. Add metadata for every new indexable page.
5. Prefer `next/image` over raw `<img>` for content images.
6. Run `cd frontend && npm run build` before merge and verify no new SEO regressions.

## Recommended Review Sequence for SEO-sensitive PRs

1. `app/layout.tsx`
2. `lib/site.ts`
3. `app/sitemap.ts`
4. `app/robots.ts`
5. `next.config.js`
6. Product metadata/schema files
7. Any changed page routes and their metadata blocks
