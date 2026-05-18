# Content migration tracker (WooCommerce → Sarveda)

**Use with:** [`LAUNCH-REQUIREMENTS.md`](./LAUNCH-REQUIREMENTS.md) section F.  
**Rule:** Every URL that Google indexes must either **exist** on the new app or **301 redirect** before cutover.

---

## Migration workflow (per content type)

```
1. Inventory   → List all live URLs (WP export, sitemap, or crawl)
2. Decide      → Build page | 301 redirect | Archive (410 rarely)
3. Export      → CSV/XML from WooCommerce (you provide)
4. Import      → Prisma seed/script → RDS
5. Build UI    → Next.js route + API if missing
6. SEO         → metadata, canonical, JSON-LD, add to sitemap
7. Verify      → Side-by-side URL check + redirect test
8. Sign-off    → Mark row ✅ in this doc
```

---

## Priority order (recommended)

| Order | Type | Why |
|-------|------|-----|
| 1 | **Courses** | In main nav; revenue + SEO (`course-sitemap.xml`) |
| 2 | Events | Bookings; `event-sitemap.xml` |
| 3 | Insights / blog | Traffic + `post-sitemap.xml` |
| 4 | Corporate wellness | Marketing landing (often single page) |
| 5 | Vaidya / mentor / retreat | Directory SEO |
| 6 | Offers, testimonials, zoom | Lower priority or redirect |

---

## F3 — Courses (IN PROGRESS)

### WooCommerce source

- **Sitemap:** `https://sarveda.com/course-sitemap.xml`
- **Target URL:** `https://sarveda.com/course/{slug}` (must not change)
- **Prisma model:** `Course`, `Lesson`, `Enrollment`

### Fields to collect (per course)

| Field | Required | WooCommerce / meta key | Maps to |
|-------|----------|------------------------|---------|
| `slug` | ✅ | post_name | `Course.slug` |
| `title` | ✅ | post_title | `Course.title` |
| `description` | ✅ | post_content | `Course.description` |
| `priceInPaise` | ✅ | regular/sale price | `Course.priceInPaise` |
| `isFree` | ✅ | price = 0 | `Course.isFree` |
| `imageUrl` | 🟡 | featured image | `Course.imageUrl` |
| `status` | ✅ | publish → PUBLISHED | `Course.status` |
| `seoTitle` | 🟡 | Yoast title | `Course.seoTitle` |
| `seoDescription` | 🟡 | Yoast metadesc | `Course.seoDescription` |
| Lessons | 🟡 | curriculum plugin / meta | `Lesson[]` |

### Import checklist

| Step | Status | Notes |
|------|--------|-------|
| Export received from client | ✅ | `data/sarveda.WordPress.2026-05-18.xml` |
| Row count matches sitemap | ⬜ | |
| Slugs unique, match live URLs | ⬜ | |
| Images hosted (S3 or CDN URLs) | ⬜ | |
| Seed script run on staging RDS | ⬜ | |
| `GET /api/courses` | ✅ | |
| `/course/[slug]` + `/courses` | ✅ | Pay / enquire / both per course |
| Import script | ✅ | `npm run import:courses` in backend |
| Course JSON-LD | ⬜ | |
| Added to `sitemap.ts` | ⬜ | |
| 301s for any slug changes | ⬜ | N/A if slugs identical |

### Course inventory (from `data/sarveda.WordPress.2026-05-18.xml`)

**Source file:** `data/sarveda.WordPress.2026-05-18.xml` · **Parsed:** 2026-05-18  
**Total in XML:** 17 · **Published:** 15 · **Trashed (skip):** 2

| # | slug | title | INR (meta) | import ✅ | page ✅ |
|---|------|-------|------------|-----------|---------|
| 1 | introduction-to-vedanta | Introduction to Vedanta - Course by Dr R.V Giridhar | 0 (free) | ⬜ | ⬜ |
| 2 | yoga-therapy-course | Yoga Therapy Course | 6500+ (curriculum tiers) | ⬜ | ⬜ |
| 3 | nada-yoga | Nada Yoga- Primordial Sound Meditation | 14000 | ⬜ | ⬜ |
| 4 | sound-alchemy-online | Introduction to the Art & Science of Sound Therapy… Online | 10500 | ⬜ | ⬜ |
| 5 | sound-therapy-bangalore-3 | Sound Therapy & Nada Yoga Workshop - Bangalore | 16500 | ⬜ | ⬜ |
| 6 | sound-therapy-goa | Sound Therapy Workshop – Goa | 23500 | ⬜ | ⬜ |
| 7 | sound-therapy-fundamentals | Sound Therapy Fundamentals | 10499 | ⬜ | ⬜ |
| 8 | sound-therapy-delhi | Sound Healing… Workshop - Delhi | 19500 | ⬜ | ⬜ |
| 9 | sound-therapy-mumbai | Sound Healing… Workshop - Mumbai | 18000 | ⬜ | ⬜ |
| 10 | sound-therapy-bangalore | Sound Healing… Weekend Residential - Bangalore | 22500 | ⬜ | ⬜ |
| 11 | rhythmic-foundations | Rhythmic Foundations for Sound Practitioners | 8500 | ⬜ | ⬜ |
| 12 | qigong-fundamentals | Root & Breath – Qigong Fundamentals & Body Awakening | 8500 | ⬜ | ⬜ |
| 13 | sonic-odyssey-workshop-across-india | Sonic Odyssey Workshop- Across India | 3999 | ⬜ | ⬜ |
| 14 | sound-therapy-fundamentals-online | Sound Therapy Fundamentals (online) | 13500 | ⬜ | ⬜ |
| 15 | anunada-workshop | Anunada Workshop: Master the Art & Science of Sound Therapy | 0 | ⬜ | ⬜ |

