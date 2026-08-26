# SARVEDA ACCOUNTING — PHASE 3D4 RETURN / RESTOCK COGS

**Status:** VALIDATED  
**Date:** 2026-08-24  
**Calc version:** `INVENTORY_COGS_REVERSED_V1`  
**Depends on:** Phase 3D3 FIFO COGS (VALIDATED) + operational `OrderInventoryRestockEvent`

---

## Verdict

PHASE 3D4 RETURN / RESTOCK COGS VALIDATED  
PHASE 3D INVENTORY / COGS COMPLETE

---

## 1. Executive summary

Phase 3D4-B posts COGS reversal when a previously COGS-posted physical `OrderItem` is restored via a **SELLABLE** `OrderInventoryRestockEvent`:

```text
Dr 1200 Inventory Asset
    Cr 5000 Cost of Goods Sold
```

Restored unit costs come **only** from historical `AccountingInventoryCostConsumption` (Phase 3D3). New `RETURN_RESTOCK` cost layers are created; depleted sale layers are never resurrected. Commerce remains the sole authority for `Inventory.onHand`.

---

## 2. Investigation findings (ops foundation — approved)

| Question | Answer |
|----------|--------|
| Refund → exact OrderItem? | **No** (`Refund` is payment + amount) |
| Returned qty per item? | **No** on Refund; **yes** on `OrderInventoryRestockEvent` |
| Money without physical return? | **Yes** (partial refunds) |
| Stock without refund? | **Yes** via admin explicit restock API |
| What increments onHand? | Commerce restock service only |
| Damaged / non-restockable? | `DAMAGED` / `NON_RESTOCKABLE` dispositions |
| Partial multi-return? | **Yes** (admin explicit + remaining-qty checks) |
| Accounting identifier | `OrderInventoryRestockEvent.id` |
| Financial vs physical vs sellable? | Separated: Refund ≠ restock event ≠ SELLABLE |

Accounting never derives cost from `Refund.amount`.

---

## 3. Operational restock lifecycle

```text
Full paid CANCELLED / REFUNDED
  → SELLABLE OrderInventoryRestockEvent per OrderItem (qtyOrdered)
  → onHand += qty (commerce)

Admin POST /api/admin/orders/:id/inventory-restock
  → SELLABLE / DAMAGED / NON_RESTOCKABLE lines
  → only SELLABLE increments onHand

Partial monetary refund
  → Refund only; no restock event
```

---

## 4. Accounting boundary

| Owns | Does not own |
|------|----------------|
| `INVENTORY_COGS_REVERSED` posting event | `Inventory.onHand` / `reserved` |
| Dr 1200 / Cr 5000 journal | `ProductVariant.costInPaise` |
| `RETURN_RESTOCK` layers | Revenue refund journals |
| Linkage restock → consumptions → layers → journal | Gateway Refund rows as cost source |

**Eligible source:** `disposition = SELLABLE` only.  
**DAMAGED / NON_RESTOCKABLE:** `NO_ACCOUNTING_RESTOCK_REQUIRED` (no 1200 restore in this phase).

---

## 5. Historical-cost reversal algorithm

**Policy:** `LIFO_OF_CONSUMPTION_V1`

Reverse against `AccountingInventoryCostConsumption` for the `OrderItem`, ordered:

1. `consumedAt DESC`
2. `createdAt DESC`
3. `id DESC`

Example: sale consumed 10 @ ₹500 then 2 @ ₹600. Return 3 → restore **2 @ ₹600 + 1 @ ₹500 = ₹1,700**.

Remaining reversible = original consumed − already reversed (sum of `RETURN_RESTOCK.quantityOriginal` for that `orderItemId`). Over-return → `RETURN_QTY_EXCEEDS_REVERSIBLE_COGS` (fail closed, no partial post).

---

## 6. RETURN_RESTOCK layers

New layers per restored segment:

