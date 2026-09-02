# Sarveda Release Certification — P1 Remediation

**Date:** 2026-09-01  
**Scope:** Resolve both P1 findings from UAT V1. No DNS / Merchant Center / Ads / OAuth dashboards / provider dashboards changed.

---

## P1-A — Legacy Woo alias `non-printed-copper-water-bottles`

### Root cause

Certification exhaustive harness treated the **first** `NEEDS 301` TSV row for that leaf as the expected slug (`copper-bottle-curved-vintage-hammered`, **medium** / `sku_exact_parent_mismatch`).

That expectation was **not** conclusive against the audit artifact.

### Evidence (`docs/audit/merchant_woo_sarveda_mapping.tsv` + live API)

| Fact | Detail |
|------|--------|
| Woo leaf parent | `6071` — title **“Grooved, Hammered & Plain Copper Bottle”** |
| Live Sarveda product `grooved-hammered-plain-copper-bottle` | `wooCommerceId=6071` |
| Live Sarveda product `copper-bottle-curved-vintage-hammered` | `wooCommerceId=5495` (separate parent; own `/store/.../copper-bottle-curved-vintage-hammered/` URLs) |
| Leaf rows in mapping | 12 total |
| HIGH + slug for this leaf | **1** — `gla_43480` / SKU `CB-CDG` → **`grooved-hammered-plain-copper-bottle`** (`sku_exact`) |
| Medium → curved-vintage | 2 rows — `sku_exact_parent_mismatch` (Sarveda parent 5495 vs Woo 6071) |
| Unmatched under parent | 9 rows — `NO TARGET` |

Leaf-only 301s can target **one** product. Correct choice = Woo parent 6071 / HIGH match = **`grooved-hammered-plain-copper-bottle`**.

### Redirect

| | Value |
|--|--------|
| **Old redirect (unchanged)** | `/product/grooved-hammered-plain-copper-bottle` |
| **New redirect** | **Same** — alias was already correct; **not** flipped to curved-vintage |
| Alias map change | Comment-only documentation in `LEGACY_WOO_LEAF_ALIASES` |
| Product.slug | **Unchanged** |

### Regression

- Unit test: maps leaf → `grooved-hammered-plain-copper-bottle`, asserts **not** curved-vintage (`legacy-woo-product-url.test.ts`)
- Exhaustive re-run (`legacy_url_exhaustive_p1.json`): expected slug prefers **alias map / HIGH**, not first TSV row

### Legacy exhaustive result

| Metric | Result |
|--------|--------|
| Unique `/store` audited paths | **148** |
| Pass | **148** |
| Wrong-target | **0** |
| Expected unresolved | 2 (`elemental-chimes`, `box-tanpura`) |
| Unit tests | **30/30 pass** |

---

## P1-B — Partial monetary refund restocked inventory

### Root cause

**Production defect** in `finalizeGatewayRefund` (not a stale test expectation).

Intended Sarveda model (code + admin API comments + existing tests):

| Scenario | Inventory |
|----------|-----------|
| 1. Cancel before fulfilment (paid pipeline, stock confirmed) | Restock via full-order status change |
| 2. Full gateway refund → order `REFUNDED` | Restock full qtyOrdered (SELLABLE events) |
| 3. **Partial monetary refund only** | **No restock** — money ≠ physical return |
| 4. Partial quantity return | Explicit admin `inventory-restock` with qty |
| 5. Returned goods | Admin restock (SELLABLE / DAMAGED / NON_RESTOCKABLE) |
| 6–7. Refund after/before shipment | Full `REFUNDED` still uses full-order restock; partial money does not |

**Key answer:** A partial monetary refund must **NOT** automatically restock. Physical return is a separate authoritative restock event.

### What went wrong

1. Commerce test mock always returned provider refund id `rfnd_test_001`.
2. After a prior full-refund test succeeded with that id, the next partial refund hit `finalizeGatewayRefund`’s “existing providerRefundId on another Refund row” branch.
3. That branch recomputed **the other payment’s** fully-refunded state, then called `handlePaidOrderStatusChange(opts.orderId, "REFUNDED")` on the **current** order → full restock (8→8 instead of staying at 6).

### Fix

| File | Change |
|------|--------|
| `backend/src/modules/payments/refund-sync.service.ts` | Duplicate `providerRefundId` on a **different** refund row → fail reserved refund + throw `DUPLICATE_REFUND` (409). **Do not** restock/status-change `opts.orderId` from another payment’s state. |
| `backend/test/commerce/setup-mocks.ts` | Unique Razorpay refund ids per call |
| `backend/test/commerce/order-inventory-restock.test.ts` | Strengthen partial-refund assertions; add cross-order duplicate provider-id regression |

### Inventory behavior

| | Before | After |
|--|--------|--------|
| Partial money refund (healthy path) | Should stay deducted; polluted path restored stock | Stays deducted; order `PARTIALLY_REFUNDED`, **0** restock events |
| Duplicate providerRefundId across orders | Could restock wrong order | Rejected `DUPLICATE_REFUND`; stock unchanged |

Payment history, original order/invoice, refund rows, and journals are not rewritten.

### Refund regression matrix

| Case | Result |
|------|--------|
| A. Payment failure / no anomalous restock | Covered by payment-flow / stock paths |
| B. Paid → stock deduction | PASS (`payment-flow`, restock suite) |
| C. Duplicate payment complete → no double deduction | PASS |
| D. Cancel / full refund restock | PASS |
| E. Full refund + restock events | PASS |
| F. Partial monetary only | PASS (fixed) |
| G. Partial quantity return (admin) | PASS |
| H. Duplicate refund webhook / provider id | PASS (hardening + new cross-order test) |
| I. Amount > remaining rejected | PASS (hardening) |
| J. Multiple sequential partial SELLABLE returns | PASS |
| K–L. Accounting / credit note | Full refund Zoho credit-note mock PASS; `order-refunded-full` + refund-hardening PASS in remediation run |

Schema limitation (documented): gateway refunds do not carry return qty — physical restock remains admin-explicit except full-order cancel/REFUNDED.

---

## Validation results

| Check | Result |
|-------|--------|
| Frontend `tsc` | **PASS** |
| Frontend production build | **PASS** |
| Legacy unit tests | **30/30 PASS** |
| Legacy exhaustive (`legacy_url_exhaustive_p1.json`) | **148/148 PASS, 0 wrong-target** |
| Backend `tsc` | **PASS** |
| Commerce vitest (11 files) | **89/89 PASS** (was 87 pass / 1 fail) |
| Refund + restock + payment-flow | **PASS** |
| Accounting `order-refunded-full` + refund-hardening | **2 files / 37 tests PASS** |

### Newly discovered P0/P1

None beyond the fixed P1-B production duplicate-providerRefundId restock bug.

---

## Final verdict

**P1 REMEDIATION COMPLETE — RELEASE CANDIDATE**

(Alias kept correct; refund restock defect fixed; suites green. Manual money UAT still recommended before cutover, unchanged from UAT V1.)

---

SARVEDA RELEASE CERTIFICATION P1 REMEDIATION COMPLETE — READY FOR REVIEW
