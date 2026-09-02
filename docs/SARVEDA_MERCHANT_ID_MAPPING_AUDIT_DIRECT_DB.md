# Sarveda Merchant ID Mapping — Direct Woo DB Reconciliation

**Status:** READ-ONLY final pre-cutover reconciliation  
**Date:** 2026-08-31  
**Prior report:** `docs/SARVEDA_MERCHANT_ID_MAPPING_AUDIT.md` (Store API era) — **not repeated** here except where DB supersedes it.

**Safety:** SELECT / export only on Woo MySQL and Sarveda Postgres. No UPDATE/INSERT/DELETE/ALTER/migrate/backfill/feed registration/MC changes.

---

## Access confirmation

| System | Access | Result |
|--------|--------|--------|
| DigitalOcean Woo MySQL | SSH `root@134.209.146.175` → read `wp-config.php` → `SELECT` via PyMySQL on server | **YES — Direct Woo DB accessed** |
| Lightsail Sarveda Postgres | SSH + read-only Prisma export | **YES** |
| Merchant Center | Local TSV only (`products_2026-08-31_17-41-02.tsv`) | **Not modified** |

**Artifacts (read-only outputs):**

| File | Purpose |
|------|---------|
| `docs/audit/merchant_woo_sarveda_mapping.tsv` | Row-level Merchant → Woo → Sarveda map |
| `docs/audit/merchant_url_no_target.tsv` | Landing URLs with no Sarveda target |
| `docs/audit/merchant_parent_only_rows.json` | The 9 parent-only MC rows |
| `docs/audit/direct_db_summary.json` | Machine-readable totals |
| `/tmp/merchant_db_audit/woo_offers.csv` | Woo offer extract from MySQL |

---

## 1. Authoritative Woo extract (MySQL)

From `wp_posts` + `wp_postmeta` (+ attribute taxonomies):

| Population | Count |
|------------|------:|
| Product + variation posts | 1253 |
| **Offers** (simple + variation) | **1109** |
| Simple | 48 |
| Variation | 1061 |
| Variable parents | 144 |
| Offers `publish` | 1096 |

Statuses among offers: publish 1096, draft 9, trash 3, private 1.

---

## 2. Sarveda extract (Lightsail)

| Population | Count |
|------------|------:|
| Variants | 864 |
| With `Product.wooCommerceId` | 808 |
| ACTIVE+ACTIVE | 839 |
| Duplicate SKUs | 0 |

Still **no** `ProductVariant.wooCommerceVariationId`.

---

## 3–5. Matching + Merchant reconciliation (coverage)

Merchant TSV: **844** rows, all `gla_<n>`.

| Stage | Count | % of 844 |
|-------|------:|--------:|
| Merchant → Woo **exact** offer (variation/simple) | **835** | **98.93%** |
| Merchant → Woo as **variable parent** (not offer) | **9** | 1.07% |
| Merchant → Sarveda **high** confidence | **685** | **81.16%** |
| Merchant → Sarveda **medium** | **30** | 3.55% |
| Merchant → Sarveda **ambiguous** | **2** | 0.24% |
| Merchant → Sarveda **unmatched** | **127** | 15.05% |

### Match methods (high/medium successes)

| Method | Count |
|--------|------:|
| `parent_plus_attributes` | 615 |
| `sku_exact` | 41 |
| `simple_unique_under_parent` | 29 |
| `parent_plus_attr_values` | 20 |
| `parent_only_product_level` | 8 |
| `sku_exact_parent_mismatch` | 2 |

### Catalog context

| Metric | Count |
|--------|------:|
| Woo variations total | 1061 |
| Woo variations represented in MC | 797 |
| Sarveda variants total | 864 |
| Sarveda variants with Woo parent id | 808 |
| Sarveda-only / remapped SKU surface | large (see SKU section) |

**ID identity (unchanged from prior audit, now DB-backed):**  
variable `gla_<n>` = variation ID; simple `gla_<n>` = product ID; `item_group_id` = parent ID for variables.

---

## 6. Unmatched rows (127) — reasons

