# Sarveda cutover runbook — REVISED (sales-safe evening window)

**Date:** 2026-09-14  
**Constraint:** Live WooCommerce on `sarveda.com` stays **selling all day**. No daytime DNS cutover.  
**Sales channel risk:** Most sales via **Google Ads / Merchant** — feed/source changes typically land ~**00:00 IST**. Plan DNS + Merchant around that.

**Keep up all day:**  
- WordPress shop on `sarveda.com` (revenue)  
- New stack on `https://sarveda-demo.xyz` (prep / UAT)

**Do NOT touch:** MX / SPF / DKIM / DMARC  
**Do NOT merge today:** CRM (`feature/crm-schema`)

---

## Strategy in one sentence

**Prep the new stack all day on demo/Lightsail → from ~19:00 put Woo under maintenance → flip DNS to Vercel → smoke → align Merchant so Ads traffic hits the new site after the night feed cycle.**

---

## Roles

| Role | Person | Owns |
|------|--------|------|
| Lead | | Go/no-go, maintenance start, DNS flip, rollback |
| Woo ops | | Maintenance mode / banner on WordPress |
| Frontend | | Vercel domains, SITE_URL, redeploy |
| Backend | | Lightsail deploy, env, PM2 |
| Payments | | Live keys + apex webhooks + paid smoke |
| Ads / Merchant | | Feed + source timing vs midnight cycle |
| Watcher | | Smoke log + war-room |

---

## Absolute rules

1. **No apex DNS change before 19:00 IST** (unless Lead declares emergency).
2. **Daytime = backend + Vercel + OAuth + webhook staging only** — Woo keeps selling.
3. **Mail DNS frozen.**
4. **WordPress stays installed** after cutover (rollback target) until soak.
5. **Demo stays up** forever today.
6. Prefer **short maintenance** (target **60–120 min**, max **3 h**).

---

## Clock plan (IST) — revised

| Block | Time | What happens to shoppers | What we do |
|-------|------|--------------------------|------------|
| **A — Day prep** | Now → **19:00** | Woo **open**, normal Ads/sales | Deploy API, UAT on **demo**, stage Vercel/OAuth/webhooks, **do not** flip DNS |
| **B — Pre-window** | **18:30–19:00** | Woo still open | Final Gate GO; Wartime checklist; lower TTL if not done |
| **C — Maintenance** | **~19:00–19:15** | Woo **closed** (maintenance page) | Enable WP maintenance; stop new Woo checkouts |
| **D — DNS cutover** | **19:15–19:45** | Maintenance or brief DNS churn | Point apex/www → Vercel; wait SSL |
| **E — Config + smoke** | **19:45–21:30** | New site live (or maintenance until ready) | SITE_URL, Lightsail env, webhooks, paid smoke |
| **F — Soft open** | **~21:30** | New stack **open** | Remove any holding page; announce |
| **G — Merchant night** | **21:30–00:30** | Ads may still use old crawl until ~midnight | Confirm feed URLs; switch Merchant source only if planned; watch 00:00 cycle |
| **H — Night soak** | **00:30–02:00** | New site + new Ads landings | Watch 404s, checkout, Ads landing PDPs |

If you start maintenance later (e.g. 20:00 / 21:00), **keep the same order** — only shift the clock.

---

# BLOCK A — Day prep (now → 19:00)  
### Woo stays LIVE. Zero customer impact.

### A1. Lightsail: latest `main` (45–60 min) — **do first**

```bash
ssh -i ~/.ssh/sarveda-lightsail.pem ubuntu@13.204.112.165
cd ~/sarveda && git fetch origin && git checkout main && git pull origin main
cd backend && npm install && npx prisma migrate deploy && npm run build
pm2 restart sarveda-backend --update-env
curl -sS http://127.0.0.1:5000/health
```

- [ ] Health OK  
- [ ] Commit SHA recorded in war-room  

### A2. Full UAT on **demo only** (2–3 h, parallel OK)

All paid tests on `https://sarveda-demo.xyz` — **not** apex.

| # | Check | Pass? |
|---|--------|-------|
| 1 | Homepage / PDP / cart / checkout | |
| 2 | Razorpay test or live-mode on demo (as you use today) → PAID | |
| 3 | Google login on demo | |
| 4 | Admin: Processing → Ready to ship (no auto AWB) | |
| 5 | Multi-item incl. drop-ship lines visible | |
| 6 | Create Delhivery label (source + partner) | |
| 7 | Order email + invoice PDF | |
| 8 | COD path if day-1 COD | |

### A3. Vercel — attach domains **without** taking Woo down (30 min)

- [ ] Add `sarveda.com` + `www.sarveda.com` in Vercel  
- [ ] Copy Vercel DNS targets to scratch pad  
- [ ] **Do not change DigitalOcean A record yet**  
  (Domain may show “Invalid Configuration” until evening — expected)

