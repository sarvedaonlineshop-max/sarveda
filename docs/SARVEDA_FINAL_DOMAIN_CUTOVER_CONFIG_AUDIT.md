# Sarveda Final Domain Cutover — Config Dependency Audit

**Date:** 2026-08-31  
**Mode:** READ ONLY — no DNS, env, dashboard, code, Merchant Center, Ads, or database changes were made.

**Current state (verified):**

| Layer | State |
|--------|--------|
| New frontend | Deployed on Vercel project `sarveda/sarveda-frontend` |
| Demo host | `https://sarveda-demo.xyz` → Vercel (Ready) |
| Legacy Woo `/store` 301s | LIVE on that deployment; UAT passed |
| Backend / DB / native Merchant feed | Production-ready on Lightsail; feed uses `MERCHANT_FEED_SITE_URL=https://sarveda.com` |
| `https://sarveda.com` | Still WordPress/Woo on DigitalOcean (`134.209.146.175`, nginx) |
| `www.sarveda.com` | CNAME → `sarveda.com`; WP **301 → apex** |
| `sarveda.com` on Vercel | **Not attached** |

---

## 1. Frontend env / origin dependency audit

### Production-relevant variables (Vercel `sarveda-frontend`)

| Variable | Observed / role | Classification |
|----------|-----------------|---------------|
| `NEXT_PUBLIC_SITE_URL` | Exists (Secret). Runtime SEO currently emits **`https://sarveda-frontend.vercel.app`** for canonical/OG/JSON-LD | **CHANGE TO `https://sarveda.com`** (then redeploy) |
| `NEXT_PUBLIC_API_URL` | Exists; browser uses same-origin `/api` via rewrites | **KEEP AS-IS** (do not point at site origin) |
| `INTERNAL_API_URL` / `BACKEND_PROXY_URL` | Rewrite target → Lightsail Express | **KEEP AS-IS** |
| `NEXT_PUBLIC_MEDIA_CDN_URL` | Media CDN/S3 | **KEEP AS-IS** |
| `NEXT_PUBLIC_GA4_ID` / `NEXT_PUBLIC_META_PIXEL_ID` | Analytics IDs only (no domain string in code) | **KEEP AS-IS** (VERIFY EXTERNALLY in GA4/Meta property domains) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` / Stripe / PayPal publishable IDs | Client keys | **KEEP AS-IS** |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client ID for any GIS use | **KEEP AS-IS** (redirect URI is backend-controlled) |
| `FRONTEND_URL` | **Not** a Vercel frontend env | N/A on Vercel — see backend §2 |

### Code references

| Reference | Use | Classification |
|-----------|-----|----------------|
| `getSiteUrl()` / `canonical()` / `absoluteUrl()` (`frontend/lib/site.ts`) | Canonical, OG, JSON-LD, sitemap, robots `host`/`sitemap` | Driven by `NEXT_PUBLIC_SITE_URL` → **CHANGE env** |
| `isProductionSite()` | Indexing gate (`robots.ts`, sitemap emptiness, noindex on non-prod) | Becomes true only when SITE_URL host is `sarveda.com` / `www.sarveda.com` |
| `metadataBase` (`app/layout.tsx`) | Absolute metadata URLs | Same as SITE_URL |
| `getApiBase()` browser | `""` → `/api/...` same host | **KEEP** — host-agnostic |
| `getApiBase()` server | Prefers `INTERNAL_API_URL`; else SITE_URL for self-proxy | API host **KEEP**; SITE_URL change affects only fallback path |
| `googleSignInUrl()` (`lib/auth-client.ts`) | `/api/auth/google?next=...` relative | **KEEP** — follows browser host |
| `window.location.origin` (BottomNav, AdminShell) | Path parsing / same-origin checks | **KEEP** — runtime host |
| `frontend/lib/attribution/classifier.ts` `"sarveda-demo.xyz"` | First-party host allowlist for attribution | **STAGING/DEMO ONLY** (harmless if left) |
| Hard-coded `https://sarveda.com/wp-content/...` in CMS/media | Legacy asset URLs | **IRRELEVANT** to Next origin (assets may stay until media cutover) |
| Hard-coded `sarveda-frontend.vercel.app` in source | Not found as a code constant; appears only as **current baked SITE_URL effect** | Fixed by SITE_URL + redeploy |

### Impact areas if SITE_URL not updated after apex points to Vercel

