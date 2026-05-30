/**
 * Remove demo carts/orders/payments so Woo imports start clean.
 * Does NOT delete products, catalog, or CMS content.
 *
 * Usage: npx tsx scripts/flush-transactional-data.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const counts = {
    refunds: await prisma.refund.count(),
    payments: await prisma.payment.count(),
    shipments: await prisma.shipment.count(),
    invoices: await prisma.invoice.count(),
    orderStatusHistory: await prisma.orderStatusHistory.count(),
    orderItems: await prisma.orderItem.count(),
    orderAddresses: await prisma.orderAddress.count(),
    orders: await prisma.order.count(),
    cartItems: await prisma.cartItem.count(),
    carts: await prisma.cart.count(),
    enrollments: await prisma.enrollment.count(),
    bookings: await prisma.booking.count()
  };

  console.log("Current transactional rows:", counts);

  if (dryRun) {
    console.log("Dry run — no deletes.");
    return;
  }

  await prisma.$transaction([
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.orderAddress.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.booking.deleteMany()
  ]);

  console.log("Flushed transactional data (orders, carts, enrollments, bookings).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
