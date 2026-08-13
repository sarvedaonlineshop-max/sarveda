#!/usr/bin/env python3
"""Count DO→Lightsail pull feasibility (loose match; LS name/SKU/variant are truth)."""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DO_PRODUCTS = ROOT / "data/compare/do_products.csv"
DO_VARIANTS = ROOT / "data/compare/do_variants.csv"
LS_EXPORT = ROOT / "data/compare/lightsail-catalog-export.json"
OUT = ROOT / "data/compare/do-pull-feasibility.json"

YOUTUBE_RE = re.compile(r"https?://(?:www\.)?(?:youtube\.com|youtu\.be)/", re.I)


def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def norm_sku(s: str) -> str:
    return norm_text(s).upper()


def parse_do_variant_name(attrs: str, title: str, product_name: str) -> str:
    if attrs:
        parts = []
        for seg in (attrs or "").split(";"):
            if "=" in seg:
                parts.append(seg.split("=", 1)[1].strip())
        if parts:
            return " / ".join(parts)
    if title and " - " in title:
        tail = title.split(" - ", 1)[1].strip()
        if tail and norm_text(tail) != norm_text(product_name):
            return tail
    return "Standard"


def is_real_video(v: str) -> bool:
    v = (v or "").strip()
    if not v or v.startswith("field_"):
        return False
    return bool(YOUTUBE_RE.search(v) or v.startswith("http"))


def money(v) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def load_do():
    products = {}
    with DO_PRODUCTS.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if (r.get("status") or "").lower() == "publish":
                products[r["id"]] = r

    by_parent: dict[str, list] = {}
    with DO_VARIANTS.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if (r.get("status") or "").lower() == "publish":
                by_parent.setdefault(r["parent_id"], []).append(r)

    do_var_rows = []
    for pid, p in products.items():
        ptype = (p.get("product_type") or "").lower()
        vars_ = by_parent.get(pid, [])
        desc_len = int(p.get("desc_len") or 0)
        short_len = int(p.get("short_len") or 0)
        gallery = (p.get("gallery") or "").strip()
        thumb = (p.get("thumb_id") or "").strip()
        if ptype == "simple" or not vars_:
            do_var_rows.append(
                {
                    "do_product_id": pid,
                    "do_slug": p.get("slug") or "",
                    "do_product_name": p.get("name") or "",
                    "do_variant_name": "Standard",
                    "do_sku": (p.get("sku") or "").strip(),
                    "do_sale": money(p.get("sale_price")) or money(p.get("regular_price")),
                    "do_regular": money(p.get("regular_price")),
                    "has_desc": desc_len > 50 or short_len > 20,
                    "has_product_image": bool(thumb or gallery),
                    "has_variant_image": bool(thumb),
                    "has_video": is_real_video(p.get("video") or ""),
                    "video": p.get("video") or "",
                }
            )
            continue
        for v in vars_:
            vthumb = (v.get("thumb_id") or "").strip()
            do_var_rows.append(
                {
                    "do_product_id": pid,
                    "do_slug": v.get("parent_slug") or p.get("slug") or "",
                    "do_product_name": p.get("name") or "",
                    "do_variant_name": parse_do_variant_name(v.get("attrs") or "", v.get("title") or "", p.get("name") or ""),
                    "do_sku": (v.get("sku") or "").strip(),
                    "do_sale": money(v.get("sale_price")) or money(v.get("regular_price")),
                    "do_regular": money(v.get("regular_price")),
                    "has_desc": desc_len > 50 or short_len > 20,
                    "has_product_image": bool(thumb or gallery),
                    "has_variant_image": bool(vthumb or thumb),
                    "has_video": is_real_video(v.get("video") or "") or is_real_video(p.get("video") or ""),
                    "video": v.get("video") or p.get("video") or "",
                }
            )

    by_slug: dict[str, list] = {}
    by_sku: dict[str, dict] = {}
    by_wc: dict[int, list] = {}
    for row in do_var_rows:
        by_slug.setdefault(norm_text(row["do_slug"]), []).append(row)
        if row["do_sku"]:
            by_sku[norm_sku(row["do_sku"])] = row
        try:
            by_wc.setdefault(int(row["do_product_id"]), []).append(row)
        except ValueError:
            pass

    by_name: dict[str, list] = {}
    for row in do_var_rows:
        by_name.setdefault(norm_text(row["do_product_name"]), []).append(row)

    return do_var_rows, by_slug, by_sku, by_wc, by_name, products


def find_do_product(candidates_fn, ls_slug, ls_name, wc_id):
    ns = norm_text(ls_slug)
    if ns:
        hits = candidates_fn("slug", ns)
        if hits:
            return hits
    if wc_id:
        hits = candidates_fn("wc", int(wc_id))
        if hits:
            return hits
    nn = norm_text(ls_name)
    hits = candidates_fn("name", nn)
    if hits:
        return hits
    return []


