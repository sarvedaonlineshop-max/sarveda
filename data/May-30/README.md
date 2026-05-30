# May 30, 2026 WordPress exports

Used by `backend/scripts/migrate-may-30.ts` and `migration-paths.ts`.

| File | Purpose |
|------|---------|
| `sarveda.WordPress.2026-05-30-products-1.xml` | Products + **reviews** (largest products file) |
| `sarveda.WordPress.2026-05-30-orders-1.xml` | **4,362** `shop_order` records |
| `sarveda.WordPress.2026-05-30-orders.xml` | Small (stripe_order only) — ignored |
| `user-export-*.csv` | Customers for `npm run import:users` |
| `sarveda.WordPress.2026-05-30-refund.xml` | Refunds |
| Other `sarveda.WordPress.2026-05-30-*.xml` | CMS, coupons, variations, media |

Runbook: `docs/MIGRATION-MAY-30-RUNBOOK.md`

## Do not push this folder to GitHub

`orders-*.xml` contains **Stripe keys** in order meta. GitHub will block the push.

Copy to EC2 directly:

```bash
scp -i ~/.ssh/sarveda-key.pem -r data/May-30 ubuntu@13.206.192.106:~/sarveda/data/
```
