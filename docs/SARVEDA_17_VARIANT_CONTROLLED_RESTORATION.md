# SARVEDA — Controlled restoration of 17 accidentally INACTIVE variants

**Date:** 2026-09-03  
**Mode:** RESTORE + CERTIFY ONLY  
**Precondition:** Variant Save Safety Fix deployed (`dded6f3` / Lightsail on `4d11aa6`)  
**Constraint:** Status-only repair. No price / SKU / inventory qty / dropship / category / Merchant registry / Ads / DNS changes.

---

## Verdict

# A. 17 VARIANTS RESTORED — 790 CATALOG/MERCHANT BASELINE RESTORED

| Metric | Value |
|--------|------:|
| SOURCE_ROWS | **17** |
| ELIGIBLE_TO_RESTORE (dry-run) | **17** |
| RESTORED | **17** |
| MANUAL_REVIEW | **0** |
| MISSING | **0** |
| TEST_VARIANTS_IN_SET | **0** |
| FEED_BEFORE | **773** |
| FEED_AFTER | **790** |
| HISTORICAL_AFTER | **764** (= 747 + 17) |
| NATIVE_AFTER | **26** |
| ACTIVE_ON_VISIBLE_PRODUCTS | **790** |
| VARIANT_SAVE_REGRESSION | **PASS** |
| OMIT_PATH_SAFE | **PASS** |
| P0 | **0** |

---

## ROOT / SCOPE

Authoritative set from [`docs/SARVEDA_17_VARIANT_INACTIVE_CAUSE_INVESTIGATION.md`](SARVEDA_17_VARIANT_INACTIVE_CAUSE_INVESTIGATION.md) (SKUs + historical `g:id`s). Variant UUIDs locked from prior Merchant 790 certification / recon JSON.

| Family | Count |
|--------|------:|
| 11 Note Tongue Drum | 2 |
| Yoga Mats-Lotus | 7 |
| Angel Tuning Forks | 2 |
| Zafu & Zabuton Combo - Plain | 4 |
| Zafu & Zabuton Combo - Lotus Embroidery | 2 |
| **Total** | **17** |

**Not restored:** any other `INACTIVE` rows; the 4 known internal test variants.

### Known test variants (explicitly excluded)

| SKU | Variant ID | Parent | Status after restore |
|-----|------------|--------|----------------------|
| MI-TP-BL-SM | `431febda-…` | `test-product` (catalogHidden) | INACTIVE |
| MI-TP-BL-LG | `6a5f4671-…` | same | INACTIVE |
| MI-TP-RD-SM | `a425ec2e-…` | same | INACTIVE |
| MI-TP-RD-LG | `3c0d7684-…` | same | INACTIVE |

`TEST_VARIANTS_IN_SET=0` — none of the 17 match these IDs/SKUs.

---

## METHOD

Script: [`backend/scripts/restore-accidentally-inactive-variants.ts`](../backend/scripts/restore-accidentally-inactive-variants.ts)

```bash
npx tsx scripts/restore-accidentally-inactive-variants.ts --dry-run
npx tsx scripts/restore-accidentally-inactive-variants.ts --apply
```

- Dry-run preflight: existence, parent ACTIVE, `catalogHidden=false`, currently INACTIVE, SKU match, CTX `PUBLISH` + mapped `sarvedaVariantId`, no duplicate ACTIVE SKU / `wooCommerceVariationId`, inventory readable, prices valid.
- Apply: `ProductVariant.status` INACTIVE → ACTIVE only.
- Audit: Winston `variant_status_transition` with `reason=RESTORE_AFTER_VARIANT_SAVE_BUG_2026_09_02`.
- Second apply: idempotent (`CHANGED=0`, `ALREADY_ACTIVE=17`).

---

## MERCHANT / ADS CONTINUITY

Live feed `GET /api/merchant/google/sarveda-products.xml` (Lightsail):

| Header | Before | After |
|--------|-------:|------:|
| Feed items | 773 | **790** |
| Historical | 747 | **764** |
| Native-only | 26 | **26** |
| Active shop offers | 773 | **790** |

Compared restored 17 vs prior certified `feed_790_certification.csv`:

| Check | Result |
|-------|-------:|
| MERCHANT_ID_MISMATCHES | **0** |
| PRODUCT_TYPE_MISMATCHES | **0** |
| ITEM_GROUP_MISMATCHES | **0** |
| LANDING_FAILURES | **0** |
| AVAILABILITY_MISMATCHES | **0** |
| IMAGE_FAILURES | **0** |

Same historical `g:id` / `item_group_id` / `product_type` / `?offer=` landing identity — no new Google items created.

---

## STOREFRONT

- Public API `/api/products/{slug}`: all **17** SKUs present on correct parents; no duplicate SKUs.
- Demo HTML `https://sarveda-demo.xyz/product/{slug}`: all restored SKUs present.
- Dropship zero-stock variants (tongue drum / angel forks): customer-available via dropship.
- Zero-stock non-dropship (some yoga mats / zafu): remain valid catalog variants (OOS), not deleted.

---

## SAVE-BUG REGRESSION (post-restore)

On `yoga-mats-lotus` after restoration:

1. Description/category-style admin save **without** deactivating → all **7** restored yoga variants stayed **ACTIVE**.
2. Intentional omit of 6 variants from payload → still **ACTIVE** (omit≠INACTIVE).

`VARIANT_SAVE_REGRESSION=PASS`, `OMIT_PATH_SAFE=PASS`.

---

## INVENTORY RECONCILIATION

| Metric | Count | Notes |
|--------|------:|-------|
| TOTAL_VARIANTS (DB) | 841 | Includes non-shop / fixture rows beyond older “794 inventory” UI snapshot |
| ACTIVE_VARIANTS | 812 | All ACTIVE rows |
| INACTIVE_VARIANTS | 29 | Includes 4 test + other legitimate INACTIVE |
| ACTIVE on visible shop products | **790** | Matches Merchant feed / genuine sellable baseline |
| Genuine Merchant baseline | **790** | 764 historical + 26 native-only |

Do **not** equate raw `ProductVariant` count (841) with Merchant 790. Shop sellable set membership is proven via feed diagnostics + `ACTIVE` + visible parent gates.

---

## ARTIFACTS

`docs/audit/variant-restoration/`

- `restoration_preflight.csv`
- `restoration_result.csv`
- `restoration_summary.json`
- `merchant_after_restoration.csv`
- `merchant_continuity_summary.json`
- `storefront_api_check.json`

---

## P0 / P1

| Severity | Items |
|----------|-------|
| P0 | **0** |
| P1 | Optional later: clarify admin inventory total (841) vs historical “794” UI messaging |

---

SARVEDA 17-VARIANT CONTROLLED RESTORATION COMPLETE — READY FOR FINAL UAT