| Area | Risk if missed |
|------|----------------|
| Canonical / OpenGraph / structured data | Keep advertising `vercel.app` (wrong public origin) |
| Sitemap / robots | Stay empty / `Disallow: /` until SITE_URL host is `sarveda.com` |
| Auth / checkout / cart UI | Mostly OK (relative `/api`, relative routes) |
| Emails | Backend-driven (see §2) — not fixed by Vercel SITE_URL alone unless backend also has `NEXT_PUBLIC_SITE_URL` |

---

## 2. Backend `FRONTEND_URL` audit (actual call sites)

### How primary frontend base is chosen

```7:8:backend/src/modules/auth/redirect.ts
export function getPrimaryFrontendBase(): string {
  return getCorsOrigins()[0] ?? "http://localhost:3000";
}
```

`getCorsOrigins()` (`backend/src/config/corsOrigins.ts`):

1. Parse **`FRONTEND_URL`**, then `FRONTEND_URL_STAGING`, then `CORS_ORIGINS` (comma-separated).
2. In production, **append** hardcoded defaults:  
   `https://sarveda-demo.xyz`, `https://sarveda-frontend.vercel.app`, `https://sarveda.com`, `https://www.sarveda.com`.

**Therefore:** the **first entry of `FRONTEND_URL`** is the primary public origin for OAuth success/failure redirects, password-reset links, Stripe success/cancel, and PayPal return/cancel.

Recommended cutover shape (do not apply in this audit):

`FRONTEND_URL=https://sarveda.com,https://sarveda-demo.xyz`

so apex is primary and demo remains explicitly listed.

### Every production use of frontend / public origin

| Module | Mechanism | Affected by changing first `FRONTEND_URL` to `https://sarveda.com`? |
|--------|-----------|---------------------------------------------------------------------|
| CORS (`app.ts` + `corsOrigins.ts`) | Allowed browser origins | Apex already in production defaults; setting FRONTEND_URL primary to apex is **required for redirects**, not solely for CORS |
| Google OAuth success | `getPrimaryFrontendBase()` + path | **YES** → `https://sarveda.com{destination}` |
| Google OAuth failure | `failureRedirect: ${getPrimaryFrontendBase()}/login?error=google` | **YES** |
| Google OAuth profile fail | `${frontendBase}/login?error=google_profile` | **YES** |
| Password reset email | `${getPrimaryFrontendBase()}/reset-password?token=...` | **YES** |
| Stripe Checkout | `FRONTEND_URL` first only (`stripe.checkout.ts` `siteUrl()`) | **YES** — success `/order/confirmed?...`, cancel `/payment-failed?...` |
| PayPal | same `siteUrl()` | **YES** — return `/checkout/paypal-return?...`, cancel `/payment-failed?...` |
| Razorpay create/verify | No FRONTEND_URL in order create; browser verify + webhooks | **NO** for return URLs in code |
| Email links (`notifications/email.ts`) | `NEXT_PUBLIC_SITE_URL` **OR** first `FRONTEND_URL` OR demo fallback | **YES if** Lightsail `NEXT_PUBLIC_SITE_URL` unset/wrong; **if Lightsail sets NEXT_PUBLIC_SITE_URL**, that wins — must align separately |
| WhatsApp links (`notifications/whatsapp.ts`) | Same priority as email | Same as email |
| Stock notify / enquiries / complaints / order-service emails | Same `NEXT_PUBLIC_SITE_URL` → `FRONTEND_URL` → demo fallback | Same |
| Merchant feed item links | Prefer `MERCHANT_FEED_SITE_URL` (already `https://sarveda.com`) | **NO CHANGE** for feed if that env stays |
| Delhivery stub tracking URL | Hard-coded `https://sarveda.com/track/...` | **KEEP** (already apex) |
| Shiprocket `channel` | Default `"www.sarveda.com"` | **KEEP / VERIFY EXTERNALLY** with Shiprocket account (label, not browser redirect) |
| Webhooks (payments/shipping/WhatsApp/Zoho) | Path on API; no FRONTEND_URL in handlers | Domain only if dashboard URL uses public host — see §4–5 |
| Admin links in chat copy | Relative paths / `hello@sarveda.com` | **IRRELEVANT** |

**Invoice seller website** default `www.sarveda.com` (`utils/invoice.ts`) — display string; **KEEP** or leave unless branding prefers apex.

---

## 3. Google OAuth — verified architecture

### Request path (production design)

