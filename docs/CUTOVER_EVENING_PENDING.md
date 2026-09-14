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

- [ ] **Stripe webhook (REQUIRED — intl day‑1)** — add  
  `https://sarveda.com/api/payments/stripe/webhook`  
  + Live keys on Lightsail/Vercel; webhook signing secret → `STRIPE_WEBHOOK_SECRET`
- [ ] **PayPal webhook (REQUIRED — intl day‑1)** — add  
  `https://sarveda.com/api/payments/paypal/webhook`  
  + `PAYPAL_MODE=live` + `PAYPAL_WEBHOOK_ID` on Lightsail
- [ ] **WP maintenance page** ready (plugin/banner) — **do not enable** yet
- [ ] **Merchant / Ads** — agree switch time (suggest **21:45**, before midnight cycle)
- [ ] Confirm Lightsail `RAZORPAY_WEBHOOK_SECRET` = secret used on **new apex** Razorpay webhook
- [ ] Confirm Vercel `NEXT_PUBLIC_RAZORPAY_KEY_ID` = same Live Key ID as Lightsail
- [ ] Optional: lower DNS TTL on DigitalOcean A/www

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

## Stripe & PayPal — status

| Gateway | Daytime status | Why |
|---------|----------------|-----|
| **Razorpay** | Done (apex webhook + Live keys) | India primary — required tonight |
| **Stripe** | **Pending** (not done yet) | Needed if you take **international card** on day‑1 |
| **PayPal** | **Pending** (not done yet) | Needed if you take **PayPal** on day‑1 |

We paused Stripe/PayPal after Razorpay to keep daytime prep moving. They are **not forgotten**.

- If tonight = **India only (Razorpay + maybe COD)** → Stripe/PayPal can wait until tomorrow (still add them soon).  
- If tonight = **intl sales open** → finish Stripe + PayPal webhooks **before 19:00**.

Exact URLs:

```
https://sarveda.com/api/payments/stripe/webhook
https://sarveda.com/api/payments/paypal/webhook
```

---

## Rollback (if apex broken)

1. DO A `@` → `134.209.146.175`  
2. Disable WP maintenance  
3. Re-enable Woo Razorpay webhook if disabled  
4. Resume Ads  
