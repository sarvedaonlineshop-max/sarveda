# SARVEDA Drop Shipping V1 — Implementation Report

**Date:** 2026-09-02  
**Verdict:** **A. DROP SHIPPING V1 COMPLETE — READY FOR CUTOVER** (pending spreadsheet import on staging/production DB)

---

## A. Schema

Additive migration `20260902193000_drop_shipping_v1`:

| Model | Field | Purpose |
|-------|-------|---------|
| `ProductVariant` | `dropShipEnabled Boolean @default(false)` | Fulfilment policy — vendor can supply when warehouse stock insufficient |
| `OrderItem` | `warehouseFulfillmentQty Int @default(0)` | Snapshot: Sarveda warehouse units at order time |
| `OrderItem` | `dropShipFulfillmentQty Int @default(0)` | Snapshot: vendor-direct units at order time |

Legacy `OrderItem` rows backfilled: `warehouseFulfillmentQty = qtyOrdered`, `dropShipFulfillmentQty = 0`.

**`Inventory.onHand` is never inflated for dropship.**

---

## B. Spreadsheet reconciliation

- **Script:** `backend/scripts/import-drop-shipping-v1.ts`
- **Usage:** `npx tsx scripts/import-drop-shipping-v1.ts --file /path/to/workbook.xlsx --dry-run|--apply`
- **Sheet:** `Inventory` — columns SKU, Drop Shipping(Y/N); On Hand is reference only (not written to DB)
- **Artifacts:** `docs/audit/drop-shipping-v1/drop_shipping_import_reconciliation.csv`, `drop_shipping_import_summary.json`
- **Status:** Workbook not on build machine — import **must be run on staging (Lightsail) before cutover** with the authoritative 790-row file (expected 303 Y / 487 N)

---

## C. Sellability formula

Authoritative helper: `backend/src/modules/inventory/variant-fulfillment-availability.ts`

```
warehouseAvailableQty = max(0, onHand - reserved)   // or UNTRACKED cap when no Inventory row
sellable = warehouseAvailableQty > 0 OR dropShipEnabled
customerOutOfStock = warehouseAvailableQty == 0 AND NOT dropShipEnabled
```

---

## D. Qty allocation formula

For requested qty `Q`:

```
warehouseQty = min(Q, warehouseAvailableQty)
shortfall = max(0, Q - warehouseAvailableQty)

if shortfall == 0 → allowed
if shortfall > 0 AND dropShipEnabled → allowed, dropShipQty = shortfall (cap CUSTOMER_MAX_LINE_QTY = 999)
if shortfall > 0 AND NOT dropShipEnabled → rejected
```

---

## E. PDP behavior

- Non-dropship: zero warehouse → Out of stock; qty capped at warehouse available
- Dropship: zero warehouse → **Available** (in stock for purchase); qty not capped at warehouse (global cap 999)
- Files: `frontend/lib/variant-utils.ts`, `ProductDetailExperience.tsx`, `ProductBuyBox.tsx`

---

## F. Cart behavior

Server-side `assertFulfillmentAllowed` on add/update/merge/set quantity.

Cart payload adds `dropShipEnabled`, `warehouseAvailable`; `maxQuantity` is `null` for dropship lines (no warehouse-only cap).

Files: `backend/src/modules/cart/cart.service.ts`, `frontend/components/cart/*`

---

## G. Checkout behavior

Pre-transaction validation + `OrderItem` snapshot at create. Unchanged payment paths (Razorpay/Stripe/PayPal/COD).

File: `backend/src/modules/checkout/checkout.service.ts`

---

## H. Order snapshot

Set at checkout:

```typescript
warehouseFulfillmentQty + dropShipFulfillmentQty === qtyOrdered
```

Persisted on `OrderItem`; not recomputed from live stock.

---

## I. Inventory deduction

`reserveStockTx` / `confirmStockTx` / `releaseStockTx` use `orderItemWarehouseUnits()` only.

Dropship units never touch `Inventory.onHand` or `reserved`.

---

## J. Cancellation / restock

