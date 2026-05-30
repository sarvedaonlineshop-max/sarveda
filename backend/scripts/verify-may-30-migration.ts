/**
 * Print row counts and sanity checks after migrate:may-30.
 * Usage: npx tsx scripts/verify-may-30-migration.ts
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const [
    users,
    wooUsers,
    products,
    variants,
    orders,
    wooOrders,
    ordersWithItems,
    reviews,
    courses,
    events,
    blogPosts,
    coupons,
    refunds,
    enrollments
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { wooCommerceId: { not: null } } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.productVariant.count(),
    prisma.order.count({ where: { deletedAt: null } }),
    prisma.order.count({ where: { wooCommerceId: { not: null } } }),
    prisma.order.count({
      where: { deletedAt: null, items: { some: {} } }
    }),
    prisma.review.count(),
    prisma.course.count(),
    prisma.event.count(),
    prisma.blogPost.count({ where: { status: "PUBLISHED" } }),
    prisma.coupon.count(),
    prisma.refund.count(),
    prisma.enrollment.count()
  ]);

  const sampleWooOrder = await prisma.order.findFirst({
    where: { wooCommerceId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      orderNumber: true,
      wooCommerceId: true,
      email: true,
      status: true,
      grandTotalInPaise: true,
      currency: true,
      _count: { select: { items: true } }
    }
  });

  console.log("\n=== May-30 migration verification ===\n");
  console.log("Users (total):              ", users);
  console.log("Users (Woo import):         ", wooUsers, "  (expect ~532)");
  console.log("Products:                   ", products, "  (expect ~169)");
  console.log("Variants:                   ", variants, "  (expect ~1037)");
  console.log("Orders (total):             ", orders);
  console.log("Orders (Woo import):        ", wooOrders, "  (expect 4362)");
  console.log("Orders with line items:     ", ordersWithItems, "  (new checkout only; Woo ~0)");
  console.log("Reviews:                    ", reviews, "  (expect ~150)");
  console.log("Courses:                    ", courses, "  (expect 14)");
  console.log("Events:                     ", events, "  (expect 38)");
  console.log("Blog posts (published):     ", blogPosts);
  console.log("Coupons:                    ", coupons);
  console.log("Refunds:                    ", refunds);
  console.log("Enrollments:                ", enrollments);

  if (sampleWooOrder) {
    console.log("\nSample Woo order:");
    console.log(
      `  ${sampleWooOrder.orderNumber} (WP #${sampleWooOrder.wooCommerceId}) ${sampleWooOrder.status} ${sampleWooOrder.email} ${sampleWooOrder.grandTotalInPaise / 100} ${sampleWooOrder.currency} lineItems=${sampleWooOrder._count.items}`
    );
  }

  const gaps: string[] = [];
  if (wooOrders < 4000) gaps.push("Woo orders lower than expected (~4362)");
  if (wooUsers < 500) gaps.push("Woo users lower than expected (~532)");
  if (reviews < 100) gaps.push("Reviews lower than expected (~150)");

  if (gaps.length) {
    console.log("\n⚠ Checks to review:");
    gaps.forEach((g) => console.log("  -", g));
  } else {
    console.log("\n✓ Core counts look in range for May-30 import.");
  }

  console.log(
    "\nNote: Historical Woo orders have no product lines in the XML export.\nOpen admin order detail — amber banner explains missing line items.\n"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
