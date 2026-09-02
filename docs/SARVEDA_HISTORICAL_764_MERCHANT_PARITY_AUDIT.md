# SARVEDA Historical 764 Merchant Parity Audit

**Mode:** Read-only audit  
**Date:** 2026-09-01  
**Historical source:** `ctx_india_authoritative.xml` (883 offers)  
**Live feed:** `https://sarveda-demo.xyz/api/merchant/google/products-source-2.xml`  
**Database:** Lightsail cutover PostgreSQL  

---

## Executive Summary

```
ACTIVE SHOP SKUs: 796
HISTORICAL CTX-BACKED: 764
SHOP-ONLY NEW: 32

ADS CONTINUITY:
Identical: 764 / 764
Different: 0 / 764

ID:
Same: 764
Different: 0

PRODUCT TYPE:
Same: 764
Different: 0

ITEM GROUP:
Same: 764
Different: 0

CURRENT COMMERCE:
Price correct vs Sarveda: 764 / 764
Availability correct vs Sarveda: 764 / 764
Correct product landing: 764 / 764
Correct variant landing: 764 / 764

HISTORICAL DIFFERENCES:
Title changed: 577
Title identical: 187
Price changed: 568
Availability changed: 335
URL changed: 764
Image changed: 764

FULL_FEED_FIELD_IDENTICAL (informational): 0 / 764
```

These historical differences are **NOT failures** when the new Sarveda catalog intentionally changed.

---

## 1. Set Proof (796 = 764 + 32)

| Check | Value |
|-------|------:|
| Active shop SKUs (`shopInventoryWhere`) | 796 |
| Historical CTX-backed active offers (PUBLISH + linked + active) | 764 |
| Shop-only active SKUs (no PUBLISH registry) | 32 |
| **764 + 32 = 796** | ✅ YES |
| Live `products-source-2.xml` item count | 764 |
| Feed matches PUBLISH active linked | ✅ YES |
| PUBLISH rows without variant link | [7765, 9908] |

---

## 2. Ads Continuity Fields (764 historical offers)

| Field | Identical | Different | Missing |
|-------|----------:|----------:|--------:|
| g:id | 764 | 0 | 0 |
| g:item_group_id | 764 | 0 | 0 |
| g:product_type | 764 | 0 | 0 |

Duplicate new g:id values: **0**

All new g:id values are bare numeric Woo offer ids (not `gla_*`).

---

## 3. Title (informational — renames allowed)

| | Count |
|---|------:|
| Identical | 187 |
| Different | 577 |

Title differences are catalog renames, not Ads identity failures.

---

## 4. Price

| Comparison | Match |
|------------|------:|
| Old CTX == new feed | 196 |
| Old CTX != new feed (expected catalog updates) | 568 |
| **New feed == current Sarveda storefront** | **764 / 764** |
| New feed != current storefront (P0/P1) | 0 |

---

## 5. Availability

| Comparison | Match |
|------------|------:|
| Old CTX == new feed | 429 |
| Old CTX != new feed (expected stock drift) | 335 |
| **New feed == current Sarveda inventory** | **764 / 764** |
| New feed != current storefront | 0 |

---

## 6. Landing URLs & Canonical

| Check | Count |
|-------|------:|
| Correct native landing (product + variant) | 764 / 764 |
| Wrong product | 0 |
| Wrong variant | 0 |
| 404 / HTTP failure | 0 |
| Canonical `https://sarveda.com/product/{slug}` | 764 / 764 |

---

## 7. Images

| Check | Count |
|-------|------:|
| Primary image valid HTTPS | 764 / 764 |
| Missing | 0 |
| Invalid / dead | 0 |

---

## 8. Brand / Condition / Identifier

| Field | Same as contract |
|-------|------------------:|
| brand = Sarveda | 764 / 764 |
| condition = new | 764 / 764 |
| identifier_exists = no | 764 / 764 |

---

## 9. Parity Scores

| Metric | Score |
|--------|------:|
| **ADS_CONTINUITY_IDENTICAL** | **764 / 764** |
| ADS_CONTINUITY_DIFFERENT | 0 / 764 |
| **CURRENT_COMMERCE_PARITY** | **764 / 764** |
| CURRENT_COMMERCE_DIFFERENT | 0 / 764 |
| FULL_FEED_FIELD_IDENTICAL (informational) | 0 / 764 |

---

## 10. Difference Matrix

| Field | Same | Different | Notes |
|-------|-----:|----------:|-------|
| g:id | 764 | 0 | Ads continuity |
| g:item_group_id | 764 | 0 | Ads continuity |
| g:product_type | 764 | 0 | Ads continuity |
| title | 187 | 577 | Expected catalog change |
| price (CTX vs new) | 196 | 568 | Expected catalog change |
| price (new vs store) | 764 | 0 | Commerce parity |
| availability (CTX vs new) | 429 | 335 | Expected stock drift |
| availability (new vs store) | 764 | 0 | Commerce parity |
| link | 0 | 764 | Expected URL migration |
| canonical_link | 764 | 0 | Must be sarveda.com |
| image_link | 0 | 764 | Expected media migration |
| brand | 764 | 0 | |
| condition | 764 | 0 | |
| identifier_exists | 764 | 0 | |

---

## 11. Shop-Only SKUs (32)

Confirmed: **32** active shop SKUs have **no** historical CTX `g:id`.  
Artifact: `shop_only_32.csv`

These are candidates for **new** Merchant products (separate from historical 764).

---

## 12. Artifacts

| File | Description |
|------|-------------|
| `historical_764_parity_audit.csv` | Per-offer full audit (764 rows) |
| `historical_764_ads_continuity_mismatches.csv` | Ads continuity failures only (0 rows) |
| `shop_only_32.csv` | Shop-only SKUs without CTX history |
| `historical_764_parity_summary.json` | Machine-readable summary |

---

## 20. Verdict

**PERFECT ADS CONTINUITY — 764/764**

---

SARVEDA HISTORICAL 764 MERCHANT PARITY AUDIT COMPLETE — READY FOR REVIEW