`restockPaidOrderLinesTx` restocks **warehouse snapshot qty only** — not dropship portion.

Integrated with existing `order-inventory-restock.service.ts` and paid cancel/refund flows.

---

## K. RTO / return interaction

No change to return disposition workflow. Physical restock still via `OrderInventoryRestockEvent` when units are actually received — dropship returns not auto-credited to warehouse.

---

## L. Admin order visibility

Order detail items show fulfilment split: `Warehouse: N · Drop ship: M` when applicable.

File: `frontend/app/admin/orders/[id]/page.tsx`

---

## M. Admin inventory

API rows include `dropShipEnabled`, `shopAvailability` (`WAREHOUSE_IN_STOCK` | `DROP_SHIP_AVAILABLE` | `OUT_OF_STOCK`).

---

## N. Out-of-stock statistics

**Customer out of stock** = `available == 0 AND dropShipEnabled == false` (replaces physical-zero-only count for commercial metric).

New metric: **Drop ship available** = `available == 0 AND dropShipEnabled == true`.

Files: `frontend/lib/inventory-utils.ts`, `AdminInventoryWorkspace.tsx`, `admin.handlers.ts`

---

## O. Shop filtering

No shop-wide “hide zero stock” filter was found that excluded dropship variants. Product listing remains status/catalog driven.

---

## P. Merchant availability

Same rule as storefront:

```
merchantFeedAvailability(onHand, reserved, dropShipEnabled)
→ in_stock if warehouse > 0 OR dropShipEnabled
```

Files: `googleMerchantFeed.ts`, `sarvedaProductsFeed.ts`

---

## Q. Shipment behavior

Shiprocket/Delhivery payloads use **warehouse units only** per line. 100% dropship orders return `DROP_SHIP_ONLY` (fail closed — no Sarveda AWB for vendor units).

Files: `shiprocket.ts`, `shipping/router.ts` (`totalWeightGrams`)

---

## R. Vendor behavior

No vendor PO automation in V1. `dropShipEnabled=true` without supplier mapping does **not** block checkout. Admin can identify drop-ship lines on orders; vendor assignment is Phase 2.

---

## S. Accounting / GST

No price, tax, invoice, or revenue posting changes. Fulfilment source is operational metadata only.

---

## T. Fingerprint decision

Commercial checkout fingerprint **unchanged** — warehouse/dropship allocation is fulfilment metadata and does not affect item/qty/price/shipping/currency fingerprint. Same cart re-checkout may allocate warehouse vs dropship differently without creating a duplicate commercial order.

---

## U. Tests / build

| Check | Result |
|-------|--------|
| `npm run test:commerce` | **216/216 passed** (includes `drop-shipping-v1.test.ts`, merchant feed dropship cases) |
| `backend npx tsc --noEmit` | Pass |
| `frontend npx tsc --noEmit` | Pass (excludes pre-existing vitest path in merchant-variant-selection test) |

---

## V. Production DB changes

| Environment | Migration | Import |
|-------------|-----------|--------|
| Local dev | Applied `20260902193000_drop_shipping_v1` | Pending workbook |
| Staging Lightsail | **Deploy + migrate + import required** | Run import script with authoritative xlsx |
| Production | **After staging verification** | Same idempotent import |

---

## W. Newly discovered P0/P1

| ID | Severity | Item |
|----|----------|------|
| DS-IMPORT | P0 before cutover | Run SKU import on staging/production — code defaults all variants to `dropShipEnabled=false` until import |
| DS-VENDOR | P2 | No vendor identity / PO workflow — operational follow-up |

---

## X. Ready for cutover

**YES** for code — **conditional** on:

1. Deploy migration to staging/production  
2. Run `import-drop-shipping-v1.ts --apply` with authoritative 790-row workbook  
3. Verify reconciliation summary (303 Y / 487 N)  
4. Re-run merchant feed certification on staging (`/api/merchant/google/sarveda-products.xml`)

---

**SARVEDA DROP SHIPPING V1 COMPLETE — READY FOR REVIEW**
