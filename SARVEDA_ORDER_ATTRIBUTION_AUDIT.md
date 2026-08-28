# SARVEDA ORDER ATTRIBUTION — ARCHITECTURE AUDIT

**Mode:** READ-ONLY (no application, schema, checkout, payment, analytics, or privacy changes)  
**Date:** 2026-08-28  
**Stack:** Next.js 14 App Router + Express + Prisma (existing Sarveda commerce)

---

## Executive summary

Sarveda has **no native Order Attribution** today. Marketing pixels (GA4 + Meta) fire purchase/cart events but do **not** persist first/last-touch, UTM, or session stats onto orders.

Checkout creates **one `Order` row (with many `OrderItem`s) before payment** (`PENDING_PAYMENT`). Retries that call `create-order` again **cancel the prior unpaid order and create a new Order**. Resume reuses the same unpaid Order.

**Recommended V1 design (not implemented):**

| Decision | Recommendation |
|----------|----------------|
| Snapshot timing | **When Order row is created** (`POST /api/checkout/create-order`) |
| Storage | **`OrderAttribution` 1:1 with `Order`** |
| Capture | First-party browser session (cookie / sessionStorage) from first landing; send payload with create-order |
| Admin | Card on `/admin/orders/[id]` near customer / payment context |
| Multi-order | N/A for native cart — one Order per checkout |

---

## 1. Primary objective (scope reminder)

Eventual support (not in this audit’s implementation): first/last touch, referrer, source/medium/campaign, UTMs, landing page, device, session page views, session start, gclid/fbclid, order-time snapshot, admin card, future reporting.

---

## 2. Storefront architecture

### App Router / layouts

| Path | Role |
|------|------|
| `frontend/app/layout.tsx` | Root layout: fonts, **CartProvider**, **Layout** shell, GA4 + Meta Pixel scripts (prod + env IDs) |
| `frontend/app/(shop)/layout.tsx` | Shop browse shell (`ShopShell` + category tree) |
| `frontend/components/layout/Layout.tsx` | Client chrome: Header, footer, page transition, cart rail (skips admin/login) |
| `frontend/middleware.ts` | Shop category 301 + **`sarveda_zone` pricing cookie** from geo headers |

### Providers / client boundaries

| File | Role |
|------|------|
| `frontend/components/cart/CartProvider.tsx` | Client cart state; API sync; guest/logged-in |
| `frontend/lib/cart-api.ts` | Guest `sarveda_cart_session_id` in **localStorage**; cart REST |
| `frontend/lib/auth-client.ts` / JWT cookie `sarveda_auth` | Session (middleware + cart headers) |
| `frontend/lib/currency.ts` | Zone cookie read/write |
| `frontend/lib/pending-checkout.ts` | **sessionStorage** unpaid checkout context |
| `frontend/lib/analytics.ts` | Thin gtag/fbq helpers (purchase, add_to_cart, begin_checkout) |

### Key commerce routes

- `/` homepage · `/shop` · `/product/[slug]` · `/cart` · `/checkout` · `/order/confirmed` · `/payment-failed` · `/login` · `/signup`

---

## 3. Existing analytics / tracking

| Capability | Status | Evidence |
|------------|--------|----------|
| **GA4** | **IMPLEMENTED** (env-gated) | `frontend/app/layout.tsx` — `NEXT_PUBLIC_GA4_ID` + gtag.js |
| **Meta Pixel** | **IMPLEMENTED** (env-gated) | Same layout — `NEXT_PUBLIC_META_PIXEL_ID`, PageView + Purchase/AddToCart/InitiateCheckout via `lib/analytics.ts` |
| **GTM container** | **NOT IMPLEMENTED** | Direct gtag, not GTM |
| **Google Ads conversion** | **PARTIAL** | GA4 purchase event only; no separate Ads tag found |
| **Razorpay analytics** | **NOT IMPLEMENTED** | Payment SDK only |
| **Vercel Analytics** | **NOT IMPLEMENTED** | No `@vercel/analytics` usage found |
| **Microsoft Clarity** | **NOT IMPLEMENTED** | — |
| **Custom page-view counter** | **NOT IMPLEMENTED** | Meta PageView on load only; no App Router SPA pageview hook |
| **UTM parsing / persistence** | **NOT IMPLEMENTED** | No storefront UTM/session attribution code |
| **Referral capture for orders** | **NOT IMPLEMENTED** | — |
| **Marketing consent cookies** | **NOT IMPLEMENTED** | Policy link `/privacy` only; no consent banner found |