- `sourceType = RETURN_RESTOCK`
- `sourceId = restockEventId`
- `sourceLineId = orderItemId`
- fingerprint includes original `consumptionId`, qty, unit cost, calc version
- `effectiveAt = restock event createdAt`
- Participate in normal FIFO thereafter

---

## 7. Idempotency & concurrency

- Unique key: `inventory_cogs_reversal:{restockEventId}`
- Event type: `INVENTORY_COGS_REVERSED`
- PostgreSQL `FOR UPDATE` on restock events for OrderItem, consumptions, and prior RETURN_RESTOCK layers
- 20 concurrent same-event posts → 1 event, 1 journal, 1 layer set
- Concurrent competing restocks cannot reverse more than original COGS qty

---

## 8. Feature flags (default OFF)

```text
NATIVE_ACCOUNTING_ENABLED=1
ACCOUNTING_INVENTORY_VALUATION_ENABLED=1
ACCOUNTING_COGS_POSTING_ENABLED=1
ACCOUNTING_COGS_REVERSAL_ENABLED=1
# production-like also:
ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1
```

Discovery defaults to `dryRun=true`.

---

## 9. Reconciliation V4

Per variant adds:

- return-restock layer qty / value
- original consumed / reversed / net consumed
- net COGS

Controls:

- 1200 GL ≈ remaining active layer value (incl. RETURN_RESTOCK)
- net 5000 ≈ original consumptions − valid return reversals

Statuses include: `RETURN_COGS_UNPOSTED`, `RESTOCK_WITHOUT_SOURCE_COGS`, `RETURN_QTY_EXCEEDS_REVERSIBLE_COGS`, `DAMAGED_NO_RESTOCK_VALUE`, `NON_RESTOCKABLE`, etc.

---

## 10. Admin UI / API

- `POST /api/admin/accounting/inventory/cogs-reversal/preview|post|discover`
- `GET /api/admin/accounting/inventory/reconciliation/v4`
- Admin page `/admin/accounting/inventory` — Return / Restock COGS section

Commerce refund/order flows unchanged for accounting (ops restock events already wired).

---

## 11. Local verification

| Check | Result |
|-------|--------|
| Prisma validate | PASS |
| COGS reversal suite | **10/10** |
| Focused COGS + restock ops + refund | **33/33** |
| Full backend suite | **297/297** across **23/23** files |
| Backend build (`tsc`) | PASS |
| Frontend build | PASS |

---

## 12. Lightsail tagged validation

| Field | Value |
|-------|--------|
| Host | `ip-172-26-7-99` (`13.204.112.165`) |
| DB | `sarveda_db` @ `ls-***.c9oiska8wm8k.ap-south-1.rds.amazonaws.com` |
| Production-like | YES |
| Localhost | NO |
| Flags | Process-scoped only; `.env` left without reversal flags |
| Fixture | `SRV-TEST-ACC-111947b4` / `TEST-ACC-REV-111947b4` |
| COGS journal | `JE-202608-00041` (₹6,200) |
| Reversal journal | `JE-202608-00042` (₹1,700) |
| Segments | 2 @ ₹600 + 1 @ ₹500 |
| RETURN_RESTOCK layers | 2 |
| Duplicate replay | idempotent |
| DAMAGED | `NO_ACCOUNTING_RESTOCK_REQUIRED` |
| Subsequent FIFO | consumed RETURN_RESTOCK (`JE-202608-00044`) |
| onHand / reserved / costInPaise | unchanged by accounting |

**Cleanup:** Retain `TEST-ACC-*` / `SRV-TEST-*` / restock events / journals for approved pre-production purge. Do not force-delete immutable journals now.

Also retained earlier fixtures (e.g. `SRV-TEST-ACC-9eabfb4b`, `31857d4c` partial runs, Phase 3D3 tags).

---

## 13. Phase 3D close-out lifecycle

Verified end-to-end pattern:

