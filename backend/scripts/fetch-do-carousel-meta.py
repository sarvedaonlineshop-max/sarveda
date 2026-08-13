#!/usr/bin/env python3
"""
Fetch ACF carousel slot meta from live DO Woo MySQL → JSON for local sync scripts.

Writes: data/compare/do_carousel_meta.json

Usage (from repo root):
  pip3 install -r backend/scripts/requirements-do-fetch.txt
  DO_SSH_PASS='your-password' python3 backend/scripts/fetch-do-carousel-meta.py
  git add data/compare/do_carousel_meta.json && git commit -m "Refresh DO carousel meta"

Optional — sync works without this (auto-infers term labels). Re-fetch improves edge cases.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print(
        "Missing paramiko. Install with:\n"
        "  pip3 install -r backend/scripts/requirements-do-fetch.txt\n"
        "Or: pip3 install paramiko",
        file=sys.stderr,
    )
    raise SystemExit(1) from None

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/compare/do_carousel_meta.json"


def php_unserialize_term_ids(raw: str) -> list[str]:
    if not raw:
        return []
    ids = re.findall(r's:\d+:"(\d+)"', raw)
    for m in re.findall(r"i:(\d+);", raw):
        if m not in ids:
            ids.append(m)
    return list(dict.fromkeys(ids))


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s or "").strip().lower())


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")


def canonical_size_label(attrs: dict[str, str], title: str) -> str | None:
    for val in attrs.values():
        m = re.search(r"(\d+(?:\.\d+)?)\s*in(?:ch|ches)?", val or "", re.I)
        if m:
            return f"{m.group(1)} in"
    m = re.search(r"(\d+(?:\.\d+)?)\s*in(?:ch|ches)?", title or "", re.I)
    if m:
        return f"{m.group(1)} in"
    return None


def size_inches(attrs: dict[str, str], title: str) -> float:
    label = canonical_size_label(attrs, title)
    if not label:
        return 9999.0
    m = re.search(r"(\d+(?:\.\d+)?)", label)
    return float(m.group(1)) if m else 9999.0


def label_for_variation(attrs: dict[str, str], title: str) -> str:
    size = canonical_size_label(attrs, title)
    if size:
        return size
    vals = [v for v in attrs.values() if v]
    if vals:
        return " / ".join(vals)
    parts = (title or "").split(" - ")
    return parts[-1] if parts else title or ""


def sort_variations(variations: list[dict]) -> list[dict]:
    if variations and all(canonical_size_label(v.get("attrs", {}), v.get("title", "")) for v in variations):
        return sorted(
            variations,
            key=lambda v: size_inches(v.get("attrs", {}), v.get("title", "")),
        )
    return sorted(
        variations,
        key=lambda v: norm(label_for_variation(v.get("attrs", {}), v.get("title", ""))),
    )


def enrich_term_names_from_carousel(products: list[dict], base: dict[str, str]) -> dict[str, str]:
    """Mirror sync script inference — fill termNames when DB lookup misses term_taxonomy_id."""
    term_names = dict(base)
    for prod in products:
        variations = prod.get("variations") or []
        sorted_vars = sort_variations(variations)
        for v in sorted_vars:
            label = label_for_variation(v.get("attrs", {}), v.get("title", ""))
            term_names[str(v["variationId"])] = label
            for tid in v.get("termIds") or []:
                term_names.setdefault(str(tid), label)
        pairing_slots = sorted(
            [s for s in prod.get("slots") or [] if len(s.get("termIds") or []) >= 2],
            key=lambda s: len(s.get("termIds") or []),
            reverse=True,
        )
        for slot in pairing_slots:
            tids = slot.get("termIds") or []
            if not any(tid not in term_names for tid in tids):
                continue
            if len(tids) == len(sorted_vars) or abs(len(tids) - len(sorted_vars)) <= 1:
                for i, tid in enumerate(tids):
                    if i < len(sorted_vars) and str(tid) not in term_names:
                        term_names[str(tid)] = label_for_variation(
                            sorted_vars[i].get("attrs", {}),
                            sorted_vars[i].get("title", ""),
                        )
    return term_names


def main() -> None:
    password = os.environ.get("DO_SSH_PASS")
    if not password:
        raise SystemExit("Set DO_SSH_PASS env var")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        "134.209.146.175",
        username="root",
        password=password,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )

    def mysql_tsv(query: str) -> list[list[str]]:
        escaped = query.replace('"', '\\"')
        cmd = f"""export MYSQL_PWD='kni87@7HG%b8#7g67voib78g76'