---

## 4. Current cookie / storage behavior

| State | Where created | Where read | Lifetime | Guest | Logged-in | Server-visible |
|-------|---------------|------------|----------|-------|-----------|----------------|
| `sarveda_zone` | Middleware + `writeZoneCookie` | Pricing / cart | 30 days | Sticky first geo | Refreshed from geo | Yes (cookie) |
| `sarveda_auth` | Auth login | Middleware, API credentials | JWT cookie (7d typical) | No | Yes | Yes |
| `sarveda_cart_session_id` | `cart-api` localStorage | Cart API `X-` session header | Until cleared/merge | Yes | Cleared after merge | Via header only |
| `sarveda_pending_checkout` | `pending-checkout.ts` sessionStorage | Payment-failed / retry / PayPal return | Tab session | Yes | Yes | **No** |
| Cart lines | Postgres `Cart` / `CartItem` | Cart API | Durable | Session cart | User cart | Yes |
| GA/Meta cookies | Third-party scripts | Their SDKs | Vendor-controlled | Yes | Yes | No (not Sarveda DB) |

**Implication for attribution:** Cart and zone already survive navigation. Attribution should use a **first-party** cookie or sessionStorage (not rely on Meta/GA cookies). Prefer a durable first-touch cookie (~30–90 days) + session fields for last-touch / page views.

---

## 5. Referrer / landing capture point (future)

| Candidate | Pros | Cons |
|-----------|------|------|
| **New client AttributionProvider under root `CartProvider` in `app/layout.tsx`** | Runs on all storefront pages; can read `document.referrer` + URL UTMs on first paint; `usePathname` for pageviews | Must skip admin/login chromeless paths; SSR won’t see `document.referrer` |
| **`Layout.tsx` (already client)** | Central storefront shell | Not mounted for some chromeless routes (OK for shop) |
| **Middleware** | Sees `Referer` header early | Internal navigations rewrite Referer; weaker UTM on client URL; less ideal alone |
| **Checkout only** | Simple | **Too late** — referrer often Sarveda itself |

**Recommendation:** Client **AttributionProvider** (first meaningful storefront hit) + optional middleware assist for UA / country only. Never capture referrer only at checkout.

---

## 6. Page-view count (future)

- App Router: `usePathname()` in a client provider (same place as Layout / future AttributionProvider).
- Increment on pathname change; ignore query-only noise if desired; exclude `/admin`, `/api`, auth chromeless.
- No existing SPA pageview hook beyond Meta’s initial PageView script.

**Target display:** `Session page views: N` (Woo-like), snapshotted at order create.

---

## 7. Device type (future)

| Source | Today |
|--------|-------|
| Middleware / geo | Country → zone only; **no UA parse** |
| Checkout | No device stored |
| `Order.ipCountry` | Column exists; **not written** in `checkout.service` create path (only read in reviews) |

**Recommend V1 enum:** `DESKTOP` \| `MOBILE` \| `TABLET` \| `OTHER` from UA at snapshot time (client hint or server `User-Agent` on create-order). Prefer **server parse of request UA** at create-order for consistency.

---

## 8. Cart → paid flow (current)

```
PDP / cart add (cartAdd)
  → CartProvider / Cart API (guest session or user)
  → /cart
  → /checkout (CheckoutClient + PaymentSelector)
  → POST /api/checkout/create-order  (+ Idempotency-Key)
       → prisma.order.create PENDING_PAYMENT + Payment row + Razorpay/Stripe/PayPal/COD
  → Gateway UI / redirect
  → Client verify (e.g. POST razorpay/verify) and/or webhook
  → Order PAID · cart clear · confirmation page trackPurchase
```

**Key files**

| Layer | Files |
|-------|-------|
| FE | `CheckoutClient.tsx`, `PaymentSelector.tsx`, `checkout-api.ts`, `pending-checkout.ts`, `analytics.ts`, `order/confirmed` |
| BE | `checkout.service.ts` (`createCheckoutOrder`, `resumePendingCheckout`), `checkout.routes.ts`, payments verify/webhook modules |
| DB | `Order`, `OrderItem`, `OrderAddress`, `Payment`, `Cart` |

---

## 9. Exact Order creation point

