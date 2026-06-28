#!/usr/bin/env python3
"""
Archive standalone Woo duplicate products so parent variable products keep team SKUs.

Resolves the 20 standalone-vs-parent SKU conflicts from new_sku.xlsx apply.

Usage (on EC2 with DATABASE_URL in backend/.env):
  python3 backend/scripts/archive-standalone-sku-duplicates.py --dry-run
  python3 backend/scripts/archive-standalone-sku-duplicates.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Standalone duplicates → parent already holds team SKU (from first apply / Zoho)
STANDALONE_PRODUCT_NAMES = [
    "Curved Copper Bottles",
    "Curved Diamond Groove Copper Bottle",
    "Curved Hammered Copper Bottles",
    "Hammered Copper Bottle",
    "Happiness is Inside",
    "Pink & Positive",
    "Tattvamasi-I am Infinite",
    "Etched Gongs",
]

# Parent products that should retain team SKUs (verification only)
PARENT_PRODUCT_NAMES = [
    "Grooved, Hammered & Plain Copper Bottle",
    "Artistically Designed Copper Bottles",
    "Etched Plain/Wind Gong",
]

# Team SKUs from new_sku.xlsx on parent variants (for post-check)
EXPECTED_PARENT_SKUS = {
    "CB-CV-B",
    "CB-CV",
    "CB-CP-B",
    "CB-CP",
    "CB-CDG",
    "CB-CVDG",
    "CB-CVH",
    "CB-CVH-B",
    "CB-CPH",
    "CB-CPH-B",
    "CB-HW-B",
    "CB-HW",
    "CB-PNT-B",
    "CB-T-B",
    "CB-T",
    "MI-G-ET-7C-18",
    "MI-G-ET-7C-20",
    "MI-G-ET-7C-22",
    "MI-G-ET-7C-24",
    "MI-G-ET-7C-28",
}


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    env_path = ROOT / "backend" / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL not set")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--apply", action="store_true", help="Archive standalone products")
    args = parser.parse_args()
    apply = bool(args.apply)

    try:
        import psycopg2
    except ImportError:
        raise SystemExit("pip install psycopg2-binary")

    conn = psycopg2.connect(load_database_url(), connect_timeout=15)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT p.id, p.name, p.slug, p.status, p."deletedAt"
        FROM "Product" p
        WHERE p.name = ANY(%s)
        ORDER BY p.name
        """,
        (STANDALONE_PRODUCT_NAMES,),
    )
    standalone_rows = cur.fetchall()
    found_names = {r[1] for r in standalone_rows}
    missing = set(STANDALONE_PRODUCT_NAMES) - found_names
    if missing:
        print("WARNING: not found in DB:", ", ".join(sorted(missing)), file=sys.stderr)

    to_archive = [r for r in standalone_rows if r[4] is None]
    already = [r for r in standalone_rows if r[4] is not None]

    print(f"Standalone products found: {len(standalone_rows)}")
    print(f"  Already archived/deleted: {len(already)}")
    print(f"  To archive now: {len(to_archive)}")

    total_variants = 0
    for pid, name, slug, status, deleted_at in to_archive:
        cur.execute(
            'SELECT id, sku FROM "ProductVariant" WHERE "productId" = %s',
            (pid,),
        )
        variants = cur.fetchall()
        total_variants += len(variants)
        print(f"\n  {name} ({slug}) — {status} — {len(variants)} variant(s)")
        for vid, sku in variants[:3]:
            print(f"    {sku}")
        if len(variants) > 3:
            print(f"    … +{len(variants) - 3} more")

    print(f"\nTotal variants to deactivate: {total_variants}")

    if not apply:
        print("\nDry run — re-run with --apply to archive.")
        cur.close()
        conn.close()
        return

    conn.autocommit = False
    archived_products = 0
    archived_variants = 0
    try:
        for pid, name, slug, status, deleted_at in to_archive:
            cur.execute('SELECT id, sku FROM "ProductVariant" WHERE "productId" = %s', (pid,))
            for vid, sku in cur.fetchall():
                archived_sku = f"ARCHIVED-{str(vid)[:8]}-{sku}"[:120]
                cur.execute(
                    """
                    UPDATE "ProductVariant"
                    SET sku = %s, status = 'INACTIVE', "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (archived_sku, vid),
                )
                archived_variants += 1
            cur.execute(
                """
                UPDATE "Product"
                SET "deletedAt" = NOW(), status = 'ARCHIVED', "updatedAt" = NOW()
                WHERE id = %s
                """,
                (pid,),
            )
            archived_products += 1
            print(f"Archived: {name}")

        conn.commit()
    except Exception:
        conn.rollback()
        raise

    print(f"\nApplied: {archived_products} products, {archived_variants} variants archived.")

    # Verify parent SKUs
    print("\n--- Parent product SKU check ---")
    cur.execute(
        """
        SELECT p.name, pv.sku
        FROM "Product" p
        JOIN "ProductVariant" pv ON pv."productId" = p.id
        WHERE p.name = ANY(%s)
          AND p."deletedAt" IS NULL
          AND pv.status = 'ACTIVE'
          AND pv.sku = ANY(%s)
        ORDER BY pv.sku
        """,
        (PARENT_PRODUCT_NAMES, list(EXPECTED_PARENT_SKUS)),
    )
    found_skus = {row[1] for row in cur.fetchall()}
    for row in cur.fetchall():
        pass
    cur.execute(
        """
        SELECT p.name, pv.sku
        FROM "Product" p
        JOIN "ProductVariant" pv ON pv."productId" = p.id
        WHERE p.name = ANY(%s)
          AND p."deletedAt" IS NULL
          AND pv.status = 'ACTIVE'
          AND pv.sku = ANY(%s)
        ORDER BY pv.sku
        """,
        (PARENT_PRODUCT_NAMES, list(EXPECTED_PARENT_SKUS)),
    )
    rows = cur.fetchall()
    found_skus = {r[1] for r in rows}
    for name, sku in rows:
        print(f"  OK {sku} on {name}")
    missing_skus = EXPECTED_PARENT_SKUS - found_skus
    if missing_skus:
        print(f"\nMissing on parents ({len(missing_skus)}):", ", ".join(sorted(missing_skus)))

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
