/**
 * Apply user decisions for remaining Pending rows (Aug 13):
 * - Move CB-AD-BM* to product "Copper Bottle - Blue Tranquillity/Meditation"
 * - ME-CZ-C-RP variant label: Rose -> Rouge Pink
 *
 * CB-CDG-V left unchanged (Curved Diamond Groove — different sheet product).
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-pending-copper-zafu.ts
 *   npx tsx scripts/fix-pending-copper-zafu.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient, ProductStatus, ProductType } from "@prisma/client";

import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKUP_DIR = path.join(REPO_ROOT, "data/compare/live-pending-copper-zafu-backups");

const BLUE_PRODUCT_NAME = "Copper Bottle - Blue Tranquillity/Meditation";
const BLUE_PRODUCT_SLUG = "copper-bottle-blue-tranquillity-meditation";
const BLUE_SKUS = ["CB-AD-BM", "CB-AD-BM-B", "CB-AD-BM-.5", "CB-AD-BM-.5-B"];
const ZAFU_SKU = "ME-CZ-C-RP";
const ZAFU_LABEL = "Rouge Pink";

const prisma = new PrismaClient();

async function findVariantBySku(sku: string) {
  return prisma.productVariant.findFirst({
    where: { sku: { equals: sku, mode: "insensitive" } },
    include: {
      productRel: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
      attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
    },
  });
}

function variantLabel(variant: {
  attributeValues: Array<{ attributeValue: { value: string } }>;
}) {
  return variant.attributeValues.map((a) => a.attributeValue.value).join(" / ");
}

async function ensureBlueTranquillityProduct(donorProductId: string) {
  const existing = await prisma.product.findFirst({
    where: { slug: BLUE_PRODUCT_SLUG, deletedAt: null },
  });
  if (existing) return existing;

  const donor = await prisma.product.findUnique({
    where: { id: donorProductId },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });
  if (!donor) throw new Error(`Donor product ${donorProductId} not found`);

  if (!APPLY) {
    return { id: "(new)", slug: BLUE_PRODUCT_SLUG, name: BLUE_PRODUCT_NAME } as const;
  }

  return prisma.product.create({
    data: {
      slug: BLUE_PRODUCT_SLUG,
      name: BLUE_PRODUCT_NAME,
      status: ProductStatus.ACTIVE,
      productType: ProductType.VARIABLE,
      taxClass: donor.taxClass,
      shortDescription: donor.shortDescription,
      description: donor.description,
      catalogHidden: false,
      images: donor.images[0]
        ? {
            create: {
              url: donor.images[0].url,
              altText: BLUE_PRODUCT_NAME,
              position: 0,
              isPrimary: true,
            },
          }
        : undefined,
    },
  });
}

async function hideEmptyProducts(log: string[]) {
  const empty = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: ProductStatus.ACTIVE,
      catalogHidden: false,
      variants: { none: { status: "ACTIVE" } },
    },
    select: { id: true, slug: true },
  });
  for (const p of empty) {
    log.push(`HIDE empty product ${p.slug}`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: { catalogHidden: true, status: ProductStatus.ARCHIVED },
      });
    }
  }
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log: string[] = [];

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);

  const blueVariants = [];
  for (const sku of BLUE_SKUS) {
    const v = await findVariantBySku(sku);
    if (!v) {
      log.push(`MISS variant ${sku}`);
      continue;
    }
    blueVariants.push(v);
  }

  if (blueVariants.length) {
    const target = await ensureBlueTranquillityProduct(blueVariants[0]!.productId);
    for (const v of blueVariants) {
      const from = `${v.productRel.name} (${v.productRel.slug})`;
      log.push(`MOVE ${v.sku} from ${from} -> ${BLUE_PRODUCT_NAME}`);
      if (APPLY && typeof target.id === "string" && target.id !== "(new)") {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { productId: target.id, isDefault: false },
        });
      }
    }
    if (APPLY) {
      const first = await prisma.productVariant.findFirst({
        where: { productId: target.id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      if (first) {
        await prisma.productVariant.updateMany({
          where: { productId: target.id },
          data: { isDefault: false },
        });
        await prisma.productVariant.update({
          where: { id: first.id },
          data: { isDefault: true },
        });
      }
    }
  }

  const zafu = await findVariantBySku(ZAFU_SKU);
  if (!zafu) {
    log.push(`MISS variant ${ZAFU_SKU}`);
  } else {
    const before = variantLabel(zafu);
    log.push(`RENAME variant ${ZAFU_SKU}: ${before || "(blank)"} -> ${ZAFU_LABEL}`);
    if (APPLY) {
      const attrs =
        zafu.attributeValues.length === 1
          ? [
              {
                name: zafu.attributeValues[0]!.attributeValue.attribute.name,
                slug: zafu.attributeValues[0]!.attributeValue.attribute.slug,
                value: ZAFU_LABEL,
              },
            ]
          : [{ name: "Option", slug: "option", value: ZAFU_LABEL }];
      await syncVariantAttributes(zafu.id, attrs);
    }
  }

  await hideEmptyProducts(log);

  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-log.txt`), log.join("\n") + "\n");
  console.log(log.join("\n"));
  console.log(`\n${log.length} actions logged`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
