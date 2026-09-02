# SARVEDA — Google Merchant Final 790 Native Feed

**Date:** 2026-09-02  
**Endpoint:** `GET /api/merchant/google/sarveda-products.xml`  
**Frozen reference (unchanged):** `GET /api/merchant/google/products-source-2.xml`  
**Legacy native (unchanged):** `GET /api/merchant/google/products.xml`

---

## Final verdict

# **A. SARVEDA NATIVE MERCHANT FEED COMPLETE — FREEZE FOR CUTOVER**

**No further Merchant feed engineering is required before launch.**

---

## Closure gate

| Gate | Value |
|------|------:|
| **Final feed count** | **790** |
| **Historical count** | **764** |
| **Native-only count** | **26** |
| Historical continuity mismatches | **0** |
| Price mismatches | **0** |
| Availability mismatches | **0** |
| Wrong product landings | **0** |
| Wrong variant landings | **0** |
| Broken images | **0** |
| Duplicate IDs | **0** |
| Manual review | **0** |

**Set proof:** 790 active genuine shop offers = 764 historical + 26 native-only (verified on Lightsail DB).

---

## 1. Feed composition

| Segment | Count | Identity | Product Type | Link |
|---------|------:|----------|--------------|------|
| Historical CTX-backed | **764** | Bare numeric `g:id` (= Woo offer ID) | Exact CTX `g:product_type` | `?offer={wooOfferId}` |
| Native-only supplements | **26** | `sv_{variantUuid}` | Sarveda category breadcrumb | `?offer=sv_{variantUuid}` |
| **Total** | **790** | Unique | — | Native `/product/{slug}` only |

**Excluded (not in 790):** test products (`MI-TP-*`), catalog-hidden duplicates (`elemental-chimes`, `incense-stick-stand`), inactive variants, draft products, digital/course SKUs.

**Why 790 (not 796):** Same authoritative shop count as prior certification — 4 test variants + 2 hidden duplicates removed from active shop.

---

## 2. Implementation

| File | Role |
|------|------|
| `backend/src/modules/merchant/sarvedaProductsFeed.ts` | Union builder + native mapper |
| `backend/src/modules/merchant/nativeMerchantIdentity.ts` | Stable `sv_` / `sv_group_` IDs |
| `backend/src/modules/merchant/merchantVariantLink.ts` | `buildNativeMerchantProductLink()` |
| `backend/src/modules/merchant/merchant.routes.ts` | New route |
| `backend/src/modules/merchant/merchant.controller.ts` | Handler + diagnostics headers |
| `frontend/lib/merchant-variant-selection.ts` | PDP resolves `?offer=sv_{uuid}` |
| `backend/scripts/certify-sarveda-products-feed.ts` | Exhaustive 790 certification |

**Historical 764:** Reuses `mapCtxOfferToFeedItem()` from frozen `ctxCompatibilityFeed.ts` — zero identity logic changes.

**Native 26:** Deterministic IDs from immutable `ProductVariant.id` (UUID). No fake Woo numeric IDs. No DB migration required.

**Native item groups:** `sv_group_{productUuid}` for variable / multi-variant products. Simple singles omit group (e.g. `MI-GP-ST`, `MI-CB-H`).

---

## 3. Native-only Product Types (26 offers)

| Product Type path | Offers |
|-----------------|-------:|
| Eco-Living & Sustainable > Home & Workspace | 7 (incense set variants) |
| Sound & Musical Instruments > Singing Bowls & Bells | 8 (polished bowl sizes) |
| Sound & Musical Instruments > Gongs | 9 (etched gong plates + stand) |
| Sound & Musical Instruments > Crystal Bowls | 1 (`MI-CB-H`) |
| Eco-Living & Sustainable > Personal Care | 1 (`YO-NP-R-185`) |

Full per-SKU detail: `docs/audit/google-merchant-final-native/native_only_offers.csv`

---

## 4. Live endpoint (Lightsail + Vercel proxy)

**Verified:** `https://sarveda-demo.xyz/api/merchant/google/sarveda-products.xml`

```
HTTP 200
X-Sarveda-Merchant-Feed-Items: 790
X-Sarveda-Merchant-Historical-Items: 764
X-Sarveda-Merchant-Native-Only-Items: 26
X-Sarveda-Merchant-Active-Shop-Offers: 790
```

