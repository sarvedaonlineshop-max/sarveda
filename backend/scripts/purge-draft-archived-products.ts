/**
 * Permanently delete DRAFT + ARCHIVED catalog products (products only — not
 * course/event checkout unless they are DRAFT/ARCHIVED).
 *
 * Deletes orders that reference any variant on those products (staging SRV-* tests).
 *
 * Usage (Lightsail):
 *   npx tsx scripts/purge-draft-archived-products.ts
 *   npx tsx scripts/purge-draft-archived-products.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKUP_DIR = path.join(REPO_ROOT, "data/compare/live-purge-draft-archived-backups");

const prisma = new PrismaClient();

async function deleteOrders(orderIds: string[]) {
  if (!orderIds.length) return;
  const ids = [...new Set(orderIds)];

  const requests = await prisma.orderServiceRequest.findMany({
    where: { orderId: { in: ids } },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);
  if (requestIds.length) {
    await prisma.orderServiceRequestPhoto.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.orderServiceRequestItem.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.orderServiceRequest.deleteMany({ where: { id: { in: requestIds } } });
  }

  const payments = await prisma.payment.findMany({
    where: { orderId: { in: ids } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
  }
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderAddress.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.enrollment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
}

async function purgeProduct(productId: string) {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);

  if (variantIds.length) {
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantShippingRate.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productImage.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.marketplaceListing.deleteMany({ where: { variantId: { in: variantIds } } });
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
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log: string[] = [];

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);

  const targets = await prisma.product.findMany({
    where: {
      status: { in: ["DRAFT", "ARCHIVED"] },
      NOT: {
        OR: [{ slug: { startsWith: "course-checkout-" } }, { slug: { startsWith: "event-checkout-" } }],
      },
    },
    include: { variants: { select: { id: true, sku: true, status: true } } },
    orderBy: { slug: "asc" },
  });

  // Also hard-delete soft-deleted archived stubs (e.g. bendo-shaker1)
  const softDeleted = await prisma.product.findMany({
    where: {
      deletedAt: { not: null },
      NOT: {
        OR: [{ slug: { startsWith: "course-checkout-" } }, { slug: { startsWith: "event-checkout-" } }],
      },
    },
    include: { variants: { select: { id: true, sku: true, status: true } } },
  });

  const all = [...targets, ...softDeleted.filter((p) => !targets.some((t) => t.id === p.id))];
  const variantIds = all.flatMap((p) => p.variants.map((v) => v.id));

  const orderItems = variantIds.length
    ? await prisma.orderItem.findMany({
        where: { variantId: { in: variantIds } },
        include: { order: { select: { id: true, orderNumber: true, status: true } } },
      })
    : [];

  const orderIds = [...new Set(orderItems.map((i) => i.orderId))];
  const orderNumbers = [...new Set(orderItems.map((i) => i.order.orderNumber))];

  log.push(`DRAFT/ARCHIVED products to purge: ${targets.length}`);
  log.push(`Soft-deleted product stubs: ${softDeleted.length}`);
  log.push(`Total products to purge: ${all.length}`);
  log.push(`Orders to delete (touch these variants): ${orderIds.length}`);
  log.push(`Order numbers: ${orderNumbers.join(", ") || "(none)"}`);

  for (const p of all) {
    log.push(`  ${p.status} ${p.slug} (${p.variants.length} variants) ${p.deletedAt ? "soft-deleted" : ""}`);
  }

  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-plan.json`), JSON.stringify({ all, orderIds, orderNumbers }, null, 2));
  console.log(log.join("\n"));

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }

  if (orderIds.length) {
    console.log(`Deleting ${orderIds.length} orders...`);
    await deleteOrders(orderIds);
  }

  for (const p of all) {
    console.log(`Purging ${p.slug}...`);
    await purgeProduct(p.id);
  }

  const after = {
    draft: await prisma.product.count({ where: { status: "DRAFT", deletedAt: null } }),
    archived: await prisma.product.count({ where: { status: "ARCHIVED", deletedAt: null } }),
    active: await prisma.product.count({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        catalogHidden: false,
        NOT: {
          OR: [{ slug: { startsWith: "course-checkout-" } }, { slug: { startsWith: "event-checkout-" } }],
        },
        variants: { some: { status: "ACTIVE" } },
      },
    }),
  };
  console.log("\nAfter purge:", after);
  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-log.txt`), log.join("\n") + "\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
