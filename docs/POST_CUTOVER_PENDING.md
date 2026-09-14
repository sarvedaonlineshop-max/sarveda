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

- [ ] Confirm only **PRODUCTS SOURCE 4** active for native feed (`INCTX` → `https://sarveda.com/api/merchant/google/products.xml`)
- [ ] Delete **Source 3** if still paused (demo URL / label `IN`)
- [ ] Watch feed item count / disapprovals for 2–3 days
- [ ] Content API (`IN`, ~112 items): decide keep vs pause after soak

---

## D. SEO (engineering done; residual later)

- [ ] Align sitemap `/shop` entry with canonical `/store` (hygiene)
- [ ] Resolve or permanently document **6** MANUAL_REVIEW Woo product leaves (intentional 404s today)
- [ ] Monitor GSC 404s for retired WP URLs (tags, authors, zoom, shipping classes) → redirect only if traffic warrants
- [ ] Optional rich results: Article / Person / AggregateRating JSON-LD
- [ ] Fill empty category `seoTitle` / descriptions where thin
- [ ] Full GSC top-URL parity export (if Arjun provides) — only add redirects that matter

---

## E. Infra / DigitalOcean exit (target: month end)

- [ ] Keep DO until DNS + mail verified elsewhere (do **not** kill mid-cutover)
- [ ] Move `sarveda.com` DNS off DigitalOcean → GoDaddy or Cloudflare (when ready)
- [ ] Point `sarveda.store` at old Woo if archive needed; update WP Site URL
- [ ] Snapshot / export anything still needed from Woo droplet
- [ ] Destroy DO droplet + cancel ~$40 plan

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
