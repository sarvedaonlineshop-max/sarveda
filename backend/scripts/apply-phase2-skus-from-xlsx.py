#!/usr/bin/env python3
"""
Apply Phase 2 SKU renames from data/new_sku.xlsx (old SKU in export → new team SKU).

Also applies blank→new rows where DB already has a different real SKU (conflicts).

Usage:
  python3 backend/scripts/apply-phase2-skus-from-xlsx.py --dry-run
  python3 backend/scripts/apply-phase2-skus-from-xlsx.py --apply
  python3 backend/scripts/apply-phase2-skus-from-xlsx.py --apply --skip-key "heart chakra singing bowl|standard"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OLD = ROOT / "data/website-catalog-zoho.xlsx"
DEFAULT_NEW = ROOT / "data/new_sku.xlsx"
DEFAULT_API = os.environ.get("SARVEDA_API_BASE", "http://13.206.192.106:5000")

# User-requested skip: duplicate MI-SB-HB target on two products
DEFAULT_SKIP_KEYS = {
    ("heart chakra singing bowl", "standard"),
    ("the head bowl", "standard"),
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def norm_key(product: str, variant: str) -> tuple[str, str]:
    return norm(product), norm(variant or "standard")


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


def build_phase2_plan(old_path: Path, new_path: Path) -> list[dict]:
    old_by = {r["key"]: r for r in load_catalog_rows(old_path)}
    new_by = {r["key"]: r for r in load_catalog_rows(new_path)}
    plan: list[dict] = []

    for key in sorted(old_by.keys() & new_by.keys()):
        o, n = old_by[key], new_by[key]
        old_s, new_s = o["sku"].strip(), n["sku"].strip()
        if not new_s or new_s.lower() == "remove":
            continue

        if old_s and new_s.upper() != old_s.upper():
            plan.append(
                {
                    "kind": "rename",
                    "product_name": n["product_name"],
                    "variant_name": n["variant_name"],
                    "key": key,
                    "expected_old": old_s,
                    "new_sku": new_s,
                    "row": n["row"],
                }
            )
        elif not old_s and new_s:
            plan.append(
                {
                    "kind": "conflict",
                    "product_name": n["product_name"],
                    "variant_name": n["variant_name"],
                    "key": key,
                    "expected_old": None,
                    "new_sku": new_s,
                    "row": n["row"],
                }
            )
    return plan


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

    skip_keys = set(DEFAULT_SKIP_KEYS)

    candidates = build_phase2_plan(args.old, args.new)
    print(f"Excel Phase 2 + conflict candidates: {len(candidates)}")

    print(f"Fetching live catalog from {args.api_base} …")
    index = build_variant_index(args.api_base)

    plan: list[dict] = []
    skipped: list[dict] = []

    for row in candidates:
        if row["key"] in skip_keys:
            skipped.append({**row, "reason": "user_skip"})
            continue
        if "c&g tuning forks" in row["key"][0]:
            skipped.append({**row, "reason": "c_and_g_hold"})
            continue

        hit = index.get(row["key"])
        if not hit:
            skipped.append({**row, "reason": "no_api_match"})
            continue

        current = hit["current_sku"]
        new_sku = row["new_sku"].strip()

        if current.upper() == new_sku.upper():
            skipped.append({**row, "reason": "already_applied", "current_sku": current})
            continue

        if row["kind"] == "rename":
            if current.upper() != row["expected_old"].upper():
                skipped.append(
                    {
                        **row,
                        "reason": "db_sku_not_expected_old",
                        "current_sku": current,
                    }
                )
                continue
        elif row["kind"] == "conflict":
            if is_placeholder_sku(current):
                skipped.append({**row, "reason": "still_placeholder", "current_sku": current})
                continue

        plan.append(
            {
                **row,
                "variant_id": hit["variant_id"],
                "current_sku": current,
                "api_variant_label": hit["variant_label"],
            }
        )

    print(f"Ready to update: {len(plan)}")
    print(f"Skipped: {len(skipped)}")
    for reason in sorted({s["reason"] for s in skipped}):
        print(f"  - {reason}: {sum(1 for s in skipped if s['reason'] == reason)}")

    report_dir = ROOT / "data" / "sku-update-run"
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "phase2-plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    (report_dir / "phase2-skipped.json").write_text(json.dumps(skipped, indent=2), encoding="utf-8")

    for p in plan:
        print(
            f"  {p['kind']}: {p['product_name']} | {p['variant_name'] or 'Standard'} | "
            f"{p['current_sku']} → {p['new_sku']}"
        )

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
    updated = 0
    conflicts = 0

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
                print(
                    f"CONFLICT sku taken: {new_sku} ({p['product_name']})",
                    file=sys.stderr,
                )
                continue
            cur.execute(
                """
                UPDATE "ProductVariant"
                SET sku = %s, "updatedAt" = NOW()
                WHERE id = %s AND status = 'ACTIVE'
                """,
                (new_sku, vid),
            )
            if cur.rowcount == 1:
                updated += 1
            else:
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


if __name__ == "__main__":
    main()
