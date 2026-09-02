# SARVEDA — FINAL SEO CUTOVER CERTIFICATION

**Certified:** 2026-09-02  
**Mode:** Local production simulation (`NEXT_PUBLIC_SITE_URL=https://sarveda.com`) + resolver unit tests + non-following HTTP redirect matrix  
**Live Vercel / DNS / WordPress / GSC / Merchant Center:** NOT modified

---

## FINAL VERDICT

**A. SEO ENGINEERING COMPLETE — FREEZE FOR CUTOVER**

**NO FURTHER SEO ENGINEERING REQUIRED BEFORE CUTOVER.**

Residual `MANUAL_REVIEW` Yoast leaves (6) are catalog/identity gaps with no deterministic native `Product` — intentionally unresolved (no homepage/guess redirects).

---

## What was implemented

### P0 — 23 nested Woo category URLs
- New: `frontend/lib/legacy-woo-category-url.ts`
- Wired in `frontend/middleware.ts` (301 only for audited parent/child pairs)
- Safe tracking param allowlist reused from legacy product resolver
- Unsafe `redirect` / `next` / `url` / `callback` dropped
- Native single-segment `/product-category/{leaf}` unchanged

### P1 — 14 Yoast product leaves
Resolved via existing `LEGACY_WOO_LEAF_ALIASES` (8):

| Historical leaf | Native slug | Evidence |
|---|---|---|
| `crescent-zafu-cushion-compact` | `crescent-zafu-cushion-wide-cotton` | Woo parent 47494 / CTX offers |
| `cotton-yoga-mat7-chakras` | `7-chakras-yoga-mats` | CTX offers 8474–8476 |
| `artistic-egg-shakers` | `painted-egg-shakers` | Woo parent 7404 |
| `copper-bottle-black-with-7-chakras-vintage` | `7-chakras-vintage-copper-bottles` | Woo 5682 |
| `shruthi-thali-gong-plates` | `gong-plates-shruti-plates-plain` | Woo 45485 |
| `tuned-pipe` | `tuned-pipes` | variations 50551/50552 |
| `printed-copper-water-bottles` | `copper-bottle-blue-tranquillity-meditation` | Product.wooCommerceId 6007 |
| `copper-bottle-with-7-chakras-plain` | `7-chakras-plain-copper-bottles` | Woo 5675 |

`MANUAL_REVIEW` (6) — no single proven native target:
`engraved-copper-water-bottles`, `natural-bamboo-xylophone-with-5-keys`, `copper-bottle-curved-copper-diamond-groove`, `crystal-bowl-o-rings-support-rings`, `overtone-flute`, `overtone-flute-2`

### Production sitemap hygiene
- Filter transactional/legacy CMS slugs (`cart`, `my-account`, `store`, payment stubs, legacy policy aliases)
- Explicit static policy URLs: `/privacy`, `/terms`, `/shipping`, `/refunds`

### Build unblock (minimal)
- `Array.from(filters.entries())` in `merchant-variant-selection.ts` (TS downlevelIteration)

---

## Scorecard

| Metric | Value |
|---|---|
| LEGACY_PRODUCT_URLS_TESTED | 160 |
| LEGACY_PRODUCT_URLS_CORRECT | 160 |
| YOAST_UNMAPPED_START | 14 |
| YOAST_RESOLVED | 8 |
| YOAST_MANUAL_REVIEW | 6 |
| NESTED_CATEGORY_URLS_TESTED | 23 |
| NESTED_CATEGORY_URLS_CORRECT | 23 |
| WRONG_PRODUCT_TARGETS | 0 |
| WRONG_CATEGORY_TARGETS | 0 |
| REDIRECT_LOOPS | 0 |
| UNEXPECTED_404S | 0 |
| TRACKING_PARAMETER_FAILURES | 0 |
| MERCHANT_FEED_ITEMS (live demo observe) | 773 |
| MERCHANT_HISTORICAL_ITEMS | 747 |
| MERCHANT_NATIVE_ITEMS | 26 |
| MERCHANT_OFFER_LANDING_FAILURES | 0 |
| PRODUCTION_CANONICAL_READY | true |
| PRODUCTION_ROBOTS_READY | true |
| PRODUCTION_SITEMAP_READY | true |
| PRODUCTION_STRUCTURED_DATA_READY | true |
| SITEMAP_URL_COUNT | 366 |
| P0_COUNT | 0 |
| P1_COUNT | 6 (residual MANUAL_REVIEW catalog gaps only) |

**Merchant note:** Live demo feed currently reports **773** items (747 historical + 26 native), not the previously certified 790/764. Merchant module remains frozen for this SEO phase; landing `?offer=` regression against SEO middleware passed (0 failures). Reconcile feed count during Merchant cutover validation if needed.

---

## Production SITE_URL simulation

Built with `NEXT_PUBLIC_SITE_URL=https://sarveda.com` (Vercel env **not** changed).

### robots.txt
```
User-Agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /checkout
Disallow: /cart
Disallow: /profile
Disallow: /my-account
Disallow: /chat

Host: https://sarveda.com/
Sitemap: https://sarveda.com/sitemap.xml
```

### Sitemap
- **366** URLs, host `sarveda.com` only
- No `sarveda-demo.xyz`, `vercel.app`, `localhost`, `/store`, `?offer=`, `gclid`/`utm_*`, `/cart`, `/checkout`, `/admin`, `/my-account`

### Canonical / JSON-LD spot checks
- Homepage: `https://sarveda.com` — Organization + WebSite
- PDP `ocean-drums`: canonical clean; Product + BreadcrumbList; `?offer=` stripped from canonical
- Category `crystal-bowls`: canonical clean; BreadcrumbList
- No demo/vercel host leakage in sampled HTML

---

## Tests run

```bash
cd frontend
npx tsx --test lib/legacy-woo-product-url.test.ts \
  lib/legacy-woo-category-url.test.ts \
  lib/seo-production-simulation.test.ts
# 43 passed

NEXT_PUBLIC_SITE_URL=https://sarveda.com DISABLE_PWA=1 npm run build
# success

SEO_CERT_LIVE=1 SEO_CERT_BASE=http://127.0.0.1:3010 \
  python3 docs/audit/seo-final-certification/run_seo_final_certification.py
```

---

## Artifacts

`docs/audit/seo-final-certification/`

- `final_redirect_matrix.csv`
- `nested_category_redirects.csv`
- `yoast_product_aliases.csv`
- `merchant_landing_regression.csv`
- `seo_production_simulation.json`
- `seo_final_summary.json`
- `run_seo_final_certification.py`
- `sitemap_production_urls.txt`

---

## Cutover-only checklist (DO NOT PERFORM NOW)

1. Attach `sarveda.com` + `www.sarveda.com` to Vercel  
2. Set `NEXT_PUBLIC_SITE_URL=https://sarveda.com`  
3. Redeploy frontend  
4. Point web DNS to Vercel  
5. Verify production canonical  
6. Verify production robots.txt  
7. Verify production sitemap  
8. Submit/re-submit sitemap in Google Search Console  
9. Inspect representative URLs in Search Console  
10. Monitor redirects/404/indexing after cutover  

Also preserve non-SEO cutover requirements:

- backend `FRONTEND_URL` apex-first  
- `GOOGLE_CALLBACK_URL` apex  
- Google OAuth redirect URI  
- payment webhook verification  
- Merchant final production validation  
- **DO NOT TOUCH** mail MX/SPF/DKIM/DMARC  

---

**STOP.** No further SEO engineering before cutover.
