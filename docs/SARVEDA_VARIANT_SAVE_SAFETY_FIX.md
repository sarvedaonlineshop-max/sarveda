# SARVEDA — Variant Save Safety Fix

**Date:** 2026-09-03  
**Scope:** Stop silent `ProductVariant` soft-deactivation on admin Save  
**Does NOT:** reactivate the 17 accidental INACTIVE variants (separate restoration task)

---

## Final verdict

# A. VARIANT SAVE SAFETY FIX COMPLETE

---

## ROOT_CAUSE

Admin `ProductForm` Save → `pruneVariantRows()` dropped persisted SKU rows when option axes changed → `syncVariants()` marked any existing variant **missing from the payload** as `INACTIVE`.

Category reassignment itself did not deactivate; full product Save during catalog edits did.

---

## OLD_BEHAVIOR

| Step | Behavior |
|------|----------|
| Frontend prune | Silently removed persisted rows that no longer matched option combos |
| Backend omit | `if (!incomingIds.has(ex.id)) status = INACTIVE` |
| Operator signal | None — looked like a normal Save |

---

## NEW_BEHAVIOR

| Step | Behavior |
|------|----------|
| Frontend prune | **Keeps** all persisted (`id`) rows; flags `optionMismatch`; drops only unsaved drafts |
| Backend omit | **No status change** for omitted variants |
| Explicit deactivate | `deactivateVariantIds: string[]` only |
| UX | Warning when options affect existing variants; confirm before queueing deactivation |

---

## BACKEND_IMPLICIT_DEACTIVATION_REMOVED

**YES** — removed from `syncVariants()` in `productAdmin.service.ts`.

Absence from `variants` ⇒ leave that row unchanged (SKU, status, dropship, inventory).

---

## EXPLICIT_DEACTIVATION_METHOD

Request field: **`deactivateVariantIds: string[]`**

Rules implemented:

- Only listed IDs may become `INACTIVE`
- Must belong to the product being edited
- Unknown / foreign ID → `400 VARIANT_NOT_ON_PRODUCT`
- Duplicates safe; empty / omitted → deactivate nothing
- Idempotent if already `INACTIVE`
- Per-variant `status` in payload still allowed as an explicit field update (logged)

Ordinary category / title / description / SEO / image saves without `deactivateVariantIds` cannot deactivate.

---

## FRONTEND_PRUNE_BEHAVIOR

`frontend/lib/variant-admin.ts` — `pruneVariantRows`:

- Persisted rows always retained
- Mismatch flagged for review (original attrs preserved when mismatched)
- Unsaved draft rows may still be dropped when non-matching
- ProductForm: “Deactivate…” requires confirmation → queues `deactivateVariantIds`
- Banner: “Changing these options affects N existing variants. They will NOT be deleted automatically.”

---

## CATEGORY_SAVE_SAFE

**YES** — VSB-002: category-only save (no `variants` key) preserves all ACTIVE statuses.

Also covered: title, description, images (VSB-003/004/005).

---

## OPTION_EDIT_SAFE

**YES** — VSB-006 / VSB-007: axis edits do not auto-deactivate; prune cannot soft-delete persisted rows.

---

## AUDIT_LOGGING

Winston structured log (no new DB table — pre-launch minimal):

```json
{
  "message": "variant_status_transition",
  "variantId": "...",
  "productId": "...",
  "oldStatus": "ACTIVE",
  "newStatus": "INACTIVE",
  "actorId": "...",
  "reason": "explicit_deactivate",
  "action": "deactivateVariantIds",
  "timestamp": "..."
}
```

Also logged when `variant.status` field explicitly changes.

---

## TESTS

| ID | Result |
|----|--------|
| VSB-001 omitted persisted remains ACTIVE | PASS |
| VSB-002 category-only preserves | PASS |
| VSB-003/004 title+description | PASS |
| VSB-005 image save | PASS |
| VSB-006 option-axis edit | PASS |
| VSB-007 prune cannot soft-delete persisted | PASS (frontend) |
| VSB-008/009 explicit deactivate + idempotent | PASS |
| VSB-010 foreign id rejected | PASS |
| VSB-011 create variant | PASS |
| VSB-012–015 update / sku / dropship / inventory | PASS |
| VSB-017 ordinary full save | PASS |
| VSB-018 two ordinary saves | PASS |
| VSB-016 Merchant identity | N/A side-effect — admin save does not touch CTX/merchant identity tables; feed still keys off ACTIVE only |

Files:

- `backend/test/commerce/variant-save-safety.test.ts`
- `frontend/lib/variant-admin.test.ts`

---

## DEPLOY_SHA

`dded6f3ad7ef019a00b4be4e420193bba6c7aea6`

---

## P0 / P1

| Severity | Items |
|----------|--------|
| **P0** | 0 open for this fix |
| **P1** | Controlled restoration of the 17 accidental INACTIVE variants (follow-up task only) |

---

## Live verification checklist (demo)

After deploy to Lightsail + Vercel:

1. Open a safe non-critical product in admin
2. Change category only → Save → reload → variant count/status unchanged
3. Confirm no unintended INACTIVE flips
4. **Do not** reactivate the known 17 in this release

---

SARVEDA VARIANT SAVE SAFETY FIX COMPLETE — READY FOR 17-VARIANT RESTORATION
