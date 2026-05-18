# Sarveda launch requirements — master checklist

**Purpose:** Single cross-check document aligned with `CLAUDE.md`. Update status as work completes.  
**Last reviewed:** 2026-05-16  
**Staging:** https://sarveda-demo.xyz · **Production target:** https://sarveda.com  

### Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done and verified |
| 🟡 | Partially done — see notes |
| ⬜ | Not started |
| 🔍 | Needs verification on staging/production |
| ⏸ | Explicitly deferred (document reason) |

### How to use

1. Before each sprint: pick items marked ⬜ or 🟡 in your scope.  
2. When done: set ✅ and add **Evidence** (URL, file path, or test note).  
3. Before DNS cutover: every row in **Launch gates** must be ✅ or ⏸ with sign-off.  
4. Content migration detail: see [`CONTENT-MIGRATION.md`](./CONTENT-MIGRATION.md).

---

## Launch gates (all must pass before `sarveda.com` cutover)

| ID | Gate | Status | Evidence / notes |
|----|------|--------|------------------|
| G1 | Shop checkout E2E (IN Razorpay + intl Stripe/PayPal) | 🔍 | Test on demo with real test keys |
| G2 | No indexed staging (`noindex` + `robots.txt` disallow) | ✅ | Demo tests May 2026 |
| G3 | Product/category URLs match WooCommerce (`/product/`, `/product-category/`) | ✅ | Middleware 301 for `?category=` |
| G4 | 301 map for all GSC top URLs (not only shop) | ⬜ | Needs GSC export |
| G5 | Every live WP URL → page or 301 (no 404 on cutover) | ⬜ | See content migration doc |
| G6 | `NEXT_PUBLIC_SITE_URL=https://sarveda.com` on Vercel | ⬜ | Cutover day |
| G7 | Razorpay + Stripe + PayPal webhooks on production host | 🔍 | Staging URLs in CLAUDE §16 |
| G8 | SendGrid domain authentication on `sarveda.com` | 🔍 | Reduces spam |
| G9 | Order email on paid + invoice PDF | 🟡 | Email works; domain auth pending |
| G10 | GST invoice PDF downloadable | 🟡 | `invoice.service.ts` — verify S3 + download |

---

## A. E-commerce core

| ID | Requirement (CLAUDE) | Status | Evidence / notes |
|----|----------------------|--------|------------------|
| A1 | 169 products + variants in PostgreSQL | ✅ | RDS seeded |
| A2 | `/shop` listing + filters | ✅ | |
| A3 | `/product/[slug]` — gallery, variants, accordion, audio | ✅ | |
| A4 | `/product-category/[slug]` PLP (incl. child categories) | ✅ | Fixed descendant filter May 2026 |
| A5 | Cart (guest + logged-in) + CartDrawer | ✅ | |
| A6 | Checkout — address, shipping, payment | ✅ | |
| A7 | Order confirmation `/order/confirmed` | ✅ | |
| A8 | Payment failed + resume unpaid order | ✅ | |
| A9 | Stock reserve / release / confirm on pay | ✅ | |
| A10 | 15 min payment timeout + cancel | ✅ | BullMQ |
| A11 | Checkout idempotency | ✅ | Redis + header |
| A12 | Coupons at checkout | ⬜ | Prisma `Coupon` — no API/UI |
| A13 | COD checkout (India) | ⬜ | CLAUDE §16 — not full path |
| A14 | Reviews (verified purchase) | ⬜ | Prisma only |
| A15 | Wishlist | ⬜ | Prisma only |
| A16 | Zone pricing IN / US / GB / OTHER | ✅ | Cart + checkout |
| A17 | Money stored as integer paise | ✅ | |

---

## B. Payments

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| B1 | Razorpay India | ✅ | |
| B2 | Stripe international | ✅ | |
| B3 | PayPal Standard | ✅ | |
| B4 | Razorpay webhook + signature + idempotent | ✅ | |
| B5 | Stripe webhook | 🟡 | `stripe.webhook.ts` — verify in dashboard |
| B6 | PayPal webhook | 🟡 | `paypal.webhook.ts` — needs `PAYPAL_WEBHOOK_ID` |
| B7 | Client verify `POST .../razorpay/verify` | ✅ | |
| B8 | User-friendly payment error messages | 🔍 | Manual UX test |
| B9 | No duplicate orders on retry | ✅ | Idempotency + resume |
| B10 | Reconciliation admin UI | 🟡 | `/admin/reconciliation` — payloads stored |
| B11 | Razorpay/Google OAuth env on demo | 🔍 | CLAUDE §16 URLs |

