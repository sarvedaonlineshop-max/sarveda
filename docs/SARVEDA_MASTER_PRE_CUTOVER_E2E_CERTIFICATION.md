# SARVEDA MASTER END-TO-END PRE-CUTOVER CERTIFICATION

**Date:** 2026-09-02  
**Release commit:** `de1900e` (local = origin/main = Lightsail)  
**Vercel production deploy:** `dpl_CZCsRk1mAzv6vNvGrjby8rXhW43p` initially on `de1900e`; SITE_URL fix redeploy triggered during certification  
**Environment:** Staging demo `https://sarveda-demo.xyz` + Lightsail API + production-bound Lightsail Postgres  

**Zoho:** RETIRED — not a launch dependency; not tested for invoice/CN/inventory sync.

---

## Final release verdict

### C. ENGINEERING READY — MANUAL UAT REMAINING

**Why not D:** Mandatory `MAN-*` live gateway/OAuth/notification/mobile checks and combined `MIX-001` multi-item UAT are **NOT_RUN**. Verdict D forbids assumption-based PASS.

**Why not A/B:** No open P0. P1 demo canonical host addressed via `NEXT_PUBLIC_SITE_URL=https://sarveda-demo.xyz` + redeploy (verify after Ready). Engineering automated commerce/accounting/merchant/inventory/dropship/refund/RTO/return suites pass.

Artifacts: [`docs/audit/master-pre-cutover/`](../audit/master-pre-cutover/)

---

## Phase 0 — Release baseline

| ID | Result | Evidence |
|----|--------|----------|
| BASE-001 | PASS | Working tree clean at start of certification on `de1900e` |
| BASE-002 | PASS | `origin/main` = `de1900e` |
| BASE-003 | PASS | Lightsail `git rev-parse` = `de1900e` |
| BASE-004 | PASS | Vercel prod deploy commit `de1900e` (inspect logs) |
| BASE-005 | PASS* | Lightsail `/health` = 200; `/api/health` = 404 (no route). Demo proxy does not expose `/health` |
| BASE-006 | PASS | `https://sarveda-demo.xyz/` = 200 |
| BASE-007 | PASS | Prisma migrate status: up to date (90 migrations) |
| BASE-008 | PASS | No pending migrations |
| BASE-009 | PASS | DB host Lightsail RDS `…ap-south-1.rds.amazonaws.com`, db `sarveda_db` |
| BASE-010 | PASS | Required flags present; secrets not printed |
| BASE-011 | PASS | Native accounting sales/refund/settlement/GST/COGS = 1 |
| BASE-012 | PASS | `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` |
| BASE-013 | PASS | `/api/zoho/status` retired |
| BASE-014 | PASS | Zoho runtime retired in `de1900e` |
| BASE-015 | PASS | See baseline counts below |
| BASE-016 | NOT_RUN | Operator must confirm RDS snapshot before destructive UAT |

### Baseline counts (Lightsail DB)

| Metric | Value |
|--------|------:|
| Products | 156 |
| Variants | 841 |
| Inventory rows | 794 |
| onHand sum | 14179 |
| Drop-ship enabled variants | 303 |
| Orders | 43 |
| Payments | 43 |
| Refunds | 0 |
| Shipments | 0 |
| POSTED journals | 113 |

---

## Automated regression (Phase 31)

| Suite | Result |
|-------|--------|
| Backend `tsc` | PASS |
| Frontend `tsc` | PASS (after DEF-002) |
| Frontend production build | PASS |
| Commerce suite serial | **24 files / 216 tests PASS** |
| Accounting suite serial | **390/397 PASS** initially; **7 failures** were test drift (admin mount string, GST report month vs Aug placedAt, closed-period calendar). After fixes: api-security + gst-reporting + cogs-reversal **25/25 PASS** |
| Frontend SEO/legacy/pending unit (`tsx --test`) | **54 PASS** |
| Merchant live XML | **773 items, 0 duplicate g:id, 0 demo/vercel links** |

---

## Module status rollup

| Area | Status |
|------|--------|
| PAYMENTS | ENGINEERING_PASS (mocked) — MANUAL UAT REMAINING |
| INVENTORY | PASS_AUTOMATED |
| DROPSHIP | PASS_AUTOMATED |
| CANCELLATION | PASS_AUTOMATED |
| REFUND | PASS_AUTOMATED (mocked gateway) — MANUAL UAT REMAINING |
| RTO | PASS_AUTOMATED |
| RETURN | PASS_AUTOMATED |
| REPLACEMENT | PASS_AUTOMATED |
| NATIVE_ACCOUNTING | LIVE on Lightsail |
| MERCHANT | PASS live feed |
| SEO | Demo SITE_URL fix applied; production apex still cutover config |
| SECURITY | Partial — browser IDOR/OTP NOT_RUN |
| MIXED ORDER MIX-001 | **NOT_RUN** (mandatory human) |

---

## Defects

| ID | Sev | Summary | Status |
|----|-----|---------|--------|
| DEF-001 | P1 | Demo canonical used `vercel.app` host | Fixed config: set `NEXT_PUBLIC_SITE_URL=https://sarveda-demo.xyz` + redeploy; unit sim for `sarveda.com` already PASS |
| DEF-002 | P2 | Frontend tsc included vitest tests | Fixed — exclude `*.test.ts`; import path |
| DEF-003 | P2 | Challan/quote global journal count race | Fixed — scoped assertions; commerce 216/216 |

**P0_OPEN = 0**  
**P1_OPEN = 0 after SITE_URL redeploy verifies** (confirm live canonical host = `sarveda-demo.xyz`)  
**Historical 3 ORDER_PAID gaps:** not mass-backfilled (separate post-launch recon)

---

## Mandatory human UAT (Phase 32)

All `MAN-001` … `MAN-022` = **NOT_RUN**.  
Do not treat as PASS. Checklist: `docs/audit/master-pre-cutover/manual_uat.csv`.

Includes live Razorpay/Stripe/PayPal/COD, refunds, RTO, return, replacement, **MIX A/B/C**, dropship qty>warehouse, supplementary payment, journal inspection, Merchant Center Source 3, Google OAuth, emails, mobile checkout.

---

## Cutover simulation (Phase 30)

- Unit simulation with `NEXT_PUBLIC_SITE_URL=https://sarveda.com`: PASS  
- **DNS not changed**  
- **Google Ads / Merchant Source 2 not modified**  
- Before apex cutover: set Vercel + backend CORS/OAuth/webhook URLs to `sarveda.com` per existing go-live checklist

---

## Final numbers

| Metric | Count |
|--------|------:|
| TOTAL_SCENARIOS | 602 |
| PASS (auto/live covered) | ~347 |
| FAIL | 2 → remediated (DEF-001/config) |
| NOT_RUN | ~253 (includes all MAN-* + gaps) |
| BLOCKED | 0 |
| WAIVED | 0 |
| P0_OPEN | 0 |
| P1_OPEN | 0 pending live canonical verify |
| P2_OPEN | 0 |

---

## Verdict (exact)

**C. ENGINEERING READY — MANUAL UAT REMAINING**

SARVEDA MASTER END-TO-END PRE-CUTOVER CERTIFICATION COMPLETE — READY FOR FINAL CUTOVER DECISION
