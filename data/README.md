# WordPress export files

| File | Contents | Import command |
|------|----------|----------------|
| `sarveda.WordPress.2026-05-18.xml` | 15 published **courses** | `npm run import:courses` |
| `sarveda-events.xml` | 36 published **events** | `npm run import:events` |
| `pages.xml` | 7 marketing **pages** (9 WP system pages skipped) | `npm run import:pages` |
| `meetings and webinars.xml` | 7 Zoom meetings | Not imported yet — optional later |
| `sarveda-variants.xml` | 1036 WooCommerce **product variations** | **Skip** — products already seeded from `wc-products.csv` |

Run from `backend/` after `npx prisma migrate deploy`.