---

## C. Shipping & fulfillment

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| C1 | Shiprocket integration | 🟡 | `shiprocket.ts` |
| C2 | Delhivery integration | 🟡 | API + webhook exist |
| C3 | Bluedart | ⬜ | Not in codebase |
| C4 | Auto-courier router (weight/zone/value) | 🟡 | `shipping/router.ts` — verify rules |
| C5 | AWB on PROCESSING | 🟡 | `AUTO_START_FULFILLMENT_ON_PAID` |
| C6 | `/track/[awb]` | ✅ | |
| C7 | Pincode serviceability before checkout | 🟡 | `PincodeCheck` on PDP; checkout uses rates API |
| C8 | Estimated delivery on PDP + checkout | 🔍 | Verify UI |
| C9 | RTO status updates | 🔍 | Webhook handling |
| C10 | Per-product shipping rates (160 products) | 🟡 | `VariantShippingRate` in schema |

---

## D. Notifications

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| D1 | SendGrid order emails | 🟡 | `notifications/email.ts` |
| D2 | order_confirmed | ✅ | `afterOrderPaid` |
| D3 | payment_failed | 🟡 | Timeout job — verify |
| D4 | order_processing | 🟡 | On auto-fulfillment |
| D5 | order_shipped | 🟡 | Wire from shipment events |
| D6 | order_delivered | 🟡 | |
| D7 | refund_initiated | 🟡 | |
| D8 | Abandoned cart (~2h) | 🟡 | `abandonedNotificationJob` — needs Redis |
| D9 | WhatsApp (WATI) all events | ⏸ | User deferred WATI |
| D10 | Email + WhatsApp both fire | ⏸ | WATI deferred |
| D11 | SendGrid domain auth (not spam) | 🔍 | Single sender OK; domain auth for prod |

**Email events in code:** `order_confirmed`, `payment_failed`, `payment_reminder`, `order_processing`, `order_shipped`, `order_delivered`, `refund_initiated`, `order_cancelled`.

---

## E. SEO & URLs

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| E1 | URL paths preserved (shop, product, cart, checkout, etc.) | ✅ | |
| E2 | Staging `noindex` + empty sitemap | ✅ | Demo verified |
| E3 | Production sitemap (products + categories + shop) | ✅ | `app/sitemap.ts` — only on sarveda.com |
| E4 | `robots.txt` production rules | ✅ | `app/robots.ts` |
| E5 | Canonical + OG per product/category | ✅ | Plain-text meta descriptions |
| E6 | JSON-LD Product + Breadcrumb | ✅ | |
| E7 | JSON-LD Organization + WebSite (home) | ✅ | |
| E8 | 301 redirect map (all indexed URLs) | ⬜ | Phase 2 — GSC CSV |
| E9 | 22 Yoast sitemap types covered or redirected | ⬜ | See CONTENT-MIGRATION.md |
| E10 | GSC sitemap submit after cutover | ⬜ | Cutover day |
| E11 | Course/Event/Blog JSON-LD | ⬜ | After pages exist |

**Yoast sitemap types on live WP:** post, page, product, product_cat, product_tag, course, event, vaidya, mentor, retreat, blog, testimonial, asp-products, zoom-meetings, variables_post, offers_post, category, post_tag, specialities, product_shipping_class, special_tags-category, author.

---

## F. Content & storefront pages (migration)

