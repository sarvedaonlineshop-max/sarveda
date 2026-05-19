# Sarveda WordPress → Custom Platform — Migration Status

**Last updated:** May 19, 2026 (demo wrap-up)

This tracks **content migration** for the staging demo (`https://sarveda-demo.xyz`).  
**Full production launch** (email, shipping, S3 media, 22 sitemaps, etc.) is tracked separately in `CLAUDE.md`.

---

## Done — demo-ready

| Area | Status | Notes |
|------|--------|--------|
| Products (169) + shop | ✅ | RDS via CSV seed |
| Cart, checkout, Razorpay | ✅ | Verify + webhook |
| Courses | ✅ | XML import + `/courses` + `/course/[slug]` |
| Events | ✅ | XML import + `/events` + `/event/[slug]` |
| Blog / Insights | ✅ | `posts-latest.xml` + `/insights` + `/[slug]` |
| Vaidya, mentors, retreats | ✅ | XML import + list + detail routes |
| Offers | ✅ | XML import + `/offers` + `/offers/[slug]` |
| Testimonials | ✅ | DB import (homepage still hardcoded — optional) |
| Corporate wellness | ✅ | React layout + theme image URLs |
| Program pages | ✅ | `/sahyog`, `/sargam`, `/samatva`, `/samsara` |
| CMS pages (7) | ✅ | `pages.xml` + `[slug]` fallback |
| Admin content | ✅ | `/admin/content` |
| Header / footer nav | ✅ | Events, Corporate, Insights added |

---

## Deploy checklist (before demo sign-off)

1. **Commit & push** (uncommitted corporate sub-pages + list pages + nav):
   - `frontend/app/[slug]/page.tsx`
   - `frontend/components/cms/CorporateProgramPage.tsx`
   - `frontend/components/cms/CorporateSharedSections.tsx`
   - `frontend/lib/corporate-program-pages-data.ts`
   - `frontend/app/vaidya|mentor|retreat|offers/page.tsx`
   - `frontend/lib/main-nav.ts`, `SiteHeader.tsx`, `SiteFooter.tsx`
2. **Vercel** — auto-deploy from `main` (~2 min).
3. **EC2** (if imports not run on prod DB):
   ```bash
   cd ~/sarveda && git pull origin main
   cd backend && npx prisma migrate deploy && npx prisma generate
   npm run import:full
   npm run build && pm2 restart sarveda-backend --update-env
   ```
4. **Smoke-test URLs:**
   - `/shop`, `/checkout` (test Razorpay)
   - `/corporate-wellness`, `/sahyog`, `/sargam`, `/samatva`, `/samsara`
   - `/events`, `/insights`, `/courses`
   - `/vaidya`, `/mentor`, `/retreat`, `/offers`

---

## Not migrated / deferred (acceptable for demo)

| Item | Reason |
|------|--------|
| Zoom meetings XML | Mostly test data |
| `coupons.xml`, `media.xml`, ACF fields | Phase 2 |
| `serenity-strength`, `corp` WP templates | Custom theme layouts — not in WXR body |
| Product images → S3 | Still WooCommerce/upload URLs in DB |
| Corporate images → S3 | Hot-linked from `sarveda.com` theme |
| Corporate contact form API | Mailto to `care@sarveda.com` only |
| Homepage testimonials from DB | Hardcoded in `app/page.tsx` |
| 22 SEO sitemaps | Launch week |
| Orders/users XML | Never import (PII) |

---

## Post-demo platform work (not “migration”)

- SendGrid + WATI notifications
- Shiprocket / pincode serviceability
- GST invoice PDFs
- Stripe/PayPal webhook hardening
- COD checkout
- Razorpay + Google OAuth env on `sarveda-demo.xyz`
- Settlement reconciliation UI

---

## Import commands

See `data/README.md`. One-shot: `npm run import:full` in `backend/`.
