#!/usr/bin/env python3
"""
Deactivate variants marked "Remove" in data/new_sku.xlsx (vs blank in old catalog).

Also applies Yo-M-C-HG-T to Teal / Superior on live 7 Chakras Yoga Mats.

Usage (on EC2 with DATABASE_URL in backend/.env):
  python3 backend/scripts/deactivate-remove-variants-from-xlsx.py --dry-run
  python3 backend/scripts/deactivate-remove-variants-from-xlsx.py --apply
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
DEFAULT_API = os.environ.get("SARVEDA_API_BASE", "http://127.0.0.1:5000")

TEAL_SUPERIOR = {
    "product_name": "7 Chakras Yoga Mats",
    "variant_name": "Teal / Superior",
    "new_sku": "Yo-M-C-HG-T",
}


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


def build_remove_list(old_path: Path, new_path: Path) -> list[dict]:
    old_by_key = {r["key"]: r for r in load_catalog_rows(old_path)}
    new_by_key = {r["key"]: r for r in load_catalog_rows(new_path)}
    removes: list[dict] = []
    for key in sorted(old_by_key.keys() & new_by_key.keys()):
        o, n = old_by_key[key], new_by_key[key]
        if o["sku"]:
            continue
        if n["sku"].strip().lower() == "remove":
            removes.append({**n, "key": key})
    return removes


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


def build_variant_index(api_base: str, workers: int = 8) -> dict[tuple[str, str], dict]:
    slugs = list_active_slugs(api_base)
    index: dict[tuple[str, str], dict] = {}
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
                index[key] = {
                    "variant_id": variant["id"],
                    "product_name": name,
                    "variant_label": label,
                    "current_sku": (variant.get("sku") or "").strip(),
                }
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
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    apply = bool(args.apply)

    if not args.old.is_file() or not args.new.is_file():
        raise SystemExit("Missing catalog xlsx files under data/")

    removes = build_remove_list(args.old, args.new)
    print(f"Excel Remove rows: {len(removes)}")

    print(f"Fetching live catalog from {args.api_base} …")
    index = build_variant_index(args.api_base)

    plan: list[dict] = []
    skipped: list[dict] = []
    for row in removes:
        hit = index.get(row["key"])
        if not hit:
            skipped.append({**row, "reason": "no_api_match"})
            continue
        plan.append({**row, **hit})

    teal_key = norm_key(TEAL_SUPERIOR["product_name"], TEAL_SUPERIOR["variant_name"])
    teal_hit = index.get(teal_key)
    if not teal_hit:
        print("WARNING: Teal / Superior not found in API index", file=sys.stderr)
    else:
        print(
            f"Teal Superior: {teal_hit['current_sku']} → {TEAL_SUPERIOR['new_sku']} "
            f"({teal_hit['variant_id']})"
        )

    print(f"Remove variants to deactivate: {len(plan)}")
    print(f"Skipped (no match): {len(skipped)}")
    for s in skipped:
        print(f"  skip: {s['product_name']} | {s['variant_name']}", file=sys.stderr)

    report_dir = ROOT / "data" / "sku-update-run"
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "remove-plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    (report_dir / "remove-skipped.json").write_text(json.dumps(skipped, indent=2), encoding="utf-8")

    for p in plan:
        print(f"  deactivate: {p['product_name']} | {p['variant_label']} | {p['current_sku']}")

    if not apply:
        print("\nDry run — re-run with --apply to write to database.")
        return

    try:
        import psycopg2
    except ImportError:
        raise SystemExit("pip install psycopg2-binary")

    conn = psycopg2.connect(load_database_url(), connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()
    deactivated = 0
    sku_updated = 0

    try:
        for p in plan:
            vid = p["variant_id"]
            sku = p["current_sku"] or "empty"
            archived_sku = f"REMOVED-{str(vid)[:8]}-{sku}"[:120]
            cur.execute(
                """
                UPDATE "ProductVariant"
                SET sku = %s, status = 'INACTIVE', "updatedAt" = NOW()
                WHERE id = %s AND status = 'ACTIVE'
                """,
                (archived_sku, vid),
            )
            if cur.rowcount == 1:
                deactivated += 1

        if teal_hit:
            new_sku = TEAL_SUPERIOR["new_sku"]
            vid = teal_hit["variant_id"]
            cur.execute(
                'SELECT id FROM "ProductVariant" WHERE sku = %s AND id != %s LIMIT 1',
                (new_sku, vid),
            )
            if cur.fetchone():
                print(f"CONFLICT: SKU {new_sku} already taken", file=sys.stderr)
            else:
                cur.execute(
                    """
                    UPDATE "ProductVariant"
                    SET sku = %s, "updatedAt" = NOW()
                    WHERE id = %s AND status = 'ACTIVE'
                    """,
                    (new_sku, vid),
                )
                if cur.rowcount == 1:
                    sku_updated = 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    print(f"\nApplied: {deactivated} variants deactivated, {sku_updated} Teal Superior SKU update")


if __name__ == "__main__":
    main()
