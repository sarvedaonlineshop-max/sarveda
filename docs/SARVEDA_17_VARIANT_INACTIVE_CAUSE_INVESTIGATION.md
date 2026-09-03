# SARVEDA — How 17 variants became INACTIVE (2026-09-02)

**Mode:** READ-ONLY investigation  
**Date:** 2026-09-03  
**Scope:** Exact cause of `ProductVariant.status = INACTIVE` for the 17 Merchant delta offers  
**Constraint:** No DB / feed / Merchant / Ads changes made

---

## Executive finding

These 17 variants were **not** intentionally toggled to INACTIVE as a catalog decision.

They were **automatically soft-deactivated** by admin product save logic:

`ProductForm` save → `PUT /api/admin/products/:id` → `saveProductAdmin` → `syncVariants()`  
which marks every existing variant **missing from the save payload** as `INACTIVE`.

That omit-path was fed by the admin UI’s **`pruneVariantRows` / option-axis rebuild** behavior: when variant levels/options are edited (or become inconsistent) during catalog work, SKU rows drop out of the form; the next Save then permanently soft-deletes them in DB.

Category reassignment alone does **not** deactivate variants. Saving the product **after** category/option edits **does**, if the payload no longer lists every prior variant id.

---

## Root mechanism (code)

### Backend — automatic deactivation

```151:157:backend/src/modules/products/productAdmin.service.ts
  for (const ex of existing) {
    if (!incomingIds.has(ex.id)) {
      await prisma.productVariant.update({
        where: { id: ex.id },
        data: { status: "INACTIVE" }
      });
    }
  }
```

Any admin save that includes a `variants` array but omits some existing variant IDs will INACTIVE those omitted rows. There is no confirmation UI and no audit log table.

### Frontend — how rows disappear before save

```108:148:frontend/lib/variant-admin.ts
/** Drop SKU rows that no longer match the current dropdown options. */
export function pruneVariantRows(...)
```

`ProductForm` runs `pruneVariantRows` whenever option-axis values change, and always sends the current (possibly pruned) `variants` array on save (`buildPayload()`).

### What does **not** explain the 17

| Path | Result |
|------|--------|
| Category-only DB update (no variants array) | `syncVariants` skipped — no deactivation |
| XL sheet apply (`productXlSheet.service.ts`) | Updates price/SKU/qty — **does not** set `INACTIVE` |
| Drop-shipping import (`import-drop-shipping-v1.ts`) | Updates `dropShipEnabled` only — **does not** set `INACTIVE` |
| Catalog cleanup / reconcile scripts on Sep 2 | No evidence those scripts ran against these 17 at the event times |
| Manual status toggle as primary action | Teammate denies; no admin UI evidence of deliberate per-SKU status flips for all 17 |

---

## Timeline evidence (Lightsail nginx + DB)

Admin browser: Windows Chrome → `https://sarveda-demo.xyz/admin/products/{id}`  
Nginx: `/var/log/nginx/access.log.1`  
DB: Lightsail Postgres `Product` / `ProductVariant.updatedAt`

### Batch A — yoga mats (7 offers) — clearest proof

| Time (UTC) | Evidence |
|------------|----------|
| 11:02:37 | `GET` product `5dc3e0ae-…` (yoga-mats-lotus) size **47766** |
| 11:02:42 | First `PUT` → response shrinks to **32489** |
| 11:04:22–11:04:29 | Further `PUT`s; DB `variant.updatedAt` cluster **11:04:28** |
| After | **1 ACTIVE** (`YO-M-CT-L-M-O`, attributes empty) + **7 INACTIVE** |

Classification: **AUTOMATICALLY_DEACTIVATED** (admin save omit-path).  
Related: catalog cleanup session (category work likely co-occurring) → treat as **CATEGORY_MOVE_SIDE_EFFECT** only in the sense that category edits were done via full product Save, not because category FK logic deactivates variants.

### Batch B — zafu lotus (2 of 17) + zafu plain (4)

| Product | GET size → first PUT size | DB cluster |
|---------|---------------------------|------------|
| zafu-zabuton-combo-lotus-embroidery | 31420 → 24632 @ 12:45:14 | 12:45:17 |
| zafu-zabuton-combo-plain | 37024 → 25093 @ 12:45:33 | 12:45:38 |

Same pattern: open admin product → Save → payload shrink → one ACTIVE survivor (empty attributes) + rest INACTIVE.

Classification: **AUTOMATICALLY_DEACTIVATED** (+ same side-effect context as category cleanup saves).

### Batch C — tongue drum (2) + angel forks (2)

| Product | Admin `PUT`s | Product.updatedAt | Variant status write | Later `updatedAt` noise |
|---------|--------------|-------------------|----------------------|-------------------------|
| 11-note-tongue-drum | 10:22, **13:08** | 13:08:19 | Omit-path at **13:08** (inferred) | **15:11** dropship import rewrote `updatedAt` while setting/confirming `dropShipEnabled` |
| angel-tuning-forks | **13:15** | 13:15:08 | Omit-path at **13:15** (SET3 also inactivated then) | **15:11** same dropship `updatedAt` rewrite for Y-dropship SKUs |

Drop-shipping import summary on Lightsail: `CHANGED: 0` on the retained artifact (idempotent re-run), but selective `updatedAt=15:11` on exactly the SKUs that are `dropShipEnabled=true` matches a prior apply that touched only those rows **without** changing `status`.

Nginx shows **no** admin product `PUT` at 15:11 — so 15:11 is **not** the inactivation event.