| Question | Answer |
|----------|--------|
| When? | **Before payment**, inside `createCheckoutOrder` transaction (`checkout.service.ts` ~509) |
| Status | `PENDING_PAYMENT` / payment `PENDING` |
| One order per checkout? | **Yes** — one Order, many OrderItems from cart lines |
| Order group / PaymentSession model? | **No** — `Payment` rows belong to `Order` |
| New create-order with stale unpaid? | Prior unpaid (same user/email, ~20 min) is **cancelled + stock released**, then **new Order** created |
| Failed payment | Order can remain `PENDING_PAYMENT` until timeout job / cancel / supersede |
| Resume | `GET /api/checkout/resume` reuses **same** Order + pending Payment |

---

## 10. Attribution snapshot timing

| Option | Verdict |
|--------|---------|
| A. Checkout page mount | Too early / multiple mounts; no Order id yet |
| **B. Order row created (`create-order`)** | **RECOMMENDED** — survives fail/abandon; browser can still send payload; webhook not required |
| C. Payment session create | Same moment as B for Sarveda (Payment created with Order) |
| D. Payment success | Loses unpaid/abandoned attribution; overwrites risk on retry paths |
| E. Webhook | **No browser context** — must not be sole source |

**Goals met by B:** unpaid orders keep acquisition data; webhook doesn’t invent UTMs; guest + logged-in both POST body/headers at create-order.

**Retry note:** New `create-order` ⇒ new Order ⇒ send **current** session attribution again (first-touch from durable cookie unchanged; last-touch may update if new external entry). Do **not** copy attribution from cancelled predecessor unless product wants that (usually unnecessary if cookie holds first-touch).

---

## 11. Order model (relevant)

From `backend/prisma/schema.prisma` `Order`:

- Identity: `id`, `orderNumber`, `customerId?`, `email`, `phone`
- Money / status / `currency`, `shippingZone`, `ipCountry?` (unused at create today)
- Relations: `items`, `addresses`, `payments`, `shipments`, `invoice`, …
- Legacy: `wooCommerceId`, `wooLegacyMeta`, Zoho invoice fields
- **No attribution fields / no OrderAttribution model**

`Payment`: per-order gateway row (`providerOrderId`, `rawPayload` Json) — **not** ideal sole home for browser UTMs.

---

## 12. Multiple orders per checkout

**Native cart checkout:** **one Order**. Attribution **once per Order** (1:1).

If future marketplace/split shipments create multiple Orders from one payment, revisit: store on Payment or a CheckoutAttempt — **out of V1 scope**.

---

## 13. Payment retries

| Behavior | Attribution rule |
|----------|------------------|
| **Resume** same unpaid order | Keep existing `OrderAttribution` row; **do not** overwrite from browser |
| **New create-order** (supersedes old) | New Order + **new snapshot** from current session (first-touch cookie stable) |
| Gateway session refresh on resume | Attribution unchanged |
| Webhook / verify PAID | Never mutate marketing fields |

---

## 14. Admin Orders UI

| Surface | Path |
|---------|------|
| List | `frontend/app/admin/orders/page.tsx` |
| Detail | `frontend/app/admin/orders/[id]/page.tsx` — large page: header, notes, status, shipment create, line items, addresses, **Totals**, **Payment & refunds**, service requests, etc. |

**Recommended card location:** After customer/email header block (or beside Totals / before Payment & refunds) — section title **Order Attribution**. List page: optional compact “Source” column later (not V1 required).

APIs: existing admin order GET must later include attribution relation (new field; not in this audit’s changes).

---

## 15. Attribution fields (proposed classification)

### REQUIRED V1

| Field | Purpose |
|-------|---------|
| `firstSource`, `firstMedium`, `firstCampaign?` | Original acquisition |
| `firstReferrer`, `firstLandingPage` | Original entry context |
| `lastSource`, `lastMedium`, `lastCampaign?` | Pre-checkout marketing entry |
| `lastReferrer`, `lastLandingPage` | Last external/UTM landing |
| `utmSource`, `utmMedium`, `utmCampaign`, `utmContent?`, `utmTerm?` | Canonical last (or order-time) UTM set |
| `deviceType` | Desktop/Mobile/Tablet/Other |
| `sessionPageViews` | Int |
| `sessionStartedAt`, `capturedAt` | Timestamps |
| `sourceType` | Classified: Direct / Organic / Referral / Social / Paid / Email / Other |

