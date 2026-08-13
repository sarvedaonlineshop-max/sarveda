#!/usr/bin/env python3
"""
Fetch ACF carousel slot meta from live DO Woo MySQL → JSON for local sync scripts.

Writes: data/compare/do_carousel_meta.json

Usage:
  DO_SSH_PASS=... python3 backend/scripts/fetch-do-carousel-meta.py
"""
from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/compare/do_carousel_meta.json"


def php_unserialize_term_ids(raw: str) -> list[str]:
    if not raw:
        return []
    return re.findall(r's:\d+:"(\d+)"', raw)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s or "").strip().lower())


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")


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

    # pa_* attribute terms (slug + name lookup)
    pa_term_rows = mysql_tsv(
        """
        SELECT t.term_id, t.name, t.slug, tt.taxonomy
        FROM wp_terms t
        JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
        WHERE tt.taxonomy LIKE 'pa_%'
        """
    )
    terms: dict[str, str] = {}
    slug_to_id: dict[str, str] = {}
    name_to_id: dict[str, str] = {}
    for tid, name, slug, _tax in pa_term_rows:
        terms[tid] = html.unescape(name)
        slug_to_id[slug.lower()] = tid
        name_to_id[norm(name)] = tid

    # Carousel slots often store term_taxonomy_id, not term_id — resolve both
    if referenced_term_ids:
        ids_sql = ",".join(sorted(referenced_term_ids, key=int))
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
            name_to_id.setdefault(norm(decoded), str(tid))

    def resolve_term_ids(attrs: dict[str, str]) -> list[str]:
        found: list[str] = []
        for val in attrs.values():
            if not val:
                continue
            raw = html.unescape(val.strip())
            by_slug = slug_to_id.get(raw.lower()) or slug_to_id.get(slugify(raw))
            by_name = name_to_id.get(norm(raw))
            if by_slug:
                found.append(by_slug)
            elif by_name:
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

    payload = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "termNames": terms,
        "products": out_products,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} — {len(out_products)} products with carousel meta")
    print(f"pa terms: {len(pa_term_rows)}, carousel term refs: {len(referenced_term_ids)}")


if __name__ == "__main__":
    main()
