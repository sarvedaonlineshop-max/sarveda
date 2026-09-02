# SARVEDA MERCHANT IDENTITY BACKFILL V1

**Date:** 2026-08-31  
**Phase:** Schema + verified historical Woo offer ID persistence only.  
**Stop point:** No Merchant feed/XML/API, no Merchant Center / Ads changes.

---

## Design decision (simple vs variable)

| Concept | Field | Meaning |
|---------|-------|---------|
| Woo parent / product identity | `Product.wooCommerceId` | Unchanged. Variable parents + simple products. |
| Woo sellable offer identity | `ProductVariant.wooCommerceVariationId` | **New.** Variable → Woo **variation** ID. Simple → Woo **product** ID (the Merchant offer id). |

Future feed (not in this phase) can consistently emit:

`id = gla_<ProductVariant.wooCommerceVariationId>`  
`item_group_id = Product.wooCommerceId` (variables)

NULL means unresolved / Sarveda-only — **never** invent IDs from UUID/SKU/hash.

---

## Files

| Role | Path |
|------|------|
| Migration | `backend/prisma/migrations/20260831180000_product_variant_woo_commerce_variation_id/migration.sql` |
| Backfill logic | `backend/src/modules/products/merchantIdentityBackfill.ts` |
| Backfill script | `backend/scripts/backfill-merchant-identity.ts` |
| Tests | `backend/test/commerce/merchant-identity-backfill.test.ts` |
| Source map | `docs/audit/merchant_woo_sarveda_mapping.tsv` |
| Success artifact | `docs/audit/merchant_identity_backfilled.tsv` |
| Residual review | `docs/audit/merchant_identity_backfill_review.tsv` |
| Summary JSON | `docs/audit/merchant_identity_backfill_summary.json` |

### Commands

```bash
# Schema
cd backend && npx prisma migrate deploy && npx prisma generate

# Preflight only
npm run backfill:merchant-identity:dry

# Write (idempotent)
npm run backfill:merchant-identity:apply
```

---

## Report checklist

| # | Item | Result |
|---|------|--------|
| **A** | Schema field added | **YES** — `ProductVariant.wooCommerceVariationId Int? @unique` |
| **B** | Migration created | **YES** — `20260831180000_product_variant_woo_commerce_variation_id` |
| **C** | Migration applied where | **1)** Local docker Postgres `localhost:5432/sarveda_db` (schema). **2)** **Lightsail staging RDS** `…ap-south-1.rds.amazonaws.com:5432/sarveda_db` (schema + backfill). **Not** production. |
| **D** | Source reconciliation rows | **844** |
| **E** | HIGH-confidence candidate rows | **685** |
| **F** | Preflight-safe 1:1 rows | **681** |
| **G** | Successfully backfilled variants | **681** (first apply writes) |
| **H** | Already-correct / idempotent rows | **681** on second apply (`toWrite=0`) |
| **I** | Skipped MEDIUM rows | **22** (`MEDIUM_CONFIDENCE` review bucket). Source confidence medium total **30** (8 of those classified as parent-only first). |
| **J** | Skipped ambiguous rows | **2** |
| **K** | Skipped unmatched rows | **126** review bucket (source unmatched **127**; 1 parent-only unmatched counted under L) |
| **L** | Skipped parent-only rows | **9** |
| **M** | Skipped conflict rows | **4** (2 Sarveda variants × 2 Woo offers each) |
| **N** | Unexpected existing-ID conflicts | **0** |
| **O** | Duplicate Woo offer IDs in accepted set | **0** |
| **P** | Duplicate Sarveda targets in accepted set | **0** |
| **Q** | Variable offers backfilled | **646** |
| **R** | Simple offers backfilled | **35** |
| **S** | NULL / unresolved variants remaining | **183** of **864** total variants |
| **T** | Historical Merchant `gla_*` exact matches | **681 / 681 (100%)** |
| **U** | Historical Merchant `gla_*` mismatches | **0** |
| **V** | item_group_id / parent exact matches | **646 / 646** variables |
| **W** | item_group_id / parent mismatches | **0** |
| **X** | Idempotency validation | **PASS** |
| **Y** | Prisma validation | **PASS** (`prisma validate` + `migrate deploy`) |
| **Z** | TypeScript / tests / build | Backend `tsc` **PASS**; vitest merchant-identity **15/15 PASS**. Frontend not required (no shared FE client change beyond Prisma on API host). |
| **AA** | Merchant Center changed | **NO** |
| **AB** | Google Ads changed | **NO** |
| **AC** | Product slugs changed | **NO** |
| **AD** | Pricing / stock changed | **NO** |
| **AE** | Orders / payments / accounting changed | **NO** |
| **AF** | Ready for native Sarveda Merchant feed | **YES** — for the **681** identity-stable historical offers (Phase 3 review). Full MC 844 still blocked by residual set. |
| **AG** | Remaining manual reconciliation count | **163** Merchant/recon rows in review TSV |
| **AH** | Remaining blocker(s) | 1) **163** residual mappings (medium/ambiguous/unmatched/parent-only/conflicts). 2) Native feed not implemented. 3) Production DB not migrated/backfilled yet. 4) Audit expected ~683; safe runtime set is **681** after excluding both sides of 2 Sarveda conflicts (no guessing). |

---

## Why 681 vs audit “683”

Audit **J** counted **683** high-confidence 1:1 auto pairs. Runtime exclusion of the **2** Sarveda-side conflict **variants** removes **4** HIGH rows (two Woo offers each), leaving **681**. Overwriting or picking one offer would be guessing — refused.

---

## Residual review reasons

| `reason_not_backfilled` | Count |
|-------------------------|------:|
| UNMATCHED | 126 |
| MEDIUM_CONFIDENCE | 22 |
| PARENT_ONLY | 9 |
| SARVEDA_CONFLICT | 4 |
| AMBIGUOUS | 2 |
| **Total** | **163** |

---

## Constraint validation (staging after apply)

- Duplicate non-null `wooCommerceVariationId` groups: **0**
- Assigned variants: **681**
- NULL variants: **183**
- Unique index present: **YES**

---

SARVEDA MERCHANT IDENTITY BACKFILL V1 COMPLETE — READY FOR NATIVE FEED REVIEW
