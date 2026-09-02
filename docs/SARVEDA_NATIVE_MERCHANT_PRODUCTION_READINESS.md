# SARVEDA NATIVE MERCHANT PRODUCTION READINESS

**Date:** 2026-08-31  
**Scope:** Production-bound Lightsail DB + API deploy/verify for native Merchant feed.  
**Hard stop:** Merchant Center / Google Ads / old Woo sources **not** modified. DNS **not** changed.

---

## A. Production DB identified

| Item | Value |
|------|--------|
| API host | Lightsail `ubuntu@13.204.112.165` (`sarveda-api-lightsail`) |
| Database | Lightsail managed Postgres `ls-38d7ccbcac4ed3da1856692cc50fc732f88d42e1.c9oiska8wm8k.ap-south-1.rds.amazonaws.com:5432` / DB `sarveda_db` |
| Role | **Sole Next.js/Express cutover database** (same instance previously used for staging validation). Old EC2 `13.206.192.106` is unreachable / retired. |
| Public site today | `sarveda.com` still serves **WordPress** (DigitalOcean). `sarveda-demo.xyz` is Vercel frontend → this API. |

There is **no separate second production Postgres** for the new stack. Preflight therefore validates this Lightsail DB as the production cutover target.

---

## Preflight (before further writes)

Dry-run (`backfill-merchant-identity.ts --dry-run`) against production-bound DB:

| Check | Result |
|------:|--------|
| Source rows | 844 |
| HIGH rows | 685 |
| Preflight-safe 1:1 | **681** |
| Already correct | **681** |
| To write | **0** |
| Duplicate Woo / Sarveda targets | **0 / 0** |
| `gla_*` continuity on accepted set | **681/681** |
| Conflicts / material discrepancy vs staging | **None** |

**Expected production backfill count before apply: 0 new writes** (already applied earlier in this cutover program). Safe to proceed.

---

## Checklist

| # | Item | Result |
|---|------|--------|
| **A** | Production DB identified | **YES** — Lightsail Postgres above |
| **B** | Production preflight expected mappings | **681** safe / **0** new writes needed |
| **C** | Migration applied | **YES** — `20260831180000_product_variant_woo_commerce_variation_id` |
| **D** | Production identities backfilled | **681** assigned |
| **E** | Idempotency | **PASS** — second `--apply` wrote **0** |
| **F** | Duplicate identities | **0** |
| **G** | NULL identities remaining | **183** / 864 variants |
| **H** | Production feed deployed | **YES** — `GET /api/merchant/google/products.xml` on Lightsail (nginx → Node) |
| **I** | `MERCHANT_FEED_SITE_URL` | **`https://sarveda.com`** |
| **J** | Feed HTTP status | **200** |
| **K** | Feed Content-Type | **`application/xml; charset=utf-8`** |
| **L** | Feed item count | **670** |
| **M** | Variable/grouped count | **637** |
| **N** | Simple count | **33** |
| **O** | In-stock count | **351** |
| **P** | Out-of-stock count | **319** |
| **Q** | Historical `g:id` exact matches | **670/670** in-feed (**0** mismatches); 11 backfilled inactive offers correctly omitted |
| **R** | Historical `g:id` mismatches | **0** |
| **S** | `item_group_id` exact matches | **637/637** |
| **T** | `item_group_id` mismatches | **0** |
| **U** | Duplicate `g:id` | **0** (670 unique) |
| **V** | `sarveda.com` product links | **670/670** begin `https://sarveda.com/product/` |
| **W** | `sarveda-demo.xyz` links | **0** |
| **X** | `/store` links emitted | **0** |
| **Y** | HTTPS image count | **670/670** |
| **Z** | Invalid image count | **0** |
| **AA** | XML validation | **PASS** (RSS + `xmlns:g`, live fetch) |
| **AB** | Price consistency | **PASS** (sampled `gla_5713`, `gla_7810`, `gla_10261`, `gla_5944` match DB `saleInPaise`/`mrpInPaise`) |
| **AC** | Availability consistency | **PASS** (same samples vs `onHand - reserved`) |
| **AD** | Legacy URL compatibility present | **CODE IN WORKSPACE ONLY** — `frontend/lib/legacy-woo-product-url.ts` + middleware changes are **not** on Vercel/`sarveda-demo.xyz` yet (deep `/store/...` → **404**). Not live on `sarveda.com` (still WordPress). |
| **AE** | Tracking parameter preservation present | **Same as AD** — implemented locally with allowlist; **not deployed** to live frontend |
| **AF** | External `sarveda.com` PDP validation | **PENDING** — DNS still WordPress; no DNS change performed |
| **AG** | Merchant Center changed | **NO** |
| **AH** | Google Ads changed | **NO** |
| **AI** | Old Woo source changed | **NO** |
| **AJ** | Payments/orders/accounting changed | **NO** |
| **AK** | Ready for DNS cutover | **CONDITIONAL YES** — API/DB/feed ready; **frontend must ship legacy `/store` 301 layer + point `FRONTEND_URL`/`NEXT_PUBLIC_SITE_URL` at `https://sarveda.com` before/at cutover** |
| **AL** | Ready to connect native feed to existing Merchant Center | **NO** — wait for final cutover review + frontend/DNS readiness |
| **AM** | Remaining blocker(s) | 1) Deploy frontend legacy Woo URL compatibility to Vercel. 2) DNS still on WordPress. 3) Set production frontend env to `sarveda.com`. 4) Do not attach feed to MC until approved. 5) 183 NULL-identity / Phase-4 new IDs. 6) 163 residual recon rows. |

---

## Sample production feed items (commerce-matched)

| Sample | `g:id` | Notes |
|--------|--------|--------|
| A Simple | `gla_5713` | No `item_group_id`; link `/product/handheld-natural-coconut-shaker`; sale 990.00 INR |
| B Variable | `gla_7810` | `item_group_id=5042`; sale 265.00 INR |
| C Many variants | group `8846` (**64** offers); sample `gla_10261` → `/product/wind-gong-etched` |
| D Sale price | `gla_7810` | `g:price` 299.00 + `g:sale_price` 265.00 |
| E Out of stock | `gla_5944` | `out_of_stock`; group `5495` |

All five: feed price/availability matched DB at validation time; links use `https://sarveda.com/product/...`.

---

## Security / regression

- Feed endpoint: **GET only**, no auth, no mutation, no session personalization  
- Unchanged by this phase: checkout, orders, payments (Razorpay/Stripe/PayPal/COD), webhooks, accounting, GST, inventory writes, shipping/Delhivery, customer/admin auth  

---

## Production sequence note

Migration + identity backfill were already applied to this Lightsail DB during the approved V1 program. This readiness pass **re-validated** dry-run/idempotency, set **`MERCHANT_FEED_SITE_URL=https://sarveda.com`**, restarted the API, and re-validated the live XML. No Merchant Center action taken.

Artifacts:

- `docs/audit/merchant_production_feed_validation.json`
- `docs/audit/merchant_feed_prod_site_url_diagnostics.json` (if present)
- Live: `http://13.204.112.165/api/merchant/google/products.xml` (and nginx `:80`)

---

SARVEDA NATIVE MERCHANT PRODUCTION READINESS COMPLETE — READY FOR FINAL CUTOVER REVIEW
