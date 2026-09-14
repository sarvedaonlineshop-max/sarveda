# Sarveda cutover runbook — 15 hours (WordPress → Next.js)

**Date:** 2026-09-14 (cutover day)  
**Window:** ~15 hours from start  
**Target:** `https://sarveda.com` on Vercel + Lightsail API  
**Keep up:** `https://sarveda-demo.xyz` (rollback / staging)  
**Do NOT touch:** MX / SPF / DKIM / DMARC / mail TXT  
**Do NOT merge today:** CRM (`feature/crm-schema`)

**Sources of truth:**  
[`SARVEDA_FINAL_DOMAIN_CUTOVER_CONFIG_AUDIT.md`](./SARVEDA_FINAL_DOMAIN_CUTOVER_CONFIG_AUDIT.md) ·  
[`PRODUCTION-GO-LIVE-CREDENTIAL-ROTATION.md`](./PRODUCTION-GO-LIVE-CREDENTIAL-ROTATION.md) ·  
[`SARVEDA_FINAL_SEO_CUTOVER_CERTIFICATION.md`](./SARVEDA_FINAL_SEO_CUTOVER_CERTIFICATION.md)

---

## Roles (fill names)

| Role | Person | Owns |
|------|--------|------|
| Lead | | Go / no-go, DNS flip, rollback call |
| Frontend | | Vercel domains, SITE_URL, redeploy |
| Backend | | Lightsail `.env`, `git pull`, PM2, health |
| Payments | | Razorpay / Stripe / PayPal dashboards + live test order |
| SEO / GSC | | robots, sitemap, Search Console submit |
| Watcher | | Live smoke log, screenshot evidence |

**Rule:** One person speaks DNS changes. Everyone else verifies.

---

## Absolute rules

1. **Mail DNS frozen** — never edit MX/SPF/DKIM/DMARC today.
2. **WordPress stays running** off-DNS until soak (rollback target).
3. **Demo stays up** (`sarveda-demo.xyz`).
4. **No CRM merge / no CRM migration** on production DB today.
5. If apex is broken after DNS → **rollback DNS first**, debug on demo second.
6. Do not paste secrets into chat.

---

## Timeline overview (IST)

| Phase | Hours from T0 | Clock (example start 09:30) | Goal |
|-------|---------------|-----------------------------|------|
| **0** Prep & gates | 0:00–1:30 | 09:30–11:00 | Access, deploy latest main, preflight |
| **1** Before DNS | 1:30–4:00 | 11:00–13:30 | Domains, OAuth, webhooks staged, env ready |
| **2** Quiet lunch / buffer | 4:00–5:00 | 13:30–14:30 | Final go/no-go |
| **3** DNS cutover | 5:00–5:45 | 14:30–15:15 | Point apex/www → Vercel |
| **4** Immediate config | 5:45–7:00 | 15:15–16:30 | SITE_URL, Lightsail, webhooks live |
| **5** Smoke + paid UAT | 7:00–10:00 | 16:30–19:30 | Checkout, OAuth, admin ship |
| **6** SEO + soak | 10:00–13:00 | 19:30–22:30 | Sitemap, GSC, monitor |
| **7** Night watch | 13:00–15:00 | 22:30–00:30 | Watch errors; declare soak OK |

Adjust clocks if you start later — keep **phase order**, not the exact clock.

---

# PHASE 0 — Prep & gates (0:00–1:30)

### 0.1 Access checklist (15 min)

- [ ] DigitalOcean DNS for `sarveda.com` (ns1/2/3.digitalocean.com)
- [ ] Vercel project (production) open
- [ ] Lightsail SSH (`sarveda-lightsail.pem` / key that works) → `13.204.112.165`
- [ ] Google Cloud OAuth client
- [ ] Razorpay / Stripe / PayPal dashboards
- [ ] Admin login for demo + plan apex admin login after cutover
- [ ] Slack/WhatsApp war-room channel for the team

### 0.2 Deploy latest `main` to Lightsail (30–45 min)

Shipping/auto-AWB/drop-ship fixes must be on API **before** public traffic.

```bash
ssh -i ~/.ssh/sarveda-lightsail.pem ubuntu@13.204.112.165
cd ~/sarveda && git fetch origin && git checkout main && git pull origin main
cd backend
npm install
npx prisma migrate deploy
npm run build
pm2 restart sarveda-backend --update-env
curl -sS http://127.0.0.1:5000/health | jq .
```

