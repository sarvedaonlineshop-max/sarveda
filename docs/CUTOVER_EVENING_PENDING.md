# Cutover evening checklist — 2026-09-14

**Rule:** Woo stays live until ~**19:00**. Do not flip DigitalOcean DNS before maintenance.

**DNS targets (Vercel — do NOT apply until Block D):**

| Host | Type | Value |
|------|------|--------|
| `@` | A | `216.198.79.1` |
| `www` | CNAME | `08444015c490a9b9.vercel-dns-017.com.` |

**Do not touch:** MX / SPF / DKIM / DMARC / mail TXT

---

## DONE (daytime — already finished)

- [x] Lightsail on latest `main` (`c5e4d20`) + health OK
- [x] Payment / shipment UAT on demo (per team)
- [x] Vercel domains attached: `sarveda.com`, `www.sarveda.com` (Invalid Config = expected)
- [x] Google OAuth web client: apex redirect URI + JS origins (`sarveda.com` / www)
- [x] Complaints Android OAuth: **no change** (not bound to demo domain)
- [x] Razorpay Live API keys: keep existing Live keys (universal) — do **not** regenerate
- [x] Razorpay webhooks:
  - [x] New: `https://sarveda.com/api/payments/razorpay/webhook` (5 events, Enabled)
  - [x] Keep Woo: `.../rzp_wc_webhook` Enabled until soft-open
  - [x] Keep demo: `sarveda-demo.xyz/...` Enabled

---

## PENDING — finish before / during evening (do not miss)

### Still daytime (before 19:00) if not done

- [ ] **Stripe webhook (REQUIRED — intl day‑1)** — **BLOCKED: needs owner OTP**  
  Resume ASAP when Arjun reachable:  
  `https://sarveda.com/api/payments/stripe/webhook`  
  + Live signing secret → `STRIPE_WEBHOOK_SECRET`  
  ⚠ Without this, intl **card** via Stripe is unsafe for day‑1; PayPal + Razorpay still OK.
- [x] **PayPal webhook (REQUIRED — intl day‑1)** — apex added  
  `https://sarveda.com/api/payments/paypal/webhook` · ID `2W290169M4234034B` on Lightsail  
  - [x] **Edit webhook events** — capture completed + denied + refunds (verified)
- [x] **WP maintenance page** ready (LightStart / WP Maintenance Mode) — **do not enable** until ~19:00
  - Status stays **Deactivated** until cutover; Bypass bots = No; Exclude keeps wp-login
- [x] Confirm Lightsail `RAZORPAY_WEBHOOK_SECRET` = apex Razorpay webhook secret
- [ ] Confirm Vercel `NEXT_PUBLIC_RAZORPAY_KEY_ID` = same Live Key ID as Lightsail
- [ ] **Merchant / Ads — CRITICAL after your correction**  
  Source 2 file URL is Woo: `https://sarveda.com/wp-content/uploads/woo-feed/google/xml/ind_ctx.xml`  
  → **breaks after DNS** (Vercel has no `/wp-content/...`).  
  **Preferred tonight:** host a copy of `ind_ctx.xml` on S3/Lightsail (stable URL) and **edit Source 2 URL** before ~00:00 fetch — keeps INCTX IDs, avoids Source 3 clash.  
  **Source 3** from `~/Documents/Product sources 3` = Merchant TSV export — only if Ads owner signs off; prior clash risk if IDs overlap Content API / Source 2.  
  Do **not** blindly re-add Source 3 during DNS without a clash plan.
- [ ] Optional: lower DNS TTL on DigitalOcean A/www
- [ ] Draft evening env notes ready (SITE_URL / FRONTEND_URL / GOOGLE_CALLBACK)

### ~18:30 — Gate GO

- [ ] Demo still healthy
- [ ] DNS targets copied
- [ ] Maintenance one-click ready
- [ ] Rollback written: restore A `@` → `134.209.146.175`
- [ ] Support staffed

### ~19:00 — Maintenance (Block C)

- [ ] Enable WordPress maintenance
- [ ] Confirm checkout blocked on Woo
- [ ] Optional: pause Google Ads during maintenance

### ~19:15 — DNS (Block D) — DigitalOcean only

- [ ] Change A `@` → `216.198.79.1` (replace Woo `134.209.146.175`)
- [ ] Change www CNAME → `08444015c490a9b9.vercel-dns-017.com.`
- [ ] Verify: `dig` + `curl -sI https://sarveda.com` → Vercel (not WordPress)
- [ ] Wait for SSL if needed

### ~19:45 — Env + webhooks live (Block E)

- [ ] Vercel: `NEXT_PUBLIC_SITE_URL=https://sarveda.com` + **redeploy**
- [ ] Lightsail `.env`:
  - `FRONTEND_URL=https://sarveda.com,https://sarveda-demo.xyz`
  - `GOOGLE_CALLBACK_URL=https://sarveda.com/api/auth/google/callback`
  - site URL for emails if used: `NEXT_PUBLIC_SITE_URL=https://sarveda.com`
  - `AUTO_START_FULFILLMENT_ON_PAID=0`
- [ ] `pm2 restart sarveda-backend --update-env` + `/health` OK
- [ ] Confirm Razorpay apex webhook secret matches env
- [ ] If using intl: confirm Stripe/PayPal webhooks pointing at apex

### Smoke on apex (must pass before soft-open)

- [ ] Homepage
- [ ] Legacy `/store/...` → product
- [ ] Cart → checkout
- [ ] Google login
- [ ] Razorpay → order **PAID** + webhook
- [ ] Email / invoice
- [ ] Admin: Processing → Ready to ship → create label

### ~21:30 — Soft open (Block F)

- [ ] Site open on new stack
- [ ] Resume Ads if paused
- [ ] **Disable** old Woo Razorpay webhook (`.../rzp_wc_webhook`)

### ~21:45–23:00 — Merchant (Block G)

- [ ] Switch / confirm Merchant primary → native feed (as planned)
- [ ] DNS already live before ~00:00 Ads refresh

### ~00:30 — Soak

- [ ] Spot-check Ads/Merchant PDP landings
- [ ] Watch payments + 5xx
- [ ] Declare **SOAK_OK** / **SOAK_WATCH** / **ROLLBACK**

---

## Stripe & PayPal — status (REQUIRED day‑1 intl)

| Gateway | Daytime status | Action now |
|---------|----------------|------------|
| **Razorpay** | Done | India |
| **Stripe** | **BLOCKED (owner OTP)** | Do before soft-open if possible; else intl cards risk until webhook added |
| **PayPal** | **DO NOW** | Apex webhook + confirm `PAYPAL_MODE=live` (already live on Lightsail) |

Lightsail already has **Stripe LIVE** + **PayPal live** credentials. Missing piece is mainly **apex webhook endpoints** in the provider dashboards (and matching secrets/IDs if new).

```
https://sarveda.com/api/payments/stripe/webhook
https://sarveda.com/api/payments/paypal/webhook
```

**Stripe events to enable:**  
`checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` (+ refund.* if offered)

**PayPal:** create webhook on that URL; copy Webhook ID into Lightsail `PAYPAL_WEBHOOK_ID` if it changes.
---

## Rollback (if apex broken)

1. DO A `@` → `134.209.146.175`  
2. Disable WP maintenance  
3. Re-enable Woo Razorpay webhook if disabled  
4. Resume Ads  