Browser never talks to Lightsail origin for OAuth UI. Flow is **same-origin on the Vercel site**, rewritten to Express:

`frontend/next.config.js` rewrite: `/api/:path*` → Lightsail `INTERNAL_API_URL` / `BACKEND_PROXY_URL` (default `http://13.204.112.165`).

Express mount: `app.use("/api/auth", authRouter)` → routes `/google` and `/google/callback`.

| Step | Exact URL / behavior | Env / code |
|------|----------------------|------------|
| **A. Browser entry** | `{site}/api/auth/google?next=...` via `googleSignInUrl()` (browser `getApiBase()` = `""`) | Host = whatever user is on (`sarveda-demo.xyz` today; `sarveda.com` after cutover) |
| **B. Backend initiation** | Express `GET /api/auth/google` → sets `sarveda_oauth_next` cookie → Passport Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **C. Google redirect URI** | **Live today:** `https://sarveda-demo.xyz/api/auth/google/callback` (from authorize URL) | **`GOOGLE_CALLBACK_URL`** in Passport (`passport.ts`); default localhost only if unset |
| **D. Callback handler** | Express `GET /api/auth/google/callback` (reached **via Vercel rewrite**, not a Next route handler) | Same as C — must match Google Console |
| **E. Success destination** | `302` → `${getPrimaryFrontendBase()}${postOAuthFrontendPath(...)}` (customers `/` or `next`; admins `/admin`) | First `FRONTEND_URL` via `getCorsOrigins()[0]` |
| **F. Failure destination** | `${getPrimaryFrontendBase()}/login?error=google` (or `google_profile`) | Same |

**Production callback to configure (verified path shape):**

`https://sarveda.com/api/auth/google/callback`

Handled by: **Vercel rewrite → Lightsail Express** — not by a Next.js Route Handler.

**Also required at cutover:**

- Google Cloud OAuth client: add apex callback (keep demo URI until demo retired).
- Backend: `GOOGLE_CALLBACK_URL=https://sarveda.com/api/auth/google/callback`
- Backend: `FRONTEND_URL` first origin `https://sarveda.com` (success/fail landing)

This audit **did not** modify Google Cloud Console.

---

## 4. Payment domain dependencies

### Razorpay

| Item | Code reality | Cutover action |
|------|--------------|----------------|
| Success URL | None in server create — checkout JS → `POST /api/payments/razorpay/verify` then client navigate | **NO CHANGE** in code |
| Cancel / dismiss | Client → `/payment-failed` (relative) | **NO CHANGE** |
| Webhook | `POST /api/payments/razorpay/webhook` on Express | **VERIFY EXTERNALLY** — dashboard should use `https://sarveda.com/api/payments/razorpay/webhook` (docs already prescribe this). If still only demo host, add/switch after DNS |
| Allowed domain | N/A in app code | **VERIFY EXTERNALLY** (Razorpay Dashboard / Checkout preferences if any) |

### Stripe

| Item | Code | Cutover action |
|------|------|----------------|
| `success_url` | `${FRONTEND_URL[0]}/order/confirmed?orderNumber=...&email=...&stripe=1` | **CHANGE** first `FRONTEND_URL` to apex |
| `cancel_url` | `${FRONTEND_URL[0]}/payment-failed?...` | **CHANGE** (same) |
| Webhook | `POST /api/payments/stripe/webhook` | **VERIFY EXTERNALLY** — endpoint URL in Stripe Dashboard → apex `/api/payments/stripe/webhook` |
| Publishable key | Vercel env | **NO CHANGE** |

### PayPal

| Item | Code | Cutover action |
|------|------|----------------|
| `return_url` | `${FRONTEND_URL[0]}/checkout/paypal-return?...` | **CHANGE** first `FRONTEND_URL` |
| `cancel_url` | `${FRONTEND_URL[0]}/payment-failed?...` | **CHANGE** |
| Webhook | `POST /api/payments/paypal/webhook` + `PAYPAL_WEBHOOK_ID` | **VERIFY EXTERNALLY** — PayPal webhook URL → apex |
| Mode | `PAYPAL_MODE` | **NO CHANGE** in this domain audit |

**Critical:** Stripe/PayPal **return URLs are generated at session/order create time** from live `FRONTEND_URL`. Update backend env **before** accepting live apex checkouts, or returns land on the old primary host.

---

## 5. WhatsApp / external integrations (domain-sensitive only)