Classification: **AUTOMATICALLY_DEACTIVATED** at 13:08 / 13:15 admin saves.  
Not IMPORT_DEACTIVATED. Not dropship-caused.

---

## Per-offer classification (all 17)

| g:id | SKU | Product | Classification | Evidence |
|------|-----|---------|----------------|----------|
| 46192 | YO-M-CT-L-M-G | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | Admin PUT 11:04; omit-path; sibling ACTIVE |
| 46194 | YO-M-CT-L-M-B | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | same |
| 46195 | YO-M-CT-L-M-P | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | same |
| 46196 | YO-M-CT-L-S-T | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | same |
| 46197 | YO-M-CT-L-S-O | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | same |
| 46198 | YO-M-CT-L-S-Y | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | same |
| 46199 | YO-M-CT-L-S-P | yoga-mats-lotus | AUTOMATICALLY_DEACTIVATED | same |
| 9314 | ME-Z-Zn-EM-L-MB | zafu lotus embroidery | AUTOMATICALLY_DEACTIVATED | Admin PUT 12:45:17 |
| 9568 | ME-Z-Zn-EM-L-LG | zafu lotus embroidery | AUTOMATICALLY_DEACTIVATED | same |
| 7185 | ME-Z-Zn-DG | zafu plain | AUTOMATICALLY_DEACTIVATED | Admin PUT 12:45:38 |
| 9597 | ME-Z-Zn-LV | zafu plain | AUTOMATICALLY_DEACTIVATED | same |
| 9598 | ME-Z-Zn-LG | zafu plain | AUTOMATICALLY_DEACTIVATED | same |
| 9599 | ME-Z-Zn-MB | zafu plain | AUTOMATICALLY_DEACTIVATED | same |
| 42411 | MI-TD-11N-W-12 | 11-note-tongue-drum | AUTOMATICALLY_DEACTIVATED | Admin PUT 13:08; `updatedAt` later polluted by dropship |
| 42412 | MI-TD-11N-W-6 | 11-note-tongue-drum | AUTOMATICALLY_DEACTIVATED | same; attrs incomplete (`Color:White` only) — prune-prone |
| 48210 | MI-TF-AG-4160 | angel-tuning-forks | AUTOMATICALLY_DEACTIVATED | Admin PUT 13:15; dropship later polluted `updatedAt` |
| 48211 | MI-TF-AG-4225 | angel-tuning-forks | AUTOMATICALLY_DEACTIVATED | same |

**Counts**

| Label | Count |
|-------|------:|
| MANUALLY_DEACTIVATED | 0 |
| AUTOMATICALLY_DEACTIVATED | **17** |
| IMPORT_DEACTIVATED | 0 |
| CATALOG_CLEANUP_DEACTIVATED | 0 (no cleanup script match) |
| CATEGORY_MOVE_SIDE_EFFECT | 0 as sole cause; **17** occurred during admin saves in a category-cleanup work session |
| UNKNOWN | 0 |

---

## Are these 17 supposed to be sellable now?

### Answer: **YES** (catalog defect / accidental soft-delete)

Evidence they should return to shop + Merchant once reactivated:

1. Teammate confirmation: **not intentional** INACTIVE.
2. Parent products remain **ACTIVE**, `catalogHidden=false`, not deleted.
3. All 17 were in the prior certified **790** Merchant feed as historical sellable offers.
4. CTX registry still **PUBLISH** with intact variant mappings (exclusion is only `INACTIVE_VARIANT`).
5. Sibling variants on the same products remain ACTIVE and in the live feed — product was not meant to collapse to a single SKU.
6. Several inactive yoga-mat variants still have **onHand > 0** (not a stock-out drafting pattern).
7. Surviving “ACTIVE” rows often have **empty attribute payloads** after the save — consistent with UI prune corruption, not a deliberate “keep only Navy Blue / Orange” merchandising decision documented anywhere.

### What current DB state does **not** prove

`status=INACTIVE` alone does **not** prove intentional exclusion. It only proves the omit-path ran.

There is **no** separate admin flag, draft product status, or merchant manual exclusion explaining these 17.

---

## Implications

| Question | Answer |
|----------|--------|
| Is 773 still “mechanically consistent” with current ACTIVE variants? | Yes (feed follows `ACTIVE` gate) |
| Is 773 the **intended** sellable Merchant catalog? | **No** — 17 accidental omissions |
| Is this a Merchant feed bug? | **No** — feed correctly excludes INACTIVE |
| Is this a catalog/admin defect? | **YES** — `pruneVariantRows` + `syncVariants` soft-delete on Save |
| Should the 17 eventually return to the feed? | **YES**, after intentional reactivation (out of scope for this read-only report) |

---

## Recommended fix direction (not applied)

1. Stop auto-INACTIVE on omitted IDs unless explicit `delete`/`deactivate` action.
2. Warn in admin when Save would deactivate N variants.
3. Do not prune existing SKU rows silently when editing categories/axes.
4. Add audit log for variant status transitions.

---

## Artifacts

- Prior recon: `docs/SARVEDA_MERCHANT_790_TO_773_FINAL_RECONCILIATION.md`
- Nginx: `/var/log/nginx/access.log.1` (02/Sep/2026)
- Code: `backend/src/modules/products/productAdmin.service.ts` (`syncVariants`)
- Code: `frontend/lib/variant-admin.ts` (`pruneVariantRows`)

---

SARVEDA 17-VARIANT INACTIVE CAUSE INVESTIGATION COMPLETE
