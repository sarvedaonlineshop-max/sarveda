# Batch 1 — First 10 partials report
Rules applied:
1. Variant name match → adapt SKU from DB to sheet (uniqueness checked)
2. Sheet-only variant → add to DB (name + SKU)
3. On SKU conflict → stop and ask (none this batch)

- Sheet SKUs adapted: **58**
- Variants added to DB: **3**
- Sheet SKU uniqueness: OK (0 dups)
- DB SKU uniqueness: OK (4 dups)

## 1. Curved Hammered Copper Bottles _(DB: Grooved, Hammered & Plain Copper Bottle)_ — NEEDS ATTENTION

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 2 | 12 | 2 | 0 | 0 |

**DB-only leftovers (not in rules — left as-is):** `CB-CDG`, `CB-CDG-B`, `CB-CP`, `CB-CP-B`, `CB-CPH`, `CB-CPH-B`, `CB-CV`, `CB-CV-B`, `CB-CVDG`, `CB-CVDG-B`

## 2. Gong Stand — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 8 | 8 | 8 | 8 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `Mi-Gg-ST-M-L` | `MI-GS-L-M` | Light / Medium |
| `Mi-Gg-ST-D-EL` | `MI-GS-XL-D` | Extra Large / Dark |
| `Mi-Gg-ST-L-S` | `MI-GS-L-S` | Light / Small |
| `Mi-Gg-ST-M-D` | `MI-GS-M-D` | Medium / Dark |
| `Mi-Gg-ST-L-L` | `MI-GS-L-L` | Large / Light |
| `Mi-Gg-ST-D-L` | `MI-GS-L-D` | Large / Dark |
| `Mi-Gg-ST-S-D` | `MI-GS-S-D` | Small / Dark |
| `Mi-Gg-ST-L-EL` | `MI-GS-XL-L` | Extra Large / Light |

## 3. Plain Yoga Mats — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 8 | 8 | 8 | 8 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `YO-PYM-M-P` | `Yo-M-MG-P` | Moderate / Pink |
| `YO-PYM-S-P` | `woo-var-46248` | Pink / Superior |
| `YO-PYM-M-Y` | `Yo-M-MG-Y` | Moderate / Yellow |
| `Yo-PYM-M-T` | `Yo-M-MG-T` | Moderate / Teal |
| `YO-PYM-S-T` | `Yo-M-SG-T` | Teal / Superior |
| `YO-PYM-M-O` | `Yo-M-MG-O` | Moderate / Orange |
| `YO-PYM-S-O` | `Yo-M-SG-O` | Orange / Superior |
| `YO-PYM-S-Y` | `Yo-M-SG-Y` | Yellow / Superior |

## 4. Shruthi Thali/Gong Plates — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 8 | 8 | 8 | 8 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-STGP-CP` | `MI-ST-C` | C Plate |
| `MI-STGP-AP` | `MI-ST-A` | A Plate |
| `MI-STGP-FU` | `MI-ST-SET` | Full Set |
| `MI-STGP-FP` | `MI-ST-F` | F Plate |
| `MI-STGP-GP` | `MI-ST-G` | G Plate |
| `MI-STGP-EP` | `MI-ST-E` | E Plate |
| `MI-STGP-BP` | `MI-ST-B` | B Plate |
| `MI-STGP-DP` | `MI-ST-D` | D Plate |

## 5. Tingsha Bell — SHEET OK (DB extras remain)

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 6 | 8 | 6 | 4 | 2 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-TB-D-SM` | `MI-TB-D-S` | Dark / Small |
| `MI-TB-D-ST` | `MI-TB-D-M` | Dark / Standard |
| `MI-TB-E-SM` | `MI-TB-E-S` | Etched /Small |
| `MI-TB-E-ST` | `MI-TB-E-M` | Etched / Standard |

**Sheet → DB adds**

| SKU | Variant |
|---|---|
| `MI-TB-P-ST` | Plain /Standard |
| `MI-TB-P-SM` | Plain / Small |

**DB-only leftovers (not in rules — left as-is):** `MI-TB-G-M`, `MI-TB-G-S`

## 6. Tuning Forks Gem Feet — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 8 | 8 | 8 | 8 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-TFGF-B` | `MI-TF-GF-B` | Blue |
| `MI-TFGF-M` | `MI-TF-GF-M` | Maroon |
| `MI-TFGF-R` | `MI-TF-GF-R` | Red |
| `MI-TFGF-F` | `MI-TF-GF-SET` | Full Set |
| `MI-TFGF-D` | `MI-TF-GF-DG` | Dark Blue |
| `MI-TFGF-G` | `MI-TF-GF-G` | Green |
| `MI-TFGF-Y` | `MI-TF-GF-Y` | Yellow |
| `MI-TFGF-V` | `MI-TF-GF-V` | Violet |