```text
OPENING → 1200 + OPENING layer
VENDOR BILL / PURCHASE → 1210 then capitalization → PURCHASE_RECEIPT layer
SALE → 5000 / 1200 + FIFO consumption
SELLABLE RETURN → 1200 / 5000 + RETURN_RESTOCK layer
```

Financial controls:

- 1200 ↔ remaining native layer value
- 1210 ↔ unmatched clearing (prior phases)
- 5000 net ↔ consumptions − valid reversals

---

## 14. Data to replace before production

Extend production checklist:

1. **OPERATIONAL REAL DATA** — real stock, POs, bills, orders  
2. **ACCOUNTING OPENING DATA** — reviewed opening batch  
3. **TEST/DUMMY DATA** — remove `TEST-ACC-*`, `SRV-TEST-*`, test restock events, test return layers (journals via approved purge only)  
4. **POST-CUTOVER NATIVE DATA** — keep from cutover forward  

---

## 15. Safety audit

| Check | Result |
|-------|--------|
| COMMERCE FILES MODIFIED | Ops restock foundation only (`order-inventory-restock.service.ts`, `orders.service.ts` restock path, admin restock endpoints) — **no** change in this accounting slice to payment/refund gateway logic |
| ORDER/REFUND FLOW MODIFIED | Accounting does not alter gateway refund |
| RESTOCK OPS FILES MODIFIED | Used as accounting source; no further ops redesign in 3D4-B |
| INVENTORY QUANTITY LOGIC MODIFIED | Accounting does **not** touch onHand |
| PURCHASES FILES MODIFIED | NONE |
| ZOHO FILES MODIFIED | NONE |
| ACCOUNTING TABLES/MIGRATIONS | Ops migration `order_inventory_restock_events` (prerequisite); no new accounting tables for posting |
| TEST DATA CREATED | Local cleaned; Lightsail tagged fixtures retained |
| UNEXPECTED FILES | NONE |
| COMMERCE REGRESSION | PASS |
| PURCHASES REGRESSION | Covered in full suite PASS |

### Files changed (3D4-B accounting + report)

- `backend/src/modules/accounting/inventory-cogs-reversal.constants.ts`
- `backend/src/modules/accounting/inventory-cogs-reversal.types.ts`
- `backend/src/modules/accounting/inventory-cogs-reversal.snapshot.service.ts`
- `backend/src/modules/accounting/inventory-cogs-reversal.eligibility.ts`
- `backend/src/modules/accounting/inventory-cogs-reversal.journal.builder.ts`
- `backend/src/modules/accounting/inventory-cogs-reversal-posting.service.ts`
- `backend/src/modules/accounting/inventory-cogs-reversal-discovery-worker.ts`
- `backend/src/modules/accounting/accounting-flag.ts`
- `backend/src/modules/accounting/accounting-errors.ts`
- `backend/src/modules/accounting/production-guard.ts`
- `backend/src/modules/accounting/accounting.handlers.ts`
- `backend/src/modules/accounting/accounting.routes.ts`
- `backend/src/modules/accounting/inventory.types.ts`
- `backend/src/modules/accounting/inventory-reconciliation.service.ts`
- `backend/test/accounting/inventory-cogs-reversal.test.ts`
- `backend/scripts/phase3d4-lightsail-cogs-reversal-validation.ts`
- `backend/.env.example`
- `frontend/lib/accounting-api.ts`
- `frontend/app/admin/accounting/inventory/page.tsx`
- `SARVEDA_ACCOUNTING_PHASE3D4_RETURN_RESTOCK_COGS.md`

(Ops foundation from prior session also includes restock migration + commerce wiring.)

---

## 16. Explicit stop

Do **not** implement purchase returns, landed cost, bank reconciliation, GST reporting, or Phase 4 in this workstream.

PHASE 3D4 RETURN / RESTOCK COGS VALIDATED  
PHASE 3D INVENTORY / COGS COMPLETE
