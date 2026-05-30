# Sarveda RTM v1.1 (audited)

**Files**

| File | Purpose |
|------|---------|
| `Sarveda-RTM.xlsx` | Your original (unchanged) |
| `Sarveda-RTM-v1.1-audited.xlsx` | **Revised** — aligned to codebase |
| `Sarveda-RTM-v1.1-audited.csv` | Flat CSV — **updated May 2026** |
| `docs/RTM-STATUS-MAY-2026.md` | **Executive summary** — % complete, pending, deferred |

**Refresh status (May 2026)**

```bash
python3 scripts/update-rtm-may-2026.py
python3 scripts/generate-rtm-v1.1.py   # optional: rebuild .xlsx from CSV logic in generator
```

For cell-only patches on existing xlsx (preserves manual formatting):

```bash
PYTHONPATH=backend/.rtm-pip python3 scripts/update-rtm-status.py
```

---

## Dashboard totals (May 2026 — after demo sprint)

| Metric | v1.1 (May 19) | **May 2026 (demo)** |
|--------|-----------------|---------------------|
| Total requirements | 130 | **135** (+5 new rows) |
| Dev Complete | 54 | **76** |
| In Progress | 23 | **13** |
| Not Started | 53 | **41** |
| Dev Deferred | — | **5** (WATI) |
| Test Pass | 38 | **73** |

**Must Have (102 items):** **71%** Dev done/deferred · **66%** Test Pass

> Use **`Sarveda-RTM-v1.1-audited.csv`** as source of truth. Re-import into Excel if needed; `generate-rtm-v1.1.py` rebuilds xlsx from an older template.

See **`docs/RTM-STATUS-MAY-2026.md`** for full “done vs pending” breakdown.

---

## What’s done vs pending (short)

### ✅ Done on demo (shop revenue path ~95%)
- Products, cart, checkout, Razorpay + Stripe + PayPal, coupons, emails, GST invoice  
- AWB manual in admin, geo pricing, audio, cart fixes  
- Courses / events / insights listings + homepage rails + corporate wellness pages  
- Pay for courses/events via cart + enrollment records  

### 🟡 In progress
- Auto shipping / courier E2E, course lesson portal, SEO cutover (301 + sitemaps)  
- GST line breakdown at checkout, advanced search filters  

### ⏸ Deferred
- **WATI / WhatsApp** (all NOT-006+)  
- **Zoho** (external)  

### ⬜ Not started
- Password reset, reviews, wishlist, refunds UI, abandoned cart, GA/Meta pixel  

---

## Format

| Original | v1.1 audited |
|----------|----------------|
| Excel `.xlsx` | Excel `.xlsx` |
| 14 columns on Full RTM | + `Deploy Dependency`, `Date Revised` |

Give Arjun **`Sarveda-RTM-v1.1-audited.csv`** or xlsx plus **`docs/RTM-STATUS-MAY-2026.md`** for status reviews.
