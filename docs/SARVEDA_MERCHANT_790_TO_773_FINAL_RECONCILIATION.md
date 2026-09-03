# SARVEDA MERCHANT — 790 → 773 FINAL DELTA RECONCILIATION

**Date:** 2026-09-03  
**Mode:** READ-ONLY audit (no DB / feed / Merchant Center / Ads / DNS changes)  
**Live feed:** `GET /api/merchant/google/sarveda-products.xml`  
**Previous certified baseline:** `docs/audit/google-merchant-final-native/feed_snapshot.xml` (790) + `feed_790_certification.csv`  
**DB truth:** Lightsail Postgres (`sarveda_db`) via feed builder (`loadPublishableCtxOffers` + native-only union)

---

## Verdict

# CURRENT 773 MERCHANT BASELINE VALID

All **17** drops from the prior **790** feed are explained by **intentional `ProductVariant.status = INACTIVE`** updates on **2026-09-02** (catalog cleanup). Current Merchant-eligible offers **exactly equal** live feed items (**773 = 773**). Zero active sellable omissions. Zero inactive/draft offers in feed. Category moves alone did **not** remove any of the 17.

---

## Baselines

| Metric | Value |
|--------|------:|
| PREVIOUS_FEED_COUNT | **790** |
| — historical CTX-backed | 764 |
| — native-only | 26 |
| CURRENT_FEED_COUNT (live XML) | **773** |
| — historical | 747 |
| — native-only | 26 |
| DELTA | **17** (all historical; native-only unchanged at 26) |

Live diagnostics headers match XML: `activeShopOffers=773`, `historicalItems=747`, `nativeOnlyItems=26`, `totalItems=773`.

---

## STEP 1 — Exact 17 missing offers

Compared previous certified snapshot `g:id` set vs live feed. **17 IDs present in 790, absent in 773.** No unexpected new historical IDs. Native-only set size unchanged (26).

| g:id | SKU | Product | Variant | Segment | Previous product_type (CTX) | Current native categories | Product status | Variant status | Storefront | Inventory (onHand/reserved) | dropShipEnabled | Merchant registry | Feed eligibility | Exact reason absent |
|------|-----|---------|---------|---------|----------------------------|---------------------------|----------------|----------------|------------|-----------------------------|-----------------|-------------------|------------------|---------------------|
| 42411 | MI-TD-11N-W-12 | 11 Note Tongue Drum | Size:12 inches; Color:White | historical | Sound & Musical Instruments > All > Handpans & Tongue Drum > … | handpans-tongue-drum | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | true | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 42412 | MI-TD-11N-W-6 | 11 Note Tongue Drum | Color:White | historical | same family | handpans-tongue-drum | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | true | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46192 | YO-M-CT-L-M-G | Yoga Mats-Lotus | Option2:Green; Option1:Moderate | historical | Yoga & Meditation > All > Yoga Mats & Props > All | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 1/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46194 | YO-M-CT-L-M-B | Yoga Mats-Lotus | Option1:Moderate; Option2:Blue | historical | same | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 7/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46195 | YO-M-CT-L-M-P | Yoga Mats-Lotus | Grip:Moderate; Color:Pink | historical | same | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 9/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46196 | YO-M-CT-L-S-T | Yoga Mats-Lotus | Color:Teal; Grip:Superior | historical | same | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46197 | YO-M-CT-L-S-O | Yoga Mats-Lotus | Color:Orange; Grip:Superior | historical | same | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46198 | YO-M-CT-L-S-Y | Yoga Mats-Lotus | Color:Yellow; Grip:Superior | historical | same | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 46199 | YO-M-CT-L-S-P | Yoga Mats-Lotus | Color:Pink; Grip:Superior | historical | same | yoga-mats-props | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 48210 | MI-TF-AG-4160 | Angel Tuning Forks | Hertz:4160 Hz | historical | Sound & Musical Instruments > All > Tuning Forks | tuning-forks | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | true | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 48211 | MI-TF-AG-4225 | Angel Tuning Forks | Hertz:4225 Hz | historical | same | tuning-forks | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | true | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 7185 | ME-Z-Zn-DG | Zafu & Zabuton Combo - Plain | Option:Dark Grey | historical | Yoga & Meditation > … > Meditation Cushions | meditation-cushions-benches | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 9314 | ME-Z-Zn-EM-L-MB | Zafu & Zabuton Combo - Lotus Embroidery | Colours:Misty Blue | historical | same cushion path | meditation-cushions-benches | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 9568 | ME-Z-Zn-EM-L-LG | Zafu & Zabuton Combo - Lotus Embroidery | Colours:Light Grey | historical | same | meditation-cushions-benches | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 9597 | ME-Z-Zn-LV | Zafu & Zabuton Combo - Plain | Colours:Lavender | historical | same | meditation-cushions-benches | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 9598 | ME-Z-Zn-LG | Zafu & Zabuton Combo - Plain | Colours:Light Grey | historical | same | meditation-cushions-benches | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |
| 9599 | ME-Z-Zn-MB | Zafu & Zabuton Combo - Plain | Colours:Misty Blue | historical | same | meditation-cushions-benches | ACTIVE | INACTIVE | NOT_STOREFRONT_SELLABLE | 0/0 | false | CTX PUBLISH + mapped | INACTIVE_VARIANT | Variant status=INACTIVE |

