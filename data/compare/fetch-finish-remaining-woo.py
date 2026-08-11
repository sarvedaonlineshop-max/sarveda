#!/usr/bin/env python3
"""Fetch Woo payloads for remaining Aug9 finish items."""
from __future__ import annotations

import html
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/compare/finish-remaining-woo-raw.json"


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
    return None


def by_id(pid: int):
    return http_get(f"https://sarveda.com/wp-json/wc/store/v1/products/{pid}")


def slim(full: dict) -> dict:
    var_ids = full.get("variations") or []
    variations = []
    if var_ids and isinstance(var_ids[0], int):
        for vid in var_ids:
            try:
                v = by_id(vid)
                pr = v.get("prices") or {}
                attrs = []
                for a in v.get("attributes") or []:
                    if isinstance(a, dict):
                        attrs.append(
                            {
                                "name": a.get("name") or a.get("attribute"),
                                "value": a.get("value") or a.get("option"),
                            }
                        )
                    elif isinstance(a, str):
                        attrs.append({"name": "Attribute", "value": a})
                variations.append(
                    {
                        "id": v.get("id"),
                        "prices": {
                            "price": pr.get("price"),
                            "regular_price": pr.get("regular_price"),
                            "sale_price": pr.get("sale_price"),
                        },
                        "attributes": attrs,
                        "image": ((v.get("images") or [{}])[0] or {}).get("src"),
                    }
                )
            except Exception as e:
                print("var err", vid, e)
            time.sleep(0.08)
    pr = full.get("prices") or {}
    return {
        "id": full.get("id"),
        "name": html.unescape(full.get("name") or ""),
        "slug": full.get("slug"),
        "product_type": full.get("type"),
        "description": full.get("description") or "",
        "short_description": full.get("short_description") or "",
        "prices": {
            "price": pr.get("price"),
            "regular_price": pr.get("regular_price"),
            "sale_price": pr.get("sale_price"),
        },
        "images": [{"src": i.get("src"), "alt": i.get("alt")} for i in (full.get("images") or [])],
        "variations": variations,
    }


def probe(label: str, queries: list[str]):
    print(f"\n=== PROBE {label} ===")
    seen = set()
    hits = []
    for q in queries:
        try:
            for p in search(q):
                pid = p.get("id")
                if pid in seen:
                    continue
                seen.add(pid)
                hits.append(
                    {
                        "id": pid,
                        "name": html.unescape(p.get("name") or ""),
                        "slug": p.get("slug"),
                        "type": p.get("type"),
                        "price": (p.get("prices") or {}).get("price"),
                    }
                )
        except Exception as e:
            print(" search err", q, e)
        time.sleep(0.1)
    for h in hits:
        print(f"  {h['id']} {h['slug']} | {h['name'][:80]} | {h['price']}")
    return hits


def main():
    probe(
        "crystal",
        [
            "coloured",
            "colored",
            "crystal colour",
            "crystal color",
            "crystal bowls",
            "frosted",
            "alchemy",
        ],
    )
    probe(
        "gong plates",
        [
            "gong plate",
            "shruti plate",
            "shruti thali",
            "etched plate",
            "plate stand",
            "gong stand",
        ],
    )
    probe("gab", ["GAB", "singing bowl set", "head set", "G, A, B"])
    probe("solar", ["solar bell", "solar"])

    # Known slugs / ids from DB or URL
    targets = {
        "gab": {"slug": "singing-bowl-set-g-a-b", "wooId": 49832},
        "solar": {"slug": "solar-bell", "wooId": 49816},
        "gong_plain": {"slug": "shruthi-thali-gong-plates", "wooId": 45485},
    }

    # Try more crystal slugs from store category browsing via search "crystal bowl"
    crystal_hits = search("crystal bowl", 50)
    print("\ncrystal bowl search count", len(crystal_hits))
    for p in crystal_hits:
        name = html.unescape(p.get("name") or "")
        print(f"  {p.get('id')} {p.get('slug')} | {name}")

    fetched = {}
    for key, meta in targets.items():
        p = by_slug(meta["slug"])
        if not p and meta.get("wooId"):
            try:
                p = by_id(meta["wooId"])
            except Exception as e:
                print("by_id fail", key, e)
                p = None
        if not p:
            print("MISS", key)
            continue
        full = by_id(p["id"])
        fetched[key] = slim(full)
        print(
            f"FETCHED {key}: {fetched[key]['name']} vars={len(fetched[key]['variations'])} "
            f"price={fetched[key]['prices']}"
        )
        time.sleep(0.1)

    # If crystal coloured found in probe list, user will map — try common names
    for p in crystal_hits:
        name = (p.get("name") or "").lower()
        slug = p.get("slug") or ""
        if any(x in name for x in ["colour", "color", "alchemy", "painted"]) or "colour" in slug or "color" in slug:
            full = by_id(p["id"])
            fetched["crystal_coloured"] = slim(full)
            print("FETCHED crystal_coloured", fetched["crystal_coloured"]["name"])
            break

    # Gong etched / stand — look in gong plate hits
    for label, keys in [
        ("gong_etched", ["etch"]),
        ("gong_stand", ["stand"]),
    ]:
        # re-search
        for p in search("gong plate", 30) + search("shruti", 30):
            name = (p.get("name") or "").lower()
            slug = (p.get("slug") or "").lower()
            if label == "gong_etched" and ("etch" in name or "etch" in slug):
                fetched[label] = slim(by_id(p["id"]))
                print("FETCHED", label, fetched[label]["name"])
                break
            if label == "gong_stand" and ("stand" in name or "stand" in slug) and (
                "plate" in name or "thali" in name or "shruti" in name
            ):
                fetched[label] = slim(by_id(p["id"]))
                print("FETCHED", label, fetched[label]["name"])
                break

    OUT.write_text(json.dumps(fetched, indent=2))
    print("\nWrote", OUT, "keys", list(fetched.keys()))


if __name__ == "__main__":
    main()
