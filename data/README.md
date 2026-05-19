# WordPress export files

| File | Contents | Import command |
|------|----------|----------------|
| `sarveda-courses.xml` (or `sarveda.WordPress...xml`) | 15 published **courses** | `npm run import:courses` |
| `sarveda-events.xml` | 36 published **events** | `npm run import:events` |
| `pages.xml` | 7 marketing **pages** (9 WP system pages skipped) | `npm run import:pages` |
| `meetings and webinars.xml` | 7 Zoom meetings | Not imported yet — optional later |
| `sarveda-variants.xml` | 1036 WooCommerce **product variations** | **Skip** — products already seeded from `wc-products.csv` |

Run from `backend/` **in this order**:

```bash
npx prisma migrate deploy
npx prisma generate          # required after migrate — fixes import validation errors
npm run import:courses
npm run import:events
npm run import:pages
# or: npm run import:content
```

### Pending XML (not imported yet)

`posts.xml`, `vaidya.xml`, `mentors.xml`, `retreats.xml`, `offers.xml`, `testimonials.xml`, `quizs.xml`, `team member.xml`, `variablesw.xml`, `zoom meetings and webinars.xml`, etc. — tell us which type to wire next.

### Skip

- `sarveda-variants.xml` — products already in DB from WooCommerce CSV
- `coupons.xml`, `users.csv`, `orders` — later phase