**Skipped (trash):** `moving-beyond-asanas__trashed`, `yoga-philosophy-for-the-modern-minds__trashed`

**Extra WP fields (ACF) in XML — not in Prisma yet:** `video_link`, `duration`, `start_date`/`end_date`, `course_week_days`, `curriculum_*`, `course_detail_table_*`, USD prices.

---

## F4 — Events

| Item | Value |
|------|--------|
| Sitemap | `event-sitemap.xml` |
| URL | `/event/{slug}` |
| Models | `Event`, `Booking` |

### Fields to collect

`slug`, `title`, `description`, `startDate`, `endDate`, `venue`, `isOnline`, `zoomLink`, `priceInPaise`, `imageUrl`, `status`, `seoTitle`, `seoDescription`

### Status

| Step | Status |
|------|--------|
| Export received | ⬜ |
| Import + API + page | ⬜ |
| Sign-off | ⬜ |

---

## F5 — Insights / blog

| Item | Value |
|------|--------|
| Sitemap | `post-sitemap.xml`, `category-sitemap.xml` |
| URL | Confirm on live site: root `/{slug}` vs `/blog/{slug}` |
| Model | `BlogPost` |

**Action before import:** Open 3 live insight URLs and record exact path pattern.

### Status

| Step | Status |
|------|--------|
| URL pattern confirmed | ⬜ |
| Export received | ⬜ |
| Import + page | ⬜ |
| Sign-off | ⬜ |

---

## F9 — Corporate wellness

| Item | Value |
|------|--------|
| Likely type | WordPress **Page** (not course CPT) |
| URL | _Record from WP:_ |

### Questions for Arjun

1. Exact live URL?
2. One page or multiple (programs, contact, etc.)?
3. Forms (contact) — embed or link to external?

### Status

| Step | Status |
|------|--------|
| URL + scope confirmed | ⬜ |
| Copy + images provided | ⬜ |
| Static page or CMS | ⬜ |
| Sign-off | ⬜ |

---

## F6–F8 — Vaidya, mentor, retreat

| Type | Sitemap | URL |
|------|---------|-----|
| Vaidya | `vaidya-sitemap.xml` | `/vaidya/{slug}` |
| Mentor | `mentor-sitemap.xml` | `/mentor/{slug}` |
| Retreat | `retreat-sitemap.xml` | `/retreat/{slug}` |

Models exist in Prisma. API + pages not built.

---

## Low priority / redirect candidates

| Sitemap | Suggestion |
|---------|------------|
| `zoom-meetings-sitemap.xml` | 301 → relevant event or `/shop` |
| `testimonial-sitemap.xml` | Homepage section or skip |
| `ajp-products-sitemap.xml` | Verify if obsolete (2021) |
| `variables_post-sitemap.xml` | Audit — may be legacy |
| `offers_post-sitemap.xml` | Build `/offers/{slug}` or redirect |
| `author-sitemap.xml` | Redirect to shop or about |

---

## What to send when you export courses (from WooCommerce)

**Minimum (CSV or spreadsheet):**

1. One row per published course  
2. Columns: `slug`, `title`, `description_html`, `price_inr`, `sale_price_inr`, `featured_image_url`, `status`, `yoast_title`, `yoast_description`  
3. Optional second sheet: lessons (`course_slug`, `lesson_title`, `video_url`, `position`, `is_free`)

**Also helpful:**

- Link to `course-sitemap.xml` or total count (“we have N courses”)  
- Any course that uses a **different URL** than `/course/{slug}`  
- Courses that are **hidden/draft** (skip vs import as DRAFT)

---

## Sign-off template (end of migration)

```
Content type: Courses
Date:
Exported rows: ___
Imported rows: ___
Live URLs tested: ___ / ___
404s: 0
Redirects added: ___
SEO metadata: yes/no
Approved by:
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-16 | Created tracker; courses marked in progress |
