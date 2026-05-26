# Sarveda RTM v1.1 (audited)

**Files**

| File | Purpose |
|------|---------|
| `Sarveda-RTM.xlsx` | Your original (unchanged) |
| `Sarveda-RTM-v1.1-audited.xlsx` | **Revised** — aligned to codebase, 19 May 2026 |
| `Sarveda-RTM-v1.1-audited.csv` | Same data as flat CSV (optional import) |

**Regenerate Excel**

```bash
python3 scripts/generate-rtm-v1.1.py
```

## Format: same idea, small improvements

| Original | v1.1 audited |
|----------|----------------|
| Excel `.xlsx` | Excel `.xlsx` (same tool for Arjun) |
| Dashboard + Full RTM + 13 module tabs | Same structure |
| Emoji sheet names (📊 Dashboard, etc.) | Plain names (`Dashboard`, `Products`, …) — opens the same in Excel |
| 14 columns on Full RTM | **+2 columns:** `Deploy Dependency`, `Date Revised` |
| Version 1.0 / 25 May 2026 | **v1.1** / audit date in header |

## Dashboard totals (v1.1)

- **130** requirements  
- **54** Dev Complete (was 50 — some upgrades, some downgrades)  
- **23** In Progress  
- **38** Test Pass (conservative; many items need staging E2E)

## What changed vs your v1.0 (high level)

**Upgraded:** COD, guest checkout, related products, estimated delivery, shipping totals, order history, tracking page, course listing, partial SEO/email, zone pricing.

**Downgraded:** Zoho L2 (not in repo), PDP pincode “before add to cart”, Delhivery/Shiprocket “Complete” → In Progress until live AWB test, password reset → Not Started.

**Wording fix:** REQ-CART-003 — stock reserves at **checkout**, not on add-to-cart.

**Deploy notes:** `import:variations`, `sync:galleries`, `migrate:media`, `SENDGRID_API_KEY` on EC2.

Give Arjun **v1.1** for status; keep **v1.0** as your first draft if needed for history.