**Mechanism:** CTX rows remain `PUBLISH` with intact `sarvedaVariantId` mapping. Feed builder still loads them as publishable CTX candidates, then `sellableExclusionReason` returns `INACTIVE_VARIANT` → offer not emitted. This is expected sellable-gate behavior, not mapping loss.

---

## STEP 2 — Yesterday’s catalog changes

All 17 `variant_updated_at` timestamps are **2026-09-02** (UTC), aligning with overnight catalog cleanup.

| Classification | Count | Notes |
|----------------|------:|-------|
| VARIANT_INACTIVE | **17** | Parent products remain ACTIVE; `catalogHidden=false` |
| CATEGORY_MOVED_ONLY | **0** | Category alone did not exclude any of these |
| PRODUCT_DRAFTED | **0** | |
| PRODUCT_INACTIVE | **0** | |
| PRODUCT_HIDDEN | **0** | |
| VARIANT_REMOVED | **0** | Variants still exist in DB |
| PRODUCT_REMOVED | **0** | |
| TEST_PRODUCT_REMOVED | **0** | |
| DUPLICATE_CLEANUP | **0** | |
| MERCHANT_MAPPING_LOST | **0** | CTX mapping intact |
| FEED_ELIGIBILITY_REGRESSION | **0** | Gate matches inactive sellable rules |
| OTHER | **0** | |

### Affected products (sibling ACTIVE variants remain sellable / in feed)

| Product slug | ACTIVE variants left | INACTIVE variants | Current category |
|--------------|---------------------:|------------------:|------------------|
| `11-note-tongue-drum` | 6 | 2 (both in the 17) | handpans-tongue-drum |
| `yoga-mats-lotus` | 1 | 7 (all 7 in the 17) | yoga-mats-props |
| `angel-tuning-forks` | 1 | 3 (2 of 3 were in prior 790 feed) | tuning-forks |
| `zafu-zabuton-combo-plain` | 1 | 4 (all 4 in the 17) | meditation-cushions-benches |
| `zafu-zabuton-combo-lotus-embroidery` | 1 | 4 (2 of 4 were in prior 790 feed) | meditation-cushions-benches |

Live feed still contains remaining offers for the same historical `item_group_id`s (e.g. tongue-drum group `42373` still has 6 offers).

---

## STEP 3 — Current shop truth (Lightsail DB + feed builder)

| Metric | Count |
|--------|------:|
| CURRENT_ACTIVE_PRODUCTS | **152** |
| CURRENT_ACTIVE_VARIANTS | **773** |
| CURRENT_STOREFRONT_SELLABLE_OFFERS (ACTIVE shop + sellable check) | **773** |
| CURRENT_MERCHANT_ELIGIBLE_OFFERS | **773** |
| CURRENT_FEED_ITEMS | **773** |

