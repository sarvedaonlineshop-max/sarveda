#!/usr/bin/env python3
"""
Fetch ACF carousel slot meta from live DO Woo MySQL → JSON for local sync scripts.

Writes: data/compare/do_carousel_meta.json

Usage:
  python3 backend/scripts/fetch-do-carousel-meta.py
"""
from __future__ import annotations

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

    # Carousel slots per parent product
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
            slot["termIds"] = list(
                dict.fromkeys(slot["termIds"] + php_unserialize_term_ids(meta_value))
            )

    # Term id → name
    term_rows = mysql_tsv("SELECT term_id, name FROM wp_terms")
    terms = {tid: name for tid, name in term_rows}

    # Variation id → attrs + term ids from attribute meta
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
    for vid, key, val in var_meta_rows:
        if not key.startswith("attribute_"):
            continue
        attr = key.replace("attribute_", "").replace("pa_", "")
        var_attrs.setdefault(vid, {})[attr] = val.strip()

    variations: dict[str, list[dict]] = {}
    for vid, parent, title in var_rows:
        attrs = var_attrs.get(vid, {})
        # Resolve term ids from attribute slugs/names
        term_ids: list[str] = []
        for attr_name, attr_val in attrs.items():
            for tid, tname in terms.items():
                if tname.lower() == attr_val.replace("-", " ").lower() or tname.lower().replace(" ", "-") == attr_val.lower():
                    term_ids.append(tid)
                    break
        variations.setdefault(parent, []).append(
            {
                "variationId": int(vid),
                "title": title,
                "attrs": attrs,
                "termIds": list(dict.fromkeys(term_ids)),
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


if __name__ == "__main__":
    main()
