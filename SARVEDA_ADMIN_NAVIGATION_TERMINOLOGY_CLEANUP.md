# SARVEDA ADMIN — NAVIGATION & TERMINOLOGY CLEANUP

**Mode:** Frontend presentation / label cleanup only  
**Date:** 2026-08-28  
**Purpose:** Remove terminology clashes between operational admin modules and native Accounting before Order Attribution work.

---

## Changes (user-facing only)

| Area | Change |
|------|--------|
| Top-level Reports | Sidebar + shell title + page heading → **Store Reports** (`/admin/reports` unchanged) |
| Accounting Reports | Nav group → **Financial Reports** · child **Statements & Ledgers**; page subtitle clarified |
| Operational Inventory | Label unchanged (**Inventory**); subtitle clarifies storefront stock vs accounting |
| Accounting Inventory | Sidebar group → **Inventory Accounting** (under Accounting); page titles already used this phrasing |
| Zoho copy | Removed “Zoho is used for invoices and accounting only” from Inventory when Zoho stock sync is off |
| Store Dashboard | Subtitle clarifies store ops vs Accounting Financial Reports |
| Accounting Dashboard | Title/subtitle clarify financial health role |
| Purchases | Overview + rail copy clarify vendor operations vs Accounting recognition |
| Orders | Label and routes unchanged (operational order workspace preserved) |

### Files touched
- `frontend/components/admin/AdminSidebar.tsx`
- `frontend/components/admin/AdminShell.tsx`
- `frontend/components/admin/AdminInventoryWorkspace.tsx`
- `frontend/components/admin/accounting/AdminAccountingNav.tsx`
- `frontend/components/admin/purchases/AdminPurchasesNav.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/admin/reports/page.tsx`
- `frontend/app/admin/accounting/page.tsx`
- `frontend/app/admin/accounting/reports/page.tsx`
- `frontend/app/admin/purchases/page.tsx`
- `frontend/app/admin/accounting/purchases/page.tsx`
- `SARVEDA_ADMIN_NAVIGATION_TERMINOLOGY_CLEANUP.md` (this file)

---

## Zoho wording review

| Location | Action |
|----------|--------|
| Inventory hero (Zoho sync **off**) | **Updated** — no longer claims Zoho is accounting authority |
| Inventory hero (Zoho sync **on**) | **Kept / clarified** — still mentions Zoho audit (live stock-sync feature) + points cost/ledgers to Accounting |
| Product form Zoho item sync toasts | **Kept** — describes real catalog sync to Zoho Inventory items |
| Old Marketplaces / Zoho Books historical panels | **Kept** — historical archive UI, not native books authority |
| Zoho pull/push stock actions | **Kept** — operational stock sync when enabled |

No Zoho API or integration code was changed.

---

## Duplicate-label decisions

| Label | Resolution |
|-------|------------|
| Reports vs Financial Reports | Renamed store → **Store Reports**; accounting → **Financial Reports** |
| Inventory vs Inventory Accounting | Top-level stays **Inventory**; accounting group → **Inventory Accounting** |
| Dashboard | Parent context: store **Dashboard** vs **Accounting Dashboard** (subtitle clarified) |
| Purchases | Operational Purchases vs Accounting Purchases / Advanced Purchase Reconciliation — clarified via copy; both retained |
| Reconciliation | Banking / Inventory / GST / Store Reconciliation — parent nav context sufficient; not renamed |

No operational pages removed.

---

## Validation

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | *(see checklist)* |
| Routes preserved | `/admin/reports`, `/admin/inventory`, `/admin/accounting/*`, `/admin/orders`, `/admin` |
| Backend / APIs / schema / accounting / commerce logic | **Unchanged** |

---

## Checklist

| | Result |
|---|--------|
| **A.** Top-level Reports renamed to Store Reports | **YES** |
| **B.** Accounting Reports clarified as Financial Reports | **YES** |
| **C.** Operational Inventory retained | **YES** |
| **D.** Accounting Inventory responsibility clarified | **YES** |
| **E.** Outdated Zoho-facing copy removed | **YES** |
| **F.** Dashboard responsibility clarified | **YES** |
| **G.** Orders responsibility preserved | **YES** |
| **H.** Purchases ambiguity reviewed | **YES** |
| **I.** Valid operational pages removed | **NO** |
| **J.** Backend changed | **NO** |
| **K.** Commerce logic changed | **NO** |
| **L.** Accounting logic changed | **NO** |
| **M.** API contracts changed | **NO** |
| **N.** TypeScript | **PASS** |
| **O.** Build | **PASS** |
| **P.** Ready for Order Attribution audit | **YES** |

---

SARVEDA ADMIN NAVIGATION & TERMINOLOGY CLEANUP COMPLETE
