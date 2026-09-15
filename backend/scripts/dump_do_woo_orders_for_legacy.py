#!/usr/bin/env python3
"""
Dump DigitalOcean Woo shop_orders (gap after May-30 / archive max) as JSON for
LegacyOrderArchive import.

Runs ON the DO box (local MySQL). Usage remotely:
  python3 /tmp/dump_do_woo_orders_for_legacy.py [--since-id=50294] [--since-date=2026-08-20]
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pymysql

cfg = Path("/var/www/sarveda_wp_new_1/wp-config.php").read_text(errors="ignore")


def g(k: str) -> str:
    m = re.search(r"define\(\s*['\"]%s['\"]\s*,\s*['\"]([^'\"]*)['\"]" % k, cfg)
    if not m:
        raise SystemExit(f"missing {k}")
    return m.group(1)


def arg_val(prefix: str, default: str | None = None) -> str | None:
    for a in sys.argv[1:]:
        if a.startswith(prefix):
            return a[len(prefix) :]
    return default


since_id = int(arg_val("--since-id=", "0") or "0")
since_date = arg_val("--since-date=", "2026-08-20")
out_path = Path(arg_val("--out=", "/tmp/do_woo_orders_legacy_gap.json") or "/tmp/do_woo_orders_legacy_gap.json")

META_KEYS = [
    "_order_total",
    "_order_currency",
    "_cart_discount",
    "_order_shipping",
    "_order_tax",
    "_order_shipping_tax",
    "_payment_method",
    "_payment_method_title",
    "_billing_email",
    "_billing_phone",
    "_billing_first_name",
    "_billing_last_name",
    "_billing_address_1",
    "_billing_address_2",
    "_billing_city",
    "_billing_state",
    "_billing_postcode",
    "_billing_country",
    "_shipping_first_name",
    "_shipping_last_name",
    "_shipping_address_1",
    "_shipping_address_2",
    "_shipping_city",
    "_shipping_state",
    "_shipping_postcode",
    "_shipping_country",
    "_shipping_phone",
    "_customer_user",
    "_order_key",
    "_paid_date",
    "_completed_date",
    "_wc_order_attribution_source_type",
    "_wc_order_attribution_utm_source",
    "_wc_order_attribution_utm_medium",
    "_wc_order_attribution_utm_campaign",
]

conn = pymysql.connect(
    host=g("DB_HOST"),
    user=g("DB_USER"),
    password=g("DB_PASSWORD"),
    database=g("DB_NAME"),
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)

with conn.cursor() as cur:
    cur.execute(
        """
        SELECT ID, post_date, post_status, post_modified
        FROM wp_posts
        WHERE post_type='shop_order'
          AND (ID > %s OR post_date >= %s)
        ORDER BY ID
        """,
        (since_id, since_date),
    )
    orders = cur.fetchall()
    ids = [int(o["ID"]) for o in orders]
    print(f"orders_selected {len(ids)} since_id>{since_id} OR date>={since_date}", file=sys.stderr)
    if not ids:
        out_path.write_text(json.dumps({"generatedAt": datetime.now(timezone.utc).isoformat(), "orders": []}))
        print(str(out_path))
        raise SystemExit(0)

    # meta
    format_ids = ",".join(str(i) for i in ids)
    key_list = ",".join("%s" for _ in META_KEYS)
    cur.execute(
        f"""
        SELECT post_id, meta_key, meta_value
        FROM wp_postmeta
        WHERE post_id IN ({format_ids})
          AND meta_key IN ({key_list})
        """,
        META_KEYS,
    )
    meta_by: dict[int, dict[str, str]] = defaultdict(dict)
    for row in cur.fetchall():
        meta_by[int(row["post_id"])][row["meta_key"]] = row["meta_value"] if row["meta_value"] is not None else ""

    # line items
    cur.execute(
        f"""
        SELECT
          oi.order_id,
          oi.order_item_id,
          oi.order_item_name,
          MAX(CASE WHEN oim.meta_key='_qty' THEN oim.meta_value END) AS qty,
          MAX(CASE WHEN oim.meta_key='_line_total' THEN oim.meta_value END) AS line_total,
          MAX(CASE WHEN oim.meta_key='_line_subtotal' THEN oim.meta_value END) AS line_subtotal,
          MAX(CASE WHEN oim.meta_key='_product_id' THEN oim.meta_value END) AS product_id,
          MAX(CASE WHEN oim.meta_key='_variation_id' THEN oim.meta_value END) AS variation_id,
          MAX(CASE WHEN oim.meta_key='_sku' THEN oim.meta_value END) AS line_sku
        FROM wp_woocommerce_order_items oi
        LEFT JOIN wp_woocommerce_order_itemmeta oim ON oim.order_item_id = oi.order_item_id
        WHERE oi.order_item_type='line_item'
          AND oi.order_id IN ({format_ids})
        GROUP BY oi.order_id, oi.order_item_id, oi.order_item_name
        ORDER BY oi.order_id, oi.order_item_id
        """
    )
    lines_raw = cur.fetchall()

    # resolve SKUs from product/variation posts
    product_ids = set()
    for r in lines_raw:
        for k in ("product_id", "variation_id"):
            v = r.get(k)
            if v and str(v) not in ("0", ""):
                product_ids.add(int(v))
    sku_map: dict[int, str] = {}
    if product_ids:
        pid_csv = ",".join(str(i) for i in product_ids)
        cur.execute(
            f"""
            SELECT post_id, meta_value FROM wp_postmeta
            WHERE meta_key='_sku' AND post_id IN ({pid_csv})
            """
        )
        for row in cur.fetchall():
            sku_map[int(row["post_id"])] = row["meta_value"] or ""

    lines_by: dict[int, list] = defaultdict(list)
    for r in lines_raw:
        oid = int(r["order_id"])
        vid = int(r["variation_id"] or 0)
        pid = int(r["product_id"] or 0)
        sku = (r.get("line_sku") or "").strip() or sku_map.get(vid) or sku_map.get(pid) or ""
        lines_by[oid].append(
            {
                "name": r["order_item_name"] or "",
                "sku": sku,
                "qty": float(r["qty"] or 0),
                "lineTotal": float(r["line_total"] or 0),
                "lineSubtotal": float(r["line_subtotal"] or r["line_total"] or 0),
                "productId": pid or None,
                "variationId": vid or None,
            }
        )

    # customers dump for audit
    cur.execute(
        """
        SELECT u.ID, u.user_email, u.display_name, u.user_registered,
          MAX(CASE WHEN um.meta_key='billing_email' THEN um.meta_value END) AS billing_email,
          MAX(CASE WHEN um.meta_key='billing_phone' THEN um.meta_value END) AS billing_phone,
          MAX(CASE WHEN um.meta_key='first_name' THEN um.meta_value END) AS first_name,
          MAX(CASE WHEN um.meta_key='last_name' THEN um.meta_value END) AS last_name
        FROM wp_users u
        LEFT JOIN wp_usermeta um ON um.user_id=u.ID
          AND um.meta_key IN ('billing_email','billing_phone','first_name','last_name')
        GROUP BY u.ID, u.user_email, u.display_name, u.user_registered
        """
    )
    users = cur.fetchall()

payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "sinceId": since_id,
    "sinceDate": since_date,
    "orderCount": len(orders),
    "orders": [
        {
            "wooCommerceId": int(o["ID"]),
            "postDate": o["post_date"].isoformat(sep=" ") if hasattr(o["post_date"], "isoformat") else str(o["post_date"]),
            "postStatus": o["post_status"],
            "postModified": o["post_modified"].isoformat(sep=" ") if hasattr(o["post_modified"], "isoformat") else str(o["post_modified"]),
            "meta": meta_by.get(int(o["ID"]), {}),
            "lineItems": lines_by.get(int(o["ID"]), []),
        }
        for o in orders
    ],
    "wpUsers": [
        {
            "wooCommerceId": int(u["ID"]),
            "email": (u["user_email"] or "").strip(),
            "displayName": u["display_name"] or "",
            "registered": u["user_registered"].isoformat(sep=" ") if hasattr(u["user_registered"], "isoformat") else str(u["user_registered"]),
            "billingEmail": (u.get("billing_email") or "").strip(),
            "billingPhone": (u.get("billing_phone") or "").strip(),
            "firstName": u.get("first_name") or "",
            "lastName": u.get("last_name") or "",
        }
        for u in users
    ],
}

out_path.write_text(json.dumps(payload, ensure_ascii=False))
print(f"wrote {out_path} orders={len(orders)} users={len(users)}", file=sys.stderr)
print(str(out_path))
conn.close()
