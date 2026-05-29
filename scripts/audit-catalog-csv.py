#!/usr/bin/env python3
"""Audit backend/prisma/wc-products.csv for migration readiness (Phase 0)."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "backend" / "prisma" / "wc-products.csv"


def dec(s: str | None) -> float | None:
    if not s or not str(s).strip():
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def main() -> int:
    if not CSV_PATH.exists():
        print(f"Missing {CSV_PATH}", file=sys.stderr)
        return 1

    rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
    parents = [r for r in rows if (r.get("Type") or "").lower() in ("simple", "variable")]
    variations = [r for r in rows if (r.get("Type") or "").lower() == "variation"]
    sellable = variations + [r for r in parents if (r.get("Type") or "").lower() == "simple"]

    missing_inr: list[str] = []
    missing_usd: list[str] = []
    missing_gbp: list[str] = []
    audio_id = 0
    audio_http = 0

    for row in parents:
        for i in range(12):
            v = (row.get(f"Meta: product_audio_{i}_audio") or "").strip()
            if v.startswith("http"):
                audio_http += 1
                break
            if v.isdigit():
                audio_id += 1
                break

    for row in sellable:
        sku = (row.get("SKU") or row.get("Name") or "?").strip()
        sale_inr = dec(row.get("Meta: _india_sale_price")) or dec(row.get("Sale price"))
        reg_inr = dec(row.get("Meta: _india_regular_price")) or dec(row.get("Regular price"))
        if not sale_inr and not reg_inr:
            missing_inr.append(sku)

        if not dec(row.get("Meta: _dollars-zone_sale_price")) and not dec(
            row.get("Meta: _dollars-zone_regular_price")
        ):
            missing_usd.append(sku)

        if not dec(row.get("Meta: _zone-1_sale_price")) and not dec(row.get("Meta: _zone-2_sale_price")):
            missing_gbp.append(sku)

    pub = sum(1 for r in parents if (r.get("Published") or "").strip() == "1")

    print("Sarveda catalog CSV audit")
    print("=" * 40)
    print(f"File: {CSV_PATH}")
    print(f"Parent products: {len(parents)} (published: {pub})")
    print(f"Variations: {len(variations)}")
    print(f"Sellable SKUs: {len(sellable)}")
    print()
    print(f"Missing INR price: {len(missing_inr)}")
    print(f"Missing USD zone price: {len(missing_usd)}")
    print(f"Missing GBP zone price: {len(missing_gbp)}")
    print()
    print(f"Audio: attachment IDs in CSV: {audio_id} products")
    print(f"Audio: direct http in CSV: {audio_http} products")
    print("  → Run: cd backend && npx tsx scripts/sync-product-audio.ts")
    print()

    if missing_inr[:8]:
        print("INR gaps (sample):", ", ".join(missing_inr[:8]))
    if missing_usd[:8]:
        print("USD gaps (sample):", ", ".join(missing_usd[:8]))

    return 0 if len(missing_inr) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
