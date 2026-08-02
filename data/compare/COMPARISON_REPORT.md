# Accurate compare: DigitalOcean WooCommerce MySQL ↔ Lightsail Postgres

**Read-only.** No updates to either database.

## Sources
- **DigitalOcean** `root@134.209.146.175` → MySQL `sarveda_wp_new_1` (creds from `wp-config.php`)
- **Lightsail** Postgres product/variant dump

## Product coverage (published Woo → Lightsail)

| Metric | Count |
|--------|------:|
| DO published products | **154** |
| DO draft products | 21 |
| DO variations | **1059** |
| Lightsail products | 185 (163 shop + 22 course/event checkout) |
| Lightsail variants | 1033 |
| Matched by exact slug | 66 |
| Matched by product name (slug differs) | 72 |
| **Present on Lightsail** | **138 / 154 (89.6%)** |
| **Missing on Lightsail** | **16** |
| Variant count mismatches (among present) | 6 |
| Exact SKU overlap (info only; SKUs remapped) | 497 / 519 Woo publish SKUs |

## 16 missing products
Clay Ocarinas; Curved Diamond Groove Copper Bottle; Curved Hammered Copper Bottles; Hammered Copper Bottle; Pink & Positive; Curved Copper Bottles; Tattvamasi-I am Infinite; Happiness is Inside; Etched Wind Gong; Etched Chau Gongs; Sleigh Bells Wooden Jingle Stick; Tuned Pipes; Wind Chimes; Wooden Finger Castanet; Wooden Guiro; Wooden Hand Taal Khartal

## Field notes (important)
- **HSN:** not populated in DO Woo meta either (0 publish products) — so Lightsail empty HSN is not a migration gap vs Woo.
- **Videos / related articles:** ACF stores empty values + `field_*` reference keys; almost no real YouTube/mp4 URLs in product meta. Treat earlier “missing video/articles” API flags as **false positives** unless we map the real ACF subfields.
- Among the 138 present on Lightsail: product images 138, accordion 138, shipping 133, description 74, pair/relations 79, variant images 53, audio 41.

## Files
- `do_products.csv` / `do_variants.csv` (fresh DO dump)
- `ls_products.csv` / `ls_variants.csv`
- `comparison_summary_do_mysql.json`
- `report_do_missing.csv` / `report_do_fuzzy.csv` / `report_do_variant_mismatch.csv`
