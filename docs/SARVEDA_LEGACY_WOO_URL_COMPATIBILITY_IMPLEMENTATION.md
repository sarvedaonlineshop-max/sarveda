# SARVEDA LEGACY WOO URL COMPATIBILITY — IMPLEMENTATION

**Date:** 2026-08-31  
**Scope:** Legacy WooCommerce / Google Merchant deep product URLs only.  
**Non-goals:** Product.slug changes, Merchant Center, Merchant feed, accounting/payments/orders/inventory.

---

## Summary

Deep historical landing URLs of the form `/store/.../{legacyLeaf}/` now **301** to `/product/{currentSarvedaSlug}` via Edge middleware + an audited static resolver. Listing `/store` behavior is unchanged. Canonical PDPs remain `/product/{slug}` only (no duplicate render).

---

## A. Unique audited paths covered

| Metric | Value |
|--------|------:|
| Merchant rows `NEEDS 301` | 742 |
| Unique landing paths (query stripped) | 149 |
| Paths with a resolvable Sarveda target | **147** |
| Paths left unresolved (audit no-target) | **2** |
| Distinct `Product.slug` destinations | 140 |
| Unique Woo leaves with a target | 140 |

Source: `docs/audit/merchant_woo_sarveda_mapping.tsv`.

---

## B. Direct slug mappings

**71** unique leaves where Woo leaf **equals** current `Product.slug` (exact match path **A**).

These resolve because the leaf is in the audited known-slug allowlist (`LEGACY_WOO_KNOWN_PRODUCT_SLUGS`, 140 entries). No alias entry is required.

Examples: `ocean-drums`, `crystal-pyramid`, `wind-chimes`, `singing-bowl-with-handle`.

---

## C. Alias mappings

| Kind | Count | Mechanism |
|------|------:|-----------|
| Renamed leaf → current slug | **68** | `LEGACY_WOO_LEAF_ALIASES` (path **C**) |
| Case-only (`copper-tongue-cleaner` → `Copper-Tongue-Cleaner`) | **1** | Case index over known slugs (path **B**) |

Aliases are **verified from the Merchant audit only** — no fuzzy name matching.

Examples:

| Woo leaf | Sarveda `Product.slug` |
|----------|------------------------|
| `engraved-flat-wind-tibetan-gong-for-meditation-sound-therapy` | `wind-gong-etched` |
| `shamanic-drum-bags-ocean-drum-bags` | `shamanic-drum-ocean-drum-bags` |
| `aslatau-or-asalato` | `asalato-kashaka-shaker` |
| `ceg-crystal-singing-bowl-set` | `triad-crystal-bowl-set` |

Same leaf under different category prefixes (7 leaves) always maps to one product — resolution ignores category segments.

---

## D. Unresolved paths

| Leaf | Example path | Behavior |
|------|--------------|----------|
| `elemental-chimes` | `/store/sound-musical-instruments/chimes/elemental-chimes/` | **No product redirect** |
| `box-tanpura` | `/store/sound-musical-instruments/indian-classical/box-tanpura/` | **No product redirect** |

These are listed in `LEGACY_WOO_UNRESOLVED_LEAVES`. Middleware does **not** send them to `/` or `/store` listing. They fall through; `next.config.js` still rewrites unmatched `/store/:path*` → `/shop/:path*`, which has **no matching App Router page** → **404**. That is intentional until catalog mapping exists.

Unknown non-audited leaves behave the same (no guess → no product 301 → 404 via rewrite).

---

## E. HTTP redirect status

Successful product matches: **HTTP 301 Permanent Redirect**.

Implemented in `frontend/middleware.ts` using `NextResponse.redirect(url, 301)`.

Destination is always constructed as an **internal** path on the request origin: `/product/{slug}`.

---

## F. Query preservation

Preserved: keys starting with `attribute_` (historical Woo variation selectors).

Dropped: everything else (including `wcpbc-manual-country`, UTM, and any `redirect=` style params).

Attribute values that look like absolute URLs / protocol schemes are dropped (open-redirect hardening).

---

## G. `/store` listing behavior preserved

| Path | Behavior |
|------|----------|
| `/store`, `/store/` | Pass-through → existing rewrite to `/shop` (catalog listing) |
| Deep `/store/.../{leaf}/` with match | **301** → `/product/{slug}` |
| Deep path without match | Pass-through (not forced to listing home) |

`/shop` → `/store` redirects in `next.config.js` are unchanged.

---

## H. `/product` routing unchanged

- No changes to `frontend/app/product/[slug]/page.tsx`.
- No `Product.slug` database or seed changes.
- Resolver ignores `/product/...` pathnames (leaf extraction only for `/store/...`).
- Canonical product URL remains `/product/{slug}`. Legacy URLs **redirect**; they do **not** render a second PDP.

---

## I. TypeScript

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

**Result:** PASS (exit 0).

---

## J. Tests

File: `frontend/lib/legacy-woo-product-url.test.ts`

Run:

```bash
cd frontend && npx tsx --test lib/legacy-woo-product-url.test.ts
```

**Result:** PASS — 23/23 tests.

Coverage includes:

- Exact matching slug  
- Renamed alias  
- Case-normalized alias  
- Deep category path  
- Query parameter preservation  
- Multiple category prefixes, same leaf  
- `/store` root  
- Unknown legacy product  
- `elemental-chimes` / `box-tanpura`  
- Malicious / open-redirect input  
- Current `/product` path unaffected  

---

## K. Build

```bash
cd frontend && npm run build
```

**Result:** PASS (exit 0) — Next.js production build succeeded.

---

## Implementation files

| File | Role |
|------|------|
| `frontend/lib/legacy-woo-product-url.ts` | Resolver, known-slug allowlist, alias map, query filter |
| `frontend/lib/legacy-woo-product-url.test.ts` | Unit tests (`node:test`) |
| `frontend/middleware.ts` | 301 wiring for `/store/...` product leaves |

Resolve order:

1. **A** Exact `Product.slug` (audited allowlist)  
2. **B** Case-normalized known slug  
3. **C** Explicit audited leaf → slug alias  

---

## Cutover UAT checklist (manual)

1. `/store` still shows shop listing.  
2. Pick a direct-slug Merchant URL → 301 → `/product/{same-slug}` with `attribute_*` kept.  
3. Pick wind-gong engraved leaf → 301 → `/product/wind-gong-etched`.  
4. `/store/.../copper-tongue-cleaner/` → 301 → `/product/Copper-Tongue-Cleaner`.  
5. `/store/.../elemental-chimes/` → **not** homepage; expect 404 until mapped.  
6. `/product/ocean-drums` still 200 (unchanged).  

---

SARVEDA LEGACY WOO URL COMPATIBILITY COMPLETE — READY FOR CUTOVER UAT
