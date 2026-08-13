#!/usr/bin/env python3
"""Read-only Woo product/variant dump from local MySQL (DigitalOcean WP)."""
import csv
import re
from collections import Counter, defaultdict
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

out = Path("/tmp/woo_compare")
out.mkdir(exist_ok=True)

with conn.cursor() as cur:
    cur.execute(
        """
        SELECT p.ID, p.post_name, p.post_title, p.post_status, p.post_type,
               CHAR_LENGTH(IFNULL(p.post_content,'')), CHAR_LENGTH(IFNULL(p.post_excerpt,''))
        FROM wp_posts p
        WHERE p.post_type='product'
          AND p.post_status IN ('publish','draft','private','pending')
        ORDER BY p.post_name
        """
    )
    prows = cur.fetchall()
    print("products", len(prows))

    cur.execute(
        """
        SELECT tr.object_id, t.slug
        FROM wp_term_relationships tr
        JOIN wp_term_taxonomy tt
          ON tt.term_taxonomy_id=tr.term_taxonomy_id AND tt.taxonomy='product_type'
        JOIN wp_terms t ON t.term_id=tt.term_id
        """
    )
    types = {str(r[0]): r[1] for r in cur.fetchall()}

    cur.execute(
        """
        SELECT post_id, meta_key, meta_value
        FROM wp_postmeta
        WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type='product')
          AND (
            meta_key IN (
              '_sku','_tax_class','_product_image_gallery','_thumbnail_id','_upsell_ids','_crosssell_ids',
              '_hsn_sac_code','_hsn_code','hsn_code','hsn',
              'product_video','_product_video','youtube_video','video_url','youtube_url',
              'related_articles','related_article_slugs','pair_with','pairing_products',
              '_price','_regular_price','_sale_price'
            )
            OR meta_key LIKE '%shipping%'
            OR meta_key LIKE '%accordion%'
            OR meta_key LIKE '%video%'
            OR meta_key LIKE '%youtube%'
            OR meta_key LIKE '%hsn%'
            OR meta_key LIKE 'pair%'
            OR meta_key LIKE '%article%'
          )
        """
    )
    all_meta = cur.fetchall()
    print("product meta rows", len(all_meta))

meta = defaultdict(dict)
meta_counts = defaultdict(lambda: defaultdict(int))
for pid, k, v in all_meta:
    pid = str(pid)
    v = "" if v is None else str(v)
    if k not in meta[pid] or (v and not meta[pid].get(k)):
        meta[pid][k] = v
    kl = k.lower()
    if "shipping" in kl:
        meta_counts[pid]["shipping"] += 1
    if "accordion" in kl or kl.startswith("faq"):
        meta_counts[pid]["accordion"] += 1
    if "video" in kl or "youtube" in kl:
        meta_counts[pid]["video"] += 1
    if "hsn" in kl:
        meta_counts[pid]["hsn"] += 1
    if "article" in kl:
        meta_counts[pid]["article"] += 1
    if kl.startswith("pair") or k in ("_upsell_ids", "_crosssell_ids"):
        meta_counts[pid]["pair"] += 1

with conn.cursor() as cur:
    cur.execute(
        """
        SELECT p.ID, p.post_parent, p.post_name, p.post_title, p.post_status
        FROM wp_posts p
        WHERE p.post_type='product_variation'
          AND p.post_status IN ('publish','private')
        ORDER BY p.post_parent, p.ID
        """
    )
    vrows = cur.fetchall()
    print("variations", len(vrows))

    cur.execute(
        """
        SELECT post_id, meta_key, meta_value
        FROM wp_postmeta
        WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type='product_variation')
          AND (
            meta_key IN (
              '_sku','_thumbnail_id','_regular_price','_sale_price','_price',
              'video_url','_variation_video','youtube_url'
            )
            OR meta_key LIKE 'attribute_%'
            OR meta_key LIKE '%video%'
            OR meta_key LIKE '%youtube%'
          )
        """
    )
    vmeta_rows = cur.fetchall()
    print("variation meta rows", len(vmeta_rows))

