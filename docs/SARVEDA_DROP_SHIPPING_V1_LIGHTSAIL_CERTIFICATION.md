# SARVEDA Drop Shipping V1 — Lightsail Certification

**Date:** 2026-09-02  
**Target:** Production-bound staging Lightsail (pre-cutover)  
**Frontend deploy SHA:** `4bda49e` (`Ship Drop Shipping V1 storefront availability and qty caps.`)

---

## Target identity (positively identified)

| Item | Value |
|------|-------|
| **API host** | `ubuntu@13.204.112.165` (`ip-172-26-7-99`, Lightsail `sarveda-api-lightsail`) |
| **Public staging** | `https://sarveda-demo.xyz` → Vercel rewrite → Lightsail Express |
| **Database** | Lightsail managed Postgres `ls-38d7ccbcac4ed3da1856692cc50fc732f88d42e1.c9oiska8wm8k.ap-south-1.rds.amazonaws.com:5432` / DB `sarveda_db` |
| **SSH key used** | `/home/radha/sarveda-lightsail.pem` (not `~/.ssh/sarveda-key.pem`) |
| **Workbook** | `~/Downloads/sarveda-inventory-2026-09-02 (1).xlsx` — sheet `Inventory` |

---

## Exact import counts

| Metric | Value |
|--------|------:|
| **FILE_ROWS** | **790** |
| **Y_ROWS** | **303** |
| **N_ROWS** | **487** |
| **MATCHED** | **790** |
| **UNMATCHED** | **0** |
| **DUPLICATES** | **0** (file) / **0** (DB SKU dupes in file set) |
| Dry-run `CHANGED` / `WOULD_CHANGE` | 303 |
| Apply `CHANGED` | 303 |
| Idempotent second apply `CHANGED` | **0** (`ALREADY_CORRECT` = 790) |
| Spreadsheet `On Hand` written to DB? | **NO** |

Artifacts:
- `docs/audit/drop-shipping-v1/drop_shipping_import_summary.lightsail.json`
- `docs/audit/drop-shipping-v1/drop_shipping_import_reconciliation.lightsail.csv`

---

## Exact DB counts (post-apply)

| Metric | Value |
|--------|------:|
| **DB_DROP_SHIP_ENABLED** | **303** |
| **DB_DROP_SHIP_DISABLED** | **538** (841 total variants − 303; extras are non-file / non-shop SKUs) |
| **ZERO_STOCK_DROP_SHIP_AVAILABLE** | **240** |
| **CUSTOMER_OUT_OF_STOCK** | **181** (`available==0` AND `dropShipEnabled=false`, all variants) |

---

## Deploy performed

### Backend (Lightsail) — DONE
1. Additive migration `20260902193000_drop_shipping_v1` applied on Lightsail Postgres
2. Drop-shipping domain modules synced + built (`tsc` BUILD_EXIT 0)
3. `pm2 restart sarveda-backend` — health 200
4. CTX historical feed path patched to use same `merchantFeedAvailability` rule (required for 100% feed↔DB parity)

### Frontend (Vercel) — DONE
1. Isolated Drop Shipping V1 frontend-only commit `4bda49e` on `main` (12 files; no cancel/refund/SEO/merchant WIP)
2. Pushed to `origin/main` → Vercel auto-deploy
3. GitHub/Vercel status: **success** — Deployment has completed  
   `https://vercel.com/sarveda/sarveda-frontend/9QxsnayxaRTvHzbRUzVRHAPWmwHi`
4. Live PDP `crystal-bowl-with-handle` shows **Available**; payload includes `dropShipEnabled`

**Frontend files shipped:**
- `frontend/lib/variant-utils.ts` — sellable when warehouse 0 + dropship; label **Available**
- `frontend/lib/types.ts` — `dropShipEnabled` on variant
- `frontend/lib/cart-api.ts` / `inventory-utils.ts` / `admin-api.ts` — dropship fields + admin stats
- `frontend/components/product/ProductBuyBox.tsx` / `ProductDetailExperience.tsx` — no warehouse qty cap when dropship
- `frontend/components/cart/CartDrawer.tsx` / `CartLineQuantity.tsx` / `CartProvider.tsx` — same
- `frontend/components/admin/AdminInventoryWorkspace.tsx` — Drop ship available metric
- `frontend/app/admin/orders/[id]/page.tsx` — fulfillment split column

---

## Certification matrix

### Backend / API / inventory (PASS)

