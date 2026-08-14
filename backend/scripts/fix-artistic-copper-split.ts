/**
 * Artistic copper bottles — ensure 5 separate products (not one grouped PDP).
 * Matches live sarveda.com split: Size + Cleaning Brush only (no "Types of Bottles").
 *
 * Fixes:
 * - Pricing from DO printed-copper / per-design products
 * - Variant attrs: size + cleaning-brush (With Brush / Without Brush)
 * - Remove types-of-bottles / option1 / option2 / coconut-fiber-brush on these SKUs
 * - Rename sunshine-within-me-artistic-design -> copper-bottle-orange-light
 * - Set wooCommerceId where DO has a dedicated product
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-artistic-copper-split.ts
 *   npx tsx scripts/fix-artistic-copper-split.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-artistic-copper-backups");
const prisma = new PrismaClient();

type Attr = { name: string; slug: string; value: string };

type SkuFix = {
  mrpInPaise: number;
  saleInPaise: number;
  attrs: Attr[];
};

type ProductFix = {
  slug: string;
  name: string;
  wooCommerceId?: number;
  /** If set, rename existing product at fromSlug to slug/name */
  fromSlug?: string;
  variantAxisOrder: string[];
  skus: Record<string, SkuFix>;
};

/** DO live prices (INR paise) — Aug 2026 printed-copper / per-design products */
const PRODUCTS: ProductFix[] = [
  {
    slug: "copper-bottle-blue-tranquillity-meditation",
    name: "Copper Bottle - Blue Tranquillity/Meditation",
    variantAxisOrder: ["size", "cleaning-brush"],
    skus: {
      "CB-AD-BM": {
        mrpInPaise: 161900,
        saleInPaise: 124500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-BM-B": {
        mrpInPaise: 174900,
        saleInPaise: 134500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      },
      "CB-AD-BM-.5": {
        mrpInPaise: 115700,
        saleInPaise: 89000,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-BM-.5-B": {
        mrpInPaise: 128100,
        saleInPaise: 98500,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      }
    }
  },
  {
    slug: "copper-bottle-with-brush-tattvamasi",
    name: "Tattvamasi-I am Infinite",
    wooCommerceId: 5466,
    variantAxisOrder: ["size", "cleaning-brush"],
    skus: {
      "CB-AD-TM": {
        mrpInPaise: 161900,
        saleInPaise: 124500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-TM-B": {
        mrpInPaise: 174900,
        saleInPaise: 134500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      },
      "CB-AD-TM-.5": {
        mrpInPaise: 115700,
        saleInPaise: 89000,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-TM-B-.5": {
        mrpInPaise: 128100,
        saleInPaise: 98500,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      }
    }
  },
  {
    slug: "copper-bottle-with-brush-true-happiness-lies-within",
    name: "Happiness is Inside",
    wooCommerceId: 5459,
    variantAxisOrder: ["size", "cleaning-brush"],
    skus: {
      "CB-AD-HI": {
        mrpInPaise: 161900,
        saleInPaise: 124500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-HI-B": {
        mrpInPaise: 174900,
        saleInPaise: 134500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      },
      "CB-AD-HI-.5": {
        mrpInPaise: 115700,
        saleInPaise: 89000,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-HI-.5-B": {
        mrpInPaise: 128100,
        saleInPaise: 98500,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      }
    }
  },
  {
    slug: "copper-bottle-orange-light",
    name: "Sunshine within Me",
    wooCommerceId: 5669,
    fromSlug: "sunshine-within-me-artistic-design",
    variantAxisOrder: ["size", "cleaning-brush"],
    skus: {
      "CB-AD-SS": {
        mrpInPaise: 161900,
        saleInPaise: 124500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-SS-B": {
        mrpInPaise: 174900,
        saleInPaise: 134500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      },
      "CB-AD-SS-.5": {
        mrpInPaise: 109900,
        saleInPaise: 84500,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-SS-.5-B": {
        mrpInPaise: 128100,
        saleInPaise: 98500,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      }
    }
  },
  {
    slug: "copper-bottle-pink-noble-toughts",
    name: "Pink & Positive",
    wooCommerceId: 5663,
    variantAxisOrder: ["size", "cleaning-brush"],
    skus: {
      "CB-AD-PP": {
        mrpInPaise: 161900,
        saleInPaise: 124500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-PP-B": {
        mrpInPaise: 174900,
        saleInPaise: 134500,
        attrs: [
          { name: "Size", slug: "size", value: "1L" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      },
      "CB-AD-PP-.5": {
        mrpInPaise: 115700,
        saleInPaise: 89000,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "Without Brush" }
        ]
      },
      "CB-AD-PP-.5-B": {
        mrpInPaise: 128100,
        saleInPaise: 98500,
        attrs: [
          { name: "Size", slug: "size", value: "500ml" },
          { name: "Cleaning Brush", slug: "cleaning-brush", value: "With Brush" }
        ]
      }
    }
  }
];