### A4. Google OAuth (15 min)

- [ ] **Add** `https://sarveda.com/api/auth/google/callback`  
- [ ] **Keep** demo callback  

### A5. Stage payment webhooks (do not remove demo yet) (30 min)

- [ ] Know apex URLs:  
  - Razorpay `https://sarveda.com/api/payments/razorpay/webhook`  
  - Stripe / PayPal apex paths confirmed  
- [ ] Prefer: **add** apex webhook now (inactive traffic until DNS) **or** switch at 19:45  
- [ ] Confirm live keys ready on Lightsail for evening  

### A6. Draft env (apply only after DNS in Block E)

**Vercel production**
```env
NEXT_PUBLIC_SITE_URL=https://sarveda.com
```

**Lightsail backend**
```env
FRONTEND_URL=https://sarveda.com,https://sarveda-demo.xyz
GOOGLE_CALLBACK_URL=https://sarveda.com/api/auth/google/callback
# customer email/WhatsApp links:
NEXT_PUBLIC_SITE_URL=https://sarveda.com
AUTO_START_FULFILLMENT_ON_PAID=0
```

- [ ] Env text ready in a local notes file (not committed)

### A7. Credential rotation (if still pending) — daytime OK

Quietly rotate on Lightsail (JWT/DB/Razorpay/S3/OAuth) **without** DNS change.  
Expect admin re-login after JWT change.  
Demo may briefly glitch — apex Woo unaffected.

### A8. Woo maintenance page — **prepare** content (30 min)

Before evening, create the maintenance message on WordPress (plugin or `.maintenance` / theme page), e.g.:

> We’re upgrading Sarveda’s store for a smoother checkout.  
> Back shortly (about 1–2 hours). Thank you for your patience.  
> Need help? WhatsApp / email …

- [ ] Maintenance plugin installed **or** known WP procedure documented  
- [ ] **Do not enable** until Block C  

### A9. Merchant / Google Ads — daytime decisions (critical)

**Fact you stated:** changing product sources now still typically affects traffic ~**00:00 tonight**.

| Option | Daytime | Evening | Midnight (~00:00) | Risk |
|--------|---------|---------|-------------------|------|
| **Recommended** | Leave Merchant source on **current Woo feed** | Cut over site 19:00–21:30 | Feed/Ads may still hit old URLs briefly, then new | Short mismatch window; prefer 301s on new stack for legacy `/store` |
| **Aggressive** | Point Merchant to **native feed** now | Site still Woo until 19:00 | Ads land on Woo until DNS, then new | Daytime Ads OK; midnight lands on new if DNS done |
| **Safest Ads** | Native feed already has `sarveda.com` PDP URLs | DNS before midnight | After 00:00 Ads → new PDPs | Requires DNS done **before** midnight cycle |

**Recommendation for Sarveda today:**

1. **Daytime:** do **not** break the live Woo shop.  
2. Confirm native Merchant feed URLs are already `https://sarveda.com/product/...` (they should be).  
3. **Evening:** DNS cutover **before 23:00** so when Merchant/Ads refresh ~00:00, landings hit **new** stack.  
4. Switch Merchant “primary source” to native feed **only when** Lead confirms — ideally **after** Gate soft-open (~21:30) and **before** midnight, **or** accept that midnight is when Ads feel it either way.  
5. Keep strong **301s** on new stack for `/store/...` so any stale Ads URL still converts.

- [ ] Ads owner: confirm current Merchant primary source  
- [ ] Ads owner: confirm native feed endpoint + item count  
- [ ] Ads owner: write the exact click time for source switch (suggest **21:45** or **23:00**)

### A10. Lower DNS TTL (5 min) — daytime OK

- [ ] Lower A/www TTL on DigitalOcean if possible (e.g. 300s)

**Gate DAY-END (18:30):** Demo UAT green + domains attached + OAuth URI + maintenance page ready + Merchant plan written → proceed Block B.

---

# BLOCK B — Pre-window (18:30–19:00)

Woo **still selling**.

Lead checklist out loud:

1. Demo paid path OK?  
2. Lightsail on latest main?  
3. Vercel DNS targets copied?  
4. Maintenance page ready to flip in one click?  
5. Rollback A → `134.209.146.175` written?  
6. Merchant switch time agreed (e.g. 21:45)?  
7. Support/WhatsApp staffed during maintenance?

- [ ] **GO for 19:00 maintenance**  
- [ ] **SLIP** to 20:00 / 21:00 if not ready (still finish DNS **before midnight**)

---

# BLOCK C — Put Woo under maintenance (~19:00–19:15)

### C1. Enable WordPress maintenance

- [ ] Enable maintenance plugin / drop maintenance file  
- [ ] Verify `https://sarveda.com` shows maintenance (not checkout)  
- [ ] Verify **new checkouts cannot complete** on Woo  

