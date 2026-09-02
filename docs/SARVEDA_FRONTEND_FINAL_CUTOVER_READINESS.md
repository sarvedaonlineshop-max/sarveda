# Sarveda Frontend — Final Cutover Readiness

**Date:** 2026-08-31  
**Scope:** Production Vercel frontend only (legacy Woo URL compatibility + public-origin prep).  
**Explicitly unchanged:** Merchant Center, Google Ads, DNS, backend commerce/payments/accounting/shipping, Product.slug, native Merchant feed semantics.

---

## Executive verdict

Approved legacy Woo `/store/...` → `/product/{slug}` **301** compatibility is **deployed** to the Vercel production project that currently serves `sarveda-demo.xyz`. Pre-DNS smoke tests on that deployment **pass**.

**Not done in this task (by design):** DNS, attaching `sarveda.com` to Vercel, setting `NEXT_PUBLIC_SITE_URL=https://sarveda.com`, or changing Google Cloud OAuth clients.

**Cutover-day blockers remain** for SEO canonicals and Google login on the apex domain (see **AF**).

---

## A. Vercel project identified

| Field | Value |
|--------|--------|
| Team | `sarveda` (`team_QIksvhnlqxep945116uvlcnI`) |
| Project | `sarveda-frontend` (`prj_VdzjKqAAewqi1PO53X3ZYVQFTkym`) |
| Git | `sarvedaonlineshop-max/sarveda` → production branch `main`, Root Directory `frontend` |
| Current production aliases | `sarveda-demo.xyz`, `sarveda-frontend.vercel.app`, `sarveda-frontend-sarveda.vercel.app`, `sarveda-frontend-git-main-sarveda.vercel.app` |
| `sarveda.com` on project | **No** — not listed in project domains |

---

## B. Production frontend deployed — YES

| Item | Value |
|------|--------|
| Deploy | `dpl_CGc2a77eiSknM1vUMr32zRpipmfr` |
| URL | https://sarveda-frontend-jy7wht4k0-sarveda.vercel.app |
| Commit | `21f2c56` — *Deploy legacy Woo /store product URL 301 compatibility for Merchant cutover.* |
| Files shipped | `frontend/lib/legacy-woo-product-url.ts`, `frontend/lib/legacy-woo-product-url.test.ts`, `frontend/middleware.ts` |
| Status | Ready; aliased to production hosts above |

CLI upload of the monorepo failed (size limit). Deployment used **git push to `main`** (approved frontend files only). Unrelated local backend/admin dirty work was **not** committed.

---

## C. Production target origin

**Target after DNS cutover:** `https://sarveda.com`

**Current live Vercel host for testing:** `https://sarveda-demo.xyz` (and `*.vercel.app` aliases).

DNS was **not** changed.

---

## D. `NEXT_PUBLIC_SITE_URL`

| State | Detail |
|--------|--------|
| Vercel Production/Preview | Variable **exists** (Secret; CLI cannot decrypt value) |
| **Observed runtime effect** | Canonical / Open Graph / JSON-LD use **`https://sarveda-frontend.vercel.app`** (e.g. `/product/ocean-drums`) |
| `isProductionSite()` | **False** (hostname ≠ `sarveda.com`) → `robots.txt` = `Disallow: /`, empty sitemap |
| **Cutover requirement** | Set Production (and Preview if desired) to **`https://sarveda.com`** (no trailing slash), then **redeploy** so `NEXT_PUBLIC_*` is rebuilt |

**Intentionally not changed in this task** — flipping to `sarveda.com` before DNS would publish apex canonicals while WordPress still answers `sarveda.com`, and would enable indexing gates on the demo deployment.

---

## E. Other public-origin / URL env variables (frontend)

| Variable | Role | Requires `sarveda.com` at cutover? |
|----------|------|-------------------------------------|
| `NEXT_PUBLIC_SITE_URL` | Canonical, OG, sitemap, `metadataBase`, server absolute links | **YES** |
| `NEXT_PUBLIC_API_URL` | API base (do not replace with site origin) | **NO** — leave on backend/API config |
| `INTERNAL_API_URL` / `BACKEND_PROXY_URL` | Vercel rewrite target → Lightsail Express | **NO** |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Media CDN/S3 | **NO** |
| `FRONTEND_URL` | **Not** a Vercel frontend env; **backend** CORS / emails / payment return primary origin | **YES on API host at cutover** (out of frontend deploy scope) |
| `GOOGLE_CALLBACK_URL` | **Backend** Passport callback | **YES on API host at cutover** (see V) |

No other frontend Production secrets were identified as site-origin stand-ins beyond `NEXT_PUBLIC_SITE_URL`.

---

## F. Remaining `sarveda-demo.xyz` production-sensitive references

| Location | Sensitivity |
|----------|-------------|
| Live Google OAuth `redirect_uri` | **`https://sarveda-demo.xyz/api/auth/google/callback`** (observed on `GET /api/auth/google`) — must become apex at cutover |
| Vercel domain alias | Staging/demo host — keep until cutover |
| `frontend/lib/attribution/classifier.ts` | Allowlist entry for demo host — harmless staging classifier |
| Docs / CLAUDE / local notes | Documentation only — not changed |

**SEO today still emits `sarveda-frontend.vercel.app`**, not `sarveda-demo.xyz`, for canonical/OG/structured data.

Harmless Woo/media URLs still reference `https://sarveda.com/wp-content/...` (legacy asset hosts) — not treated as Next canonical origin.

---

## G. Legacy resolver deployed — YES

Middleware uses `resolveStorePathToProductRedirect`; `/store` and `/store/` pass through to listing rewrite; deep `/store/...` → **301** `/product/{slug}` with tracking allowlist. No Product.slug DB changes. No fuzzy matching. Unresolved leaves: `elemental-chimes`, `box-tanpura`.