- [ ] `/health` → database + redis ok
- [ ] `git rev-parse --short HEAD` matches expected `main`

### 0.3 Confirm demo still healthy (10 min)

- [ ] https://sarveda-demo.xyz → 200
- [ ] Admin login works
- [ ] One PDP + cart loads
- [ ] Ready-to-ship shows **both** warehouse + drop-ship lines on a known order (if available)

### 0.4 Credential rotation — minimum if not done (30–45 min)

If secrets were never rotated for go-live, do **minimum** now (quiet window):

1. DB password → update `DATABASE_URL` → restart  
2. `JWT_SECRET` (backend + matching frontend JWT if used) → restart/redeploy  
3. Razorpay live keys + webhook secret  
4. AWS S3 keys  
5. Google OAuth secret  

Full list: `PRODUCTION-GO-LIVE-CREDENTIAL-ROTATION.md`.  
If already rotated earlier → **skip**, only verify env present.

### 0.5 Preflight snapshot (5 min)

- [ ] Note current apex A record: should be `134.209.146.175` (Woo)  
- [ ] Screenshot DO DNS page  
- [ ] Write rollback command in war-room:  
  `Restore A sarveda.com → 134.209.146.175`

**Gate A:** Demo healthy + Lightsail on latest main + access OK → proceed Phase 1.

---

# PHASE 1 — Before DNS (1:30–4:00)

### 1.1 Vercel domains (20–30 min)

- [ ] Add `sarveda.com`
- [ ] Add `www.sarveda.com`
- [ ] Prefer **apex primary**; configure **www → redirect to apex**
- [ ] Copy the **exact** DNS records Vercel shows (A / ALIAS / CNAME) into a scratch pad  
  **Do not change DigitalOcean yet**

### 1.2 Google OAuth (15 min)

- [ ] Authorized redirect URI **add**:  
  `https://sarveda.com/api/auth/google/callback`
- [ ] Keep demo callback:  
  `https://sarveda-demo.xyz/api/auth/google/callback`
- [ ] Save — do not remove demo today

### 1.3 Payment webhooks — stage apex URLs (30 min)

Prepare (add or note to switch at Phase 4):

| Provider | Apex webhook |
|----------|----------------|
| Razorpay | `https://sarveda.com/api/payments/razorpay/webhook` |
| Stripe | `https://sarveda.com/api/payments/stripe/webhook` (confirm path in dashboard/code) |
| PayPal | production webhook URL for new stack (confirm path) |

- [ ] Live keys on Lightsail (not test) if accepting real money today  
- [ ] Vercel `NEXT_PUBLIC_RAZORPAY_KEY_ID` / Stripe / PayPal public keys match live mode

### 1.4 Lightsail env — draft the edits (do not apply yet unless dual-host safe) (20 min)

Prepare these values (apply in Phase 4 right after DNS verifies):

```env
FRONTEND_URL=https://sarveda.com,https://sarveda-demo.xyz
GOOGLE_CALLBACK_URL=https://sarveda.com/api/auth/google/callback
# If Lightsail also sends customer links:
NEXT_PUBLIC_SITE_URL=https://sarveda.com
```

- [ ] Confirm `AWS_S3_REGION=us-east-1`, `AWS_S3_BUCKET_NAME=sarveda-media`
- [ ] Confirm Redis URL set
- [ ] Confirm `AUTO_START_FULFILLMENT_ON_PAID` is **off** (`0` / unset) — labels via Ready to ship only

### 1.5 Vercel env — draft (apply Phase 4)

```env
NEXT_PUBLIC_SITE_URL=https://sarveda.com
```

Keep demo project / preview separate if you use a second Vercel project for demo.

### 1.6 Lower TTL if possible (5 min)

- [ ] If DO allows, set A/CNAME TTL low (e.g. 300s) **before** flip

**Gate B:** Domains attached, OAuth URI added, webhook URLs known, env drafts ready → Phase 2.

---

# PHASE 2 — Go / no-go (4:00–5:00)

Lead asks out loud:

1. Lightsail health OK?  
2. Vercel domain shows pending/verified instructions?  
3. OAuth apex URI saved?  
4. Payment live keys + webhook plan clear?  
5. Rollback A → `134.209.146.175` written down?  
6. Mail records **untouched**?

- [ ] **GO** → Phase 3  
- [ ] **NO-GO** → stay on Woo; fix blockers; do not touch DNS

---

# PHASE 3 — DNS cutover (5:00–5:45)

### 3.1 Change only web records on DigitalOcean

- [ ] **A** `sarveda.com` → Vercel apex target(s) from Vercel UI (replace `134.209.146.175`)
- [ ] **www** → Vercel www CNAME (usually `cname.vercel-dns.com`) **or** keep CNAME to apex only if Vercel redirect www→apex is configured
- [ ] Save DNS

### 3.2 Verify propagation (15–30 min)

```bash
dig +short sarveda.com A
dig +short www.sarveda.com CNAME
curl -sI https://sarveda.com | head -20
curl -sI https://www.sarveda.com | head -20
```

Expect:

- [ ] Not WordPress (`X-Redirect-By: WordPress` gone on apex)
- [ ] Vercel / Next headers or your new stack
- [ ] SSL valid (may take a few minutes after DNS)

If still Woo after 20–30 min: wait for TTL; do not thrash. If wrong host forever → check Vercel domain config.

**Gate C:** Apex serves new stack (or Vercel pending SSL completing) → Phase 4 immediately.

---

# PHASE 4 — Immediate config (5:45–7:00)

### 4.1 Vercel production env + redeploy (15–25 min)

- [ ] Set `NEXT_PUBLIC_SITE_URL=https://sarveda.com`
- [ ] Redeploy production
- [ ] Wait until Ready

Verify:

```bash
curl -sL https://sarveda.com/robots.txt | head -30
curl -sL https://sarveda.com/sitemap.xml | head -40
curl -sL https://sarveda.com | rg -i 'canonical|sarveda.com' | head
```

- [ ] robots **Allow** (production), not staging-closed
- [ ] sitemap non-empty (products/categories)
- [ ] canonical host `https://sarveda.com`

### 4.2 Lightsail apply env + restart (15 min)

```bash
# edit ~/sarveda/backend/.env carefully
pm2 restart sarveda-backend --update-env
curl -sS http://127.0.0.1:5000/health | jq .
```

- [ ] `FRONTEND_URL` apex-first  
- [ ] `GOOGLE_CALLBACK_URL` apex  
- [ ] health OK

### 4.3 Flip payment webhooks to apex (15 min)

- [ ] Razorpay webhook → apex URL; secret matches `.env`
- [ ] Stripe / PayPal same
- [ ] Optional: keep demo webhook disabled or secondary during soak

### 4.4 Shipping / WhatsApp callbacks (10 min)

- [ ] Delhivery / Shiprocket / WATI webhook hosts → apex if they were demo-only

**Gate D:** robots/sitemap/canonical OK + API restarted + webhooks pointed → Phase 5.

---

# PHASE 5 — Smoke + paid UAT (7:00–10:00)

Log pass/fail with screenshots in war-room.

### 5.1 Storefront smoke (30 min)

| # | Check | Pass? |
|---|--------|-------|
| 1 | Homepage loads | |
| 2 | `/store` or legacy path 301 → product/category | |
| 3 | PDP images (S3) | |
| 4 | Add to cart | |
| 5 | Checkout page loads | |
| 6 | Mobile homepage + cart | |

### 5.2 Auth (20 min)

| # | Check | Pass? |
|---|--------|-------|
| 7 | Email/password login | |
| 8 | Google login (apex redirect) | |
| 9 | Admin login | |

### 5.3 Payments (60–90 min) — mandatory

| # | Check | Pass? |
|---|--------|-------|
| 10 | Razorpay India — real/small live or certified live-mode test → order **PAID** | |
| 11 | Webhook delivery log shows 200 on apex | |
| 12 | Order email received (or ZeptoMail/SES log success) | |
| 13 | Invoice PDF download from admin/order | |
| 14 | COD path (if selling COD today) → order created, Ready to ship | |
| 15 | Optional: Stripe or PayPal one intl smoke if you sell intl day-1 | |

### 5.4 Fulfillment (30 min)