mysql -usarveda_wp -h127.0.0.1 sarveda_wp_new_1 -N -e "{escaped}" """
        _, out, err = client.exec_command(cmd, timeout=300)
        text = out.read().decode()
        err_text = err.read().decode()
        if err_text.strip():
            print("mysql stderr:", err_text[:500])
        rows = []
        for line in text.splitlines():
            if line.strip():
                rows.append(line.split("\t"))
        return rows

    slot_rows = mysql_tsv(
        """
        SELECT post_id, meta_key, REPLACE(REPLACE(meta_value, CHAR(10), ' '), CHAR(13), ' ')
        FROM wp_postmeta
        WHERE meta_key LIKE 'product_gallery_carousel_image_linked_with_%'
          AND meta_key NOT LIKE '\\_%'
          AND meta_value IS NOT NULL AND meta_value != ''
        ORDER BY post_id, meta_key
        """
    )

    products: dict[str, dict] = {}
    referenced_term_ids: set[str] = set()

    for parts in slot_rows:
        if len(parts) < 3:
            continue
        post_id, meta_key, meta_value = parts[0], parts[1], parts[2]
        m = re.match(
            r"product_gallery_carousel_image_linked_with_(\d+)_(.+)", meta_key
        )
        if not m:
            continue
        idx, field = m.group(1), m.group(2)
        prod = products.setdefault(
            post_id,
            {"wooProductId": int(post_id), "slots": {}},
        )
        slot = prod["slots"].setdefault(
            idx,
            {"index": int(idx), "imageId": None, "iframe": None, "termIds": []},
        )
        if field == "image" and meta_value.strip().isdigit():
            slot["imageId"] = meta_value.strip()
        elif field == "iframe":
            slot["iframe"] = meta_value.strip()
            yt = re.search(r"youtube\.com/embed/([^\"?]+)", meta_value)
            if yt:
                slot["youtube"] = f"https://www.youtube.com/embed/{yt.group(1)}"
        elif field.startswith("link_this_image_type"):
            ids = php_unserialize_term_ids(meta_value)
            slot["termIds"] = list(dict.fromkeys(slot["termIds"] + ids))
            referenced_term_ids.update(ids)

    # All Woo terms (term_id + term_taxonomy_id) — carousel slots use either
    all_term_rows = mysql_tsv(
        """
        SELECT t.term_id, t.name, t.slug, tt.term_taxonomy_id, tt.taxonomy
        FROM wp_terms t
        JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
        """
    )
    terms: dict[str, str] = {}
    slug_to_id: dict[str, str] = {}
    name_to_id: dict[str, str] = {}
    for tid, name, slug, ttid, tax in all_term_rows:
        decoded = html.unescape(name)
        terms[str(tid)] = decoded
        terms[str(ttid)] = decoded
        if tax.startswith("pa_"):
            slug_to_id[slug.lower()] = str(tid)
            name_to_id.setdefault(norm(decoded), str(tid))

    # Batch-resolve any carousel refs still missing (deleted terms, edge IDs)
    missing_refs = [rid for rid in referenced_term_ids if rid not in terms]
    for i in range(0, len(missing_refs), 100):
        batch = missing_refs[i : i + 100]
        if not batch:
            break
        ids_sql = ",".join(batch)
        extra = mysql_tsv(
            f"""
            SELECT t.term_id, tt.term_taxonomy_id, t.name
            FROM wp_terms t
            JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
            WHERE t.term_id IN ({ids_sql}) OR tt.term_taxonomy_id IN ({ids_sql})
            """
        )
        for tid, ttid, name in extra:
            decoded = html.unescape(name)
            terms[str(tid)] = decoded
            terms[str(ttid)] = decoded

    def resolve_term_ids(attrs: dict[str, str]) -> list[str]:
        found: list[str] = []
        for val in attrs.values():
            if not val:
                continue
            raw = html.unescape(val.strip())
            candidates = [
                raw,
                raw.replace("-", " "),
                slugify(raw),
                norm(raw),
            ]
            for c in candidates:
                by_slug = slug_to_id.get(c.lower()) or slug_to_id.get(slugify(c))
                by_name = name_to_id.get(norm(c))
                if by_slug and by_slug not in found:
                    found.append(by_slug)
                elif by_name and by_name not in found:
                    found.append(by_name)
        return list(dict.fromkeys(found))

    var_rows = mysql_tsv(
        """
        SELECT p.ID, p.post_parent, p.post_title
        FROM wp_posts p
        WHERE p.post_type='product_variation' AND p.post_status='publish'
        """
    )
    var_meta_rows = mysql_tsv(
        """
        SELECT post_id, meta_key, meta_value
        FROM wp_postmeta
        WHERE meta_key LIKE 'attribute_%' AND meta_value != ''
        """
    )
    var_attrs: dict[str, dict[str, str]] = {}
    for parts in var_meta_rows:
        if len(parts) < 3:
            continue
        vid, key, val = parts[0], parts[1], parts[2]
        if not key.startswith("attribute_"):
            continue
        attr = key.replace("attribute_", "").replace("pa_", "")
        var_attrs.setdefault(vid, {})[attr] = val.strip()

    variations: dict[str, list[dict]] = {}
    for parts in var_rows:
        if len(parts) < 3:
            continue
        vid, parent, title = parts[0], parts[1], parts[2]
        attrs = var_attrs.get(vid, {})
        variations.setdefault(parent, []).append(
            {
                "variationId": int(vid),
                "title": title,
                "attrs": attrs,
                "termIds": resolve_term_ids(attrs),
            }
        )

    client.close()

    out_products = []
    for pid, data in products.items():
        slots = sorted(data["slots"].values(), key=lambda s: s["index"])
        out_products.append(
            {
                "wooProductId": int(pid),
                "slots": slots,
                "variations": variations.get(pid, []),
            }
        )

    term_names = enrich_term_names_from_carousel(out_products, terms)

    payload = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "termNames": term_names,
        "products": out_products,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    still_missing = [rid for rid in referenced_term_ids if rid not in term_names]
    pa_count = sum(1 for row in all_term_rows if len(row) > 4 and str(row[4]).startswith("pa_"))
    print(f"Wrote {OUT} — {len(out_products)} products with carousel meta")
    print(f"all terms: {len(all_term_rows)} (pa_*: {pa_count}), carousel term refs: {len(referenced_term_ids)}")
    print(f"termNames keys: {len(term_names)} (db: {len(terms)}), unresolved carousel refs: {len(still_missing)}")
    if still_missing[:5]:
        print(f"  sample unresolved: {still_missing[:5]}")


if __name__ == "__main__":
    main()