**Cutover URL (not yet DNS-bound):** `https://sarveda.com/api/merchant/google/sarveda-products.xml`

---

## 5. Frozen feed regression

| Endpoint | Items | Status |
|----------|------:|--------|
| `products-source-2.xml` | **764** | Unchanged |
| `products.xml` | 790 | Unchanged output shape |

Historical regression vs frozen `products-source-2.xml` inside new feed: **764/764** on g:id, product_type, item_group, price, availability.

---

## 6. Certification artifacts

| Artifact | Path |
|----------|------|
| Feed snapshot | `docs/audit/google-merchant-final-native/feed_snapshot.xml` |
| Per-item certification | `docs/audit/google-merchant-final-native/feed_790_certification.csv` |
| Native-only offers | `docs/audit/google-merchant-final-native/native_only_offers.csv` |
| Summary JSON | `docs/audit/google-merchant-final-native/final_summary.json` |

Re-run: `MERCHANT_FEED_SITE_URL=https://sarveda.com CTX_CERT_API_BASE=https://sarveda-demo.xyz npx tsx scripts/certify-sarveda-products-feed.ts`

---

## 7. Cutover-day Merchant Center plan

1. Sarveda apex DNS → Vercel (native frontend + `/api` proxy)
2. Verify production PDPs on `https://sarveda.com/product/...`
3. Verify public feed: `https://sarveda.com/api/merchant/google/sarveda-products.xml` → **790 items**
4. **Create a NEW Merchant Center data source** (scheduled URL fetch) pointing to `sarveda-products.xml`
5. **Do NOT delete** existing PRODUCTS SOURCE 2 / CTX fetch immediately
6. Trigger manual fetch on new source; inspect diagnostics / approvals
7. Verify PMax/Shopping Product Type groups remain populated (764 historical IDs)
8. Verify 26 native-only products appear under expected Product Types
9. After stable soak (recommended 7–14 days), pause or retire old CTX PRODUCTS SOURCE 2 fetch

**Rollback:** Old CTX `products-source-2.xml` endpoint and Merchant source remain intact until native source is proven.

---

## 8. Source overlap warning (764 shared IDs)

During overlap, **both feeds contain the same 764 bare-numeric historical `g:id` values**.

Google Merchant Center behavior (operational guidance — not modified in this task):

| Concern | Guidance |
|---------|----------|
| Can both coexist? | **Yes temporarily**, if configured as separate data sources with clear roles |
| Duplicate ID risk | If **both sources target the same country + language as primary**, Google may treat overlapping IDs as duplicates or apply last-fetch-wins — **avoid dual-primary** |
| Safest overlap procedure | (1) Add new `sarveda-products.xml` as **primary** for India. (2) Keep CTX PRODUCTS SOURCE 2 **fetching but demoted to supplemental** OR **pause its scheduled fetch** once the new primary completes first successful full processing. (3) Monitor Merchant diagnostics for duplicate-ID warnings. |
| Source priority | Configure **only one primary** feed per target market; supplemental feeds must not re-declare the same IDs as primary |
| Immediate pause? | **Not required on day 1** if old source stays supplemental/read-only during soak; **pause old primary fetch** once new source shows 790/790 processed with 764 historical continuity confirmed |

**Do not assume** silent coexistence — verify in Merchant Center diagnostics after first dual-source fetch.

---

## 9. Remaining cutover operations (not dev blockers)

| Item | When |
|------|------|
| Deploy frontend `?offer=sv_` PDP resolver to Vercel | Before Ads traffic hits native-only deep links |
| DNS apex → Vercel | Cutover day |
| `sarveda.com` feed + PDP verification | Cutover day |
| New MC data source + fetch | Cutover day |
| Retire CTX PRODUCTS SOURCE 2 | After soak |

---

## 10. Data fix applied during certification

`MI-GP-ST` (gong stand) primary image was in private S3 prefix `products/.../primary.jpg`. Re-published to public `media/wp/uploads/2025/04/gong-plates-shruti-plates-stand-primary.jpg` — certification now **BROKEN_IMAGES: 0**.

---

**SARVEDA FINAL NATIVE MERCHANT FEED COMPLETE — READY FOR CUTOVER**
