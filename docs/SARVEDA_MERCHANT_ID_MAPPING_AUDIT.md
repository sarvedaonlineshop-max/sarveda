# Sarveda Merchant ID Continuity Audit

**Status:** READ-ONLY — no code, database, Merchant Center, or configuration changes were made.  
**Date:** 2026-08-31  
**Merchant export:** `/home/radha/Downloads/products_2026-08-31_17-41-02.tsv` (844 rows, all `gla_*` IDs)

---

## 0. Data sources & access limits

| Source | How accessed | Notes |
|--------|----------------|-------|
| **Merchant Center export** | Local TSV (today) | 844 products; columns include `id`, `item group id`, `link`, `title`, … |
| **Old WooCommerce (DigitalOcean MySQL)** | **Not reachable via SSH from this machine** (`root@134.209.146.175` → `Permission denied` with available PEMs; MySQL port closed externally) | Live catalog extracted read-only via **Woo Store API** on `https://sarveda.com` (`/wp-json/wc/store/v1/...`), which is served from the same DO WordPress/MySQL catalog. |
| **New Sarveda (Lightsail Postgres)** | Read-only Prisma export on `ubuntu@13.204.112.165` | 864 variant rows exported to `/tmp/merchant_id_audit/sarveda_variants_audit.csv` |
| **WXR (supplementary only)** | `data/variations.xml`, products WXR | Used only to test SKU overlay; **not** used as source of truth for IDs |

Working artifacts (local temp, not committed): `/tmp/merchant_id_audit/`  
(`woo_store_offers.csv`, `sarveda_variants_audit.csv`, `mc_id_proof_rows.csv`, `summary.json`)

**Important:** Direct MySQL on DO was not available for this audit. ID conclusions for `gla_*` are proven against the **live Woo Store API offer IDs** (variation ID / simple product ID). `_sku` meta coverage on Woo is incomplete in Store API (many blank SKUs); full SKU backfill still needs DO MySQL or authenticated WC REST when SSH is restored.

---

## 1. OLD Woo catalog extract (live Store API)

| Population | Count |
|------------|------:|
| Simple products | 39 |
| Variable parents | 121 |
| Variations | 1057 |
| **Sellable offer rows** (simple + variation) | **1096** |

Per offer fields captured: parent ID, variation ID (if any), offer ID, SKU (when present), name, attributes, stock flag, permalink.

**SKU anomalies (Woo Store API):**

| Issue | Count |
|-------|------:|
| Blank SKU on offer | **468** |
| Distinct SKUs | 599 |
| Duplicate SKU keys | 13 (42 rows) |

---

## 2. NEW Sarveda catalog extract (Lightsail)

| Population | Count |
|------------|------:|
| Variant rows | 864 |
| With non-empty SKU | 864 |
| Parent has `Product.wooCommerceId` | 808 |
| ACTIVE variant + ACTIVE product | 839 |
| Duplicate SKUs | **0** |

**Schema note:** `Product.wooCommerceId` exists (parent Woo product ID). **`ProductVariant` has no Woo variation ID field.**

---

## 3. Match by SKU (Woo ↔ Sarveda)

| Metric | Count | Notes |
|--------|------:|-------|
| Unique Woo SKUs (non-blank) | 599 | |
| Unique Sarveda SKUs | 864 | |
| **Exact SKU overlap** | **44** | Very low |
| Unmatched Woo offer rows (no Sarveda SKU) | 581 | Includes blank-SKU offers |
| Unmatched Sarveda variant rows | 820 | |
| Blank Woo SKU offers | 468 | |
| Duplicate Woo SKUs | 13 keys | |
| Duplicate Sarveda SKUs | 0 | |

**Conclusion:** SKU is **not** a reliable primary bridge between live Woo offers and Sarveda variants today. Many Woo variations expose empty SKU in Store API; Sarveda SKUs often differ from live Woo SKUs even when both are present (only 44 intersect).

Parent ID check on the small SKU-matched set: Sarveda `wooCommerceId` agreed with Woo parent on **45/47** join rows (2 disagreements on copper-bottle SKUs).

---

## 4. Merchant ID test — conclusive result

### Raw Merchant facts

| Metric | Value |
|--------|------:|
| Merchant rows | **844** |
| IDs matching `gla_<digits>` | **844 / 844 (100%)** |
| Unique numeric IDs | 844 |

### Hypothesis results

