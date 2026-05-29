# Phase 0 runbook — catalog, prices, geo (before Monday)

**Goal:** New site matches WooCommerce on **product count, prices, shipping, images, and international currency** — with evidence, not guesswork.

**Date:** 29 May 2026

---

## What we verified in the repo (CSV audit)

| Check | Result |
|-------|--------|
| Parent products in `wc-products.csv` | **169** (145 published in export) |
| Variations | **1037** (~1069 sellable rows) |
| Missing INR price | **9** (mostly Lingam bowl variations + 2 Ocarina — fix in Woo or CSV) |
| Missing USD zone price | **21** SKUs |
| Missing GBP zone price | **17** SKUs |
| Audio in CSV | **Attachment IDs** (e.g. `42824`), not URLs — needs `sync:audio` + `migrate:media` |

**Risk:** If USD/GBP is empty, the app can show **$ / £ using INR amounts** (dangerous). Fix gaps before promoting international traffic.

```bash
python3 scripts/audit-catalog-csv.py
# or
cd backend && npm run audit:catalog
```

---

## Staging vs local

- **Code** deploys via `git push` → Vercel (frontend) + EC2 `git pull` (backend).
- **Data** scripts run on **EC2** against **RDS** (not on your laptop unless Docker Postgres is up).
- Admin **Catalog gaps:** https://sarveda-demo.xyz/admin/catalog-gaps (after login).

---

## EC2 checklist (run in order)

SSH: `ubuntu@13.206.192.106`, then:

```bash
cd ~/sarveda && git pull origin main
cd backend
npx prisma migrate deploy && npx prisma generate
npm install
```

### 1. Variant labels (Type / Size)

```bash
npm run import:variations
# dry-run first: npm run import:variations:dry
```

Uses `data/variations.xml`. **REQ-PROD-003**

### 2. Product galleries (all images)

```bash
npm run sync:galleries:dry
npm run sync:galleries
```

**REQ-PROD-002**

### 3. Audio samples (singing bowls, etc.)

```bash
npm run sync:audio:dry
npm run sync:audio
```

Then copy files to S3:

```bash
npm run check:s3
npm run migrate:media
```

**REQ-PROD-004** — Requires `AWS_S3_REGION=us-east-1` and keys in `backend/.env`.

### 4. Geo pricing (USD / GBP on browse)

Deploy latest frontend (middleware sets `sarveda_zone` from Vercel geo).

Test: US VPN → shop/PDP shows **$**; UK → **£**; India → **₹**.

**REQ-PAY-009**

### 5. Catalog gaps report

Open admin → **Catalog gaps**; export or screenshot pricing/shipping gaps; fix worst SKUs in admin or re-seed.

---

## What we need from you (Arjun / team)

| # | Item | Why |
|---|------|-----|
| 1 | **Fresh WooCommerce Products CSV** from **live sarveda.com** (full export, all columns) | Only way to guarantee prices match today’s live site |
| 2 | Confirm **EC2 SSH** or run the block above and paste console output | Data scripts don’t run from Cursor alone |
| 3 | **SendGrid API key** on EC2 (`SENDGRID_API_KEY`) | Phase 1 order emails |
| 4 | **Razorpay / Stripe / PayPal** test keys on demo | Phase 1 payment E2E |
| 5 | Optional: **5 SKUs** you care about most (e.g. Pulse Tubes sizes) | We’ll compare live Woo vs demo line-by-line |
| 6 | If audio still missing after `sync:audio`: **`data/media.xml`** or confirm `variations.xml` is complete | Resolves attachment IDs → MP3 URLs |

---

## Honest comparison: new site vs WooCommerce

| Area | Match Woo? | Notes |
|------|------------|--------|
| Product URLs `/product/[slug]` | ✅ | Preserved |
| Multi-zone prices in DB | ✅ | From CSV |
| Geo currency on browse | ✅ after deploy | Middleware + cookie; Woo did similar |
| Checkout / payments | ✅ Razorpay; ⚠️ Stripe/PayPal need E2E test | |
| Coupons | ✅ code exists | Test WELCOME10 on demo |
| Pincode on PDP | ❌ by design | Checkout/shipping API only (less clutter) |
| Zoho sync | ❌ | External / not in repo — defer |
| Course purchase | ❌ | Listing only; defer Monday |
| Reviews on PDP | ❌ | Placeholder |
| WhatsApp | ❌ | Needs WATI |

We are **not** cloning every Woo plugin — we are matching **revenue-critical shop behaviour** first, then polish.

---

## Monday path (after Phase 0)

1. **Phase 1** — India checkout E2E (Razorpay, COD, guest, coupons).
2. **Phase 2** — International Stripe/PayPal + SendGrid + one shipping AWB test.
3. **Phase 3** — Regression checklist + RTM Test Pass with order numbers.

---

## Commands reference

```bash
python3 scripts/audit-catalog-csv.py
cd backend && npm run import:variations:dry
cd backend && npm run sync:galleries:dry && npm run sync:audio:dry
```
