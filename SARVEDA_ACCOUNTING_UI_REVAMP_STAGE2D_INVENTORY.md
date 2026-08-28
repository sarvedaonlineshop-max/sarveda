# SARVEDA ACCOUNTING UI REVAMP — STAGE 2D INVENTORY

**Mode:** Frontend presentation / IA only  
**Date:** 2026-08-28  
**Prior locked:** 2A Purchases · 2B Banking · 2C Sales  

---

## Files changed

### New
- `frontend/components/admin/accounting/inventory/AdminInventoryNav.tsx`
- `frontend/components/admin/accounting/inventory/inventory-ui.tsx`
- `frontend/app/admin/accounting/inventory/valuation/page.tsx`
- `frontend/app/admin/accounting/inventory/reconciliation/page.tsx`
- `frontend/app/admin/accounting/inventory/capitalization/page.tsx`
- `frontend/app/admin/accounting/inventory/cogs/page.tsx`
- `frontend/app/admin/accounting/inventory/reversals/page.tsx`
- `frontend/app/admin/accounting/inventory/opening/page.tsx` (Advanced XLSX; not in Inventory tabs)
- `SARVEDA_ACCOUNTING_UI_REVAMP_STAGE2D_INVENTORY.md` (this report)

### Rewritten
- `frontend/app/admin/accounting/inventory/page.tsx` — Overview (replaces mega-page)

### Updated
- `frontend/components/admin/accounting/AdminAccountingNav.tsx` — Inventory sub-items + Advanced “Inventory Opening”
- `frontend/app/admin/accounting/opening/page.tsx` — link to Inventory Opening XLSX

---

## Routes

| Route | Screen |
|-------|--------|
| `/admin/accounting/inventory` | Overview |
| `/admin/accounting/inventory/valuation` | Valuation |
| `/admin/accounting/inventory/reconciliation` | Reconciliation |
| `/admin/accounting/inventory/capitalization` | Inventory Purchases |
| `/admin/accounting/inventory/cogs` | Cost of Goods Sold |
| `/admin/accounting/inventory/reversals` | Inventory Cost Reversals |
| `/admin/accounting/inventory/opening` | Inventory Opening XLSX (Advanced only) |

Secondary tabs: Overview · Valuation · Reconciliation · Purchase Capitalization · Cost of Goods Sold · Reversals  

---

## Components reused
Shared `accounting-ui` + Sales-style shell/table/fact cards; `AdminConfirmModal`; inventory-specific status humanization and zero-layer empty state.

---

## API reuse (unchanged backend)
- `fetchInventoryReconciliationV4`, `fetchPurchaseCapitalizationClearing`
- Capitalization: preview / post / discover (dryRun)
- COGS: preview / post / discover (dryRun)
- Reversal: preview / post / discover (dryRun)
- Opening: template / preview upload / draft / post / batches list  

---

## Overview
KPIs from recon v4 financial control + attention counts; Needs Attention deep-links; Quick Actions to review workflows; zero-layer informative state with Opening links.

## Valuation
SKU table with on-hand, accounting qty, value, average remaining cost (value÷qty only), human statuses, View detail (no invented layer list).

## Reconciliation
Diagnostic copy; Refresh + View Details only; **no Resolve**; `?attention=1` filter.

## Capitalization
Clearing worklist + Find Purchases to Record (discover dryRun) + structured preview + **Record Inventory Purchase** confirmation. Account names first (codes secondary).

## COGS
Order number workflow; Find Orders to Record; structured preview + impact; insufficient-cost helper → valuation; confirmation modal.

## Reversals
Find Returns; preview explains accounting-only (no ops onHand claim); confirmation **Record Reversal**.

## Opening placement
Removed from daily Inventory tabs; Advanced → Inventory Opening (+ link from Opening Balances). Strong confirmation on post.

## Status mapping
See `inventoryStatusLabel` / `clearingStatusLabel` in `inventory-ui.tsx`.

## Dangerous actions guarded
Capitalization, COGS, Reversal, Opening Inventory — all use `AdminConfirmModal`.

## Loading / empty
Skeleton pulse; intentional empty and zero-layer copy; no `[]`/`null` dumps.

## Deep links
`?attention=1` on reconciliation; `?find=1` on capitalization / cogs / reversals (non-posting discover only).

## Intentionally not implemented
- Per-layer cost composition detail (API does not return remaining layers on recon rows)
- Resolve / adjust reconciliation
- Warehouse costing
- Clearing-row direct post without receiptLineId (uses discover for receipt lines)
- Automatic posting

## Validation
- TypeScript: **PASS** (`npx tsc --noEmit`)
- Build: **PASS** (`npm run build`)
- Backend changed: **NO**
- Accounting logic changed: **NO**