| Hypothesis | Result | Evidence |
|------------|--------|----------|
| **A. Variable products:** `gla_<n>` == Woo **variation** ID | **CONFIRMED** | **797 / 797** MC rows that resolve to Store `type=variation` have `n == variation.id` (**0 misses**) |
| **B. Simple products:** `gla_<n>` == Woo **product** ID | **CONFIRMED** | **38 / 38** MC rows that resolve to Store `type=simple` have `n == product.id` (**0 misses**) |
| **C. `item_group_id` == Woo parent product ID** | **CONFIRMED for variables** | **797 / 797** variable MC rows: `item group id` == variation’s `parent`. **All 38 simples have empty `item group id`.** |

### Coverage of MC → Woo offer

| Outcome | Count | % of 844 |
|---------|------:|--------:|
| MC numeric ID found as Woo variation or simple offer | **835** | **98.9%** |
| MC numeric ID **not** in variation/simple offer list | **9** | 1.1% |

**The 9 exceptions** (`gla_7317`, `48428`, `7478`, `7484`, `45668`, `45654`, `7887`, `7300`, `7370`): fetching each ID on Store API returns **`type=variable` parent** (not a variation). So Google listed **parent product IDs** for those rows (empty `item group id`). They are **not** counterexamples to A/B; they are a third pattern: **`gla_<parentId>` for some variable parents**.

### Sample evidence (pattern holds across the file; 835 proof rows written)

| Merchant `id` | Numeric | Woo kind | Woo variation/product ID | `item group id` | Woo parent |
|---------------|--------:|----------|--------------------------|-----------------|----------:|
| `gla_43497` | 43497 | variation | 43497 | 5489 | 5489 |
| `gla_9536` | 9536 | variation | 9536 | 9529 | 9529 |
| `gla_10020` | 10020 | variation | 10020 | 10008 | 10008 |
| `gla_8078` | 8078 | variation | 8078 | 8058 | 8058 |
| `gla_7456` | 7456 | simple | 7456 | *(empty)* | 7456 |
| `gla_48931` | 48931 | simple | 48931 | *(empty)* | 48931 |

**Verdict:** Google for WooCommerce item IDs are **`gla_` + WooCommerce post ID of the offered item** (variation ID for variables, product ID for simples), with rare parent-only rows. **`item_group_id` is the Woo parent product ID** for variable offers.

---

## 5. Coverage — Merchant → Woo → Sarveda

| Stage | Count | % of MC (844) |
|-------|------:|-------------:|
| Merchant rows total | 844 | 100% |
| Merchant IDs mapped to Woo offer (var/simple) | 835 | 98.9% |
| Merchant IDs that are variable **parents** (not offers) | 9 | 1.1% |
| MC → Sarveda via **SKU only** (unique) | **47** | **5.6%** |
| MC → Sarveda via **parent `wooCommerceId` + normalized attributes** (+ SKU within parent) | **678** | **80.3%** |
| Unmapped / incomplete to Sarveda (after parent+attr) | 166 | 19.7% |
| Ambiguous attribute matches | 2 | — |
| MC missing Sarveda parent (`wooCommerceId`) | 29 | — |
| New Sarveda-only variants (no Woo SKU overlap) | ~820 rows | catalog drift |

**Breakdown of the 80.3% parent+attr mapping:**

| Path | Count |
|------|------:|
| Variable, unique attribute fingerprint | 643 |
| Variable, SKU within same parent | (included in improved pass; see stats) |
| Simple, unique/default variant | 35 |
| Variable unmatched attrs | 126 |
| No Sarveda parent | 29 |
| MC parent-only IDs | 9 |
| Attribute ambiguous | 2 |

Attribute mismatches are mostly naming drift (e.g. Woo `Cleaning Brush` vs Sarveda `Coconut Fiber Brush`, size text `9 in` vs `9 Inches`) — fixable in a backfill script, not a Merchant ID problem.

---

## 6. Feed ID strategy (do **not** implement yet)

### Safe ID emission (once mapping exists on Sarveda)

| Case | Emit |
|------|------|
| Variable / variation offer | `id = "gla_" + wooVariationId` |
| Simple product | `id = "gla_" + wooProductId` |
| Rare parent-only MC rows | Prefer emit variation offers instead; if retaining parent rows, `id = "gla_" + wooParentId` only for those historical 9 |

### `item_group_id`

**Yes — preserve for variable products:**