vmeta = defaultdict(dict)
for pid, k, v in vmeta_rows:
    pid = str(pid)
    v = "" if v is None else str(v)
    if k.startswith("attribute_"):
        vmeta[pid].setdefault("_attrs", {})[k] = v
    else:
        vmeta[pid][k] = v


def pick_hsn(m):
    for k in ("_hsn_sac_code", "_hsn_code", "hsn_code", "hsn"):
        if m.get(k):
            return m[k]
    for k, v in m.items():
        if "hsn" in k.lower() and v:
            return v
    return ""


def pick_video(m):
    for k in ("product_video", "_product_video", "youtube_video", "video_url", "youtube_url"):
        if m.get(k):
            return m[k]
    for k, v in m.items():
        if ("video" in k.lower() or "youtube" in k.lower()) and v and len(v) > 3:
            return v
    return ""


with (out / "do_products.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(
        [
            "id",
            "slug",
            "name",
            "status",
            "product_type",
            "sku",
            "hsn",
            "tax_class",
            "desc_len",
            "short_len",
            "video",
            "thumb_id",
            "gallery",
            "upsell",
            "crosssell",
            "shipping_meta_count",
            "accordion_meta_count",
            "video_meta_count",
            "article_meta_count",
            "pair_meta_count",
            "regular_price",
            "sale_price",
        ]
    )
    for r in prows:
        pid, slug, title, status, _ptype, dlen, slen = r
        pid_s = str(pid)
        m = meta.get(pid_s, {})
        mc = meta_counts.get(pid_s, {})
        w.writerow(
            [
                pid,
                slug,
                title,
                status,
                types.get(pid_s, ""),
            m.get("_sku", ""),
            pick_hsn(m),
            m.get("_tax_class", ""),
            dlen,
            slen,
            pick_video(m),
            m.get("_thumbnail_id", ""),
            m.get("_product_image_gallery", ""),
                m.get("_upsell_ids", ""),
                m.get("_crosssell_ids", ""),
                mc.get("shipping", 0),
                mc.get("accordion", 0),
                mc.get("video", 0),
                mc.get("article", 0),
                mc.get("pair", 0),
                m.get("_regular_price", ""),
                m.get("_sale_price", ""),
            ]
        )

parent_slug = {str(r[0]): r[1] for r in prows}
with (out / "do_variants.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(
        [
            "id",
            "parent_id",
            "parent_slug",
            "sku",
            "status",
            "title",
            "thumb_id",
            "video",
            "attrs",
            "regular_price",
            "sale_price",
        ]
    )
    for r in vrows:
        vid, parent, slug, title, status = r
        m = vmeta.get(str(vid), {})
        attrs = ";".join(f"{k}={v}" for k, v in sorted((m.get("_attrs") or {}).items()))
        video = m.get("video_url") or m.get("_variation_video") or m.get("youtube_url") or ""
        if not video:
            for k, v in m.items():
                if ("video" in k.lower() or "youtube" in k.lower()) and v:
                    video = v
                    break
        w.writerow(
            [
                vid,
                parent,
                parent_slug.get(str(parent), ""),
                m.get("_sku", ""),
                status,
                title,
                m.get("_thumbnail_id", ""),
                video,
                attrs,
                m.get("_regular_price", ""),
                m.get("_sale_price", ""),
            ]
        )

print("product status", Counter(r[3] for r in prows))
print("publish products", sum(1 for r in prows if r[3] == "publish"))

with conn.cursor() as cur:
    cur.execute(
        """
        SELECT p.ID, p.guid, pm.meta_value
        FROM wp_posts p
        LEFT JOIN wp_postmeta pm
          ON pm.post_id = p.ID AND pm.meta_key = '_wp_attached_file'
        WHERE p.post_type = 'attachment'
        ORDER BY p.ID
        """
    )
    att_rows = cur.fetchall()
    print("attachments", len(att_rows))

with (out / "do_attachments.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "guid", "attached_file", "url"])
    for aid, guid, attached in att_rows:
        attached = attached or ""
        guid = guid or ""
        url = ""
        if attached:
            url = f"https://sarveda.com/wp-content/uploads/{attached.lstrip('/')}"
        elif guid.startswith("http"):
            url = guid
        w.writerow([aid, guid, attached, url])

conn.close()
print("wrote", out)
