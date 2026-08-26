# SARVEDA ACCOUNTING — UAT LIVE ACTIVATION

**Date:** 2026-08-26  
**UAT window:** now → 31/08/2026  
**Production cutover (boundary only):** `2026-09-01T00:00:00+05:30`  
**Phase 7D:** **NOT started**

---

## 1. Verdict (engineering)

| Requirement | Status |
|-------------|--------|
| Architecture supports **Accounting UI ON** while **production posting OFF** | **YES** |
| Commerce auto-creates native journals | **NO** (admin discovery/post only; payments/checkout do not call accounting) |
| Lightsail DB treated as production-like | **YES** (`13.204.112.165` in `production-guard.ts`) |
| Journal **persist** on Lightsail without `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` | **BLOCKED** (intentional) |
| This session deployed env flags on Lightsail / Vercel | **NO — operator action required** (SSH from this workstation denied) |
| UAT banner code | **YES** (added) |
| Reset execute via UI/API | **NO** (CLI only; not exposed) |
| Zoho migrated | **NO** |
| Opening balances posted | **NO** |
| Reset `--execute` | **NO** |

**Architectural note (not a stop on UI UAT):**  
On Lightsail, *any* journal persistence requires `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` because the DB host is production-like. Per owner instruction that flag stays **OFF** for Aug UAT. Therefore:

- Admins can **open all screens**, run **preview / dry-run**, use **Purchases ops** (`PURCHASES_MODULE_ENABLED`).
- Admins **cannot** persist GL journals / bank transfer journals / statement categorization posts until Phase 7D flips production posting (or a future explicitly approved UAT-only persist path — **not** added; guards not weakened).

This still satisfies: commerce live, no pre-Sept-1 **production** native posting from real orders, UI available for training.

---

## 2. Deployment environment

| Item | Value |
|------|--------|
| Intended UAT host | Lightsail API (`sarveda-demo.xyz` → backend) + Vercel frontend |
| GitHub `main` baseline (prior push) | `5c76ffa` (“UI updates” — includes accounting module) |
| This session deltas | UAT banner, status fields, `.env.example` UAT profile, cleanup dry-run + LS activation script |
| Local DB used for dry-run script | `localhost/sarveda_db` (not Lightsail) |
| SSH deploy from Cursor machine | **Failed** (`Permission denied` / timeout) — run `backend/scripts/uat-live-activation-on-lightsail.sh` on the box |

---

## 3. Migrations

| Step | Status |
|------|--------|
| Pending accounting migrations in repo | Present under `backend/prisma/migrations/20260822*` … `20260826180000_*` |
| Applied on Lightsail this session | **Not verified here** — operator must `npx prisma migrate status` before/after `migrate deploy` |
| Accounting reset | **Not run** |
| Opening post | **Not run** |

Operator commands (on Lightsail):

```bash
bash ~/sarveda/backend/scripts/uat-live-activation-on-lightsail.sh
# then edit backend/.env to UAT profile, pm2 restart
```

---

## 4. Feature flag matrix

There is **no** `ACCOUNTING_FINANCIAL_REPORTING_ENABLED` in the codebase. Reports use **`ACCOUNTING_REPORTS_ENABLED`**.