| Integration | Domain dependency found | Action |
|-------------|-------------------------|--------|
| WhatsApp (WATI) templates | Order/checkout/track links via `siteBaseUrl()` (`NEXT_PUBLIC_SITE_URL` \|\| `FRONTEND_URL` \|\| demo) | Align Lightsail site origin envs to apex |
| WhatsApp webhook | `POST /api/whatsapp/webhook` (path only in code) | **VERIFY EXTERNALLY** if Meta/WATI callback URL is host-specific |
| Email (SendGrid) | Same `siteBaseUrl()` for order/cart/track/invoice CTAs | Align origin envs |
| SMS / OTP | No hard-coded storefront origin found in OTP path | **NO CHANGE** for domain (VERIFY provider templates if they embed URLs) |
| Shiprocket webhooks | `/api/shipping/shiprocket/webhook` and `/api/shipping/carrier-events/webhook` | **VERIFY EXTERNALLY** dashboard URL host |
| Delhivery webhook | `/api/shipping/delhivery/webhook` | **VERIFY EXTERNALLY** |
| Delhivery stub track | Hard-coded `https://sarveda.com/track/...` | Already apex — **KEEP** |
| Zoho webhook | `/api/zoho/webhook` | **VERIFY EXTERNALLY** if URL is public-host based |
| GA4 / Meta Pixel | IDs only in frontend | **VERIFY EXTERNALLY** allowed domains include `sarveda.com` |
| Google Merchant feed | `MERCHANT_FEED_SITE_URL=https://sarveda.com` | **KEEP** — already correct; **do not** change Merchant Center in this phase |
| Search Console / Ads | Not in app env | Out of app; cutover ops later — **not modified** |
| Facebook share / social hrefs | Public facebook.com pages | **IRRELEVANT** |

---

## 6. Vercel domain preparation (read-only)

| Domain | Attached to `sarveda-frontend`? |
|--------|----------------------------------|
| `sarveda.com` | **NO** |
| `www.sarveda.com` | **NO** |
| `sarveda-demo.xyz` | **YES** (verified) |
| `sarveda-frontend.vercel.app` | **YES** |

**What must be done later (not in this audit):** In Vercel project Domains, add `sarveda.com` and `www.sarveda.com`, then apply the DNS records Vercel shows (apex A/ALIAS and www CNAME). Prefer apex as primary; set www → redirect to apex to match current WP behavior.

### Recommended canonical

**`https://sarveda.com` (apex, non-www).**

Evidence: live `www` already **301 → `https://sarveda.com/`** (`X-Redirect-By: WordPress`). Continuity with Merchant feed `MERCHANT_FEED_SITE_URL` and product URLs.

---

## 7. DNS current state (read-only)

**Nameservers for `sarveda.com`:** DigitalOcean (`ns1/ns2/ns3.digitalocean.com`) — **not** Vercel DNS.

| Name | Type | Current target | Cutover relevance |
|------|------|----------------|-------------------|
| `sarveda.com` | **A** | `134.209.146.175` (DO WordPress) | **MUST CHANGE** to Vercel apex targets (per Vercel domain UI) |
| `www.sarveda.com` | **CNAME** | `sarveda.com.` | **MUST CHANGE** to Vercel www target (typically `cname.vercel-dns.com`) **or** keep CNAME to apex only after apex is on Vercel + configure Vercel www→apex redirect |
| `sarveda-demo.xyz` | **A** | Vercel anycast IPs | **KEEP** (rollback / staging) |
| MX (Google) | MX | `aspmx.google.com` / alts | **DO NOT TOUCH** |
| TXT SPF | TXT | `v=spf1 include:zcsend.in include:zeptomail.net ~all` | **DO NOT TOUCH** |
| TXT Brevo | TXT | `brevo-code:...` | **DO NOT TOUCH** |
| DKIM / DMARC | (mail auth) | — | **DO NOT TOUCH** |

No DNS changes were made in this audit.

---

## 8. Cookie / session domain audit

| Cookie | Set by | Attributes (code) | Host-scoped to `sarveda-demo.xyz`? |
|--------|--------|-------------------|-------------------------------------|
| `sarveda_auth` | Express `setAuthCookie` (`jwt.ts`) | `httpOnly`, `secure` (prod), `sameSite: lax`, `path: /`, **no `domain`** | **No explicit Domain** — host-only for the request Host (via `/api` proxy → site hostname) |
| `sarveda_oauth_next` | Express OAuth start | Same pattern, 10 min | Host-only |
| `sarveda_zone` | Next middleware + client | `path=/`, `sameSite=lax`, `secure` in prod, **no Domain** | Host-only |
| Attribution first-touch | Client `document.cookie` | `Path=/; SameSite=Lax; Secure` | Host-only |

