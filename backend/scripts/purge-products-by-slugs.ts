/**
 * Permanently delete specific catalog products by slug.
 * Removes order line items referencing their variants (does not delete Woo orders).
 *
 * Usage:
 *   npx tsx scripts/purge-products-by-slugs.ts slug-one slug-two
 *   npx tsx scripts/purge-products-by-slugs.ts --apply slug-one slug-two
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const SLUGS = process.argv.filter((a) => a !== "--apply");
const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKUP_DIR = path.join(REPO_ROOT, "data/compare/live-purge-products-by-slugs-backups");

const prisma = new PrismaClient();

async function purgeProduct(productId: string) {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true, sku: true },
  });
  const variantIds = variants.map((v) => v.id);

  if (variantIds.length) {
    await prisma.orderItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantShippingRate.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productImage.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.marketplaceListing.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productXlStagingPrice.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.stockNotification.deleteMany({ where: { variantId: { in: variantIds } } });
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
  await prisma.product.delete({ where: { id: productId } });
}

async function main() {
  if (!SLUGS.length) {
    console.error("Pass one or more product slugs.");
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const products = await prisma.product.findMany({
    where: { slug: { in: SLUGS } },
    include: { variants: { select: { id: true, sku: true, status: true } } },
    orderBy: { slug: "asc" },
  });

  const foundSlugs = new Set(products.map((p) => p.slug));
  const missing = SLUGS.filter((s) => !foundSlugs.has(s));

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`Requested: ${SLUGS.length} slugs`);
  console.log(`Found: ${products.length}`);
  if (missing.length) console.log(`Missing: ${missing.join(", ")}`);

  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const orderItems = variantIds.length
    ? await prisma.orderItem.findMany({
        where: { variantId: { in: variantIds } },
        include: { order: { select: { orderNumber: true } } },
      })
    : [];

  for (const p of products) {
    const skus = p.variants.map((v) => v.sku).join(", ") || "(no variants)";
    console.log(`  ${p.status} ${p.slug} — ${p.name} [${skus}]`);
  }
  if (orderItems.length) {
    console.log(`Order line items to remove: ${orderItems.length}`);
    const nums = [...new Set(orderItems.map((i) => i.order.orderNumber))];
    console.log(`  Orders affected: ${nums.slice(0, 20).join(", ")}${nums.length > 20 ? ` (+${nums.length - 20} more)` : ""}`);
  }

  fs.writeFileSync(
    path.join(BACKUP_DIR, `${stamp}-plan.json`),
    JSON.stringify({ slugs: SLUGS, products, orderItemCount: orderItems.length }, null, 2)
  );

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }

  for (const p of products) {
    console.log(`Purging ${p.slug}...`);
    await purgeProduct(p.id);
  }

  const storefront = await prisma.product.count({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      catalogHidden: false,
      NOT: {
        OR: [{ slug: { startsWith: "course-checkout-" } }, { slug: { startsWith: "event-checkout-" } }],
      },
      variants: { some: { status: "ACTIVE" } },
    },
  });
  console.log(`\nDone. Storefront products: ${storefront}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
