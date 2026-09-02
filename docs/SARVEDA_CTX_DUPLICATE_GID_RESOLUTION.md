# SARVEDA CTX Duplicate g:id Resolution & Manual Mapping Runbook

**Date:** 2026-09-01  
**Related:** `docs/SARVEDA_CTX_COMPATIBILITY_NATIVE_FEED_V1.md`, `docs/SARVEDA_GOOGLE_MERCHANT_ADS_NATIVE_COMPATIBILITY_AUDIT.md`

This document explains how we resolve **variant conflicts** (multiple historical CTX `g:id`s pointing at one Lightsail variant), **owner exclusions**, and **missing catalog imports** so the native PRODUCTS SOURCE 2 feed stays aligned with Google Merchant Center without duplicate Ads listings.

---

## Core rule: one PUBLISH g:id per LS variant

Google Merchant may list several historical Woo variation IDs (`g:id`) for what is now **one** native `ProductVariant`. The native feed must publish **exactly one** `g:id` per variant SKU to avoid double listings in Ads.

| Term | Meaning |
|------|---------|
| **Canonical PUBLISH id** | The CTX `g:id` that stays live in the feed for that variant |
| **Superseded id** | Older/duplicate CTX `g:id` for the same variant → `INTENTIONALLY_EXCLUDE` |
| **Bridge** | `CTX g:id` → DO `_lightsail_sku` → LS `ProductVariant.sku` |

When two CTX ids map to the same LS SKU, keep whichever is **already `PUBLISH`** in `MerchantCtxOffer` (usually the newer DO bridge id). Exclude the rest with `excludeReason: DUPLICATE_CTX_GID_SUPERSEDED`.

---

## Batch history

| Batch | File | What it did |
|-------|------|-------------|
| 1 | `ctx_manual_exclusions.json` | 21 bundle/strap offers excluded (ops lock) |
| 2 | `ctx_manual_decisions_batch2.json` | 18 manual PUBLISH maps + many NOT_IN_LS exclusions |
| **3** | `ctx_manual_decisions_batch3.json` | 9 conflict supersede + 3 mallet PUBLISH |
| **3b** | `ctx_manual_decisions_batch3b.json` | Fix: restore CTX 42903–42906 (Google Ads); supersede bridge ids 5783/44013/44012/5779 |

---

## Batch 3 decisions (2026-09-01)

### A. Variant conflicts — exclude superseded ids

Keep existing **PUBLISH**; exclude redundant CTX ids:

| Exclude | Keep PUBLISH | LS SKU | Product slug |
|--------:|-------------:|--------|--------------|
| 42900 | 44010 | CB-AD-SS-.5-B | copper-bottle-orange-light |
| 42901 | 44009 | CB-AD-SS-.5 | copper-bottle-orange-light |
| 42902 | 5782 | CB-AD-SS-B | copper-bottle-orange-light |
| 43492 | 43440 | CB-7C-V-B | 7-chakras-* bottles |
| 43493 | 43437 | CB-7C | 7-chakras-* bottles |
| 43494 | 43436 | CB-7C-B | 7-chakras-* bottles |
| 46163 | 8476 | YO-M-CT-7C-M-O | 7-chakras-yoga-mats |
| 46165 | 8474 | YO-M-CT-7C-M-P | 7-chakras-yoga-mats |
| 47883 | 47882 | MI-BT | box-tanpura (single variant; Male listing only) |

### B. Printed copper bottles — keep historical CTX ids for Google Ads

Owner **rows 76–79 on the original no_bridge sheet were Crystal Bowl Mallets** (49605–49607), now imported to LS — **not** pink/sunshine bottles.

Pink & Positive + Sunshine bottle variants stay in the feed under **historical CTX g:ids** (batch 3b correction):

| PUBLISH (Google Ads) | LS SKU | Product slug | Supersedes (exclude) |
|---------------------:|--------|--------------|---------------------|
| 42903 | CB-AD-SS | copper-bottle-orange-light | 5783 |
| 42904 | CB-AD-PP-.5-B | copper-bottle-pink-noble-toughts | 44013 |
| 42905 | CB-AD-PP-.5 | copper-bottle-pink-noble-toughts | 44012 |
| 42906 | CB-AD-PP-B | copper-bottle-pink-noble-toughts | 5779 |

| Row | CTX g:id | Type | LS SKU | Parent Woo |
|----:|---------:|------|--------|------------|
| 73 | 49605 | Ball Mallet | MI-CB-MA-B | 49604 |
| 74 | 49606 | Rimming Mallet | MI-CB-MA-R | 49604 |
| 75 | 49607 | Silicon Mallet | MI-CB-MA-S | 49604 |

- Native slug: `crystal-bowl-accessories` (matches Woo `/store/.../crystal-bowl-accessories/`)
- Prices/images/descriptions copied from live Woo Store API + CTX authoritative XML
- Feed retains historical CTX `g:id`s (49605–49607), not `gla_*`