**Moving to `sarveda.com`:** no cookie Domain rewrite required in code. Sessions on demo do **not** transfer to apex (different host). Users re-login on apex — expected.

Cross-origin: browser uses same-origin `/api` + `credentials: "include"`; CORS `credentials: true` with allowlist — works when apex is allowed (already in production CORS defaults).

---

## 9. CORS audit

Production allowlist sources:

- Env: `FRONTEND_URL`, `FRONTEND_URL_STAGING`, `CORS_ORIGINS`
- Hardcoded production defaults already include:
  - `https://sarveda-demo.xyz`
  - `https://sarveda-frontend.vercel.app`
  - `https://sarveda.com`
  - `https://www.sarveda.com`

| Origin | Must add/change? |
|--------|------------------|
| `https://sarveda.com` | Already defaulted — still set as **first** `FRONTEND_URL` for redirects |
| `https://www.sarveda.com` | Already defaulted; keep if www ever serves app without redirect |
| `https://sarveda-demo.xyz` | **May remain** after cutover (defaults + optional explicit FRONTEND_URL list) for rollback/testing |

No CORS config was modified.

---

## 10. Final cutover action table

| # | Timing | System | Current | Required action | Risk if missed | Verification |
|---|--------|--------|---------|-----------------|----------------|--------------|
| 1 | **BEFORE DNS** | Vercel Domains | Apex/www not attached | Add `sarveda.com` + `www.sarveda.com` (pending DNS) | Cannot complete Vercel SSL/routing for apex | Domain shows in project; instructions visible |
| 2 | **BEFORE DNS** | Google Cloud OAuth | Callback = demo only (live) | **Add** `https://sarveda.com/api/auth/google/callback` (keep demo) | Google login broken on apex | Authorize URL shows apex `redirect_uri` when callback env set |
| 3 | **BEFORE DNS** | Payment dashboards | Likely demo or mixed | Plan apex webhook URLs for Razorpay/Stripe/PayPal | Missed webhooks / unpaid stuck | Dashboard endpoint list |
| 4 | **BEFORE DNS** | Ops checklist | — | Confirm Lightsail has/ hasn’t `NEXT_PUBLIC_SITE_URL`; plan set/clear to apex | Email/WhatsApp links stay on demo | Grep Lightsail env (ops) |
| 5 | **AT DNS CUTOVER** | DNS A `sarveda.com` | `134.209.146.175` | Point apex to **Vercel** (per Vercel docs for attached domain) | Traffic stays on Woo | `dig` + `curl -I` → Vercel |
| 6 | **AT DNS CUTOVER** | DNS www | CNAME → `sarveda.com` | Point www to Vercel; prefer redirect www→apex | Split-brain hosts | `curl -I https://www.sarveda.com` |
| 7 | **IMMEDIATELY AFTER DNS** (or seconds before traffic) | Vercel env | SITE_URL ≈ vercel.app effect | `NEXT_PUBLIC_SITE_URL=https://sarveda.com` + **redeploy** | Wrong canonicals / robots stay closed or wrong host | View-source canonical; `/robots.txt` allow |
| 8 | **IMMEDIATELY AFTER DNS** | Lightsail API | FRONTEND_URL / GOOGLE_CALLBACK likely demo | `FRONTEND_URL=https://sarveda.com,https://sarveda-demo.xyz`; `GOOGLE_CALLBACK_URL=https://sarveda.com/api/auth/google/callback`; restart process | OAuth/Stripe/PayPal/emails wrong host | Google login; Stripe/PayPal test; email link host |
| 9 | **IMMEDIATELY AFTER DNS** | Razorpay/Stripe/PayPal webhooks | External | Point to `https://sarveda.com/api/payments/.../webhook` | Status lag / missed capture | Provider delivery logs + order PAID |
| 10 | **AFTER VALIDATION** | Shiprocket / Delhivery / WhatsApp callbacks | External | Confirm public webhook hosts if they used demo | Tracking/bot lag | Provider UI |
| 11 | **AFTER VALIDATION** | GA4 / Meta | External | Confirm apex domain in property settings | Analytics gaps | Realtime hit on apex |
| 12 | **LATER / OPTIONAL** | Woo on DO | Still running off-DNS | Quarantine/disable after soak — not part of DNS second | Accidental WP exposure if DNS rolls back unexpectedly | N/A |
| 13 | **LATER / OPTIONAL** | Merchant Center / Ads | Feed already apex URLs | No change in this cutover window | — | Feed fetch only |
| 14 | **DO NOT** | MX/SPF/DKIM/DMARC | Mail | Leave untouched | Mail breakage | — |