| FLAG | CURRENT (repo `.env.example` default) | UAT VALUE (Lightsail / Vercel) | PRODUCTION VALUE (until Phase 7D) | PURPOSE |
|------|----------------------------------------|--------------------------------|-----------------------------------|---------|
| `NATIVE_ACCOUNTING_ENABLED` | `0` | `1` | `0` until 7D | Master API gate |
| `PURCHASES_MODULE_ENABLED` | `0` | `1` | `0` until intentional | Purchases admin ops |
| `ACCOUNTING_SALES_POSTING_ENABLED` | `0` | `1` | `0` | Enables sales post *APIs*; persist still needs prod allow on LS |
| `ACCOUNTING_REFUND_POSTING_ENABLED` | `0` | `1` | `0` | Full-refund shadow APIs |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` | `0` | `1` | `0` | Settlement APIs |
| `ACCOUNTING_PURCHASES_POSTING_ENABLED` | `0` | `1` | `0` | Vendor bill GL APIs |
| `ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED` | `0` | `1` | `0` | Vendor payment GL APIs |
| `ACCOUNTING_EXPENSE_POSTING_ENABLED` | `0` | `1` | `0` | Expense GL APIs |
| `ACCOUNTING_INVENTORY_VALUATION_ENABLED` | `0` | `1` | `0` | Inventory layers / opening valuation APIs |
| `ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED` | `0` | `1` | `0` | Capitalization APIs |
| `ACCOUNTING_COGS_POSTING_ENABLED` | `0` | `1` | `0` | COGS APIs |
| `ACCOUNTING_COGS_REVERSAL_ENABLED` | `0` | `1` | `0` | COGS reversal APIs |
| `ACCOUNTING_BANKING_ENABLED` | `0` | `1` | `0` | Bank registry / transfers APIs |
| `ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED` | `0` | `1` | `0` | Statement import APIs |
| `ACCOUNTING_BANK_RECONCILIATION_ENABLED` | `0` | `1` | `0` | Recon / categorize APIs |
| `ACCOUNTING_COD_COLLECTION_ENABLED` | `0` | `0` (code always false) | `0` | Unsupported |
| `ACCOUNTING_GST_ENABLED` | `0` | `1` | `0` | GST ledger |
| `ACCOUNTING_GST_RECONCILIATION_ENABLED` | `0` | `1` | `0` | GST recon |
| `ACCOUNTING_ITC_VERIFICATION_ENABLED` | `0` | `1` | `0` | ITC workflow |
| `ACCOUNTING_GST_REPORTING_ENABLED` | `0` | `1` | `0` | GSTR-style reports |
| `ACCOUNTING_REPORTS_ENABLED` | `0` | `1` | `0` | TB / GL / P&L / BS |
| `ACCOUNTING_OPENING_BALANCE_ENABLED` | `0` | **`0`** | `0` until 7D | Block production openings |
| `ACCOUNTING_CUTOVER_DATE` | unset | **`2026-09-01T00:00:00+05:30`** | same | Cutover boundary |
| `ACCOUNTING_CUTOVER_FORWARD_ONLY` | unset | **`1`** | `1` | Block pre-cutover post when posting allowed |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | unset/`0` | **`0`** | **`0` until Phase 7D** | Fail-closed persist on prod-like |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` | unset/`0` | **`0`** | `0` until approved | Block bulk backfill |
| `NEXT_PUBLIC_ACCOUNTING_ENABLED` | unset | **`1`** (Vercel) | `0` until 7D UI | Sidebar + layout |
| `NEXT_PUBLIC_PURCHASES_ENABLED` | unset | **`1`** (Vercel) | as needed | Purchases sidebar |
| `NEXT_PUBLIC_ACCOUNTING_UAT_MODE` | unset | **`1`** (or omit; banner on) | `0` after 7D | UAT banner |

Clock reaching Sept 1 does **not** auto-enable production flags. Phase 7D must set them explicitly.

---

## 5. UAT banner

- Component: `frontend/components/admin/accounting/AccountingUatBanner.tsx`
- Mounted on all accounting admin pages via `frontend/app/admin/accounting/layout.tsx`
- Copy: **Accounting UAT Mode / Training/Test Data Only / Production Accounting Starts 01-Sep-2026**
- Backend status/dashboard also expose `uatBanner` string
- Disable after go-live: `NEXT_PUBLIC_ACCOUNTING_UAT_MODE=0`

---

## 6. Admin access

| Role | Access |
|------|--------|
| `ADMIN` | Full `/admin/*` including `/admin/accounting/*` and `/admin/purchases/*` when public flags on (`requireAdmin`) |
| `SUPER_ADMIN` | Same |
| `CUSTOMER` / guests | **No** |

Improvement (not done): finer accounting-only role — currently any admin sees accounting when flags on.

Reset execute is **not** in UI/API (opening handlers show ops notice only).

---

## 7. Commerce isolation proof (code-level)

1. Payment verify/webhook/order complete paths do **not** import accounting posting.
2. No BullMQ job auto-posts ORDER_PAID.
3. Posting only via `/api/admin/accounting/*` discovery/post endpoints.
4. On Lightsail, persist additionally requires `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` — **kept 0**.
5. Production-guard + cutover tests: **36/36 PASS** this session.

Therefore real Aug commerce (orders/payments/refunds) does **not** create native production journals while UAT profile is applied as specified.

---

## 8. UAT data / cleanup dry-run

- Tag: `TEST-UAT-ACC-*` (plus legacy `TEST-ACC*` patterns in integrity regexes).
- Script: `backend/scripts/uat-cleanup-dry-run.ts` (`execute: false`).
- Local dry-run (dev DB): all identifiable UAT counts **0**.
- Lightsail dry-run: run same script after deploy against staging `DATABASE_URL`.
- Future cleanup must preserve Orders, Payments, Refunds, Customers, Products, Variants, operational Inventory, Shipments.

