/**
 * Products-only cleanup:
 * - Permanently delete duplicate draft product bendo-shaker1
 * - Permanently delete 3 mistaken Shankh Plain stub products (reconcile artifacts)
 * - Align standard-shankh with live sarveda.com (shankh-conch / Shankh/Conch / MI-SK-S|M|L)
 *
 * Source of truth for live site: data/compare/do_variants.csv + woo_live_products.json
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-shankh-bendo-cleanup.ts
 *   npx tsx scripts/fix-shankh-bendo-cleanup.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKUP_DIR = path.join(REPO_ROOT, "data/compare/live-shankh-bendo-cleanup-backups");

const DELETE_PRODUCT_SLUGS = [
  "bendo-shaker1",
  "shankh-plain",
  "shankh-plain-mi-sk-me",
  "shankh-plain-mi-sk-sm",
];

const STANDARD_SHANKH_SLUG = "standard-shankh";
const LIVE_NAME = "Shankh/Conch";
const LIVE_SLUG = "shankh-conch";
const SKU_MAP: Array<{ from: string; to: string; label: string }> = [
  { from: "MI-SK-ST-S", to: "MI-SK-S", label: "Small" },
  { from: "MI-SK-ST-M", to: "MI-SK-M", label: "Medium" },
  { from: "MI-SK-ST-L", to: "MI-SK-L", label: "Large" },
];

const prisma = new PrismaClient();

async function variantHasBlockers(variantId: string) {
  const [orders, cart] = await Promise.all([
    prisma.orderItem.count({ where: { variantId } }),
    prisma.cartItem.count({ where: { variantId } }),
  ]);
  return orders + cart > 0;
}

async function purgeProduct(productId: string, slug: string, log: string[]) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: { select: { id: true, sku: true } },
    },
  });
  if (!product) {
    log.push(`SKIP purge ${slug} (not found)`);
    return;
  }

  const blocked: string[] = [];
  const deletable: string[] = [];
  for (const v of product.variants) {
    if (await variantHasBlockers(v.id)) blocked.push(v.sku);
    else deletable.push(v.id);
  }

  if (blocked.length) {
    log.push(
      `ARCHIVE ${slug} (${blocked.length} variant(s) kept — order history: ${blocked.join(", ")})`
    );
    if (APPLY) {
      await prisma.product.update({
        where: { id: productId },
        data: {
          deletedAt: new Date(),
          status: "ARCHIVED",
          catalogHidden: true,
        },
      });
    }
    return;
  }

  log.push(`PURGE product ${slug} (${product.variants.length} variants)`);
  if (!APPLY) return;

  const variantIds = product.variants.map((v) => v.id);
  if (variantIds.length) {
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantShippingRate.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productImage.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.marketplaceListing.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productXlStagingPrice.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }

  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.productCategory.deleteMany({ where: { productId } });
  await prisma.accordionItem.deleteMany({ where: { productId } });
  await prisma.productRelation.deleteMany({
    where: { OR: [{ fromProductId: productId }, { toProductId: productId }] },
  });
  await prisma.review.deleteMany({ where: { productId } });
  await prisma.wishlist.deleteMany({ where: { productId } });
  await prisma.stockNotification.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log: string[] = [];

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);

  for (const slug of DELETE_PRODUCT_SLUGS) {
    const p = await prisma.product.findFirst({ where: { slug } });
    if (!p) {
      log.push(`MISS delete target ${slug}`);
      continue;
    }
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${slug}.json`),
      JSON.stringify(p, null, 2)
    );
    await purgeProduct(p.id, slug, log);
  }

  const standard = await prisma.product.findFirst({
    where: { slug: { in: [STANDARD_SHANKH_SLUG, LIVE_SLUG] }, deletedAt: null },
    include: {
      variants: {
        include: { attributeValues: { include: { attributeValue: { include: { attribute: true } } } } },
      },
    },
  });
  if (!standard) {
    log.push(`MISS ${STANDARD_SHANKH_SLUG}`);
  } else {
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${STANDARD_SHANKH_SLUG}-before.json`),
      JSON.stringify(standard, null, 2)
    );

    const slugClash = await prisma.product.findFirst({
      where: { slug: LIVE_SLUG, deletedAt: null, NOT: { id: standard.id } },
    });
    if (slugClash) {
      log.push(`CONFLICT slug ${LIVE_SLUG} taken by ${slugClash.name}`);
    } else {
      log.push(`RENAME product ${standard.slug} -> ${LIVE_SLUG} | ${standard.name} -> ${LIVE_NAME}`);
      if (APPLY) {
        await prisma.product.update({
          where: { id: standard.id },
          data: { slug: LIVE_SLUG, name: LIVE_NAME },
        });
      }
    }

    for (const row of SKU_MAP) {
      const v = standard.variants.find((x) => x.sku.toUpperCase() === row.from.toUpperCase());
      if (!v) {
        log.push(`MISS variant ${row.from} on ${STANDARD_SHANKH_SLUG}`);
        continue;
      }
      const clash = await prisma.productVariant.findFirst({
        where: { sku: { equals: row.to, mode: "insensitive" }, NOT: { id: v.id } },
      });
      if (clash) {
        log.push(`CONFLICT SKU ${row.to} taken`);
        continue;
      }
      log.push(`RENAME SKU ${v.sku} -> ${row.to} (${row.label})`);
      if (APPLY) {
        await prisma.productVariant.update({ where: { id: v.id }, data: { sku: row.to } });
      }
    }
  }

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