**Proof:**

```
CURRENT_MERCHANT_ELIGIBLE_OFFERS = CURRENT_FEED_ITEMS = 773
```

| Gate | Count | Required |
|------|------:|----------|
| ACTIVE_SELLABLE_BUT_MISSING_FROM_FEED | **0** | ZERO |
| INACTIVE_OR_DRAFT_BUT_PRESENT_IN_FEED | **0** | ZERO |
| Native exclusion bucket | empty `{}` | — |

---

## STEP 4 — Category change safety

| Concern | Result |
|---------|--------|
| Feed inclusion driven by category alone? | **No** — sellable gates are product/variant status, `catalogHidden`, deleted; category is not an exclusion key |
| Did category move remove any of the 17? | **No** — all 17 excluded solely by `INACTIVE_VARIANT` |
| Historical `g:id` stability (747 still emitted) | **Preserved** — all live historical IDs ⊆ prior 790 set |
| Historical `g:item_group_id` vs prior snapshot | **0 mismatches** (entity-normalized compare of live XML vs `feed_snapshot.xml`) |
| Historical `g:product_type` vs prior snapshot | **0 mismatches** (same compare) |
| Landing URLs / `?offer=` | Historical continue native `/product/{slug}?offer={wooOfferId}`; inactive variants correctly omitted |
| Price / availability continuity for remaining historical | Identity continuity intact for remaining 747; no silent Ads identity rewrite from native category |

**Note on CSV vs XML:** Comparing live feed to `feed_790_certification.csv` showed 747 apparent `g:product_type` diffs due to HTML-entity double-encoding in the CSV (`&amp;amp;` / literal `&gt;`). Comparing **XML snapshot → live XML** with double-unescape yields **0** real product_type or item_group mismatches.

**Native-only (26):** Unchanged count; product_type continues to follow native category breadcrumb rules (not CTX). No native-only drops in this delta.

---

## STEP 5 — Final classification of the 17

| Bucket | Count |
|--------|------:|
| LEGITIMATE_CATALOG_REMOVALS | **17** |
| — of which VARIANT_INACTIVE / VARIANT_PRODUCT_REMOVAL (status) | **17** |
| CATEGORY_MOVE_RELATED | **0** |
| DRAFT_INACTIVE_HIDDEN (product-level) | **0** |
| FEED_BUGS | **0** |
| UNEXPLAINED | **0** |

### Answers

1. Are all 17 differences explained by legitimate catalog changes?  
   **YES**

2. Is 773 the correct Merchant feed count for the CURRENT catalog?  
   **YES**

3. Are there any currently active/sellable products missing from Merchant?  
   **NO + count 0**

4. Did category movement accidentally remove any active product from the feed?  
   **NO + count 0**

5. Are historical Google Ads identity fields still preserved for every currently eligible historical offer?  
   **YES + mismatches 0** (`g:id` / `g:product_type` / `g:item_group_id` vs prior certified XML snapshot)

---

## Evidence artifacts

| Artifact | Location |
|----------|----------|
| Prior certified feed XML | `docs/audit/google-merchant-final-native/feed_snapshot.xml` |
| Prior certification CSV | `docs/audit/google-merchant-final-native/feed_790_certification.csv` |
| Prior 790 doc | `docs/SARVEDA_GOOGLE_MERCHANT_FINAL_790_NATIVE_FEED.md` |
| Live feed at audit | 773 items; diagnostics `747 + 26` |
| DB recon dump (Lightsail `/tmp`) | `merchant_790_773_recon.json` (read-only script output) |

---

## Certification statement

CURRENT 773 MERCHANT BASELINE VALID

The prior **790** count is obsolete relative to the post–2026-09-02 catalog. The live **773** feed is the correct reflection of the current sellable Merchant-eligible catalog.

---

SARVEDA MERCHANT 790 TO 773 FINAL RECONCILIATION COMPLETE