---

## H–P. Pre-DNS tests (`https://sarveda-demo.xyz`)

| ID | Check | Result |
|----|--------|--------|
| **H** | Direct legacy slug `/store/sound-musical-instruments/kids/ocean-drums` | **301** → `/product/ocean-drums` (trailing slash first **308** strip, then **301**) |
| **I** | Renamed `/store/7-chakra-morchang-set` | **301** → `/product/7-chakra-morchang` |
| **J** | Case-only `/store/Ocean-Drums` | **301** → `/product/ocean-drums` |
| **K** | `gclid` + drop `redirect=` | **301** → `/product/ocean-drums?gclid=Cj0KCQjw-TEST` (`redirect` absent) |
| **L** | UTM set | **301** preserves `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id` |
| **M** | Unsafe / non-allowlisted drop | `url=` dropped; `gbraid`/`wbraid`/`fbclid`/`dclid`/`gad_source`/`attribute_*` kept |
| **N** | `/store` listing | **200** (shop catalog) |
| **O** | `/product/ocean-drums` PDP | **200** |
| **P** | Unresolved | `/store/elemental-chimes` **404**; `/store/box-tanpura` **404** (no product 301) |

Also verified: `/store/ankh-sound-healing-instrument` → `/product/ankh` on both demo and `sarveda-frontend.vercel.app`.

Middleware redirects are **origin-relative** (`Location: /product/...`) — hostname-agnostic; safe to validate on demo before DNS.

---

## Q–U. Critical customer route smoke (demo URL)

| ID | Route | Result |
|----|--------|--------|
| **Q** | `/` homepage | **200** |
| **R** | `/shop` | **308** → `/store` (canonical shop alias); store **200** |
| **S** | `/cart` | **200** |
| **T** | `/checkout` | **200** (no paid order placed) |
| **U** | `/login` | **200**; `/my-account` → **308** `/profile` |

**Production-domain dependency found:** Google OAuth callback still bound to **demo** host (see V). Payment gateways themselves were not exercised; Stripe/PayPal return URLs follow **backend** `FRONTEND_URL` (not modified here).

---

## V. Google auth callback requirement

**Do not guess — observed live:**

Current callback in OAuth authorize URL:

`https://sarveda-demo.xyz/api/auth/google/callback`

**Production will require (after DNS + API env update):**

`https://sarveda.com/api/auth/google/callback`

(Browser hits same-origin `/api/...` on the Vercel site; rewrite proxies to Lightsail Express.)

**This task did not modify Google Cloud Console.** At cutover, authorized redirect URIs must include the apex callback, and backend `GOOGLE_CALLBACK_URL` (and primary `FRONTEND_URL`) must match.

---

## W. Canonical / SEO readiness

| Item | Current (pre-DNS) | After cutover env + redeploy |
|------|-------------------|------------------------------|
| Canonical / OG / JSON-LD | `https://sarveda-frontend.vercel.app/...` | Should be `https://sarveda.com/...` once `NEXT_PUBLIC_SITE_URL` updated |
| robots / sitemap | `Disallow: /` / empty (non-production site flag) | Indexable when `getSiteUrl()` host is `sarveda.com` |
| Remaining demo/vercel.app in public SEO | Until env cutover | Blocker if DNS flips without env update |

---

## X–Z. Validation (local before deploy)

| Check | Result |
|-------|--------|
| **X** TypeScript (`frontend` `tsc --noEmit`) | **Pass** |
| **Y** Legacy resolver tests | **29/29 pass** |
| **Z** Production Next.js build (`npm run build`) | **Pass** (includes middleware bundle) |

---

## AA–AD. Other systems

| ID | Item | Changed? |
|----|------|----------|
| **AA** | Merchant Center | **NO** |
| **AB** | Google Ads | **NO** |
| **AC** | DNS | **NO** |
| **AD** | Backend / payments / accounting / orders / Razorpay / Stripe / PayPal / shipping / Delhivery / native Merchant feed / DB product identities | **NO** (this task) |

---

## AE. Ready to point `sarveda.com` to Vercel — **NO (not yet)**

Legacy routing blocker is cleared. **DNS cutover is not recommended until AF is closed.**

---

## AF. Remaining blockers (cutover checklist)

1. **Attach `sarveda.com` (and ideally `www`) to Vercel project `sarveda-frontend`** — currently absent; do not attempt destructive registrar changes from this task.
2. **Set `NEXT_PUBLIC_SITE_URL=https://sarveda.com`** on Vercel Production and **redeploy** (required for canonical/OG/sitemap/indexing).
3. **Google OAuth:** add `https://sarveda.com/api/auth/google/callback` in Google Cloud; set backend `GOOGLE_CALLBACK_URL` (and update primary `FRONTEND_URL` / CORS for apex). Keep demo callback until demo is retired if needed.
4. **Backend `FRONTEND_URL`:** include `https://sarveda.com` for CORS and payment/email return links (API host — separate from this frontend deploy).
5. **Known catalog gaps (non-DNS):** `elemental-chimes` and `box-tanpura` remain unresolved (404 on deep `/store` paths) — product/content decision, not routing bug.
6. Optional hygiene: today SEO emits `sarveda-frontend.vercel.app` rather than `sarveda-demo.xyz`; either is wrong for post-cutover apex until (2).

---

## Tracking query allowlist (deployed)

Preserved: `attribute_*`, `gclid`, `gbraid`, `wbraid`, `dclid`, `gad_source`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `fbclid`.  
Unknown / destination-changing params dropped.

---

SARVEDA FRONTEND FINAL CUTOVER READINESS COMPLETE — READY FOR DNS CUTOVER REVIEW
