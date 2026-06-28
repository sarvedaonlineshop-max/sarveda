#!/usr/bin/env python3
"""
Apply team SKUs for the 11 misaligned Excel row pairs (848 vs 863 gap).

Usage on EC2:
  python3 backend/scripts/apply-misaligned-skus.py --dry-run
  python3 backend/scripts/apply-misaligned-skus.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PRODUCT_YOGA = "8e57d530-25e7-46a0-abb7-981ef43f75a7"
TEAL_MODERATE = "9fae886b-e377-4f7e-bd9a-df2b45ae81ee"
YELLOW_MODERATE = "ee83b231-727b-4a14-a365-dce3b5393beb"

COLOR_GREEN = "f2322bf2-09e7-4def-8872-fca8f36a20a4"
COLOR_BLUE = "a265036e-a9ff-41ed-9582-06899a4a1aef"
GRIP_MODERATE = "21ef822a-bff5-4af5-bddb-e2f23573bab3"

COCONUT_PAINTED = "e7ed3f61-3ce2-48ee-acaa-06cd3fc7ebbe"
TYPE_PAINTED = "91581b19-423f-4c67-8166-c6e23822fcd5"
TYPE_DOT_PAINTED = "9de3f1e2-571a-4513-952b-951477630e6e"

MORCHANG = [
    ("358c8533-abfb-4985-b74e-bb4d4ba5713b", "MI-CM-B"),
    ("ac6ebdd1-130d-480e-8872-3fd473a82b52", "MI-CM-M"),
    ("6b923a99-7380-4084-9e7a-d45c03df4266", "MI-CM-S"),
    ("a723ec67-d6d7-4bee-ad7f-b7993723e1a1", "MI-CM-ST"),
]

SKU_UPDATES = [
    ("090de018-8ed9-4458-bb54-9918aa32d4f3", "MI-CB-CL-8-14-SET", "Crystal Bowls set"),
    ("f1e9ee9d-8f90-400d-967a-6a2fd9824063", "MI-OD-DC-40", "Ocean Dream Catcher 40"),
    ("c92812da-be13-4e68-944e-41b6dafe4c9f", "MI-OD-FL-40", "Ocean Flower 40"),
]


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    env_path = ROOT / "backend" / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL not set")


def archived_sku(vid: str, sku: str) -> str:
    return f"REMOVED-{str(vid)[:8]}-{sku}"[:120]


def ensure_sku_free(cur, sku: str, exclude_id: str | None = None) -> bool:
    if exclude_id:
        cur.execute(
            'SELECT id FROM "ProductVariant" WHERE sku = %s AND id != %s LIMIT 1',
            (sku, exclude_id),
        )
    else:
        cur.execute('SELECT id FROM "ProductVariant" WHERE sku = %s LIMIT 1', (sku,))
    return cur.fetchone() is None


def clone_variant_from_template(
    cur,
    *,
    product_id: str,
    template_id: str,
    new_id: str,
    sku: str,
    color_value_id: str,
) -> None:
    cur.execute(
        """
        SELECT "mrpInPaise", "saleInPaise", "mrpUsdCents", "saleUsdCents",
               "mrpGbpPence", "saleGbpPence", "weightGrams"
        FROM "ProductVariant" WHERE id = %s
        """,
        (template_id,),
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"Template variant missing: {template_id}")

    cur.execute(
        """
        INSERT INTO "ProductVariant"
          (id, "productId", sku, "mrpInPaise", "saleInPaise", "mrpUsdCents", "saleUsdCents",
           "mrpGbpPence", "saleGbpPence", "weightGrams", "isDefault", status, "createdAt", "updatedAt")
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, false, 'ACTIVE', NOW(), NOW())
        """,
        (new_id, product_id, sku, *row),
    )

    cur.execute(
        """
        INSERT INTO "Inventory" (id, "variantId", "onHand", reserved, "lowStockThreshold")
        SELECT gen_random_uuid(), %s, COALESCE(i."onHand", 0), 0, 5
        FROM "Inventory" i WHERE i."variantId" = %s
        """,
        (new_id, template_id),
    )

    cur.execute(
        """
        INSERT INTO "VariantAttributeValue" ("variantId", "attributeValueId")
        VALUES (%s, %s), (%s, %s)
        """,
        (new_id, color_value_id, new_id, GRIP_MODERATE),
    )

    cur.execute(
        """
        INSERT INTO "VariantShippingRate"
          (id, "variantId", country, "standardPerProduct", "standardAdditional",
           "expeditedPerProduct", "expeditedAdditional", "codPerProduct", "codAdditional", "estimatedDays")
        SELECT gen_random_uuid(), %s, country, "standardPerProduct", "standardAdditional",
               "expeditedPerProduct", "expeditedAdditional", "codPerProduct", "codAdditional", "estimatedDays"
        FROM "VariantShippingRate" WHERE "variantId" = %s
        """,
        (new_id, template_id),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    apply = bool(args.apply)

    try:
        import psycopg2
    except ImportError:
        raise SystemExit("pip install psycopg2-binary")

    plan = [
        "Deactivate Moderate/Teal + Moderate/Yellow on 7 Chakras Yoga Mats",
        "Create Moderate/Green Yo-M-C-MG-G-27 + Moderate/Blue Yo-M-C-MG-B-27",
        "Classic Morchang Set: 4 SKU updates",
        "Coconut Maracas: Painted → Dot Painted + MI-CM-DP",
        "Crystal Bowls 8-14 set + Ocean 40cm x2 SKU updates",
    ]
    print("Plan:")
    for p in plan:
        print(f"  - {p}")

    if not apply:
        print("\nDry run — re-run with --apply")
        return

    conn = psycopg2.connect(load_database_url(), connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 1–2 Yoga mats
        for vid, label in [(TEAL_MODERATE, "Teal/Moderate"), (YELLOW_MODERATE, "Yellow/Moderate")]:
            cur.execute('SELECT sku FROM "ProductVariant" WHERE id = %s', (vid,))
            row = cur.fetchone()
            if not row:
                print(f"SKIP missing {label}", file=sys.stderr)
                continue
            sku = row[0]
            cur.execute(
                """
                UPDATE "ProductVariant"
                SET sku = %s, status = 'INACTIVE', "updatedAt" = NOW()
                WHERE id = %s AND status = 'ACTIVE'
                """,
                (archived_sku(vid, sku), vid),
            )
            print(f"Deactivated {label}")

        for sku, color_id, label in [
            ("Yo-M-C-MG-G-27", COLOR_GREEN, "Green/Moderate"),
            ("Yo-M-C-MG-B-27", COLOR_BLUE, "Blue/Moderate"),
        ]:
            if not ensure_sku_free(cur, sku):
                raise RuntimeError(f"SKU already taken: {sku}")
            new_id = str(uuid.uuid4())
            clone_variant_from_template(
                cur,
                product_id=PRODUCT_YOGA,
                template_id=TEAL_MODERATE,
                new_id=new_id,
                sku=sku,
                color_value_id=color_id,
            )
            print(f"Created {label} → {sku}")

        # 3 Morchang
        for vid, sku in MORCHANG:
            if not ensure_sku_free(cur, sku, vid):
                raise RuntimeError(f"SKU already taken: {sku}")
            cur.execute(
                """
                UPDATE "ProductVariant"
                SET sku = %s, "updatedAt" = NOW()
                WHERE id = %s AND status = 'ACTIVE'
                """,
                (sku, vid),
            )
            print(f"Morchang {vid[:8]} → {sku}")

        # 4 Coconut rename + SKU
        if not ensure_sku_free(cur, "MI-CM-DP", COCONUT_PAINTED):
            raise RuntimeError("SKU MI-CM-DP already taken")
        cur.execute(
            """
            UPDATE "VariantAttributeValue"
            SET "attributeValueId" = %s
            WHERE "variantId" = %s AND "attributeValueId" = %s
            """,
            (TYPE_DOT_PAINTED, COCONUT_PAINTED, TYPE_PAINTED),
        )
        cur.execute(
            """
            UPDATE "ProductVariant"
            SET sku = %s, "updatedAt" = NOW()
            WHERE id = %s AND status = 'ACTIVE'
            """,
            ("MI-CM-DP", COCONUT_PAINTED),
        )
        print("Coconut: Painted → Dot Painted, MI-CM-DP")

        # 5–7 Straight SKU updates
        for vid, sku, label in SKU_UPDATES:
            if not ensure_sku_free(cur, sku, vid):
                raise RuntimeError(f"SKU already taken: {sku}")
            cur.execute(
                """
                UPDATE "ProductVariant"
                SET sku = %s, "updatedAt" = NOW()
                WHERE id = %s AND status = 'ACTIVE'
                """,
                (sku, vid),
            )
            print(f"{label} → {sku}")

        conn.commit()
        print("\nApplied all misaligned SKU fixes.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