### C2. Optional: pause Ads (recommended during maintenance)

- [ ] Pause Google Ads campaigns **or** accept spend → maintenance page for ~1–2 h  
  (Pausing is cleaner; resume after soft open)

War-room message: “Maintenance ON — DNS starting.”

---

# BLOCK D — DNS cutover (19:15–19:45)

DigitalOcean DNS only (web records):

- [ ] **A** `sarveda.com` → Vercel apex targets (replace `134.209.146.175`)  
- [ ] **www** → Vercel www CNAME (prefer www→apex redirect in Vercel)  
- [ ] **Do not touch** MX/TXT mail  

Verify:

```bash
dig +short sarveda.com A
curl -sI https://sarveda.com | head -20
```

- [ ] Not WordPress  
- [ ] Vercel/Next responding (SSL may lag a few minutes)

If broken >20 min with no progress → **Rollback** (restore A to `134.209.146.175`, disable WP maintenance, reopen Woo).

---

# BLOCK E — Config + smoke (19:45–21:30)

### E1. Vercel

- [ ] `NEXT_PUBLIC_SITE_URL=https://sarveda.com`  
- [ ] Redeploy production  
- [ ] Check `/robots.txt` Allow + `/sitemap.xml` non-empty  

### E2. Lightsail

- [ ] Apply `FRONTEND_URL` + `GOOGLE_CALLBACK_URL` (+ SITE_URL for links)  
- [ ] `pm2 restart sarveda-backend --update-env`  
- [ ] `/health` OK  

### E3. Webhooks → apex

- [ ] Razorpay / Stripe / PayPal webhooks on `sarveda.com`  
- [ ] Shipping/WhatsApp callbacks if demo-only  

### E4. Critical smoke on **apex** (not demo)

| # | Check | Pass? |
|---|--------|-------|
| 1 | Homepage | |
| 2 | Legacy `/store/...` → product | |
| 3 | Cart → checkout | |
| 4 | Google login | |
| 5 | Razorpay → PAID + webhook | |
| 6 | Email / invoice | |
| 7 | Admin Ready to ship + label | |

**Soft-open Gate:** items 1–5 pass → Block F.

---

# BLOCK F — Soft open (~21:30)

- [ ] Confirm no WP maintenance in path (DNS already off Woo)  
- [ ] Resume Google Ads if paused  
- [ ] War-room: “Sarveda.com is on the new stack”  
- [ ] Support watches first live orders  

Target: shoppers buying again by **~21:30**, well before Merchant midnight.

---

# BLOCK G — Merchant / Ads night cycle (21:30–00:30)

### G1. Source switch (pick one — Lead decides)

**Plan G-SAFE (recommended tonight):**  
- [ ] ~21:45 — set Merchant primary / supplemental to **native Sarveda feed** (if not already)  
- [ ] Confirm feed fetch success in Merchant UI  
- [ ] Expect Ads landing behaviour to refresh around **~00:00**

**Plan G-HOLD:**  
- [ ] Leave source as-is until tomorrow if feed already apex URLs and DNS is live  
- [ ] Still monitor 00:00 for crawling/disapprovals  

### G2. Landing URL spot-check after midnight

- [ ] 3–5 Ads / Merchant product links → 200 on new PDP (or clean 301)  
- [ ] No soft-404 / Woo theme  

---

# BLOCK H — Night soak (00:30–02:00)

- [ ] Checkout success rate  
- [ ] PM2 / Vercel errors  
- [ ] Payment webhooks  
- [ ] Ads landing complaints  

End status: **SOAK_OK** / **SOAK_WATCH** / **ROLLBACK**

---

# ROLLBACK (anytime after maintenance)

1. DigitalOcean **A** `sarveda.com` → `134.209.146.175`  
2. Disable WordPress maintenance  
3. Confirm Woo checkout works  
4. Resume Ads if paused  
5. Keep demo for debugging new stack  
6. Revert Lightsail FRONTEND/OAuth to demo only if needed for API testing  

---

## What we explicitly will NOT do in daytime

| Action | Why |
|--------|-----|
| Change apex A away from Woo | Kills daytime sales |
| Enable WP maintenance before 19:00 | Blocks daytime sales |
| Delete WordPress | Need rollback |
| Merge CRM | Out of scope |
| Touch mail DNS | Breaks email |
| Assume Merchant changes are instant | They land ~midnight |

---

## Decision log

| Time | Decision | By | Notes |
|------|----------|-----|-------|
| | Day Gate | | |
| | Maintenance ON | | |
| | DNS flipped | | |
| | Soft open | | |
| | Merchant switch | | |
| | End status | | |

---

**Right now:** execute **Block A** only. Call me when Lightsail is pulled/restarted or when you want to walk through demo UAT / maintenance page prep.
