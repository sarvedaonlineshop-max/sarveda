# WordPress export files

| File | Contents | Import command |
|------|----------|----------------|
| `sarveda.WordPress.2026-05-29-media.xml` | **Media library** (~4154 attachments, MP3 samples) | Used by `npm run sync:audio` / `sync:galleries` (attachment ID → URL) |
| `sarveda.WordPress.2026-05-29-products.xml` | **Products** export (170 products + embedded attachments) | Reference / future re-seed; shop data still from `wc-products.csv` |
| `sarveda-courses.xml` | 15 published **courses** | `npm run import:courses` |
| `sarveda-events.xml` | 36 published **events** | `npm run import:events` |
| `pages.xml` | 7 marketing **pages** | `npm run import:pages` |
| `posts-latest.xml` | ~62 **blog / Insights** posts | `npm run import:posts` |
| `vaidya.xml` | Ayurvedic practitioners | `npm run import:vaidya` |
| `mentors.xml` | Mentors | `npm run import:mentors` |
| `retreats.xml` | Retreats | `npm run import:retreats` |
| `testimonials.xml` | Testimonials | `npm run import:testimonials` |
| `offers.xml` | Promo offers | `npm run import:offers` |
| `coupons.xml` | WooCommerce coupons | `npm run import:coupons` |
| `meetings and webinars.xml` | Zoom meetings | Not imported yet |
| `sarveda-variants.xml` | Product variations | **Skip** — use `wc-products.csv` |

## One-shot (EC2)

```bash
cd ~/sarveda/backend
npx prisma migrate deploy
npx prisma generate
npm run import:full    # all imports + coupons + corporate-wellness HTML seed
npm run migrate:media  # mirror WP/theme images to S3 (set AWS_* first)
npm run build && pm2 restart sarveda-backend --update-env
```

`import:full` = `import:all` + `import:coupons` + `seed:corporate`.

After `migrate:media`, set `AWS_CLOUDFRONT_URL` on EC2 and `NEXT_PUBLIC_MEDIA_CDN_URL` on Vercel to the same CDN base.

**S3 region:** If uploads fail with *"must be addressed using the specified endpoint"*, your bucket region does not match `AWS_REGION`.  
Example: bucket `sarveda-media` in **US East (N. Virginia)** → `AWS_S3_REGION=us-east-1` in `backend/.env`.  
Run `npm run check:s3` before `migrate:media`.

## Admin

After deploy: **https://sarveda-demo.xyz/admin/content** — edit pages, courses, events, blog, vaidyas, mentors, retreats, offers, testimonials.

### Not imported

| File | Reason |
|------|--------|
| `posts.xml` | Empty — use `posts-latest.xml` |
| `team member.xml` | Overlaps mentors |
| `quizs.xml`, `variablesw.xml`, `coupons.xml`, `media.xml`, ACF | Later |
| `orders.xml`, `users.csv` | **Never commit** |
