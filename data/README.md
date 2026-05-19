# WordPress export files

| File | Contents | Import command |
|------|----------|----------------|
| `sarveda-courses.xml` | 15 published **courses** | `npm run import:courses` |
| `sarveda-events.xml` | 36 published **events** | `npm run import:events` |
| `pages.xml` | 7 marketing **pages** | `npm run import:pages` |
| `vaidya.xml` | Ayurvedic practitioners | `npm run import:vaidya` |
| `mentors.xml` | Mentors | `npm run import:mentors` |
| `retreats.xml` | Retreats | `npm run import:retreats` |
| `testimonials.xml` | Testimonials (DB; homepage widget later) | `npm run import:testimonials` |
| `offers.xml` | Promo offers (`/offers/[slug]`) | `npm run import:offers` |
| `meetings and webinars.xml` | Zoom meetings | Not imported yet |
| `sarveda-variants.xml` | Product variations | **Skip** — use `wc-products.csv` |

Run from `backend/` **in this order**:

```bash
npx prisma migrate deploy
npx prisma generate
npm run import:all
# or step by step:
npm run import:courses && npm run import:events && npm run import:pages
npm run import:vaidya && npm run import:mentors && npm run import:retreats
npm run import:testimonials && npm run import:offers
```

### Not imported yet

| File | Reason |
|------|--------|
| `posts.xml` | Empty export — re-export **Posts** from WP for Insights/blog |
| `team member.xml` | Overlaps mentors — import manually if needed |
| `quizs.xml`, `variablesw.xml`, `coupons.xml`, `media.xml`, ACF files | Later phase |
| `orders.xml`, `users.csv` | **Never commit** — PII / payment keys |

### Skip

- `sarveda-variants.xml` — products already in DB from WooCommerce CSV