`item_group_id = Woo parent product ID`  
(= existing `Product.wooCommerceId` when that field is correct)

Simples: leave `item_group_id` empty (matches current MC).

### Can Sarveda emit this **tonight** without a new DB field?

**Not safely for the full catalog.** Emitting `gla_` + UUID or `gla_` + Sarveda-only SKU would **create duplicates** or **orphan** existing Shopping history. Emitting correct `gla_` IDs requires knowing each variant’s Woo offer ID.

---

## 7. Database storage decision (recommendation only — **no migration created**)

### Recommendation: **YES — persist Woo variation ID before feed implementation**

Minimal additive field:

```prisma
// ProductVariant
wooCommerceVariationId Int? @unique
```

- **Simple products:** store the same Woo product ID on the single variant’s `wooCommerceVariationId` **or** treat “simple” as `Product.wooCommerceId` only and use that for `gla_` (both match MC). Prefer storing offer ID on the variant for one code path: `id = "gla_" + wooCommerceVariationId`.
- Keep existing `Product.wooCommerceId` as **parent / item_group_id**.

### Can it be backfilled from Old Woo → SKU → Sarveda SKU?

**Not safely as the primary method** (only ~5.6% MC continuity via SKU today).

**Safer backfill order:**

1. **Preferred when DO SSH/MySQL available:** dump `wp_posts` + `wp_postmeta._sku` for `product` / `product_variation` → map to Sarveda by SKU **after** aligning SKUs, **or** by `Product.wooCommerceId` + attribute fingerprint.  
2. **Available now (partial):** live Store API offer list (`id`, `parent`, attributes, sku) → match Sarveda via `wooCommerceId` + attributes (~80% MC rows in this audit).  
3. **Do not** invent new `gla_` IDs for unmatched rows; leave them out of the first feed or resolve manually.

---

## 8. Pre-cutover risk

### Continuity verdict: **SAFE WITH BACKFILL**

| Layer | Status |
|-------|--------|
| Understanding of Merchant `gla_*` IDs | **SAFE** — proven |
| Preserving IDs in a future Sarveda feed | **SAFE WITH BACKFILL** of Woo offer/variation IDs onto variants |
| SKU-only backfill | **Insufficient** |
| Shipping a feed **tonight** without backfill | **BLOCKED** for continuity (would risk duplicates or wrong IDs) |
| DNS cutover of `sarveda.com` storefront URLs | Separate from ID mapping; MC links today still use Woo `/store/...` paths — landing URL rewrite is an additional cutover risk |

### What must happen before / around cutover tonight

1. **Do not** register a Sarveda feed that uses new UUIDs/`gla_`+SKU as `id` while old MC products remain.  
2. **Do** plan Shopping continuity: pause Shopping **or** keep Woo feed alive on a temporary host **or** ship a compatibility feed only after variation-ID backfill.  
3. **Restore DO SSH/MySQL access** (or WC authenticated API) ASAP to finish SKU + variation-ID backfill at high confidence.  
4. Add `ProductVariant.wooCommerceVariationId` (migration **after** this audit, when approved) and backfill.  
5. Expect ~1% MC rows that are parent IDs — handle explicitly.  
6. Landing URLs in MC still point at Woo `/store/...` permalinks; after DNS cutover those paths must 301 to Sarveda PDPs or ads will break even if IDs are perfect.

---

## 9. Answers (short)

| Question | Answer |
|----------|--------|
| Does `gla_<n>` = Woo variation ID (variables)? | **Yes** (797/797) |
| Does `gla_<n>` = Woo product ID (simples)? | **Yes** (38/38) |
| Does `item_group_id` = Woo parent ID? | **Yes** for variables (797/797); empty for simples |
| Can feed emit `gla_` + wooVariationId / wooProductId? | **Yes, after IDs are stored/mapped on Sarveda** |
| Must `item_group_id` be preserved? | **Yes** for variables |
| Persist `wooCommerceVariationId`? | **Yes (recommended)** |
| Backfill via SKU alone? | **No — insufficient; use parent+attributes and/or DO MySQL** |

---

## 10. Document control

- **Type:** Read-only DB/API comparison audit  
- **Code / DB / MC changes:** None  
- **Blocker for direct DO MySQL:** SSH key for `root@134.209.146.175` not available on this workstation  

---

SARVEDA MERCHANT ID MAPPING AUDIT COMPLETE — READY FOR REVIEW