async function resolveProduct(fix: ProductFix) {
  let product = await prisma.product.findFirst({
    where: { slug: fix.slug, deletedAt: null }
  });
  if (product) return product;

  if (fix.fromSlug) {
    product = await prisma.product.findFirst({
      where: { slug: fix.fromSlug, deletedAt: null }
    });
    if (product) return product;
  }

  const skus = Object.keys(fix.skus);
  for (const sku of skus) {
    const v = await prisma.productVariant.findFirst({
      where: { sku: { equals: sku, mode: "insensitive" } },
      include: { productRel: true }
    });
    if (v?.productRel) return v.productRel;
  }
  return null;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log: string[] = [];
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);

  for (const fix of PRODUCTS) {
    const product = await resolveProduct(fix);
    if (!product) {
      log.push(`MISSING product for ${fix.slug}`);
      console.log(`MISSING ${fix.slug}`);
      continue;
    }

    const slugChange = product.slug !== fix.slug;
    const nameChange = product.name !== fix.name;
    if (slugChange || nameChange || fix.wooCommerceId) {
      log.push(
        `PRODUCT ${product.slug} -> slug=${fix.slug} name=${fix.name}` +
          (fix.wooCommerceId ? ` wooId=${fix.wooCommerceId}` : "")
      );
      console.log(log[log.length - 1]);
      if (APPLY) {
        const conflict = await prisma.product.findFirst({
          where: { slug: fix.slug, deletedAt: null, NOT: { id: product.id } }
        });
        if (conflict) {
          throw new Error(`Slug conflict: ${fix.slug} already used by ${conflict.id}`);
        }
        await prisma.product.update({
          where: { id: product.id },
          data: {
            slug: fix.slug,
            name: fix.name,
            wooCommerceId: fix.wooCommerceId ?? product.wooCommerceId,
            variantAxisOrder: fix.variantAxisOrder,
            catalogHidden: false,
            status: "ACTIVE"
          }
        });
      }
    } else if (APPLY) {
      await prisma.product.update({
        where: { id: product.id },
        data: { variantAxisOrder: fix.variantAxisOrder }
      });
    }

    for (const [sku, spec] of Object.entries(fix.skus)) {
      const variant = await prisma.productVariant.findFirst({
        where: { sku: { equals: sku, mode: "insensitive" } },
        include: { productRel: { select: { slug: true } } }
      });
      if (!variant) {
        log.push(`  MISS variant ${sku}`);
        console.log(`  MISS ${sku}`);
        continue;
      }

      if (variant.productRel.slug !== fix.slug && variant.productId !== product.id) {
        log.push(`  MOVE ${sku} from ${variant.productRel.slug} -> ${fix.slug}`);
        console.log(`  MOVE ${sku}`);
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { productId: product.id }
          });
        }
      }

      const priceChange =
        variant.mrpInPaise !== spec.mrpInPaise || variant.saleInPaise !== spec.saleInPaise;
      if (priceChange) {
        log.push(
          `  PRICE ${sku}: ₹${variant.saleInPaise / 100} -> ₹${spec.saleInPaise / 100} (mrp ${spec.mrpInPaise / 100})`
        );
        console.log(`  PRICE ${sku}`);
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { mrpInPaise: spec.mrpInPaise, saleInPaise: spec.saleInPaise }
          });
        }
      }

      log.push(`  ATTR ${sku}: ${spec.attrs.map((a) => `${a.slug}=${a.value}`).join(", ")}`);
      console.log(`  ATTR ${sku}`);
      if (APPLY) {
        await syncVariantAttributes(variant.id, spec.attrs);
      }
    }
  }

  // Archive grouped umbrella if any variants remain
  const grouped = await prisma.product.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug: "artistically-designed-copper-bottles" },
        { slug: "printed-copper-water-bottles" },
        { name: { contains: "Artistically Designed Copper", mode: "insensitive" } }
      ]
    },
    include: { variants: { where: { status: "ACTIVE" } } }
  });
  if (grouped) {
    log.push(
      `ARCHIVE grouped ${grouped.slug} (${grouped.variants.length} active variants left)`
    );
    console.log(log[log.length - 1]);
    if (APPLY) {
      await prisma.product.update({
        where: { id: grouped.id },
        data: { catalogHidden: true, status: "ARCHIVED" }
      });
    }
  }

  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-log.txt`), log.join("\n") + "\n");
  console.log(`\n${log.length} actions logged`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
