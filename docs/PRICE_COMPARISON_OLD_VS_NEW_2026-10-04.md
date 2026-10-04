# Old shop vs new shop: prices, and whether higher prices stopped sales

Read on 4 Oct 2026. No prices were changed for this note.

## Sources

- Old selling price: WordPress still running on the DigitalOcean server, Store API, India rupees, every published product. 161 products, 877 sellable rows (41 simple, 836 variations).
- New selling price: Lightsail catalog, `saleInPaise` on active variants.
- Match: the Woo variation id already stored on the variant. 790 of 803 variants have that id. 751 are still published on the old shop, so those 751 prices line up one to one.
- Sales: paid orders only (delivered, processing, paid, shipped). Cancelled and refunded are out. Old window 1 Apr–15 Sep 2026 (168 days). New window 16 Sep–4 Oct 2026 (19 days). India time.

The earlier sales note only compared SKUs that happened to sell in both windows. This note is the whole catalog.

## Did prices go up?

| Compared variants | Count |
|---|---:|
| Same price, within ₹1 | 311 |
| Higher by under 10% | 246 |
| Higher by 10–25% | 131 |
| Higher by 25% or more | 53 |
| Lower | 10 |

Median change **+2.6%**. Average **+6.4%**, pulled up by the large jumps. 184 variants on 57 products are up by 10% or more. About 4 in 10 matched variants did not move.

Largest increases (old selling price → new selling price):

| Product | SKU | Old | New | Change |
|---|---|---:|---:|---:|
| Handmade singing bowl, 13 in | MI-SB-HM-13 | ₹13,650 | ₹24,990 | +83% |
| Massage boot | MI-TF-MB | ₹590 | ₹995 | +69% |
| Handmade singing bowl, 12 in | MI-SB-HM-12 | ₹12,650 | ₹19,990 | +58% |
| Tuning-fork activator | MI-TF-AM | ₹250 | ₹395 | +58% |
| Zen meditation bench, small / medium / large | ME-ZMB-S / M / L | ₹3,250 / ₹3,450 / ₹3,650 | ₹5,090 / ₹5,290 / ₹5,490 | about +50% |
| Plain wind gong, 20 in | MI-GO-WI-20 | ₹23,400 | ₹34,990 | +50% |
| Kenari bracelet | MI-KR-BT | ₹1,350 | ₹1,990 | +47% |
| Hanging bowls, set of 3 | MI-SB-HB-3 | ₹8,950 | ₹12,990 | +45% |
| Circuit boot | MI-TF-CB | ₹690 | ₹995 | +44% |
| Harmonium, concert / professional | MI-HA-C / MI-HA-P | ₹23,990 / ₹28,900 | ₹31,990 / ₹37,990 | +33% / +32% |
| Gong-plate set of 7 | MI-GP-SET7 | ₹75,500 | ₹99,990 | +32% |
| Mayura morchang set | MI-MO-MY-SET3 | ₹7,250 | ₹9,490 | +31% |

Ten variants are cheaper. The 3.5 in sacred-mantra bowls dropped from ₹2,295 to ₹945. That is large enough to check as a data error, not as a shop-wide cut.

## Did the higher prices stop people buying?

Unit sales, not raw totals. A product that sold steadily on the old site would be expected to sell `old quantity × 19/168` units in the new window.

| Price group | Old units / day | New units / day | Expected units in 19 days | Actual units | New sales value / day |
|---|---:|---:|---:|---:|---:|
| Same price | 2.60 | 4.95 | 49 | 94 | ₹7,906 → ₹22,319 |
| Up under 10% | 1.21 | 1.95 | 23 | 37 | ₹3,487 → ₹9,969 |
| Up 10–25% | 1.02 | 0.58 | 19 | 11 | ₹3,115 → ₹2,106 |
| Up 25% or more | 0.58 | 0.58 | 11 | 11 | ₹1,601 → ₹1,378 |
| Cheaper | 0.07 | 0.16 | 1 | 3 | small |
| Not matched to a current variant | 1.34 | 0.16 | 25 | 3 | ₹4,656 → ₹953 |

What this supports:

- Products that stayed the same price are selling more units per day on the new site, not fewer.
- Products up by less than 10% are also selling more units per day.
- Products up by 25% or more held their old unit rate (11 vs 11 expected). They did not stop. Five of those orders were cancelled or refunded against ten that were kept, which is a higher fall-away rate than the same-price group (15 fall-aways against 84 kept), on a small count.
- The only matched group below its old rate is the 10–25% rise: 11 units instead of about 19. That is about eight units short across 19 days, not a collapse of the shop.
- The big drop sits in lines that do not match a current variant (blank old SKU, or the SKU changed). That bucket is not evidence of a price effect. The rainstick is the clear case inside it: old SKU MI-RS-N, 88 paid orders in 168 days (about one every two days, line about ₹2,983), new SKU MI-RS-W-80, 5 paid orders in 19 days at ₹3,450. If the old rate had held, about 10 would be expected. So that one popular product is both dearer and slower. It does not describe the rest of the catalog.

Nineteen days is a short window, and the old site’s own last 15 days (1–15 Sep) were already down to 4.3 paid orders a day before the switch. The shop average moved from 6.0 to 5.1 paid orders a day. The price table does not explain that one-order gap. Same-price products more than replaced their old volume.