def find_do_variant(candidates: list, ls_sku: str, ls_variant: str) -> dict | None:
    if not candidates:
        return None
    sk = norm_sku(ls_sku)
    if sk:
        for c in candidates:
            if norm_sku(c.get("do_sku") or "") == sk:
                return c
    lv = norm_text(ls_variant)
    for c in candidates:
        if norm_text(c.get("do_variant_name") or "") == lv:
            return c
    d_tokens = set(re.split(r"[\s/]+", lv)) - {""}
    best = (0.0, None)
    for c in candidates:
        cv = norm_text(c.get("do_variant_name") or "")
        c_tokens = set(re.split(r"[\s/]+", cv)) - {""}
        if not d_tokens or not c_tokens:
            continue
        overlap = len(d_tokens & c_tokens) / max(len(d_tokens), len(c_tokens))
        if overlap > best[0]:
            best = (overlap, c)
    if best[0] >= 0.45:
        return best[1]
    if len(candidates) == 1:
        return candidates[0]
    return None


def main():
    ls = json.loads(LS_EXPORT.read_text())
    ls_rows = ls["rows"]
    do_rows, by_slug, by_sku_global, by_wc, by_name, _ = load_do()

    def lookup(kind, key):
        if kind == "slug":
            return by_slug.get(key, [])
        if kind == "wc":
            return by_wc.get(key, [])
        if kind == "name":
            return by_name.get(key, [])
        return []

    matched = 0
    unmatched = 0
    can_price = 0
    can_variant_image = 0
    can_product_image = 0
    can_video = 0
    can_description = 0
    would_price = 0
    would_variant_image = 0
    would_product_image = 0
    would_video = 0
    would_description = 0

    for ls_r in ls_rows:
        if not ls_r.get("variantId"):
            continue
        cands = find_do_product(lookup, ls_r["slug"], ls_r["name"], ls_r.get("wooCommerceId"))
        if not cands and ls_r.get("sku"):
            hit = by_sku_global.get(norm_sku(ls_r["sku"]))
            if hit:
                cands = by_slug.get(norm_text(hit["do_slug"]), [hit])
        do_v = find_do_variant(cands, ls_r.get("sku") or "", ls_r.get("variantName") or "")
        if not do_v:
            # fuzzy product slug
            best = (0.0, None)
            seen = set()
            for d in do_rows:
                slug = d["do_slug"]
                if slug in seen:
                    continue
                seen.add(slug)
                score = SequenceMatcher(None, norm_text(ls_r["slug"]), norm_text(slug)).ratio()
                if score > best[0]:
                    best = (score, slug)
            if best[0] >= 0.78 and best[1]:
                cands = by_slug.get(norm_text(best[1]), [])
                do_v = find_do_variant(cands, ls_r.get("sku") or "", ls_r.get("variantName") or "")

        if not do_v:
            unmatched += 1
            continue
        matched += 1

        if do_v["do_sale"] is not None:
            can_price += 1
            would_price += 1  # always pull price from DO per user rule

        if do_v["has_variant_image"]:
            can_variant_image += 1
            if (ls_r.get("variantImageCount") or 0) == 0:
                would_variant_image += 1

        if do_v["has_product_image"]:
            can_product_image += 1
            if (ls_r.get("productImageCount") or 0) == 0:
                would_product_image += 1

        if do_v["has_video"]:
            can_video += 1
            if not ls_r.get("hasVariantVideo") and not ls_r.get("hasProductVideo"):
                would_video += 1

        if do_v["has_desc"]:
            can_description += 1
            if not ls_r.get("hasDescription") and not ls_r.get("hasShortDescription"):
                would_description += 1

    total = matched + unmatched
    summary = {
        "lightsailActiveVariantRows": total,
        "matchedToDoLoose": matched,
        "noDoEquivalent": unmatched,
        "matchRatePct": round(100 * matched / total, 1) if total else 0,
        "canPullFromDoIgnoringNameSkuVariantMismatch": {
            "pricesInr": can_price,
            "variantImages": can_variant_image,
            "productImages": can_product_image,
            "youtubeOrVideoUrl": can_video,
            "description": can_description,
        },
        "wouldApplyToLightsail": {
            "pricesAlwaysFromDo": would_price,
            "variantImagesWhenLsEmpty": would_variant_image,
            "productImagesWhenLsEmpty": would_product_image,
            "videoWhenLsEmpty": would_video,
            "descriptionWhenLsEmpty": would_description,
        },
        "notes": [
            "Match: slug, wooCommerceId, name, SKU, or fuzzy slug/variant (ignores name/SKU/variant label mismatches for pairing).",
            "LS product name, variant name, SKU stay unchanged on import.",
            "DO video count uses youtube/http URLs only; ACF field keys in dump are excluded.",
            "DO USD/GBP zone prices not in current CSV dump — INR prices only for now.",
        ],
    }
    OUT.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