**Mail / MX / SPF / DKIM / DMARC: DO NOT TOUCH.**

---

## 11. Rollback plan (do not execute)

**Fastest path if apex Vercel is critically broken:**

1. **DNS rollback:** Restore `sarveda.com` **A** to `134.209.146.175` (WordPress). Keep www CNAME to apex or prior working shape. TTL-dependent; lower TTL before cutover if possible.
2. **Demo remains:** `https://sarveda-demo.xyz` stays on Vercel — continue ops/testing without apex.
3. **Backend:** If `FRONTEND_URL` / `GOOGLE_CALLBACK_URL` were flipped to apex, either:
   - revert those two envs to demo and restart API, **or**
   - leave apex values if Woo does not use this API (Woo is separate stack) — new-stack emails/OAuth would still point at down apex until reverted.
4. **Woo availability:** Unchanged on DO until DNS points away; rollback restores shoppers to Woo immediately.
5. **OAuth:** Google client should retain **both** demo and apex redirect URIs during soak so either host can authenticate.
6. **Payments:** Webhooks should accept both hosts temporarily, or prefer **direct Lightsail URL** only if already used (not required by code). After DNS rollback, browser checkouts on Woo use Woo gateways — not this Node stack.
7. **Merchant feed:** Continues advertising `https://sarveda.com` PDPs — during rollback those hit Woo again (acceptable short-term; do not touch Merchant Center in panic unless directed).

---

## CUTOVER BLOCKERS

1. **`sarveda.com` / `www.sarveda.com` not attached to Vercel** — must add before/at DNS.
2. **DNS A still points apex to WordPress (`134.209.146.175`)** — change only in controlled cutover window.
3. **`NEXT_PUBLIC_SITE_URL` not yet `https://sarveda.com`** (live SEO still `sarveda-frontend.vercel.app`) — requires env + redeploy.
4. **`GOOGLE_CALLBACK_URL` still demo** (live authorize `redirect_uri`) — must become apex callback; Google Console must allow it.
5. **Backend `FRONTEND_URL` primary must become `https://sarveda.com`** for OAuth landings, Stripe/PayPal returns, password reset; align or clear Lightsail `NEXT_PUBLIC_SITE_URL` so email/WhatsApp links match.
6. **Payment provider webhook URLs** — verify/switch to apex (external; not in repo).
7. **Mail DNS must not be altered** while changing A/CNAME for web.

Non-blockers for DNS itself: legacy Woo resolver (already live), Merchant feed site URL (already apex), CORS defaults (apex already listed), cookie Domain attributes (none hardcoded to demo).

---

## EXACT ORDER OF OPERATIONS

1. Attach `sarveda.com` + `www.sarveda.com` on Vercel (pending verification).  
2. Add Google OAuth redirect URI for apex callback (keep demo).  
3. Inventory Lightsail env: `FRONTEND_URL`, `GOOGLE_CALLBACK_URL`, `NEXT_PUBLIC_SITE_URL`, `MERCHANT_FEED_SITE_URL` (confirm feed stays apex).  
4. Pre-stage payment webhook apex URLs in provider UIs (or switch immediately after DNS).  
5. Lower DNS TTL if practical; change **only** web A/CNAME for apex/www → Vercel (**do not touch MX/TXT mail**).  
6. Set Vercel `NEXT_PUBLIC_SITE_URL=https://sarveda.com` and redeploy.  
7. Set Lightsail `FRONTEND_URL` (apex first, demo second) + `GOOGLE_CALLBACK_URL=https://sarveda.com/api/auth/google/callback`; restart API.  
8. Smoke: homepage, `/store` legacy 301, PDP, cart, checkout (no paid order required for config proof), Google login, robots/canonical host.  
9. Confirm Razorpay/Stripe/PayPal webhook deliveries to apex.  
10. Keep `sarveda-demo.xyz` up for rollback; only decommission Woo after soak.

---

SARVEDA FINAL DOMAIN CUTOVER CONFIG AUDIT COMPLETE — READY FOR CONTROLLED CUTOVER
