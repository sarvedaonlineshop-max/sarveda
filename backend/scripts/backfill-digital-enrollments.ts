/**
 * Backfill Enrollment / Booking for paid digital orders that missed fulfill
 * (e.g. guest checkout before guest-user creation existed).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/backfill-digital-enrollments.ts
 *   npx ts-node --transpile-only scripts/backfill-digital-enrollments.ts --order=SRV-20260900004
 */
import { prisma } from "../src/config/db";
import { fulfillDigitalPurchases } from "../src/modules/orders/fulfillDigitalPurchases";
import { isDigitalSku } from "../src/utils/digitalCart";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--order="));
  const orderNumber = arg?.slice("--order=".length)?.trim();

  const where = orderNumber
    ? { orderNumber, deletedAt: null }
    : {
        deletedAt: null,
        status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as const },
        paymentStatus: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] as const },
        items: {
          some: {
            OR: [
              { digitalOfferId: { not: null } },
              { skuSnapshot: { startsWith: "COURSE-" } },
              { skuSnapshot: { startsWith: "EVENT-" } }
            ]
          }
        }
      };

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderNumber: true,
      email: true,
      items: { select: { skuSnapshot: true, digitalOfferId: true } }
    },
    take: 500,
    orderBy: { createdAt: "desc" }
  });

  let ran = 0;
  for (const o of orders) {
    const digital = o.items.some((i) => Boolean(i.digitalOfferId) || isDigitalSku(i.skuSnapshot));
    if (!digital) continue;
    await fulfillDigitalPurchases(o.id);
    ran += 1;
    // eslint-disable-next-line no-console
    console.log(`fulfilled ${o.orderNumber} (${o.email})`);
  }
  // eslint-disable-next-line no-console
  console.log(`Done. Ran fulfill on ${ran} order(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
