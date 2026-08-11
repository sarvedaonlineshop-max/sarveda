#!/usr/bin/env python3
"""Fetch Woo Store API payloads for sheet-only import targets."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = json.loads((ROOT / "data/compare/sheet-only-import-targets.json").read_text())

# Explicit sheet -> Woo slug (do not invent weak matches)
SLUG_MAP: dict[str, str] = {
    "Bar Chime - 25 Rods": "32-bar-rod-chime",
    "Curved Copper Bottles": "copper-bottle-vintage-plain-curved",
    "Curved Hammered Copper Bottles": "copper-bottle-curved-vintage-hammered",
    # DNA Tuning Fork: set from probe when Woo name contains DNA
    "Etched Chau Gong": "etched-gongs",
    "Guiro": "wooden-guiro",
    "Hammered Copper Bottle": "copper-bottle-hammered-copper-set",
    "Happiness is Inside": "copper-bottle-with-brush-true-happiness-lies-within",
    "Jingle Stick": "sleigh-bells-wooden-jingle-stick",
    "Khartal*3": "wooden-hand-taal-khartal",
    "Native American Flute - Double": "native-american-style-flute-handcrafted-wooden-melody-maker",
    "Native American Flute - Single Large": "native-american-style-flute-handcrafted-wooden-melody-maker",
    "Native American Flute - Single Medium": "native-american-style-flute-handcrafted-wooden-melody-maker",
    "Native American Flute - Single Small": "native-american-style-flute-handcrafted-wooden-melody-maker",
    "Ocarina - Small": "clay-ocarinas",
    "Pink & Positive": "copper-bottle-pink-noble-toughts",
    "Shruti Box Pedal": "shruti-box-pedal",
    "Tattvamasi-I am Infinite": "copper-bottle-with-brush-tattvamasi",
    "Wind chimes": "wind-chimes",
    "Wooden Finger Castanet": "wooden-finger-castanet",
    "incense stick stand": "incense-stick-stand",
    # Crystal coloured: try slug after search; may remain skipped
}

# Products we will NOT invent from wrong Woo parents
SKIP_UNLESS_FOUND = {
    "Crystal Bowls - Coloured",
    "Blue Tranquillity/Meditation",
    "Deep Dotted",
    "GAB Set",
    "Gong Plates/Shruti Plates Etched",
    "Gong Plates/Shruti Plates Stand",
}


def http_get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "SarvedaImporter/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def search(q: str, per_page: int = 20):
    url = (
        "https://sarveda.com/wp-json/wc/store/v1/products?search="
        + urllib.parse.quote(q)
        + f"&per_page={per_page}"
    )
    return http_get(url)


def by_slug(slug: str):
    data = http_get(
        "https://sarveda.com/wp-json/wc/store/v1/products?slug=" + urllib.parse.quote(slug)
    )
    if isinstance(data, list) and data:
        return data[0]
    for p in search(slug.replace("-", " ")):
        if p.get("slug") == slug:
            return p
    return None


def by_id(pid: int):
    return http_get(f"https://sarveda.com/wp-json/wc/store/v1/products/{pid}")


def slim_product(full: dict) -> dict:
    variations_raw = full.get("variations") or []
    variations = []
    if variations_raw and isinstance(variations_raw[0], int):
        for vid in variations_raw:
            try:
                v = by_id(vid)
                variations.append(v)
            except Exception as e:
                print(f"  var {vid} err: {e}")
            time.sleep(0.05)
    elif variations_raw and isinstance(variations_raw[0], dict):
        variations = variations_raw

    def prices(p):
        pr = p.get("prices") or {}
        return {
            "price": pr.get("price"),
            "regular_price": pr.get("regular_price"),
            "sale_price": pr.get("sale_price"),
            "currency_minor_unit": pr.get("currency_minor_unit"),
        }

    def attrs(p):
        out = []
        for a in p.get("attributes") or []:
            if isinstance(a, str):
                out.append({"name": "Attribute", "value": a})
                continue
            if not isinstance(a, dict):
                continue
            out.append(
                {
                    "name": a.get("name") or a.get("label") or a.get("attribute"),
                    "taxonomy": a.get("taxonomy"),
                    "value": a.get("value") or a.get("terms") or a.get("option"),
                    "options": a.get("options") or a.get("terms"),
                }
            )
        # variation attribute shape
        for a in p.get("variation") or []:
            if isinstance(a, str):
                out.append({"name": "Attribute", "value": a})
                continue
            if not isinstance(a, dict):
                continue
            out.append(
                {
                    "name": a.get("attribute") or a.get("name"),
                    "value": a.get("value"),
                }
            )
        return out

    return {
        "id": full.get("id"),
        "name": full.get("name"),
        "slug": full.get("slug"),
        "product_type": full.get("type"),
        "description": full.get("description"),
        "short_description": full.get("short_description"),
        "prices": prices(full),
        "images": [{"src": i.get("src"), "alt": i.get("alt")} for i in (full.get("images") or [])],
        "categories": full.get("categories") or [],
        "attributes": attrs(full),
        "variations": [
            {
                "id": v.get("id"),
                "name": v.get("name"),
                "sku": v.get("sku"),
                "prices": prices(v),
                "attributes": attrs(v),
                "image": (
                    (v.get("images") or [{}])[0].get("src")
                    if v.get("images")
                    else (v.get("image") or {}).get("src")
                    if isinstance(v.get("image"), dict)
                    else None
                ),
            }
            for v in variations
            if isinstance(v, dict)
        ],
    }


def main():
    # Probe hard-to-find products
    probes = {
        "Crystal Bowls - Coloured": [
            "coloured",
            "colored crystal",
            "crystal bowls colour",
            "chakra crystal bowl",
        ],
        "Blue Tranquillity/Meditation": ["blue copper", "tranquillity", "meditation bottle"],
        "GAB Set": ["gab", "set of 3 singing"],
        "Deep Dotted": ["deep dotted", "dotted singing"],
        "Gong Plates/Shruti Plates Etched": ["etched plate", "etched thali", "etched shruti"],
        "Gong Plates/Shruti Plates Stand": ["plate stand", "thali stand"],
        "DNA Tuning Fork": ["dna tuning", "dna fork", "tuning fork dna"],
    }
    probe_hits = {}
    for sheet, qs in probes.items():
        hits = []
        seen = set()
        for q in qs:
            try:
                for p in search(q, 15):
                    pid = p.get("id")
                    if pid in seen:
                        continue
                    seen.add(pid)
                    hits.append({"id": pid, "name": p.get("name"), "slug": p.get("slug")})
            except Exception as e:
                print("probe err", q, e)
            time.sleep(0.1)
        probe_hits[sheet] = hits
        print(f"PROBE {sheet}: {[(h['slug'], h['name']) for h in hits[:8]]}")
        # adopt first coloured crystal if any
        if sheet == "Crystal Bowls - Coloured":
            for h in hits:
                n = (h["name"] or "").lower()
                if "colour" in n or "color" in n or "chakra" in n:
                    SLUG_MAP[sheet] = h["slug"]
                    break
        elif sheet == "DNA Tuning Fork":
            for h in hits:
                if "dna" in (h["name"] or "").lower():
                    SLUG_MAP[sheet] = h["slug"]
                    break
        elif hits and sheet in SKIP_UNLESS_FOUND:
            # only adopt if name clearly related (never map Deep Dotted → generic Dotted)
            for h in hits:
                n = (h["name"] or "").lower()
                if sheet.startswith("Blue") and ("blue" in n or "tranquil" in n):
                    SLUG_MAP[sheet] = h["slug"]
                    break
                if sheet.startswith("GAB") and "gab" in n:
                    SLUG_MAP[sheet] = h["slug"]
                    break
                if sheet.startswith("Deep") and "deep" in n and "dot" in n:
                    SLUG_MAP[sheet] = h["slug"]
                    break
                if "Etched" in sheet and "etch" in n:
                    SLUG_MAP[sheet] = h["slug"]
                    break
                if "Stand" in sheet and "stand" in n and ("gong" in n or "plate" in n or "thali" in n):
                    SLUG_MAP[sheet] = h["slug"]
                    break

    unique_slugs = sorted(set(SLUG_MAP.values()))
    woo_by_slug: dict[str, dict] = {}
    for slug in unique_slugs:
        print(f"FETCH {slug} ...")
        p = by_slug(slug)
        if not p:
            print(f"  MISS {slug}")
            continue
        full = by_id(p["id"])
        slim = slim_product(full)
        woo_by_slug[slug] = slim
        print(
            f"  OK id={slim['id']} name={slim['name']!r} type={slim['product_type']} "
            f"vars={len(slim['variations'])} imgs={len(slim['images'])}"
        )
        if slim["variations"]:
            for v in slim["variations"][:12]:
                print(f"    var {v.get('id')} sku={v.get('sku')!r} name={v.get('name')!r} attrs={v.get('attributes')}")
        time.sleep(0.1)

    # DNA sanity: if woo name isn't DNA, flag
    dna_slug = SLUG_MAP.get("DNA Tuning Fork")
    if dna_slug and dna_slug in woo_by_slug:
        nm = (woo_by_slug[dna_slug]["name"] or "").lower()
        if "dna" not in nm:
            print(f"WARNING: DNA Tuning Fork mapped to non-DNA product {woo_by_slug[dna_slug]['name']}")

    # Build per-sheet import plan skeleton
    plan = []
    for t in TARGETS:
        sheet = t["sheetProduct"]
        slug = SLUG_MAP.get(sheet)
        if not slug or slug not in woo_by_slug:
            plan.append(
                {
                    "sheetProduct": sheet,
                    "sheetVariants": t["sheetVariants"],
                    "action": "skip_no_woo",
                    "wooSlug": slug,
                }
            )
            continue
        plan.append(
            {
                "sheetProduct": sheet,
                "sheetVariants": t["sheetVariants"],
                "action": "import",
                "wooSlug": slug,
                "wooName": woo_by_slug[slug]["name"],
                "wooId": woo_by_slug[slug]["id"],
            }
        )

    out_dir = ROOT / "data/compare"
    (out_dir / "woo-import-products-raw.json").write_text(json.dumps(woo_by_slug, indent=2))
    (out_dir / "sheet-to-woo-slug-map.json").write_text(json.dumps(SLUG_MAP, indent=2))
    (out_dir / "sheet-only-import-plan-skeleton.json").write_text(json.dumps(plan, indent=2))
    (out_dir / "sheet-only-woo-probes.json").write_text(json.dumps(probe_hits, indent=2))
    print("\nPlan actions:")
    for row in plan:
        print(f"  {row['action']:12} {row['sheetProduct']} -> {row.get('wooName') or row.get('wooSlug')}")


if __name__ == "__main__":
    main()