| ID | Content type | WP URL pattern | New app route | DB model | API | Frontend page | Status |
|----|--------------|----------------|---------------|----------|-----|---------------|--------|
| F1 | Products | `/product/{slug}` | same | Product | ✅ | ✅ | ✅ |
| F2 | Categories | `/product-category/{slug}` | same | Category | ✅ | ✅ | ✅ |
| F3 | **Courses** | `/course/{slug}` | `/course/{slug}` | Course | ⬜ | ⬜ | **→ migrating next** |
| F4 | Events | `/event/{slug}` | `/event/{slug}` | Event | ⬜ | ⬜ | ⬜ |
| F5 | Blog / Insights | `/{slug}` or blog path | TBD | BlogPost | ⬜ | ⬜ | ⬜ |
| F6 | Vaidyas | `/vaidya/{slug}` | same | Vaidya | ⬜ | ⬜ | ⬜ |
| F7 | Mentors | `/mentor/{slug}` | same | Mentor | ⬜ | ⬜ | ⬜ |
| F8 | Retreats | `/retreat/{slug}` | same | Retreat | ⬜ | ⬜ | ⬜ |
| F9 | **Corporate wellness** | TBD (likely `/page/`) | TBD | Page/CMS? | ⬜ | ⬜ | ⬜ |
| F10 | Offers | `/offers/{slug}` | same | TBD | ⬜ | ⬜ | ⬜ |
| F11 | Static WP pages | `/page-slug/` | static or CMS | — | ⬜ | ⬜ | ⬜ |
| F12 | Testimonials | CPT | TBD | — | ⬜ | ⬜ | ⬜ |
| F13 | Zoom meetings | zoom CPT | redirect/archive? | — | ⬜ | — | ⬜ |

Detail tracker: [`CONTENT-MIGRATION.md`](./CONTENT-MIGRATION.md).

---

## G. UX, search & account

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| G1 | Header search + `/search` | 🟡 | `search/page.tsx` — verify suggestions debounce |
| G2 | `/my-account` | 🟡 | Redirects to `/profile` |
| G3 | Profile / order history | 🟡 | `ProfileClient` |
| G4 | Login / signup / Google OAuth | ✅ | |
| G5 | Phone OTP | ✅ | Backend auth |
| G6 | Mobile checkout ≤3 taps | 🔍 | UX review |
| G7 | Skeleton loaders | 🔍 | Spot-check |
| G8 | 404 / 500 branded pages | ⬜ | |
| G9 | Recently viewed (localStorage) | ⬜ | |
| G10 | Sticky add-to-cart mobile | 🔍 | |
| G11 | PWA | 🟡 | next-pwa configured |

---

## H. Admin

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| H1 | Dashboard KPIs | ✅ | |
| H2 | Products CRUD | ✅ | |
| H3 | Orders list + detail | ✅ | |
| H4 | Inventory + pagination | ✅ | |
| H5 | Catalog gaps | ✅ | |
| H6 | Pickup locations | ✅ | |
| H7 | Reconciliation | 🟡 | |
| H8 | Courses/events admin | ⬜ | |

---

## I. Infrastructure & ops

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| I1 | EC2 Mumbai backend | ✅ | 13.206.192.106 |
| I2 | RDS PostgreSQL | ✅ | |
| I3 | Redis (jobs) | 🟡 | On EC2 — required for timeout/abandoned |
| I4 | Vercel frontend + demo domain | ✅ | sarveda-demo.xyz |
| I5 | S3 + CloudFront media | 🔍 | Verify product images |
| I6 | ElastiCache (prod target) | ⬜ | Post-launch scale |
| I7 | Route 53 DNS cutover | ⬜ | |
| I8 | PM2 deploy process | ✅ | CLAUDE §14 |

---

## J. Security & compliance

| ID | Requirement | Status | Evidence / notes |
|----|-------------|--------|------------------|
| J1 | JWT HTTP-only cookies | ✅ | |
| J2 | Rate limiting login | ✅ | |
| J3 | Zod validation | ✅ | |
| J4 | CORS allowlist | ✅ | |
| J5 | CSP / XSS | 🔍 | Helmet in app.ts |
| J6 | Privacy / terms pages | ⬜ | If required at launch |

---

## K. Cutover day checklist

- [ ] Freeze WooCommerce edits (or sync final delta)
- [ ] Final product/category sync if needed
- [ ] Import all content (courses, events, etc.) — see CONTENT-MIGRATION
- [ ] Deploy backend + frontend
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://sarveda.com`
- [ ] Point DNS to Vercel; API proxy to EC2
- [ ] Razorpay/Stripe/PayPal webhooks → production URLs
- [ ] Google OAuth redirect → sarveda.com
- [ ] Test one INR + one international order
- [ ] Submit sitemap in GSC
- [ ] Verify top 20 URLs (curl or GSC URL inspection)
- [ ] Monitor logs 24h (pm2, payment webhooks)

---

## Deferred by client (documented)

| Item | Reason |
|------|--------|
| WATI WhatsApp | Explicitly skipped for now |
| Bluedart live API | Deferred |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-16 | Initial checklist; shop SEO phase 1 verified on demo |
