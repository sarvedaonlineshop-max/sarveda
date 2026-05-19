# Migration status — May 19, 2026 (production wrap-up)

**SEO sitemaps / JSON-LD bulk work** → deferred to launch week.

Everything else for demo + production storefront is implemented in code. **Deploy + run scripts on EC2** to apply to live data.

---

## Completed in codebase

| Area | Status |
|------|--------|
| Products + shop + cart + checkout + payments | ✅ |
| Product PDP — attribute variant selectors, zone pricing, SKU, pincode shipping API | ✅ |
| Courses, events, blog, vaidya, mentors, retreats, offers | ✅ |
| Corporate wellness + 4 program pages | ✅ |
| Header/footer nav | ✅ |
| Homepage testimonials from DB | ✅ |
| Corporate contact form → SendGrid API | ✅ |
| Coupons import script | ✅ |
| Media migration script → S3 | ✅ (`npm run migrate:media`) |
| CDN-aware corporate + product image URLs | ✅ (`NEXT_PUBLIC_MEDIA_CDN_URL`) |

---

## EC2 deploy (run once per release)

```bash
cd ~/sarveda && git pull origin main
cd backend
npx prisma migrate deploy && npx prisma generate
npm run import:full          # content + coupons
npm run migrate:media        # requires AWS creds; ~30–60 min first run
npm run build && pm2 restart sarveda-backend --update-env
```

**Vercel:** set `NEXT_PUBLIC_MEDIA_CDN_URL` = your CloudFront URL (same as `AWS_CLOUDFRONT_URL`).

---

## Still manual / env-only

| Item | Action |
|------|--------|
| S3 + CloudFront | Bucket `sarveda-media` is **us-east-1** — set `AWS_S3_REGION=us-east-1` on EC2, run `npm run check:s3`, then `migrate:media` |
| SendGrid | `SENDGRID_API_KEY` on EC2 for order + corporate emails |
| WATI WhatsApp | Optional; email path already wired on orders |
| Razorpay/Google OAuth URIs | Dashboard for `sarveda-demo.xyz` |

---

## Deferred (not blocking storefront)

- 22 SEO sitemaps
- `serenity-strength` / `corp` custom WP templates (empty in WXR)
- Zoom meetings XML (test data)
- HTML body image URL rewrite inside long posts (optional second pass)
