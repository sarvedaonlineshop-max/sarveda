# Post-cutover pending (do later if needed)

**Created:** 2026-09-14 (cutover night)  
**Rule:** Not blocking soft-open. Pick up after maintenance lift + first live orders are stable.

---

## A. Soft-open / ops (soon after lift)

- [ ] Lift storefront `MAINTENANCE_MODE` on Vercel Production (set `0` / remove + redeploy)
- [ ] Storefront smoke: home → PDP → cart → checkout → Google login → Razorpay Live PAID
- [ ] Admin smoke: Ready-to-ship / create label
- [ ] Google Search Console: submit/resubmit `https://sarveda.com/sitemap.xml`
- [ ] Spot-check Ads/Merchant PDP landings after ~00:00 IST feed cycle
- [ ] Resume Google Ads if paused during maintenance
- [ ] Confirm Vercel Domains both Valid (`sarveda.com` + `www`) once DNS fully settles

---

## B. Payments

- [ ] **Stripe** — owner OTP: add apex webhook  
  `https://sarveda.com/api/payments/stripe/webhook`  
  + Live signing secret → Lightsail `STRIPE_WEBHOOK_SECRET`  
  (Until then: intl **cards** risky; Razorpay + PayPal OK)
- [ ] PayPal: delete old Woo apps later (keep **Sarveda New Website**)
- [ ] Razorpay: optionally remove disabled Woo/demo webhooks later (already disabled)

---

## C. Merchant / Ads

