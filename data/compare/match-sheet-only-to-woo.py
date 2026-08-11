#!/usr/bin/env python3
"""Match sheet-only remaining products to live Woo store API."""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ITEMS = json.loads((ROOT / "data/compare/sheet-only-remaining-list.json").read_text())
ITEMS = [i for i in ITEMS if i.get("product", "").strip().lower() not in ("name", "")]
# Debadutta already excluded from list; shankhs imported excluded.

OUT = ROOT / "data/compare/sheet-only-woo-match.json"


def fetch(q: str):
    url = (
        "https://sarveda.com/wp-json/wc/store/v1/products?search="
        + urllib.parse.quote(q)
        + "&per_page=20"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "SarvedaImporter/1.0"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode())


def norm(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()
    return re.sub(r"\s+", " ", s)


# Extra search seeds when product name is marketing-y
EXTRA_Q = {
    "blue tranquillity/meditation": ["blue tranquillity", "tranquillity copper", "meditation copper bottle"],
    "happiness is inside": ["happiness is inside", "happiness copper"],
    "pink & positive": ["pink positive", "pink & positive"],
    "tattvamasi-i am infinite": ["tattvamasi", "i am infinite"],
    "gab set": ["gab set", "singing bowl gab"],
    "deep dotted": ["deep dotted", "dotted singing bowl"],
    "curved copper bottles": ["curved copper bottle"],
    "curved hammered copper bottles": ["curved hammered copper"],
    "hammered copper bottle": ["hammered copper bottle"],
    "gong plates/shruti plates etched": ["etched gong plate", "shruti plate etched"],
    "gong plates/shruti plates stand": ["gong plate stand", "shruti plate stand"],
    "native american flute - double": ["native american flute double", "double flute"],
    "native american flute - single large": ["native american flute", "single flute"],
    "native american flute - single medium": ["native american flute"],
    "native american flute - single small": ["native american flute"],
    "swing flute/harmonic": ["swing flute", "harmonic flute"],
    "wooden finger castanet": ["castanet", "finger castanet"],
    "incense stick stand": ["incense stick stand", "incense stand"],
    "ball mallet": ["ball mallet", "mallet ball"],
    "bar chime - 25 rods": ["bar chime 25", "25 rods bar chime", "bar chime"],
    "crystal bowls - coloured": ["coloured crystal bowl", "colored crystal bowl", "crystal bowls coloured"],
    "etched chau gong": ["etched chau gong", "etched gong"],
    "dna tuning fork": ["dna tuning fork"],
    "khartal*3": ["khartal"],
    "jingle stick": ["jingle stick"],
    "wind chimes": ["wind chime"],
    "shruti box pedal": ["shruti box pedal", "pedal shruti"],
    "nipple gong": ["nipple gong"],
    "overtone flute": ["overtone flute"],
    "ocarina - small": ["ocarina"],
    "clay whistle": ["clay whistle"],
    "guiro": ["guiro"],
}


def queries_for(name: str) -> list[str]:
    q = [name]
    key = name.lower().strip()
    q.extend(EXTRA_Q.get(key, []))
    short = re.sub(r"\s*[/\-].*$", "", name).strip()
    if short and short.lower() != name.lower():
        q.append(short)
    # unique preserve order
    seen = set()
    out = []
    for x in q:
        x = x.strip()
        if x and x.lower() not in seen:
            seen.add(x.lower())
            out.append(x)
    return out


def score_match(sheet: str, woo_name: str) -> int:
    a = norm(sheet)
    b = norm(woo_name)
    if not a or not b:
        return 0
    if a == b:
        return 100
    if a in b or b in a:
        return 85
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0
    jaccard = int(100 * len(sa & sb) / len(sa | sb))
    # important token boosts
    boost = 0
    for tok in sa:
        if len(tok) >= 4 and tok in sb:
            boost += 3
    return min(100, jaccard + boost)


def main():
    results = []
    for it in ITEMS:
        name = it["product"]
        hits = []
        seen_ids = set()
        errors = []
        for q in queries_for(name):
            try:
                data = fetch(q)
            except Exception as e:
                errors.append({"q": q, "error": str(e)})
                continue
            for p in data:
                pid = p.get("id")
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)
                prices = p.get("prices") or {}
                hits.append(
                    {
                        "id": pid,
                        "name": p.get("name"),
                        "slug": p.get("slug"),
                        "type": p.get("type"),
                        "price": prices.get("price"),
                        "regular": prices.get("regular_price"),
                        "sale": prices.get("sale_price"),
                        "image": (p.get("images") or [{}])[0].get("src"),
                    }
                )
            time.sleep(0.12)

        best = None
        best_score = -1
        for h in hits:
            sc = score_match(name, h["name"] or "")
            if sc > best_score:
                best_score = sc
                best = h

        if best and best_score >= 55:
            status = "likely"
        elif best and best_score >= 30:
            status = "weak"
        else:
            status = "no_woo"

        row = {
            "sheetProduct": name,
            "sheetVariants": it["variants"],
            "wooStatus": status,
            "bestScore": best_score,
            "bestWoo": best,
            "otherHits": [h for h in hits if best is None or h.get("id") != best.get("id")][:6],
            "errors": errors[:3],
        }
        results.append(row)
        woo_label = f"{best['name']} ({best['slug']})" if best else "—"
        print(f"{status:7} {best_score:3} | {name}")
        print(f"         -> {woo_label}")

    OUT.write_text(json.dumps(results, indent=2))
    counts = {}
    for r in results:
        counts[r["wooStatus"]] = counts.get(r["wooStatus"], 0) + 1
    print("\nCounts:", counts)
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
