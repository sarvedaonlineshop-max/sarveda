# SARVEDA NATIVE ACCOUNTING — PHASE 2C SHADOW VALIDATION

**Date:** 2026-08-22  
**Scope:** `ORDER_REFUNDED_FULL_V1` + sale dependency + Reconciliation V2 against real pre-launch Lightsail data  
**Not in scope:** settlements, partial-refund GST allocation, COD collection, bank reconciliation, COGS, purchases, Phase 3

---

## Headline labels

| Field | Value |
|-------|--------|
| **ENVIRONMENT** | PRE-LAUNCH LIGHTSAIL / REAL SARVEDA DATABASE |
| **COMMERCE DATA** | REAL |
| **COMMERCE MODIFICATIONS** | NONE |
| **ACCOUNTING SHADOW WRITES** | See §8 (exact Accounting* rows) |
| **EXTERNAL PAYMENT / ZOHO / SHIPPING SIDE EFFECTS** | NONE |

---

## 1. Environment proof (no secrets)

| Check | Result |
|-------|--------|
| Public API host | `13.204.112.165` (Lightsail) |
| Server hostname | `ip-172-26-7-99` |
| NODE_ENV | `production` (deploy shape; **not** customer-launched) |
| Database host | `ls-38d7ccbcac4ed3da1856692cc50fc732f88d42e1.c9oiska8wm8k.ap-south-1.rds.amazonaws.com` |
| Database name | `sarveda_db` |
| Intended pre-launch Lightsail Sarveda DB | **YES** (Lightsail managed Postgres — not DO Woo MySQL / not EC2 RDS prod marker `sarveda-db.ct2kuyqkyegn…`) |
| Live customer traffic | **No** — pre-launch; recent SRV-* orders are internal/test |
| `NATIVE_ACCOUNTING_ENABLED` (`.env` file) | absent / false |
| `ACCOUNTING_SALES_POSTING_ENABLED` (`.env`) | absent / false |
| `ACCOUNTING_REFUND_POSTING_ENABLED` (`.env`) | absent / false |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` (`.env`) | absent / false |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` (`.env`) | absent / false |
| Code `isProductionLikeEnvironment()` | **true** (NODE_ENV=production + Lightsail IP marker) |

**Controlled validation overrides (process env only, not persisted to `.env`):**

- `NATIVE_ACCOUNTING_ENABLED=1`
- `ACCOUNTING_SALES_POSTING_ENABLED=1`
- `ACCOUNTING_REFUND_POSTING_ENABLED=1`
- `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` (required by dual production guard; restored off after run)
- `ACCOUNTING_BULK_DISCOVERY_ALLOWED=1` only for bounded discovery ≤10; deleted after run

**Confirmed after run:** all five posting/discovery keys remain **absent** from Lightsail `backend/.env`.

---

## 2. Safety posture followed

1. Commerce tables **read-only** — fingerprints before/after on Order, OrderItem, Payment, Refund, Inventory, Invoice, Shipment, Zoho fields.
2. **No manufactured** refunds/discounts/COD/GST scenarios — only rows already in DB.
3. **No** Razorpay/Stripe/PayPal mutations, Zoho writes, email, S3 invoice changes, shipping actions, `refund.service`, checkout/payment success, or stock ops.
4. Writes limited to existing **Accounting\*** tables via established posting path.
5. Applied existing accounting migrations only (additive Accounting\* objects). Did **not** apply purchases migration.
6. Sample size small: primary full-refund order + one interstate shipping sale sample; bounded discovery scan = 2 refund rows (limit 10).

---

## 3. Prerequisite fix for historical refunded sales

Real refunded orders have `Payment.status = REFUNDED`, so `ORDER_PAID` eligibility previously failed with `PAYMENT_NOT_CAPTURED`, blocking the required sale journal before refund shadow post.

**Minimal accounting-only change:** online payments with status `CAPTURED` | `REFUNDED` | `PARTIALLY_REFUNDED` remain eligible for historical `ORDER_PAID` shadow posting (`order-eligibility.ts` + unit test). Commerce untouched.

---

## 4. Scenario coverage (real DB)

| Scenario | Result |
|----------|--------|
| Razorpay paid (with line items) | **YES** (5) |
| Stripe paid (with line items) | **DATA_GAP** (WOO Stripe rows lack `OrderItem`) |
| PayPal paid (with line items) | **DATA_GAP** |
| COD (with line items) | **YES** (2 present; refund auto-post still `COD_NOT_AUTO_POSTABLE` by design) |
| Discount (with items) | **DATA_GAP** |
| Shipping | **YES** |
| Interstate GST | **YES** (`SRV-20260800003` TN, `SRV-20260800010` AP vs seller Karnataka → IGST) |
| Multi-line / multi-rate / qty>1 | **DATA_GAP** / not represented in small SRV sample |
| Single processed full refund | **YES** — `SRV-20260800003` |
| Partial refund | **YES** — `WOO-7963` (Stripe `completed`, amount &lt; grand total) |
| Cumulative partials | **DATA_GAP** |
| REFUNDED status without Refund row | **YES** — 6 WOO orders (e.g. `WOO-8091`) |
| Zoho invoice references | **YES** — `SRV-20260800003` zohoInvoiceId / INV/25-26/08902 |

### Gaps closed vs local Phase 2B/2C attempt