| Reason (`match_method`) | Count | Meaning |
|-------------------------|------:|---------|
| `unmatched_under_parent` | **97** | Parent exists on Sarveda (`wooCommerceId`) but attribute fingerprint did not uniquely match (renames / incomplete attrs / catalog reshape). Concentrated in ~20 parents (e.g. artistic copper bottles 6007, etched bowls 9795, grooved copper 6071, silk ring cushions 6988, shruthi plates 45485, …). |
| `no_parent_no_sku` | **20** | No `Product.wooCommerceId` and blank Woo SKU — cannot join. |
| `sku_not_in_sarveda_and_no_parent` | **9** | Woo has SKU but parent not on Sarveda and SKU not found. |
| `parent_only_no_sarveda` | **1** | Parent-only MC row with no Sarveda product (`Bamboo Rainstick` parent 7484 — parent `draft` in Woo; no Sarveda variants). |

**Not primarily “Merchant stale random IDs”:** 835/844 IDs still exist as live Woo offers.

---

## 7. The 9 parent-only Merchant rows

Google listed **variable parent** IDs as items even though variations also exist (and in most cases those variations are **also** in MC).

| Parent ID | Name | Parent status | Publish vars | Vars also in MC | Sarveda variants | Feed recommendation |
|----------:|------|---------------|-------------:|----------------:|-----------------:|---------------------|
| 7317 | Thunder Tube - Basic Edition | publish | 3 | 3 | 3 | Prefer **variation** offers; parent row redundant |
| 48428 | Native American Style Flutes | publish | 5 | 5 | 5 | Prefer variation offers |
| 7478 | Wooden Tambourines | publish | 2 | 2 | 2 | Prefer variation offers |
| 7484 | Bamboo Rainstick | **draft** | 4 | 0 | **0** | Review / likely drop parent legacy row |
| 45668 | Triad Crystal Bowl Set | publish | 3 | 3 | 3 | Prefer variation offers |
| 45654 | Crystal Pyramid | publish | 2 | 2 | 2 | Prefer variation offers |
| 7887 | Handcrafted Set of 7 Bowls… | publish | (see JSON) | yes | yes | Prefer variation offers |
| 7300 | Asalato/Kashaka Shaker | publish | yes | yes | yes | Prefer variation offers |
| 7370 | Coconut Maracas Shakers | publish | yes | yes | yes | Prefer variation offers |

Full detail: `docs/audit/merchant_parent_only_rows.json`.

**Do not transition yet** — for a compatibility feed, keep emitting variation `gla_<variationId>` rows; treat parent `gla_<parentId>` as optional legacy (8/9 have Sarveda product; 1 missing).

---

## 8. True SKU coverage (wp_postmeta `_sku`)

Store API did **not** invent the blank-SKU problem. Direct MySQL confirms:

| Metric | Count |
|--------|------:|
| Woo offers with SKU | **589** |
| Woo offers without SKU | **520** |
| Publish with SKU | 585 |
| Publish without SKU | 511 |
| Duplicate Woo SKUs | **0** |
| Exact SKU overlap with Sarveda | **43** |
| Sarveda-only SKUs | 821 |
| Woo-only SKUs | 546 |

**Conclusion:** SKU is clean when present (unique on Woo) but **sparse** and **mostly remapped** on Sarveda. Parent+attributes is the primary continuity bridge; SKU is supporting evidence only.

---

## 9. Mapping artifact

**File:** [`docs/audit/merchant_woo_sarveda_mapping.tsv`](audit/merchant_woo_sarveda_mapping.tsv)

Columns include:  
`merchant_id`, `merchant_item_group_id`, `merchant_title`, `merchant_link`, `woo_offer_id`, `woo_parent_id`, `woo_offer_kind`, `woo_status`, `woo_sku`, `woo_attributes`, `sarveda_product_id`, `sarveda_variant_id`, `sarveda_sku`, `sarveda_slug`, `match_method`, `match_confidence`, `notes`, `url_class`, `url_notes`.

This is **not** a DB import.

---

## 10. Backfill safety (`ProductVariant.wooCommerceVariationId`)

| Question | Result |
|----------|--------|
| Propose field | `wooCommerceVariationId Int? @unique` (no migration in this audit) |
| High-confidence auto pairs (1:1) | **683** |
| Manual / non-high residual | ~**153** Merchant rows (unmatched + ambiguous + parent-only edge + medium needing review) |
| One Woo offer → multiple Sarveda variants (high set) | **0** Woo-side dups |
| One Sarveda variant → multiple Woo offers (high set) | **2** Sarveda-side conflicts flagged — exclude from auto backfill until reviewed |
| Woo variation IDs recoverable from DB | **YES** |

---

## 11. Feed continuity verdict (not implemented)

