#!/usr/bin/env python3
"""
Read-only Woo order line dump from local MySQL (DigitalOcean WP).
Writes TSV: /tmp/woo_compare/do_instrument_order_lines.tsv

Completed + processing shop_order line items, with product title + SKU.
"""
import csv
import re
from pathlib import Path

import pymysql

cfg = Path("/var/www/sarveda_wp_new_1/wp-config.php").read_text(errors="ignore")


def g(k: str) -> str:
    m = re.search(r"define\(\s*['\"]%s['\"]\s*,\s*['\"]([^'\"]*)['\"]" % k, cfg)
    if not m:
        raise SystemExit(f"missing {k}")
    return m.group(1)


conn = pymysql.connect(
    host=g("DB_HOST"),
    user=g("DB_USER"),
    password=g("DB_PASSWORD"),
    database=g("DB_NAME"),
    charset="utf8mb4",
    cursorclass=pymysql.cursors.Cursor,
)

out_dir = Path("/tmp/woo_compare")
out_dir.mkdir(exist_ok=True)
out_path = out_dir / "do_instrument_order_lines.tsv"

sql = """
SELECT
  p.ID AS order_id,
  DATE(p.post_date) AS order_date,
  p.post_status AS status,
  oi.order_item_name AS item_name,
  IFNULL(parent.post_title, '') AS parent_name,
  COALESCE(NULLIF(vsku.meta_value, ''), NULLIF(psku.meta_value, ''), NULLIF(linesku.meta_value, ''), '') AS sku,
  CAST(IFNULL(qty.meta_value, '0') AS DECIMAL(12,4)) AS qty,
  CAST(IFNULL(tot.meta_value, '0') AS DECIMAL(12,4)) AS line_total,
  IFNULL(pid.meta_value, '') AS product_id,
  IFNULL(vid.meta_value, '') AS variation_id
FROM wp_woocommerce_order_items oi
JOIN wp_posts p ON p.ID = oi.order_id AND p.post_type = 'shop_order'
LEFT JOIN wp_woocommerce_order_itemmeta qty
  ON qty.order_item_id = oi.order_item_id AND qty.meta_key = '_qty'
LEFT JOIN wp_woocommerce_order_itemmeta tot
  ON tot.order_item_id = oi.order_item_id AND tot.meta_key = '_line_total'
LEFT JOIN wp_woocommerce_order_itemmeta pid
  ON pid.order_item_id = oi.order_item_id AND pid.meta_key = '_product_id'
LEFT JOIN wp_woocommerce_order_itemmeta vid
  ON vid.order_item_id = oi.order_item_id AND vid.meta_key = '_variation_id'
LEFT JOIN wp_woocommerce_order_itemmeta linesku
  ON linesku.order_item_id = oi.order_item_id AND linesku.meta_key = '_sku'
LEFT JOIN wp_posts parent ON parent.ID = pid.meta_value
LEFT JOIN wp_postmeta psku
  ON psku.post_id = pid.meta_value AND psku.meta_key = '_sku'
LEFT JOIN wp_postmeta vsku
  ON vsku.post_id = vid.meta_value AND vsku.meta_key = '_sku' AND IFNULL(vid.meta_value, '0') <> '0'
WHERE oi.order_item_type = 'line_item'
  AND p.post_status IN ('wc-completed', 'wc-processing')
"""

headers = [
    "order_id",
    "order_date",
    "status",
    "item_name",
    "parent_name",
    "sku",
    "qty",
    "line_total",
    "product_id",
    "variation_id",
]

with conn.cursor() as cur:
    cur.execute(sql)
    rows = cur.fetchall()

with out_path.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, delimiter="\t", lineterminator="\n")
    w.writerow(headers)
    for row in rows:
        w.writerow(["" if v is None else v for v in row])

print(f"wrote {out_path} lines={len(rows)}")
conn.close()