| # | Check | Pass? |
|---|--------|-------|
| 16 | Mark Processing → appears in **Ready to ship** (not auto Created) | |
| 17 | Multi-item order shows **all** physical lines (incl. drop-ship) | |
| 18 | Create Delhivery label with Source + Partner | |
| 19 | Order moves to Created with AWB | |

### 5.5 Admin ops (20 min)

| # | Check | Pass? |
|---|--------|-------|
| 20 | Orders list | |
| 21 | Inventory visible | |
| 22 | Refund preview on a test order (do not mass-refund live) | |

**Gate E:** Items 1–12 + 16–18 pass → declare **soft live**. Fix blockers before marketing push.

If payment or OAuth hard-fail and no quick fix → **Phase R rollback**.

---

# PHASE 6 — SEO + soak (10:00–13:00)

### 6.1 SEO verify (20 min)

- [ ] `/robots.txt` production allow list
- [ ] `/sitemap.xml` has product URLs
- [ ] Sample legacy `/store/...` → 301 → `/product/{slug}`
- [ ] Nested category legacy URLs 301 (spot-check 3)

### 6.2 Google Search Console (20–40 min)

- [ ] Property `https://sarveda.com` (or domain property)
- [ ] Submit sitemap `https://sarveda.com/sitemap.xml`
- [ ] URL inspection on homepage + 1 PDP

### 6.3 Analytics (15 min)

- [ ] GA4 / Meta realtime hit on apex (if used)

### 6.4 Merchant (optional same day)

- [ ] Confirm feed still apex PDP URLs  
- [ ] Do **not** panic-switch Merchant sources unless already planned

### 6.5 Soak watch (remaining time)

Watch for 60–120 min:

- [ ] Checkout errors
- [ ] PM2 logs / 5xx
- [ ] Payment webhook failures
- [ ] Customer complaints channel

---

# PHASE 7 — Night close (13:00–15:00)

### Declare status

| Status | Meaning |
|--------|---------|
| **SOAK_OK** | Soft live stable; Woo stays off-DNS; demo stays up |
| **SOAK_WATCH** | Minor issues; stay live; fix overnight |
| **ROLLBACK** | Critical; restore Woo DNS |

### End-of-day checklist

- [ ] War-room summary: what passed / failed  
- [ ] Lightsail commit SHA recorded  
- [ ] Vercel deploy URL recorded  
- [ ] Webhook endpoints recorded  
- [ ] Woo **not** deleted  
- [ ] CRM **not** merged  

### Explicitly defer (tomorrow+)

- Quarantine/disable WordPress on DO  
- CRM merge  
- Residual 6 Yoast MANUAL_REVIEW product leaves  
- Full 22-sitemap parity  
- WATI if deferred  
- Credential rotation leftovers not done in Phase 0  

---

# PHASE R — Rollback (anytime)

**Trigger:** Apex down, SSL broken >30 min with no fix, checkout/payments broken, or SEO catastrophe.

1. DigitalOcean: set **A** `sarveda.com` → `134.209.146.175`  
2. Confirm `curl -sI https://sarveda.com` shows WordPress again  
3. Leave `sarveda-demo.xyz` as new-stack testing  
4. Optionally revert Lightsail `FRONTEND_URL` / `GOOGLE_CALLBACK_URL` to demo if you need API emails on demo  
5. Keep Google OAuth **both** redirect URIs  
6. War-room: incident note + next fix window  

Do **not** delete Vercel domains or destroy Lightsail while rolling back.

---

## Quick command card

```bash
# DNS
dig +short sarveda.com A
dig +short www.sarveda.com CNAME

# Stack
curl -sI https://sarveda.com | head -20
curl -sL https://sarveda.com/robots.txt | head -20
curl -sL https://sarveda.com/sitemap.xml | head -20

# API (from Lightsail)
curl -sS http://127.0.0.1:5000/health

# Deploy API
cd ~/sarveda && git pull origin main && cd backend && npm run build && pm2 restart sarveda-backend --update-env
```

---

## Decision log (fill during cutover)

| Time | Decision | By | Notes |
|------|----------|-----|-------|
| | Gate A | | |
| | Gate B | | |
| | Gate C (DNS) | | |
| | Gate D | | |
| | Gate E (soft live) | | |
| | End status | | |

---

**Start Phase 0 now.** Call Gate A when Lightsail is on latest `main` and demo is healthy.
