# WordPress export files

| File | Contents | Import command |
|------|----------|----------------|
| `sarveda-courses.xml` | 15 published **courses** | `npm run import:courses` |
| `sarveda-events.xml` | 36 published **events** | `npm run import:events` |
| `pages.xml` | 7 marketing **pages** | `npm run import:pages` |
| `posts-latest.xml` | ~62 **blog / Insights** posts | `npm run import:posts` |
| `vaidya.xml` | Ayurvedic practitioners | `npm run import:vaidya` |
| `mentors.xml` | Mentors | `npm run import:mentors` |
| `retreats.xml` | Retreats | `npm run import:retreats` |
| `testimonials.xml` | Testimonials | `npm run import:testimonials` |
| `offers.xml` | Promo offers | `npm run import:offers` |
| `meetings and webinars.xml` | Zoom meetings | Not imported yet |
| `sarveda-variants.xml` | Product variations | **Skip** — use `wc-products.csv` |

## One-shot (EC2)

```bash
cd ~/sarveda/backend
npx prisma migrate deploy
npx prisma generate
npm run import:full    # all imports + corporate-wellness HTML seed
npm run build && pm2 restart sarveda-backend --update-env
```

`import:full` = `import:all` + `seed:corporate` (fills `/corporate-wellness` — WP export has empty body, ACF-only).

## Admin

After deploy: **https://sarveda-demo.xyz/admin/content** — edit pages, courses, events, blog, vaidyas, mentors, retreats, offers, testimonials.

### Not imported

| File | Reason |
|------|--------|
| `posts.xml` | Empty — use `posts-latest.xml` |
| `team member.xml` | Overlaps mentors |
| `quizs.xml`, `variablesw.xml`, `coupons.xml`, `media.xml`, ACF | Later |
| `orders.xml`, `users.csv` | **Never commit** |