## 7. Wooden Mallets for Singing Bowls — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 17 | 17 | 17 | 8 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-SB-M-TW-R` | `MI-SB-M-R-TW` | Red / Thick Wide |
| `MI-SB-M-L-F-ST` | `MI-SB-M-R-L-S` | Red / Long Firm-Standard |
| `MI-SB-M-W-L-F-S` | `MI-SB-M-W-L-F` | White / Long Firm-Small |
| `MI-SB-M-L-F-S` | `MI-SB-M-R-L-F` | Red / Long Firm-Small |
| `MI-SB-M-ST-B` | `MI-SB-M-B-SW` | Black / Standard Wide |
| `MI-SB-M-W-L-F-ST` | `MI-SB-M-W-L-S` | White / Long Firm-Standard |
| `MI-SB-M-TW-B` | `MI-SB-M-B-TW` | Black / Thick Wide |
| `MI-SB-M-ST-R` | `MI-SB-M-R-SW` | Red / Standard Wide |

## 8. Tuning Forks 7 Chakra Set — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 8 | 8 | 8 | 7 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-TF-7C-CWE-NGF` | `MI-TF-C-W` | Colour Weighted / Without Gem Foot |
| `MI-TF-7C-WE-NGF` | `MI-TF-7C-W` | Weighted / Without Gem Foot |
| `MI-TF-7C-CUW-NGF` | `MI-TF-C-UW` | Colour Unweighted / Without Gem Foot |
| `MI-TF-7C-UW-NGF` | `MI-TF-7C-UW` | Unweighted / Without Gem Foot |
| `MI-TF-7C-CUW-GF` | `MI-TF-C-UW-GF` | Colour Unweighted / With Gem Foot |
| `MI-TF-7C-WE-GF` | `MI-TF-7C-W-GF` | Weighted / With Gem Foot |
| `MI-TF-7C-CWE-GF` | `MI-TF-C-W--GF` | Colour Weighted / With Gem Foot |

## 9. Ocean Drums — EXACT LOCK

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 9 | 9 | 9 | 6 | 0 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-OD-F-35` | `MI-OD-FL-35` | Flower of Life / 35 cms |
| `MI-OD-D-40` | `MI-OD-DC-40` | 40 cms / Dream Catcher |
| `MI-OD-D-35` | `MI-OD-DC-35` | Dream Catcher / 35 cms |
| `MI-OD-D-30` | `MI-OD-DC-30` | Dream Catcher / 30 cms |
| `MI-OD-F-30` | `MI-OD-FL-30` | Flower of Life / 30 cms |
| `MI-OD-F-40` | `MI-OD-FL-40` | 40 cms / Flower of Life |

## 10. Chau Gongs _(DB: Tam-Tam/Chau Gong)_ — SHEET OK (DB extras remain)

| Sheet | DB | Shared | Adapted | Added |
|---:|---:|---:|---:|---:|
| 7 | 10 | 7 | 1 | 1 |

**DB → sheet SKU adapts**

| Old (sheet) | New (from DB) | Variant |
|---|---|---|
| `MI-CG-2` | `MI-CG-20` | 20 in |

**Sheet → DB adds**

| SKU | Variant |
|---|---|
| `MI-CG-36` | 36 in |

**DB-only leftovers (not in rules — left as-is):** `MI-CG-16`, `MI-CG-26`, `MI-CG-30`

