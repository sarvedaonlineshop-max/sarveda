# SARVEDA — Google Merchant Final Feed Sync & Module Closure Certification

**Date:** 2026-09-02  
**Last re-certified:** 2026-09-02 (post mallet image remediation)  
**Database:** Lightsail Postgres (`ls-38d7ccbcac4ed3da1856692cc50fc732f88d42e1.c9oiska8wm8k.ap-south-1.rds.amazonaws.com`)  
**Feed endpoint:** `GET /api/merchant/google/products-source-2.xml` (live via `https://sarveda-demo.xyz`)  
**Audit script:** `backend/scripts/final-merchant-sync-audit.ts`  
**Remediation script:** `backend/scripts/fix-crystal-bowl-mallet-images.ts`

| Artifact | Path |
|----------|------|
| Summary JSON | `docs/audit/google-merchant-final-sync/final_summary.json` |
| Reconciliation CSV | `docs/audit/google-merchant-final-sync/final_feed_reconciliation.csv` |
| Former 32 CSV | `docs/audit/google-merchant-final-sync/former_32_reconciliation.csv` |
| Feed snapshot | `docs/audit/google-merchant-final-sync/final_feed_snapshot.xml` |

---

## Final verdict

# **A. MERCHANT NATIVE MODULE COMPLETE — FREEZE FOR CUTOVER**

**No further Merchant feed development is required before launch.**

All closure gates pass. The sole P1 blocker (broken crystal bowl mallet images for offers `49605`–`49607`) was remediated on 2026-09-02.

---

## Remediation applied (2026-09-02)

**Root cause:** `import-crystal-bowl-mallets-from-ctx.ts` mirrored images to non-public S3 keys under `products/crystal-bowl-accessories/` (HTTP 403). The project's standard Woo mirror path is `media/wp/uploads/...`.

**Fix (`fix-crystal-bowl-mallet-images.ts --apply` on Lightsail):**

| Asset | S3 URL (public HTTPS) |
|-------|----------------------|
| Primary gallery | `https://sarveda-media.s3.amazonaws.com/media/wp/uploads/2026/04/Crystal-bowl-accessories.jpg` |
| Ball Mallet (additional) | `.../media/wp/uploads/2026/03/mallet.jpg` |
| Rimming Mallet (additional) | `.../media/wp/uploads/2026/03/mallet-copy-8.jpg` |
| Silicon Mallet (additional) | `.../media/wp/uploads/2026/03/Silicon-mallet_.jpg` |

**Explicit image verification (offers 49605–49607):**

| `g:id` | SKU | `g:image_link` | HTTPS |
|--------|-----|----------------|------:|
| 49605 | MI-CB-MA-B | `.../2026/04/Crystal-bowl-accessories.jpg` | **200** |
| 49606 | MI-CB-MA-R | `.../2026/04/Crystal-bowl-accessories.jpg` | **200** |
| 49607 | MI-CB-MA-S | `.../2026/04/Crystal-bowl-accessories.jpg` | **200** |

`import-crystal-bowl-mallets-from-ctx.ts` was also corrected to use the `media/wp/uploads/` key pattern for future imports.

**Not modified:** historical `g:id`, `g:product_type`, `g:item_group_id`, Merchant compatibility logic, prices, inventory, or unrelated products.

---

## Closure gate — final numbers

| Gate | Value |
|------|------:|
| **CURRENT_ACTIVE_SHOP_OFFERS** | **790** |
| **MERCHANT_ELIGIBLE (source-2 / Ads contract)** | **764** |
| **NATIVE_FEED_ITEMS (products-source-2.xml)** | **764** |
| **HISTORICAL_CTX_CONTINUITY_ITEMS (in feed)** | **764** |
| **NEW/NATIVE-ONLY ITEMS** | **26** |
| **INTENTIONALLY_EXCLUDED** | **117** |
| **TEST/INTERNAL EXCLUDED** | **6** |
| **MISSING_FROM_FEED** | **2** (7765, 9908 — registry only) |
| **DUPLICATE IDs** | **0** |
| **ID CONTINUITY MISMATCHES** | **0** |
| **PRODUCT TYPE MISMATCHES** | **0** |
| **ITEM GROUP MISMATCHES** | **0** |
| **PRICE MISMATCHES VS CURRENT SARVEDA** | **0** |
| **AVAILABILITY MISMATCHES VS CURRENT SARVEDA** | **0** |
| **WRONG PRODUCT LANDINGS** | **0** |
| **WRONG VARIANT LANDINGS** | **0** |
| **BROKEN NATIVE PDPs** | **0** |
| **BROKEN IMAGES** | **0** |
| **MANUAL_REVIEW REMAINING** | **0** |
| **FORMER 32 UNEXPLAINED** | **0** |

---

## Ads continuity conclusion

# **YES**

Switching Merchant Center PRODUCTS SOURCE 2 to `https://sarveda.com/api/merchant/google/products-source-2.xml` on cutover day will preserve historical offer identity for existing PMax/Shopping campaigns:

- **764/764** bare numeric `g:id` preserved
- **764/764** `g:product_type` preserved (campaign filters safe)
- **764/764** `g:item_group_id` preserved

---

## Cutover-day operations only (not dev gaps)

1. DNS apex `sarveda.com` → Vercel
2. Verify public feed at `https://sarveda.com/api/merchant/google/products-source-2.xml`
3. Switch Merchant Center PRODUCTS SOURCE 2 fetch URL
4. Trigger Merchant fetch + inspect diagnostics
5. Verify native PDP landings through `sarveda.com`
6. Confirm PMax Product Type asset groups remain populated

---

*Re-certified 2026-09-02T04:43:20Z (UTC) after mallet image fix. `BROKEN_IMAGES: 0`.*

**SARVEDA GOOGLE MERCHANT FINAL SYNC CERTIFICATION COMPLETE — READY FOR MODULE CLOSURE**