### USEFUL V1

| Field | Purpose |
|-------|---------|
| `gclid`, `fbclid` | Paid click ids (truncated) |
| `referringDomain` | Parsed host of referrer |
| `landingPath` | Path-only of landing (no secrets) |

### FUTURE

| Field | Purpose |
|-------|---------|
| `browserSessionId` | Cross-order analytics join |
| Full click-path / multi-touch graph | ERP-level |
| Ad-platform enrichment APIs | — |

---

## 16. Source classification (deterministic, future)

Suggested priority (first match wins):

1. Paid markers (`gclid`, `utm_medium` ∈ cpc/ppc/paid…) → **Paid Search** / **Paid Social** by source  
2. `utm_medium=email` → **Email**  
3. Known social hosts (instagram, facebook, …) → **Social**  
4. Search organic referrers (google, bing, …) without paid → **Organic Search**  
5. External referrer else → **Referral**  
6. No referrer / no UTM → **Direct**  
7. Else → **Other**

Independent of WooCommerce plugins; pure string rules.

---

## 17. First vs last touch rules

**First touch:** Set once per attribution cookie lifetime when external referrer **or** UTM/gclid/fbclid present (or Direct on truly empty first hit). **Never** overwrite with internal Sarveda navigations.

**Last touch:** Update only when new **external** referrer (host ≠ sarveda.com / demo host) **or** new UTM/click-id on URL. Internal `/product` → `/cart` must **not** reset last-touch to Direct/self.

---

## 18. Session definition (V1 recommendation)

| Concept | Proposal |
|---------|----------|
| **Marketing session** | 30 minutes inactivity **or** new external/UTM entry starts “session activity”; pageview counter resets on new session |
| **First-touch cookie** | Separate longer TTL (e.g. 90 days) so first acquisition survives many sessions |
| **Browser session id** | Optional UUID in cookie/sessionStorage |

Aligns with cart/zone durability without equating to JWT login.

---

## 19. Consent / privacy (technical observations)

- Public **Privacy Policy** link (`/privacy`); **no** cookie-consent gate found wrapping GA/Meta.
- GA4/Meta load in production when env IDs set (`app/layout.tsx`).
- Attribution V1 would be **first-party operational** fields on Order (similar in spirit to storing email/IP zone), not a substitute for legal review.
- Truncate URLs; avoid storing full query strings with tokens; document in privacy policy when implementing.

---

## 20. Security / trust boundary

- Treat all attribution as **informational** — never drive payment, inventory, or accounting journals.
- Backend Zod: max lengths, strip HTML, allowlist `deviceType`, sanitize UTMs, truncate referrer/landing (~2k).
- Ignore attribution payload on **resume**; only accept on **create-order**.
- Do not trust webhook to supply browser UTMs.

---

## 21. Bot / internal traffic

| Traffic | V1 suggestion |
|---------|----------------|
| `/admin` | Do not run AttributionProvider |
| Obvious bots (UA) | Optional skip persist or flag `isBot` FUTURE |
| Health checks | No storefront HTML |
| Staff testing | Accept; filter in reports later |

---

## 22. Proposed data model (design only — no migration)

```prisma
model OrderAttribution {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId            String   @unique @db.Uuid
  sourceType         String?  // Direct | Organic Search | ...
  firstSource        String?
  firstMedium        String?
  firstCampaign      String?
  firstReferrer      String?  @db.VarChar(2048)
  firstLandingPage   String?  @db.VarChar(2048)
  lastSource         String?
  lastMedium         String?
  lastCampaign       String?
  lastReferrer       String?  @db.VarChar(2048)
  lastLandingPage    String?  @db.VarChar(2048)
  utmSource          String?
  utmMedium          String?
  utmCampaign        String?
  utmContent         String?
  utmTerm            String?
  gclid              String?
  fbclid             String?
  referringDomain    String?
  landingPath        String?
  deviceType         String?  // DESKTOP | MOBILE | TABLET | OTHER
  sessionPageViews   Int?
  sessionStartedAt   DateTime?
  capturedAt         DateTime @default(now())
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  order              Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([sourceType])
  @@index([utmCampaign])
  @@index([capturedAt])
}
```

**Why 1:1 on Order:** Matches one-order checkout; simple admin join; cascade delete with order; resume-safe.

---

## 23. Proposed frontend flow (future)