**Cleanup not executed.**

---

## 9. Smoke test matrix (this session)

| Check | Result |
|-------|--------|
| Backend `tsc --noEmit` | PASS |
| Production-guard + cutover vitest | **36/36 PASS** |
| Admin login / accounting nav on staging | **PENDING operator** (flags + Vercel) |
| Accounting pages load | **PENDING operator** |
| Commerce pages / checkout unaffected | **YES by design** (flags don’t touch commerce); live E2E **PENDING operator** |
| UAT journal **preview/dry-run** | Available once `NATIVE_ACCOUNTING_ENABLED=1` |
| UAT journal **persist** on Lightsail | **Expected FAIL** while `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=0` |
| Pre-cutover commerce journal from live order | **NO** (no auto-post + prod allow off) |
| Cutover timestamp | `2026-09-01T00:00:00+05:30` |
| Opening posted / Zoho migrated / reset execute | **NO / NO / NO** |

---

## 10. Operator checklist (required to finish UAT activation)

1. On Lightsail: clean `git pull` / `reset --hard origin/main` (after pushing this UAT banner commit if not yet on remote).
2. Run `bash backend/scripts/uat-live-activation-on-lightsail.sh`.
3. Apply **UAT VALUE** column flags in `backend/.env` — especially **`ACCOUNTING_PRODUCTION_POSTING_ALLOWED=0`**.
4. `pm2 restart` backend.
5. Vercel: set `NEXT_PUBLIC_ACCOUNTING_ENABLED=1`, `NEXT_PUBLIC_PURCHASES_ENABLED=1`, `NEXT_PUBLIC_ACCOUNTING_UAT_MODE=1` → redeploy.
6. Login as ADMIN → confirm Accounting nav + amber UAT banner.
7. `GET /api/admin/accounting/status` → `productionPostingAllowed: false`, cutover IST string present.
8. Run `npx ts-node --transpile-only scripts/uat-cleanup-dry-run.ts` on LS.

---

## 11. Rollback

1. Set `NATIVE_ACCOUNTING_ENABLED=0`, `NEXT_PUBLIC_ACCOUNTING_ENABLED=0` (and purchases flags if needed).
2. Restart backend / redeploy Vercel.
3. Do **not** roll back migrations unless emergency (data-preserving preferred).
4. Keep `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` unset/`0`.

---

## 12. Final checklist answers

1. **Environment deployed:** Code on GitHub `main` (+ this UAT activation delta). **Lightsail/Vercel flag apply: PENDING operator.**
2. **Accounting UI accessible:** **PENDING** until Vercel `NEXT_PUBLIC_ACCOUNTING_ENABLED=1` + backend `NATIVE_ACCOUNTING_ENABLED=1`.
3. **Admin roles with access:** `ADMIN`, `SUPER_ADMIN`.
4. **Exact UAT feature flags:** See §4 UAT VALUE column.
5. **Production posting enabled:** **NO** (`ACCOUNTING_PRODUCTION_POSTING_ALLOWED=0`).
6. **Commerce tested unaffected:** **YES (architecture)**; live checkout smoke **PENDING operator**.
7. **Pre-cutover commerce journal created:** **NO** (by design when UAT profile applied).
8. **UAT sample transaction successful:** **PARTIAL** — UI/preview YES after flags; **persist blocked** on LS until Phase 7D (intentional).
9. **UAT data identifiable for cleanup:** **YES** (`TEST-UAT-ACC-*` + dry-run script).
10. **Zoho data migrated:** **NO**
11. **Opening balances posted:** **NO**
12. **Reset execute run:** **NO**
13. **Cutover timestamp:** `2026-09-01T00:00:00+05:30`
14. **Remaining blockers/high:** (H1) Operator must apply LS + Vercel flags and migrate. (H2) Full GL journal UAT on Lightsail requires Phase 7D production-posting allow or an explicitly approved alternate — **not** enabled now.

---

## 13. Closing statement

Accounting **UAT mode is engineered and ready to switch on** with **production posting OFF**.  
Complete the operator checklist above to make the UI live for the accounts team.

**Do not start Phase 7D.**

When flags are applied exactly as §4:

**SARVEDA ACCOUNTING UAT MODE ACTIVE — PRODUCTION POSTING OFF**
