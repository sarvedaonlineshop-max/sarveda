# Canonical product / SKU master

**Source of truth (ops / pricing / SKU):** [`../Sarveda MASTER.xlsx`](../Sarveda%20MASTER.xlsx)  
Sheet: `Website Catalog` (columns: Name, Variant Name, SKU, …)

Do **not** use older copies for new work (`Sarveda MASTER Final.xlsx`, `Final1`, `Latest`, July pricing dumps) unless comparing history.

## Staging compare (SKU-first, then name)

**Default: DRAFT products are excluded** from staging. Pass `--include-drafts` only if you explicitly want them.

```bash
python3 data/compare/compare_master_to_staging.py \
  --master "data/Sarveda MASTER.xlsx" \
  --staging /tmp/staging_variants.csv \
  --out-dir data/compare
```

Latest summary: `master_vs_staging_summary.json`  
Detail CSVs: `master_vs_staging_{exact,partial,only_sheet,only_db}.csv`
