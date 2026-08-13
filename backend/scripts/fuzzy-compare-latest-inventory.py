#!/usr/bin/env python3
"""
Fuzzy compare team inventory xlsx vs live Lightsail catalog.

Outputs multi-sheet xlsx:
  - Exact Match
  - Fuzzy Match
  - Sheet Only
  - DB Only

Usage:
  python3 backend/scripts/fuzzy-compare-latest-inventory.py \\
    --xlsx data/latest_inventory.xlsx \\
    --out data/compare/latest-inventory-fuzzy.xlsx
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from rapidfuzz import fuzz

API_DEFAULT = "http://13.204.112.165"

HEADERS = [
    "Sheet Product name",
    "DB Product name",
    "Sheet Variant name",
    "DB Variant name",
    "Sheet SKU",
    "DB SKU",
    "Match score",
    "Match type",
    "Notes",
]


@dataclass
class Row:
    product: str
    variant: str
    sku: str


def variant_match(a: str, b: str) -> bool:
    na, nb = norm_variant(a), norm_variant(b)
    if na == nb:
        return True
    if na and nb and set(na.split()) == set(nb.split()):
        return True
    return False


def rows_exact(s: Row, d: Row) -> bool:
    return (
        norm_text(s.product) == norm_text(d.product)
        and variant_match(s.variant, d.variant)
        and norm_sku(s.sku) == norm_sku(d.sku)
    )


def norm_text(s: str) -> str:
    return " ".join(str(s or "").lower().split())


def norm_sku(s: str) -> str:
    return " ".join(str(s or "").strip().split()).upper()


def norm_variant(s: str) -> str:
    s = norm_text(s)
    return re.sub(r"[\s|/·,–—\-]+", " ", s).strip()


def composite_key(product: str, variant: str, sku: str) -> str:
    return f"{norm_text(product)} | {norm_variant(variant)} | {norm_sku(sku)}"


def fuzzy_score(sheet: Row, db: Row) -> float:
    if norm_sku(sheet.sku) == norm_sku(db.sku):
        name_s = fuzz.token_set_ratio(sheet.product, db.product)
        var_s = fuzz.token_set_ratio(sheet.variant or "", db.variant or "") if (sheet.variant or db.variant) else 100.0
        return min(100.0, 40 + name_s * 0.35 + var_s * 0.25)

    name_s = fuzz.token_set_ratio(sheet.product, db.product)
    var_s = fuzz.token_set_ratio(sheet.variant or "", db.variant or "")
    sku_s = fuzz.ratio(norm_sku(sheet.sku), norm_sku(db.sku))
    combo = name_s * 0.45 + var_s * 0.35 + sku_s * 0.20
    if name_s >= 92 and var_s >= 85:
        combo = max(combo, 88.0)
    return combo


def load_inventory(path: Path) -> list[Row]:
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb["Website Catalog"] if "Website Catalog" in wb.sheetnames else wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    header_i = next(i for i, r in enumerate(rows[:20]) if r and str(r[0] or "").strip() == "Name")
    out: list[Row] = []
    cur = ""
    for r in rows[header_i + 1 :]:
        if not r:
            continue
        if r[0] is not None and str(r[0]).strip():
            cur = str(r[0]).strip()
        sku = "" if len(r) < 3 or r[2] is None else str(r[2]).strip()
        if not sku:
            continue
        variant = "" if r[1] is None else str(r[1]).strip()
        out.append(Row(cur, variant, sku))
    wb.close()
    return out


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.loads(resp.read().decode())


def variant_label(attrs) -> str:
    if not attrs:
        return ""
    parts = sorted(
        (a["attributeValue"]["attribute"]["slug"], a["attributeValue"]["value"])
        for a in attrs
        if a.get("attributeValue")
    )
    return " / ".join(v for _, v in parts)


def fetch_lightsail_rows(api: str) -> list[Row]:
    page = 1
    slugs: list[str] = []
    while True:
        data = fetch_json(f"{api}/api/products?limit=100&page={page}&status=ACTIVE")
        items = data["data"]["items"]
        slugs.extend(i["slug"] for i in items)
        pag = data["data"]["pagination"]
        if page >= pag["totalPages"]:
            break
        page += 1

    rows: list[Row] = []

    def one(slug: str) -> list[Row]:
        data = fetch_json(f"{api}/api/products/{slug}")
        p = data["data"]["product"]
        if p.get("deletedAt") or p.get("status") != "ACTIVE" or p.get("catalogHidden"):
            return []
        name = p["name"]
        out: list[Row] = []
        for v in p.get("variants") or []:
            if v.get("status") != "ACTIVE":
                continue
            out.append(Row(name, variant_label(v.get("attributeValues")), v["sku"]))
        return out

    with ThreadPoolExecutor(max_workers=12) as ex:
        for fut in as_completed(ex.submit(one, s) for s in slugs):
            rows.extend(fut.result())
    return rows


def classify_match(sheet: Row, db: Row) -> tuple[str, str]:
    if rows_exact(sheet, db):
        return "exact", "All three fields match"

    notes: list[str] = []
    if norm_sku(sheet.sku) != norm_sku(db.sku):
        notes.append("SKU differs")
    if norm_text(sheet.product) != norm_text(db.product):
        notes.append("Product name differs")
    if not variant_match(sheet.variant, db.variant):
        notes.append("Variant name differs")
    if norm_sku(sheet.sku) == norm_sku(db.sku):
        return "sku_exact_text_diff", "; ".join(notes)
    return "fuzzy", "; ".join(notes) if notes else "Fuzzy paired"


def match_rows(sheet_rows: list[Row], db_rows: list[Row], *, fuzzy_threshold: float = 82.0):
    exact: list[dict] = []
    fuzzy: list[dict] = []
    used_db: set[int] = set()
    used_sheet: set[int] = set()

    db_by_sku: dict[str, list[int]] = {}
    for i, r in enumerate(db_rows):
        db_by_sku.setdefault(norm_sku(r.sku), []).append(i)

    # Pass 1: exact triple (name + variant + SKU)
    for si, s in enumerate(sheet_rows):
        for di, d in enumerate(db_rows):
            if di in used_db or si in used_sheet:
                continue
            if rows_exact(s, d):
                used_sheet.add(si)
                used_db.add(di)
                exact.append(
                    {
                        "Sheet Product name": s.product,
                        "DB Product name": d.product,
                        "Sheet Variant name": s.variant,
                        "DB Variant name": d.variant,
                        "Sheet SKU": s.sku,
                        "DB SKU": d.sku,
                        "Match score": 100,
                        "Match type": "exact",
                        "Notes": "All three fields match",
                    }
                )
                break

    # Pass 2: same SKU, text differs
    for si, s in enumerate(sheet_rows):
        if si in used_sheet:
            continue
        candidates = [di for di in db_by_sku.get(norm_sku(s.sku), []) if di not in used_db]
        if len(candidates) == 1:
            di = candidates[0]
            d = db_rows[di]
            used_sheet.add(si)
            used_db.add(di)
            mtype, note = classify_match(s, d)
            fuzzy.append(
                {
                    "Sheet Product name": s.product,
                    "DB Product name": d.product,
                    "Sheet Variant name": s.variant,
                    "DB Variant name": d.variant,
                    "Sheet SKU": s.sku,
                    "DB SKU": d.sku,
                    "Match score": round(fuzzy_score(s, d), 1),
                    "Match type": mtype,
                    "Notes": note,
                }
            )

    # Pass 3: greedy fuzzy on remaining
    pairs: list[tuple[float, int, int]] = []
    for si, s in enumerate(sheet_rows):
        if si in used_sheet:
            continue
        for di, d in enumerate(db_rows):
            if di in used_db:
                continue
            sc = fuzzy_score(s, d)
            if sc >= fuzzy_threshold:
                pairs.append((sc, si, di))
    pairs.sort(reverse=True)

    for sc, si, di in pairs:
        if si in used_sheet or di in used_db:
            continue
        s, d = sheet_rows[si], db_rows[di]
        used_sheet.add(si)
        used_db.add(di)
        mtype, note = classify_match(s, d)
        fuzzy.append(
            {
                "Sheet Product name": s.product,
                "DB Product name": d.product,
                "Sheet Variant name": s.variant,
                "DB Variant name": d.variant,
                "Sheet SKU": s.sku,
                "DB SKU": d.sku,
                "Match score": round(sc, 1),
                "Match type": mtype,
                "Notes": note,
            }
        )

    sheet_only = [
        {
            "Sheet Product name": sheet_rows[si].product,
            "DB Product name": "",
            "Sheet Variant name": sheet_rows[si].variant,
            "DB Variant name": "",
            "Sheet SKU": sheet_rows[si].sku,
            "DB SKU": "",
            "Match score": "",
            "Match type": "sheet_only",
            "Notes": "No fuzzy match on Lightsail",
        }
        for si in range(len(sheet_rows))
        if si not in used_sheet
    ]

    db_only = [
        {
            "Sheet Product name": "",
            "DB Product name": db_rows[di].product,
            "Sheet Variant name": "",
            "DB Variant name": db_rows[di].variant,
            "Sheet SKU": "",
            "DB SKU": db_rows[di].sku,
            "Match score": "",
            "Match type": "db_only",
            "Notes": "Not on team sheet",
        }
        for di in range(len(db_rows))
        if di not in used_db
    ]

    return exact, fuzzy, sheet_only, db_only


def write_sheet(ws, rows: list[dict]) -> None:
    for col, h in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True)
    for ri, row in enumerate(rows, start=2):
        for ci, h in enumerate(HEADERS, start=1):
            ws.cell(row=ri, column=ci, value=row.get(h, ""))
    widths = [38, 38, 32, 32, 18, 18, 12, 16, 40]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", type=Path, default=Path("data/latest_inventory.xlsx"))
    ap.add_argument("--out", type=Path, default=Path("data/compare/latest-inventory-fuzzy.xlsx"))
    ap.add_argument("--api", default=API_DEFAULT)
    ap.add_argument("--threshold", type=float, default=82.0)
    args = ap.parse_args()

    print("Loading sheet...")
    sheet_rows = load_inventory(args.xlsx)
    print(f"Fetching Lightsail ({args.api})...")
    db_rows = fetch_lightsail_rows(args.api)
    print(f"Sheet: {len(sheet_rows)} | DB: {len(db_rows)}")

    exact, fuzzy, sheet_only, db_only = match_rows(sheet_rows, db_rows, fuzzy_threshold=args.threshold)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    wb.remove(wb.active)

    sheets = [
        ("Exact Match", exact),
        ("Fuzzy Match", fuzzy),
        ("Sheet Only", sheet_only),
        ("DB Only", db_only),
    ]
    for title, rows in sheets:
        ws = wb.create_sheet(title)
        write_sheet(ws, rows)

    summary = wb.create_sheet("Summary", 0)
    summary["A1"] = "Metric"
    summary["B1"] = "Count"
    summary["A1"].font = Font(bold=True)
    summary["B1"].font = Font(bold=True)
    metrics = [
        ("Sheet rows (with SKU)", len(sheet_rows)),
        ("Lightsail ACTIVE variant rows", len(db_rows)),
        ("Exact Match", len(exact)),
        ("Fuzzy Match (incl. SKU-exact-text-diff)", len(fuzzy)),
        ("Sheet Only (unmatched)", len(sheet_only)),
        ("DB Only (unmatched)", len(db_only)),
        ("Fuzzy threshold", args.threshold),
        ("Source API", args.api),
    ]
    for i, (k, v) in enumerate(metrics, start=2):
        summary.cell(row=i, column=1, value=k)
        summary.cell(row=i, column=2, value=v)
    summary.column_dimensions["A"].width = 42
    summary.column_dimensions["B"].width = 20

    wb.save(args.out)

    print()
    print(f"Exact Match:  {len(exact)}")
    print(f"Fuzzy Match:  {len(fuzzy)}")
    print(f"Sheet Only:   {len(sheet_only)}")
    print(f"DB Only:      {len(db_only)}")
    print(f"Wrote: {args.out}")


if __name__ == "__main__":
    main()