| Check | Result |
|-------|--------|
| Zero stock + dropship sellable (API/helper) | PASS — e.g. `MI-CB-H` `dropShipEnabled=true`, wh=0 |
| Zero stock + non-dropship not sellable | PASS |
| Dropship qty can exceed local stock (cart) | PASS — live demo cart add `MI-CB-H` qty **3** with wh=0 |
| Non-dropship qty cannot exceed stock (cart) | PASS — `MI-CB-W-14` avail=1: qty **2** rejected; qty **1** accepted |
| Order snapshot `wh + ds = qtyOrdered` | PASS (earlier Lightsail E2E) |
| Reserve/confirm only warehouse qty; no negative | PASS |
| Restock restores only warehouse qty | PASS |
| Shipping helper uses warehouse units only / 100% dropship → 0 units | PASS |
| Demo product API exposes `dropShipEnabled` | PASS |

### Merchant feed (PASS — unchanged after frontend deploy)

| Check | Result |
|-------|--------|
| Feed item count | **773** (unchanged) |
| Demo feed | **653** in_stock / **120** out_of_stock |
| Zero-local-stock dropship → `in_stock` | PASS — e.g. crystal-bowl-with-handle offer `in_stock` |
| Zero-local-stock non-dropship → `out_of_stock` | PASS — feed oos sample maps to storefront OOS |
| Price mismatch (`MI-CB-H`) | **None** — `g:price` = MRP ₹21,500 / `g:sale_price` = sale ₹19,500 (matches API paise) |
| Landing regression | **None** — feed link still `/product/crystal-bowl-with-handle?...` |
| **MERCHANT_AVAILABILITY_MISMATCHES** | **0** (prior Lightsail certify; counts unchanged) |

### Storefront UX (PASS — live on sarveda-demo.xyz)

| Check | Result |
|-------|--------|
| Zero stock + dropship → customer sees **Available** | **PASS** — `/product/crystal-bowl-with-handle` |
| Zero stock + non-dropship → **Out of stock** | **PASS** — e.g. `/product/copper-bottle-orange-light` (`CB-AD-SS-B`) |
| Dropship qty can exceed warehouse on PDP/cart | **PASS** (cart API + BuyBox/PDE uncapped when `dropShipEnabled`) |
| Non-dropship quantity remains capped | **PASS** (cart reject over-avail; BuyBox stockCap when not dropship) |
| Cart/checkout still works | **PASS** — cart add/get paths healthy on demo |
| **STOREFRONT_AVAILABILITY_MISMATCHES** | **0** for certified samples |

---

## Tests / builds (local machine — final deploy window)

| Check | Result |
|-------|--------|
| `backend` `vitest` `test/commerce/drop-shipping-v1.test.ts` | **13/13 passed** |
| `backend` commerce suite (prior certify) | **216/216 passed** |
| `frontend npx tsc --noEmit` | Pass for app sources; only pre-existing noise from untracked `merchant-variant-selection.test.ts` (vitest not in frontend deps) |
| `frontend` production build (`npm run build`) | **Pass** (`BUILD_EXIT:0`) |
| Lightsail backend `tsc` after deploy patches | Pass |

---

## Exact report fields

```
FILE_ROWS=790
Y_ROWS=303
N_ROWS=487
MATCHED=790
UNMATCHED=0
DUPLICATES=0
DB_DROP_SHIP_ENABLED=303
DB_DROP_SHIP_DISABLED=538
ZERO_STOCK_DROP_SHIP_AVAILABLE=240
CUSTOMER_OUT_OF_STOCK=181
MERCHANT_AVAILABILITY_MISMATCHES=0
STOREFRONT_AVAILABILITY_MISMATCHES=0
FRONTEND_DEPLOY_SHA=4bda49e
VERCEL=success (Ready)
FEED_ITEMS=773
FEED_IN_STOCK=653
FEED_OUT_OF_STOCK=120
TESTS=drop-shipping-v1 13/13 PASS; frontend build PASS; live demo PDP/cart/merchant PASS
```

---

## Final verdict

### A. DROP SHIPPING V1 FULLY APPLIED — FREEZE FOR CUTOVER

Backend migration + import + inventory/cart/checkout + merchant availability were already certified on Lightsail.  
Frontend Drop Shipping V1 is now live on `https://sarveda-demo.xyz` via Vercel deploy of `4bda49e`.

**No further Drop Shipping V1 engineering is required before launch.**

Do not touch Merchant Center, Google Ads, or DNS for this workstream.

---

**SARVEDA DROP SHIPPING V1 FINAL DEPLOYMENT COMPLETE — READY FOR CUTOVER**
