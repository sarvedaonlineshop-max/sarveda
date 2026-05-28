# SEO Change Checklist

Use this checklist for every new feature, page, or route change before merge.

## 1) URL and Routing Safety

- [ ] Keep existing SEO-critical URL patterns unchanged unless explicitly approved:
  - `/product/[slug]`
  - `/product-category/[slug]`
  - `/shop`
  - `/cart`
  - `/checkout`
  - `/my-account` (redirected) / `/profile`
  - `/:slug` for blog content
- [ ] If replacing or moving any route, add a permanent redirect in `frontend/next.config.js` (`redirects()`).
- [ ] Do not break existing `rewrites()` in `frontend/next.config.js` (API proxy must stay intact).

## 2) Metadata Requirements for New Pages

- [ ] Add `generateMetadata()` (or `export const metadata`) for every indexable page.
- [ ] Include page `title` and `description`.
- [ ] Include canonical URL via `canonical("/your-path")` from `@/lib/site`.
- [ ] Include correct `robots` policy:
  - Public/indexable pages: `index: true, follow: true` (respecting production guards where needed)
  - Transactional/private pages: `index: false, follow: false`
- [ ] Ensure OG/Twitter coverage:
  - Either page-specific metadata
  - Or safe fallback from `app/layout.tsx` defaults

## 3) Sitemap Inclusion

- [ ] For static pages, add entries in `frontend/app/sitemap.ts` `staticRoutes`.
- [ ] For dynamic pages, add fetcher(s) in `frontend/lib/api.ts` and route mapping in `frontend/app/sitemap.ts`.
- [ ] Use `absoluteUrl()` or `canonical()` helpers consistently (no hardcoded domain strings).
- [ ] Keep production guard behavior (`isProductionSite()`) intentional and unchanged unless approved.

## 4) Product and Commerce SEO

- [ ] For product-related changes, preserve metadata logic in `frontend/app/product/[slug]/page.tsx`.
- [ ] Keep `openGraph` product metadata intact (`type`, URL, image fallback).
- [ ] Keep product JSON-LD valid in `frontend/lib/seo-product.ts`.
- [ ] Do not remove description sanitization (`stripHtml`) from schema generation.
- [ ] Keep `inLanguage: "en-IN"` and core offer fields valid.

## 5) Image SEO and Performance

- [ ] Use `next/image` for page content images when possible.
- [ ] Avoid new raw `<img>` tags unless there is a justified exception.
- [ ] Provide meaningful `alt` text for content images.
- [ ] For unknown dimensions, use `fill` with a correctly sized relative parent.

## 6) Noindex Policy Guardrails

- [ ] Confirm noindex on transactional/auth/private surfaces:
  - `cart`, `checkout`, `login`, `signup`, `profile`, `chat`, `search` layout
- [ ] If adding any new account/payment/internal page, default to noindex unless SEO explicitly requires indexing.

## 7) Pre-merge SEO Validation

- [ ] Run `cd frontend && npm run build`.
- [ ] Confirm no new TypeScript or compilation errors.
- [ ] Confirm no new metadata/image lint warnings introduced by your change.
- [ ] Manually verify in browser:
  - `/robots.txt`
  - `/sitemap.xml`
  - one product page head tags (title, canonical, OG/Twitter)
  - one content page head tags
  - one noindex page

## 8) Production Readiness Checks

- [ ] Verify `NEXT_PUBLIC_SITE_URL` is correct for target environment.
- [ ] Verify `isProductionSite()` logic matches real production hostnames.
- [ ] Verify canonical URLs point to the intended production domain.
- [ ] After deploy, run spot checks in Search Console URL Inspection for key pages.

## Quick "Done" Gate

Do not merge if any of these fail:

1. Metadata missing for an indexable new page.
2. Sitemap missing a newly indexable route.
3. URL changed without redirect.
4. Raw `<img>` added where `next/image` is expected.
5. Build introduces new SEO-related warnings/errors.