1. Visitor hits storefront → AttributionProvider init  
2. Persist first-touch cookie + session state  
3. Count pageviews on route change  
4. Update last-touch only on external/UTM  
5. Checkout → `createOrder(..., attribution)`  
6. Backend validates → insert `OrderAttribution`  
7. Admin detail shows card  

---

## 24. Proposed admin display (conceptual)

**Order Attribution**

- Origin / Source type  
- Source / Medium · Campaign  
- Landing page · Device · Session page views  
- First touch · Last touch (compact)  
- Hide empty campaigns/clids  

---

## 25. Future reporting (not V1)

Orders/revenue by source & campaign; AOV by channel; ChatGPT/Instagram slices; Direct vs Organic vs Paid; device mix — all enabled by persisted snapshot + indexes.

---

## 26. Implementation effort estimate

| Phase | Work | Approx. touch |
|-------|------|----------------|
| **A** Schema + BE validate/persist on create-order; admin GET include | Prisma model, checkout schema/service, orders serializer | ~8–12 files |
| **B** AttributionProvider + storage helpers + classification | New lib + provider in layout | ~5–8 files |
| **C** Wire payload in PaymentSelector/createOrder | checkout-api + PaymentSelector | ~3–5 files |
| **D** Admin Order Attribution card | orders/[id] + types | ~2–4 files |
| **E** Tests (create-order attribution, resume no-overwrite, sanitize) | BE tests + light FE | ~3–6 files |

**Rough total:** medium feature slice (order of **~3–6 engineering days** once design approved), assuming no consent-platform rebuild.

---

## 27. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Attribution lost at checkout | Send on create-order; durable first-touch cookie |
| Internal referrer overwrites source | Last-touch rules ignore same-site |
| Payment retry overwrite | Resume: immutable; new order: fresh snapshot from cookie |
| create-order supersede cancels old order | Accept; first-touch cookie preserves acquisition |
| Safari ITP / storage | Prefer cookie + short sessionStorage backup |
| Bot noise | Skip admin; optional UA filter |
| Gateway return referrer = Sarveda | Snapshot already taken at create-order |
| Privacy | Truncate; policy update; informational only |
| Secrets in landing URLs | Store path + allowlisted query keys only |

---

## 28. Final checklist

| ID | Topic | Answer |
|----|--------|--------|
| **A** | Existing analytics/tracking | GA4 + Meta Pixel (env); no UTM/order attribution; no Clarity/Vercel Analytics/GTM |
| **B** | Existing session/storage | Zone cookie, auth JWT, cart localStorage session, pending-checkout sessionStorage, server Cart |
| **C** | Order creation point | **Before payment** in `createCheckoutOrder` → `PENDING_PAYMENT` |
| **D** | Multi-order checkout | **One Order** per create-order (many line items) |
| **E** | Recommended snapshot timing | **Order create (`create-order`)** |
| **F** | Recommended model | **`OrderAttribution` 1:1 Order** |
| **G** | Required V1 fields | First/last source medium campaign referrer landing; UTMs; device; pageviews; session/captured times; sourceType |
| **H** | First-touch strategy | Durable cookie; set once on first external/UTM/Direct; never internal overwrite |
| **I** | Last-touch strategy | Update only external referrer or new UTM/click-id |
| **J** | Page-view strategy | Client `usePathname` counter in AttributionProvider; snapshot at order create |
| **K** | Device strategy | Enum from UA at create-order (prefer server) |
| **L** | Checkout integration point | Extend `POST /api/checkout/create-order` body (+ FE createOrder) |
| **M** | Payment-retry behavior | Resume: keep attribution; new create-order: new snapshot from session |
| **N** | Admin display location | `/admin/orders/[id]` card near customer/payment |
| **O** | Privacy/consent | Policy page exists; **no** consent banner; pixels env-gated in prod |
| **P** | Backend changes required (to build feature) | **YES** (future) |
| **Q** | Prisma migration required (to build feature) | **YES** (future) |
| **R** | Estimated effort | ~3–6 eng days across phases A–E |
| **S** | Main risks | Internal referrer overwrite; create-order supersede; storage/ITP; privacy expectations |
| **T** | Ready for Order Attribution **implementation** | **YES** — design can proceed from this audit |

---

*This audit did not modify any application code, schema, or configuration.*

SARVEDA ORDER ATTRIBUTION AUDIT COMPLETE — READY FOR DESIGN