---

## How to apply (Lightsail)

SSH to API host (`13.204.112.165`), `cd ~/sarveda/backend`:

```bash
# 1. Import product + variants (must run before publish decisions)
npm run import:crystal-bowl-mallets:apply

# 2. Apply batch 3 registry decisions
npx tsx scripts/apply-ctx-manual-decisions.ts --apply \
  --file=../docs/audit/google-merchant-native-compatibility/ctx_manual_decisions_batch3.json

# 3. Verify counts
npx tsx scripts/certify-ctx-compatibility-feed.ts

# 4. Regenerate manual-review Excel (optional)
# Export registry first, then:
python3 scripts/export-ctx-bridge-pending-xlsx.py
```

Expected post-batch-3 classification (Lightsail 2026-09-01):

| Classification | Count |
|----------------|------:|
| PUBLISH | 766 |
| INTENTIONALLY_EXCLUDE | 117 |
| MANUAL_REVIEW | 0 |
| **Registry total** | **883** |

Live feed XML items (`feed_published_items`): **764** (PUBLISH rows that pass active variant + price/image eligibility).

Full redirect map: `ctx_native_link_tracker_full.json` (764 links, regenerated from DB).

---

## Registry locks (do not overwrite accidentally)

Defined in `backend/src/modules/merchant/ctxOfferRegistry.ts`:

| `manualAction` | Effect |
|----------------|--------|
| `MANUAL_EXCLUDE_LOCK` | Re-classify must keep `INTENTIONALLY_EXCLUDE` |
| `MANUAL_MAP_LOCK` | Re-classify must keep `PUBLISH` + `sarvedaVariantId` |
| `OWNER_CONFIRMATION_PENDING` | Stays `MANUAL_REVIEW` until batch apply clears it |

Batch apply scripts set these locks when writing decisions.

---

## Native PDP links

Published offers link at runtime as:

```
https://sarveda.com/product/{slug}?offer={historical_ctx_g_id}
```

Tracker artifact: `docs/audit/google-merchant-native-compatibility/ctx_native_link_tracker.json`  
Legacy `/store/...` URLs need **301 redirects** separately (`frontend/next.config.js` + `legacy-woo-product-url.ts`).

---

## Troubleshooting

### Excel still shows `VARIANT_ALREADY_PUBLISHED`

The export script reads stale `ctx_bridge_apply_summary.json` for skip reasons. After batch apply, trust **live DB** classification from:

```bash
npx tsx scripts/certify-ctx-compatibility-feed.ts
```

Or query `MerchantCtxOffer` where `classification != 'PUBLISH'`.

### `VARIANT_CLAIMED_IN_BATCH` on apply

Two publish decisions target the same LS SKU in one batch. Only one `g:id` may PUBLISH per variant — split into exclude + single publish.

### Unique constraint on `sarvedaVariantId`

Only one registry row may reference a variant as PUBLISH. The apply script clears `sarvedaVariantId` on other rows before setting the canonical publish row.

### Mallet apply fails `LS_SKU_NOT_FOUND`

Run `import:crystal-bowl-mallets:apply` first. SKUs: `MI-CB-MA-B`, `MI-CB-MA-R`, `MI-CB-MA-S`.

### Feed count ≠ 883

883 is **registry total** (all CTX rows). Live XML includes **PUBLISH only** (~760–770). Excluded rows are intentional (bundles, inactive, superseded duplicates, not sold on LS).

---

## Key files

| Path | Purpose |
|------|---------|
| `ctx_manual_decisions_batch3.json` | Batch 3 decision source |
| `ctx_manual_decisions_apply.json` | Last apply run log |
| `ctx_native_link_tracker.json` | Links from last apply batch (merged on re-apply) |
| `ctx_native_link_tracker_full.json` | All 764 PUBLISH links regenerated from DB |
| `do_lightsail_sku_map.json` | CTX id → LS SKU bridge (includes 49605–49607) |
| `ctx_india_authoritative.xml` | 883-row Merchant Center snapshot |
| `import-crystal-bowl-mallets-from-ctx.ts` | Catalog import for mallets |
| `apply-ctx-manual-decisions.ts` | Apply publish/exclude/pending |
| `export-ctx-bridge-pending-xlsx.py` | Manual review workbook |

---

## Reverting a mistake

1. Find row in `ctx_manual_decisions_apply.json` or DB `MerchantCtxOffer`.
2. If wrong exclude: update row to `MANUAL_REVIEW`, clear `manualAction`, re-run bridge or manual map.
3. If wrong publish: exclude the id, publish the correct id in a new batch JSON, re-apply.
4. Never delete registry rows — CTX XML import must keep 883 accounting.

---

*Maintainer: Sarveda migration team. Update this doc when adding batch4+ decisions.*
