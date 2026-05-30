# May 30, 2026 — WooCommerce → Sarveda demo migration

**Goal:** Replicate live Woo data on `https://sarveda-demo.xyz` (catalog, CMS, customers, orders, refunds, reviews). **SEO / 301 / DNS last** — do not change live `sarveda.com` SEO until sign-off.

**Data folder:** `data/May-30/` (WordPress exports + `user-export-*.csv`)

**Never commit `data/May-30/` to GitHub** — order XML includes Stripe API keys; user CSV has PII. Copy to EC2 with `scp` (see `data/May-30/README.md`). Push only migration **scripts** via git.

---

## Before you run (EC2)

```bash
cd ~/sarveda && git pull origin main
cd backend
npx prisma migrate deploy
npx prisma generate
```

Ensure `DATABASE_URL` points to **demo RDS** (not local dev if you intend to replace demo orders).

---

## One-shot migration

```bash
cd ~/sarveda/backend
npm run migrate:may-30
```

This runs in order:

1. **Flush** demo carts/orders/payments (does not delete products or CMS)
2. **Users** from `user-export-*.csv` (~535 customers; WP passwords not imported)
3. **CMS** — courses, events, pages, blog, vaidya, mentors, retreats, testimonials, offers, coupons, corporate seed
4. **Variant attributes** from `sarveda.WordPress.2026-05-30-variations.xml`
5. **Reviews** from embedded comments in `products-1.xml`
6. **Orders** from `orders-1.xml` (~4,362 shop orders)
7. **Refunds** from `refund.xml`
8. **Audio + galleries** sync from May-30 media/products XML

Dry run (no writes):

```bash
npm run migrate:may-30 -- --dry-run
```

Partial run:

```bash
npm run migrate:may-30 -- --only=users,orders --skip-flush
```

---

## Important limitation — order line items

The WordPress **Orders** export does **not** include product line items (no SKUs/qty per order in XML). Each imported order has:

- Correct totals, status, billing/shipping, payment method, customer link
- `wooLegacyMeta` JSON on the order row noting the gap

For **full line-item history**, export from WooCommerce:

**WooCommerce → Orders → Export** (CSV with line items) and share the file — we will add `import-orders-csv.ts` in a follow-up.

Until then, admin order detail shows header-level data matching Woo; line list may be empty for historical orders.

---

## Product catalog (optional refresh)

If you have a new **WooCommerce product CSV** with all price columns:

1. Copy to `backend/prisma/wc-products.csv`
2. On EC2: `npm run db:seed -- --products-only` (or full seed if instructed)

May-30 `products-1.xml` is used for **reviews** and media attachment IDs, not full catalog re-seed.

---

## Verify after migration

On EC2:

```bash
cd ~/sarveda/backend
npm run verify:migration
pm2 restart sarveda-backend --update-env
```

| Check | URL / action |
|-------|----------------|
| Order count ~4362 | Admin → Orders (numbers like `WOO-5325`) |
| Customers ~532 | Admin → **Customers** (after latest deploy) |
| Reviews on PDP | Product with reviews on live site |
| Courses/events | `/courses`, `/events` |
| Coupons | Checkout with `WELCOME10` |
| Content | Admin → Content |

---

## Monday checklist (team)

- [ ] EC2: `npm run migrate:may-30` completed without errors
- [ ] Arjun: spot-check 5 orders vs Woo admin (totals, status, email)
- [ ] Shiva: PDP reviews + cart/checkout still work for **new** orders
- [ ] Optional: Woo **Orders CSV** export for line items
- [ ] SEO: **not** until above signed off
