#!/usr/bin/env python3
"""
Apply warehouse SKUs from data/new_sku.xlsx for rows that were blank in
data/website-catalog-zoho.xlsx (330 rows; excludes "Remove" → 293 updates).

Matches live catalog variants via public products API (product name + variant label).
Only updates when current DB SKU is empty-ish (woo-var-* / woo-* / blank).

Usage:
  python3 backend/scripts/apply-new-skus-from-xlsx.py --dry-run
  python3 backend/scripts/apply-new-skus-from-xlsx.py --apply
  python3 backend/scripts/apply-new-skus-from-xlsx.py --apply --api-base http://127.0.0.1:5000
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OLD = ROOT / "data/website-catalog-zoho.xlsx"
DEFAULT_NEW = ROOT / "data/new_sku.xlsx"
DEFAULT_API = os.environ.get("SARVEDA_API_BASE", "http://13.206.192.106:5000")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def norm_key(product: str, variant: str) -> tuple[str, str]:
    return norm(product), norm(variant)


def load_catalog_rows(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Website Catalog"]
    rows: list[dict] = []
    current = ""
    for i, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        cells = list(row)
        name = cells[0] if len(cells) > 0 else None
        variant = cells[1] if len(cells) > 1 else None
        sku = cells[2] if len(cells) > 2 else None
        if name is not None and str(name).strip():
            current = str(name).strip()
        variant_s = "" if variant is None else str(variant).strip()
        sku_s = "" if sku is None else str(sku).strip()
        if not current and not variant_s and not sku_s:
            continue
        rows.append(
            {
                "row": i,
                "product_name": current,
                "variant_name": variant_s,
                "sku": sku_s,
                "key": norm_key(current, variant_s),
            }
        )
    wb.close()
    return rows


def build_update_list(old_path: Path, new_path: Path) -> list[dict]:
    old_by_key = {r["key"]: r for r in load_catalog_rows(old_path)}
    new_by_key = {r["key"]: r for r in load_catalog_rows(new_path)}
    updates: list[dict] = []
    for key in sorted(old_by_key.keys() & new_by_key.keys()):
        o, n = old_by_key[key], new_by_key[key]
        if o["sku"]:
            continue  # already had SKU in old export — skip (488 unchanged bucket)
        new_sku = n["sku"].strip()
        if not new_sku or new_sku.lower() == "remove":
            continue
        updates.append(
            {
                "product_name": n["product_name"],
                "variant_name": n["variant_name"],
                "new_sku": new_sku,
                "key": key,
            }
        )
    return updates


def fetch_json(url: str, timeout: int = 60) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def list_active_slugs(api_base: str) -> list[str]:
    slugs: list[str] = []
    page = 1
    while True:
        url = f"{api_base.rstrip('/')}/api/products?status=ACTIVE&limit=100&page={page}"
        payload = fetch_json(url)
        batch = payload.get("data", {}).get("items", [])
        if not batch:
            break
        slugs.extend(p["slug"] for p in batch if p.get("slug"))
        pagination = payload.get("data", {}).get("pagination", {})
        if page >= pagination.get("totalPages", page):
            break
        page += 1
    return slugs


def fetch_product(api_base: str, slug: str) -> dict:
    url = f"{api_base.rstrip('/')}/api/products/{urllib.parse.quote(slug)}"
    payload = fetch_json(url)
    product = payload.get("data", {}).get("product")
    if not product:
        raise RuntimeError(f"Product not found: {slug}")
    return product


def variant_label(variant: dict) -> str:
    attrs = variant.get("attributeValues") or []
    if not attrs:
        return "Standard"
    return " / ".join(row["attributeValue"]["value"] for row in attrs)


def is_placeholder_sku(sku: str) -> bool:
    s = (sku or "").strip()
    if not s:
        return True
    return bool(re.match(r"^woo(-var)?-", s, re.I))


def build_variant_index(api_base: str, workers: int = 8) -> dict[tuple[str, str], dict]:
    slugs = list_active_slugs(api_base)
    index: dict[tuple[str, str], dict] = {}
    duplicates: list[tuple[str, str]] = []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_product, api_base, slug): slug for slug in slugs}
        for future in as_completed(futures):
            product = future.result()
            name = product.get("name") or ""
            for variant in product.get("variants") or []:
                if variant.get("status") != "ACTIVE":
                    continue
                label = variant_label(variant)
                key = norm_key(name, label)
                entry = {
                    "variant_id": variant["id"],
                    "product_name": name,
                    "variant_label": label,
                    "current_sku": (variant.get("sku") or "").strip(),
                }
                if key in index:
                    duplicates.append(key)
                index[key] = entry
    if duplicates:
        print(f"Warning: {len(set(duplicates))} duplicate API keys (last wins)", file=sys.stderr)
    return index


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    env_path = ROOT / "backend" / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL not set")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--old", type=Path, default=DEFAULT_OLD)
    parser.add_argument("--new", type=Path, default=DEFAULT_NEW)
    parser.add_argument("--api-base", default=DEFAULT_API)
    parser.add_argument("--dry-run", action="store_true", help="Preview only (default if --apply omitted)")
    parser.add_argument("--apply", action="store_true", help="Write SKU updates to DB")
    args = parser.parse_args()
    apply = bool(args.apply)

    if not args.old.is_file():
        raise SystemExit(f"Missing old catalog: {args.old}")
    if not args.new.is_file():
        raise SystemExit(f"Missing new catalog: {args.new}")

    updates = build_update_list(args.old, args.new)
    print(f"Excel rows to apply (old blank → new SKU, excl. Remove): {len(updates)}")

    print(f"Fetching live catalog from {args.api_base} …")
    index = build_variant_index(args.api_base)
    print(f"API variant index: {len(index)} ACTIVE variants")

    plan: list[dict] = []
    skipped: list[dict] = []

    for row in updates:
        key = row["key"]
        hit = index.get(key)
        if not hit:
            skipped.append({**row, "reason": "no_api_match"})
            continue
        current = hit["current_sku"]
        if not is_placeholder_sku(current):
            if current.upper() == row["new_sku"].upper():
                skipped.append({**row, "reason": "already_has_sku", "current_sku": current})
            else:
                skipped.append({**row, "reason": "db_has_other_sku", "current_sku": current})
            continue
        plan.append(
            {
                **row,
                "variant_id": hit["variant_id"],
                "current_sku": current or "(empty)",
                "api_variant_label": hit["variant_label"],
            }
        )

    print(f"Ready to update: {len(plan)}")
    print(f"Skipped: {len(skipped)}")
    for reason in sorted({s["reason"] for s in skipped}):
        n = sum(1 for s in skipped if s["reason"] == reason)
        print(f"  - {reason}: {n}")

    report_dir = ROOT / "data" / "sku-update-run"
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    (report_dir / "skipped.json").write_text(json.dumps(skipped, indent=2), encoding="utf-8")

    if not plan:
        print("Nothing to update.")
        return

    if not apply:
        print("\nDry run — first 10 planned updates:")
        for p in plan[:10]:
            print(
                f"  {p['product_name']} | {p['variant_name']} | "
                f"{p['current_sku']} → {p['new_sku']}"
            )
        print(f"\nReports: {report_dir}/plan.json")
        print("Re-run with --apply to write to database.")
        return

    try:
        import psycopg2
    except ImportError:
        raise SystemExit("pip install psycopg2-binary")

    db_url = load_database_url()
    conn = psycopg2.connect(db_url, connect_timeout=10)
    conn.autocommit = False
    cur = conn.cursor()

    updated = 0
    conflicts = 0
    errors = 0

    try:
        for p in plan:
            new_sku = p["new_sku"].strip()
            vid = p["variant_id"]
            cur.execute(
                'SELECT id FROM "ProductVariant" WHERE sku = %s AND id != %s LIMIT 1',
                (new_sku, vid),
            )
            if cur.fetchone():
                conflicts += 1
                print(f"CONFLICT sku taken: {new_sku} ({p['product_name']})", file=sys.stderr)
                continue
            cur.execute(
                'UPDATE "ProductVariant" SET sku = %s, "updatedAt" = NOW() WHERE id = %s',
                (new_sku, vid),
            )
            if cur.rowcount == 1:
                updated += 1
            else:
                errors += 1
                print(f"ERROR no row updated: {vid}", file=sys.stderr)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    print(f"\nApplied: {updated} SKU updates")
    if conflicts:
        print(f"Skipped (SKU already used): {conflicts}")
    if errors:
        print(f"Errors: {errors}")


if __name__ == "__main__":
    main()