- [x] **2026-09-15 fix:** `products.xml` (Source 4 URL) was wrongly serving `gla_*` ids → Google treated all offers as new. Now serves continuity-safe `sarveda-products` catalog (bare Woo ids + `?offer=`). Redeploy backend + request Merchant refetch.
- [ ] Confirm only **PRODUCTS SOURCE 4** active for native feed (`INCTX` → `https://sarveda.com/api/merchant/google/products.xml`)
- [ ] In Merchant Center → Business info: upload **Sarveda logo** (square, ≥1200px preferred) — Google Shopping seller badge uses this, not the site favicon
- [ ] Delete **Source 3** if still paused (demo URL / label `IN`)
- [ ] Watch feed item count / disapprovals for 2–3 days after continuity restore
- [ ] Content API (`IN`, ~112 items): decide keep vs pause after soak
- [ ] Note: generic Google “singing bowls” carousels also show competitors (Amazon/Flipkart/**The Buddhist…**). That “B” badge is **not** Sarveda — verify with a branded query `sarveda singing bowls`

---

## D. SEO (engineering done; residual later)

- [ ] Align sitemap `/shop` entry with canonical `/store` (hygiene)
- [ ] Resolve or permanently document **6** MANUAL_REVIEW Woo product leaves (intentional 404s today)
- [ ] **2026-10-01, 9:00 PM IST:** Create overtone flute from old Sarveda, then redirect `/product/overtone-flute` and `/product/overtone-flute-2`. Also add crystal bowl O-rings (`/product/crystal-bowl-o-rings-support-rings`) tonight.
- [ ] Future: `/product/caxixi` — still sold, no live page yet. Do not redirect until the page exists.
- [ ] No redirect (stopped or not a product): `/product/null`, `/product/eco-friendly-neem-wood-toothbrush`, `/product/spirulina`, `/product/mini-bamboo-and-aluminium-bar-chime`.
- [ ] Still unmapped: `/product/natural-bamboo-xylophone-with-5-keys`.

### D1. Track separately — 22 product 404s the rename patch does not cover

Logged 1 Oct 2026, midnight–early afternoon IST. **75 requests, 22 addresses.** Not part of the 76 renamed `/product/` redirects already on `main` (`2ba20c2`). Owner: we sell most of these, so a redirect should be added only after the live slug is confirmed. Do not guess a similar product.

| Requests | Old URL | Note |
|---|---|---|
| 25 | `/product/null` | Not a product. Do not redirect. |
| 8 | `/product/8-keys-wooden-xylophone` | Confirm live slug |
| 7 | `/product/32-bar-rod-chime` | Confirm live slug |
| 6 | `/product/caxixi` | Confirm live slug |
| 3 | `/product/singing-bowl-handmade-with-mantra` | Confirm live slug |
| 3 | `/product/wooden-maracas-shaker-with-dot-painting` | Confirm live slug |
| 3 | `/product/kenari-seed-shell-shaker-with-bamboo-handle` | Confirm live slug |
| 3 | `/product/kenari-seed-shell-shaker-large` | Confirm live slug |
| 2 | `/product/eco-friendly-neem-wood-toothbrush` | Confirm live slug |
| 2 | `/product/6-3-inches-mini-tongue-drum` | Confirm live slug |
| 2 | `/product/handmade-polished-singing-bowls-for-sound-therapy` | Confirm live slug |
| 1 | `/product/shamanic-drum-with-butterfly-artwork` | Confirm live slug |
| 1 | `/product/mini-bamboo-and-aluminium-bar-chime` | Confirm live slug |
| 1 | `/product/spirulina` | Confirm live slug |
| 1 | `/product/9-10-notes-handpan-drum-handcrafted-to-precision` | Confirm live slug |
| 1 | `/product/elemental-chimes` | Live page exists: `/product/elemental-chimes-new` |
| 1 | `/product/engraved-copper-water-bottles` | Split across more than one bottle; confirm target |
| 1 | `/product/copper-bottle-curved-copper-diamond-groove` | Confirm live slug |
| 1 | `/product/crystal-bowl-o-rings-support-rings` | Confirm live slug |
| 1 | `/product/overtone-flute` | Create from old Sarveda at 9:00 PM IST, then redirect |
| 1 | `/product/overtone-flute-2` | Same as overtone flute |
| 1 | `/product/natural-bamboo-xylophone-with-5-keys` | Confirm live slug |
- [ ] Monitor GSC 404s for retired WP URLs (tags, authors, zoom, shipping classes) → redirect only if traffic warrants
- [ ] Optional rich results: Article / Person / AggregateRating JSON-LD
- [ ] Fill empty category `seoTitle` / descriptions where thin
- [ ] Full GSC top-URL parity export (if Arjun provides) — only add redirects that matter

---

## E. Infra / DigitalOcean exit (target: month end)

- [ ] Keep DO until DNS + mail verified elsewhere (do **not** kill mid-cutover)
- [ ] Move `sarveda.com` DNS off DigitalOcean → GoDaddy or Cloudflare (when ready)
- [x] **2026-09-15:** DO Woo prepared for archive on `sarveda.store`
  - nginx vhost + archive map (storefront → `sarveda.com`; `/wp-admin`, `/subscriber-login`, `/my-account` stay)
  - WP `siteurl`/`home` → `http://sarveda.store` (bump to `https://` after Certbot)
  - **Still needed (GoDaddy):** A `@` + `www` → `134.209.146.175`, then Certbot on droplet
- [ ] Snapshot / export anything still needed from Woo droplet
- [ ] Destroy DO droplet + cancel ~$40 plan
- [ ] **Rotate DO root password** (was shared in chat) + prefer SSH key-only login


---

## F. Explicitly out of scope for tonight

- CRM (`feature/crm-schema`) — do not merge for cutover
- Mail DNS (MX / SPF / DKIM / DMARC) — do not touch
- Cloudflare full cutover polish (optional later)

---

## Already done (reference — do not redo)

- DNS apex/www → Vercel; Lightsail `FRONTEND_URL` + `GOOGLE_CALLBACK_URL`
- Razorpay apex webhook **Enabled**; Woo `rzp_wc_webhook` **Disabled**
- PayPal apex webhook + Live app **Sarveda New Website**
- Merchant Source 4 native feed; Source 2 Woo feed backed up + removed from Merchant
- Source 2 XML backup: `~/Documents/Products source 2 Old/ind_ctx.xml`
- Storefront maintenance page (logo + window copy) while `MAINTENANCE_MODE=1`