Localhost had **0 Refund rows**. Lightsail covered:

- Real Razorpay **full processed** refund with gateway id  
- Real **shipping** + **interstate IGST** sale/refund journals  
- Real **Zoho invoice** link on sale document  
- Real **partial** Stripe refund → correctly `UNPOSTED_PARTIAL`  
- Real **status-only REFUNDED** without payment/refund rows → not auto-posted  

Still missing for later phases: Stripe/PayPal paid with items, discounts, multi-line/multi-rate, cumulative partials, COD refund evidence.

---

## 5. Validation sequence (executed)

Primary order: **`SRV-20260800003`** (Razorpay, grand 800 paise, shipping 300, single processed Refund 800, Zoho invoice present).

1. **Sale preview** — eligible, balanced 800/800, INTER_STATE IGST (76) + sales (424) + shipping (300).  
2. **Sale dry-run discovery** — no Accounting\* persistence; commerce fingerprint unchanged.  
3. **Sale post** → `JE-202608-00001` (`ORDER_PAID`); **replay** → duplicate.  
   *(First execution: refund preview before this step returned `SALE_JOURNAL_REQUIRED`; after sale post, eligibility became `AUTO_POSTABLE_FULL`.)*  
4. **Refund preview** → `AUTO_POSTABLE_FULL`.  
5. **Refund dry-run discovery** — no new persistence beyond existing sale.  
6. **Refund post** → `JE-202608-00002` (`ORDER_REFUNDED_FULL`); **replay** → duplicate.  
7. Partial `WOO-7963` preview → `UNPOSTED_PARTIAL` (not posted).  
8. Status-only `WOO-8091` → not auto-postable (no payment/refund rows).  
9. Sample sale **`SRV-20260800010`** (shipping + interstate) → `JE-202608-00003`.  
10. **Reconciliation V2** on primary → `UNSETTLED` / `UNSETTLED_PROVISIONAL` (expected until settlement import).  
11. **Bounded discovery** limit 10 → scanned 2, posted 0, duplicates 1, skipped 1 (`UNPOSTED_PARTIAL`).  
12. Commerce fingerprints **identical** before/after for primary refund order.

---

## 6. Commerce integrity

For `SRV-20260800003`, SHA-256 fingerprints of Order / Payment / Refund / OrderItem / Inventory / Invoice / Shipment / Zoho metadata were unchanged across dry-run, sale post, refund post, replay, and bounded discovery.

**COMMERCE MODIFICATIONS: NONE**

---

## 7. Reconciliation V2 (primary)

| Field | Value |
|-------|--------|
| Status | `UNSETTLED` |
| Reason | Sale + full refund posted; clearing provisional until settlement import |
| Sale journal | `JE-202608-00001` `ORDER_PAID_V1` |
| Refund journal | `JE-202608-00002` `ORDER_REFUNDED_FULL_V1` |
| Clearing | 1020 Razorpay; sale Dr 800 / refund Cr 800; implied balance 0; label `UNSETTLED_PROVISIONAL` |

---

## 8. ACCOUNTING SHADOW WRITES (exact)

| Table | Rows created / used |
|-------|---------------------|
| `AccountingAccount` | 23 (CoA seed) |
| `AccountingSequence` | 1 (`JE` 202608) |
| `AccountingJournalEntry` | **3** — `JE-202608-00001`, `JE-202608-00002`, `JE-202608-00003` |
| `AccountingJournalLine` | **12** (4+4+4) |
| `AccountingPostingEvent` | **3** — `order:…:paid` ×2 orders + `order:…:refunded_full` ×1 |
| `AccountingDocumentLink` | **4** — ORDER×3 + REFUND×1 (`rfnd_TQlKG3jByZoQId`) |
| `AccountingAuditLog` | **3** |
| `AccountingPeriod` | 0 |

### Primary refund lifecycle lines

**JE-202608-00001 ORDER_PAID SRV-20260800003**

| Code | Dr | Cr |
|------|----|----|
| 1020 Razorpay clearing | 800 | 0 |
| 4000 Product sales | 0 | 424 |
| 2102 Output IGST | 0 | 76 |
| 4100 Shipping income | 0 | 300 |

**JE-202608-00002 ORDER_REFUNDED_FULL** (exact invert)

| Code | Dr | Cr |
|------|----|----|
| 1020 | 0 | 800 |
| 4000 | 424 | 0 |
| 2102 | 76 | 0 |
| 4100 | 300 | 0 |

**JE-202608-00003 ORDER_PAID SRV-20260800010** — same shape (shipping + IGST sample).

---

## 9. External side effects

**NONE** — no payment-provider mutation APIs, Zoho invoice/CN create/update, email, S3 invoice rewrite, carrier actions, or commerce service invocations beyond read-only Prisma selects.

---

## 10. Tests / tooling

- Local `npm run test:accounting` after eligibility fix (includes REFUNDED-payment eligibility case).  
- Validation runner: `backend/scripts/phase2c-lightsail-shadow-validation.ts` (requires `PHASE2C_LIGHTSAIL_SHADOW_OK=1`).  
- Accounting migrations applied on Lightsail: `20260822190000_native_accounting_phase1`, `20260822210000_accounting_phase1_5_hardening`.

---

## 11. Verdict

**PHASE 2C SHADOW VALIDATED — READY FOR SETTLEMENT ARCHITECTURE REVIEW**
