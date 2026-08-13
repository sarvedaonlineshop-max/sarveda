/**
 * Permanently delete all staging/test orders (orderNumber starts with SRV-).
 *
 * Usage (Lightsail):
 *   npx tsx scripts/purge-srv-orders.ts
 *   npx tsx scripts/purge-srv-orders.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKUP_DIR = path.join(REPO_ROOT, "data/compare/live-purge-srv-orders-backups");

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

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const orders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: "SRV-" } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      email: true,
      grandTotalInPaise: true,
      createdAt: true,
    },
    orderBy: { orderNumber: "asc" },
  });

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`SRV-* orders found: ${orders.length}`);
  if (orders.length) {
    for (const o of orders) {
      console.log(
        `  ${o.orderNumber}  ${o.status}  ${o.email}  ₹${(o.grandTotalInPaise / 100).toFixed(2)}  ${o.createdAt.toISOString().slice(0, 10)}`
      );
    }
  }

  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-srv-orders.json`), JSON.stringify(orders, null, 2));

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to delete.");
    return;
  }

  if (!orders.length) {
    console.log("Nothing to delete.");
    return;
  }

  await deleteOrders(orders.map((o) => o.id));

  const remaining = await prisma.order.count({ where: { orderNumber: { startsWith: "SRV-" } } });
  const total = await prisma.order.count();
  console.log(`\nDeleted ${orders.length} SRV-* orders. Remaining SRV-*: ${remaining}. Total orders in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