| Pattern | Preservable? |
|---------|--------------|
| Variable: `id=gla_<wooVariationId>`, `item_group_id=<wooParentId>` | **YES** for **683–685** high-confidence mapped offers after backfill |
| Simple: `id=gla_<wooProductId>`, empty group | **YES** for mapped simples in that set |
| Full MC 844 | **~81% high** now; **~84%** if medium included carefully; **~15% unmatched** must not invent new IDs |

**Safe to implement compatibility feed?** **YES — for the high-confidence subset after backfill field + load.**  
**Not** safe to claim 100% MC coverage tonight without finishing the 127 unmatched.

---

## 12. Landing URL cross-check

Merchant links are overwhelmingly Woo paths like `/store/.../slug/` (not `/product/slug`). Sarveda storefront PDPs are `/product/{slug}`. Many parent slugs were also **renamed** on Sarveda (410/685 high rows: Woo `post_name` ≠ Sarveda slug).

| Class | Count | % of 844 |
|-------|------:|--------:|
| **DIRECTLY WORKS** (already `/product/{matching-slug}`) | **0*** | 0% |
| **NEEDS 301** | **742** | 87.9% |
| **NO TARGET** | **102** | 12.1% |
| AMBIGUOUS | 0 | 0% |

\*Under current routing: `/store` aliases to shop listing, **not** deep Woo category product permalinks. Even when the leaf slug exists on Sarveda, the Merchant URL path needs a **301 to `/product/{sarvedaSlug}`** (or equivalent rewrite). That is why almost all matched products are `NEEDS 301`, not `DIRECTLY WORKS`.

**NO TARGET (102 rows / 26 products):** no Sarveda product mapping (unmatched parents) — listed in `docs/audit/merchant_url_no_target.tsv` (e.g. artistic copper bottles under missing/unmatched parents, silk ring cushions, rainstick, some cushions/combos).

---

## 13. Final cutover verdict (A–T)

| # | Item | Result |
|---|------|--------|
| **A** | Direct Woo DB accessed | **YES** |
| **B** | Merchant rows | **844** |
| **C** | Merchant → Woo exact | **835 (98.93%)** (+9 parent-only) |
| **D** | Merchant → Sarveda high-confidence | **685 (81.16%)** |
| **E** | Ambiguous | **2** |
| **F** | Unmatched | **127 (15.05%)** |
| **G** | Woo SKU coverage | **589 / 1109 offers (53.1%)**; publish **585 / 1096** |
| **H** | Exact SKU overlap | **43** |
| **I** | Woo variation IDs recoverable | **YES** |
| **J** | Safe automatic backfill count | **683** 1:1 pairs |
| **K** | Manual-review count | **~153** MC rows |
| **L** | Duplicate-ID conflicts | Woo→SV **0**; SV→Woo **2** (review) |
| **M** | Parent-only Merchant rows resolved | **YES** (8 product-level on Sarveda; 1 missing/draft rainstick) |
| **N** | Existing Merchant IDs preservable | **~81% high / ~84% with careful medium** |
| **O** | Landing URLs directly working | **0** (as `/product` exact without rewrite) |
| **P** | Landing URLs needing 301 | **742** |
| **Q** | Landing URLs with no target | **102** |
| **R** | Safe to implement compatibility feed | **YES** (high-confidence subset **after** variation-ID backfill) |
| **S** | Safe to cut over Shopping **without pausing** | **NO** |
| **T** | Exact remaining blocker(s) | 1) No `wooCommerceVariationId` backfill yet  2) Compatibility feed not built/registered  3) **742 Merchant URLs need 301/rewrite** to `/product/{slug}`  4) **102 URLs / ~15% MC rows** unmatched on Sarveda  5) SKU remapping incomplete (not a blocker for ID emission if variation IDs backfilled) |

### Practical recommendation for tonight

1. **Do not** assume Shopping can ride DNS cutover untouched.  
2. Either **pause Shopping** until feed + URL 301s are live, **or** keep Woo reachable for feed/landing until Sarveda compatibility feed + redirects cover the 742+ paths.  
3. Next engineering (out of scope here): add `wooCommerceVariationId`, load the 683 high-confidence pairs from `merchant_woo_sarveda_mapping.tsv`, implement feed + slug 301 map from Merchant links / Woo `post_name` → Sarveda slug.

---

SARVEDA MERCHANT DIRECT-DB RECONCILIATION COMPLETE — READY FOR CUTOVER DECISION
