/**
 * Soft-open cleanup: delete D2C orders placed before a cutoff and draft test products.
 *
 * Cutoff default: 2026-09-14 23:00 IST = 2026-09-14T17:30:00.000Z
 *
 *   npx tsx scripts/cleanup-pre-live-orders.ts
 *   npx tsx scripts/cleanup-pre-live-orders.ts --apply
 *
 * BACK UP DB before --apply.
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const CUTOFF_ISO =
  process.env.CLEANUP_CUTOFF_ISO?.trim() || "2026-09-14T17:30:00.000Z";
const CUTOFF = new Date(CUTOFF_ISO);
const BACKUP_DIR = path.resolve(
  __dirname,
  "../../data/compare/pre-live-order-cleanup-backups"
);

const TEST_PRODUCT_SLUGS = ["dummy-product", "test-product"] as const;

const prisma = new PrismaClient();

async function deleteOrdersClean(orderIds: string[]) {
  if (!orderIds.length) return;
  const ids = [...new Set(orderIds)];

  await prisma.accountingDocumentLink.deleteMany({
    where: { documentType: "ORDER", documentId: { in: ids } },
  });
  await prisma.accountingPostingEvent.deleteMany({
    where: { sourceType: "ORDER", sourceId: { in: ids } },
  });

  // Soft refs (no FK) — clear so settlement rows do not point at deleted ids
  await prisma.accountingGatewaySettlementLine.updateMany({
    where: { orderId: { in: ids } },
    data: { orderId: null, paymentId: null, mappingStatus: "UNMAPPED" },
  });

  await prisma.orderAttribution.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderInventoryRestockEvent.deleteMany({
    where: { orderId: { in: ids } },
  });

  // Service-request tree (returns / replacements / photos / claims)
  const requests = await prisma.orderServiceRequest.findMany({
    where: { orderId: { in: ids } },
    select: { id: true },
  });
  const requestIds = requests.map((r) => r.id);
  if (requestIds.length) {
    await prisma.returnCourierClaim.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.returnVendorClaim.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.returnCaseEconomics.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderReturnQcLine.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderReturnReceiptLine.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderServiceRequestEvent.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderReplacementFulfillment.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderReturnShipment.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderServiceRequestPhoto.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderServiceRequestItem.deleteMany({
      where: { requestId: { in: requestIds } },
    });
    await prisma.orderServiceRequest.deleteMany({
      where: { id: { in: requestIds } },
    });
  }

  // Refunds → allocations must go first (RESTRICT on Refund + OrderItem)
  const payments = await prisma.payment.findMany({
    where: { orderId: { in: ids } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length) {
    const refunds = await prisma.refund.findMany({
      where: { paymentId: { in: paymentIds } },
      select: { id: true },
    });
    const refundIds = refunds.map((r) => r.id);
    if (refundIds.length) {
      await prisma.refundAllocation.deleteMany({
        where: { refundId: { in: refundIds } },
      });
      await prisma.refund.deleteMany({ where: { id: { in: refundIds } } });
    }
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { orderId: { in: ids } },
    select: { id: true },
  });
  const orderItemIds = orderItems.map((i) => i.id);
  if (orderItemIds.length) {
    await prisma.refundAllocation.deleteMany({
      where: { orderItemId: { in: orderItemIds } },
    });
  }

  await prisma.orderSupplementaryPayment.deleteMany({
    where: { orderId: { in: ids } },
  });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });

  // Explicit logistics docs (also CASCADE from Order, but clear cleanly)
  await prisma.eWayBill.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryChallan.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.shipment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderAddress.deleteMany({ where: { orderId: { in: ids } } });

  // Optional FKs: detach rather than wipe customer LMS history
  await prisma.enrollment.updateMany({
    where: { orderId: { in: ids } },
    data: { orderId: null },
  });
  await prisma.booking.updateMany({
    where: { orderId: { in: ids } },
    data: { orderId: null },
  });
  await prisma.quotation.updateMany({
    where: { convertedOrderId: { in: ids } },
    data: { convertedOrderId: null },
  });

  await prisma.order.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  if (Number.isNaN(CUTOFF.getTime())) {
    throw new Error(`Invalid CLEANUP_CUTOFF_ISO: ${CUTOFF_ISO}`);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const orders = await prisma.order.findMany({
    where: { createdAt: { lt: CUTOFF } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      email: true,
      phone: true,
      grandTotalInPaise: true,
      createdAt: true,
      placedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const keep = await prisma.order.findMany({
    where: { createdAt: { gte: CUTOFF } },
    select: { orderNumber: true, createdAt: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  const testProducts = await prisma.product.findMany({
    where: { slug: { in: [...TEST_PRODUCT_SLUGS] } },
    select: { id: true, slug: true, name: true, status: true },
  });

  const childCounts = {
    payments: await prisma.payment.count({
      where: { orderId: { in: orders.map((o) => o.id) } },
    }),
    shipments: await prisma.shipment.count({
      where: { orderId: { in: orders.map((o) => o.id) } },
    }),
    invoices: await prisma.invoice.count({
      where: { orderId: { in: orders.map((o) => o.id) } },
    }),
    serviceRequests: await prisma.orderServiceRequest.count({
      where: { orderId: { in: orders.map((o) => o.id) } },
    }),
    refunds: await prisma.refund.count({
      where: { payment: { orderId: { in: orders.map((o) => o.id) } } },
    }),
  };

  const manifest = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    cutoffIso: CUTOFF.toISOString(),
    cutoffNote: "2026-09-14 23:00 Asia/Kolkata",
    deleteOrderCount: orders.length,
    keepOrderCount: keep.length,
    keepOrders: keep,
    childCounts,
    testProducts,
    orders: orders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      placedAt: o.placedAt?.toISOString() ?? null,
    })),
  };

  const backupPath = path.join(BACKUP_DIR, `${stamp}-manifest.json`);
  fs.writeFileSync(backupPath, JSON.stringify(manifest, null, 2));

  console.log(`Mode: ${manifest.mode}`);
  console.log(`Cutoff: ${manifest.cutoffIso} (${manifest.cutoffNote})`);
  console.log(`Orders to delete: ${orders.length}`);
  console.log(`Orders to keep (>= cutoff): ${keep.length}`);
  console.log(`Related: ${JSON.stringify(childCounts)}`);
  console.log(`Test products → DRAFT: ${testProducts.map((p) => p.slug).join(", ") || "(none found)"}`);
  console.log(`Manifest: ${backupPath}`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply after DB backup.");
    return;
  }

  await deleteOrdersClean(orders.map((o) => o.id));

  const drafted = await prisma.product.updateMany({
    where: { slug: { in: [...TEST_PRODUCT_SLUGS] } },
    data: { status: "DRAFT" },
  });

  const remainingBeforeCutoff = await prisma.order.count({
    where: { createdAt: { lt: CUTOFF } },
  });
  const totalOrders = await prisma.order.count();
  const latestSep = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: "SRV-202609" } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  // Preview next number the app will issue this month
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const prefix = `SRV-${y}${m}`;
  const latestForPrefix = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  let nextSeq = 1;
  if (latestForPrefix?.orderNumber) {
    const n = parseInt(latestForPrefix.orderNumber.slice(prefix.length), 10);
    if (!Number.isNaN(n)) nextSeq = n + 1;
  }
  const nextOrderNumber = `${prefix}${String(nextSeq).padStart(5, "0")}`;

  console.log(`\nDeleted ${orders.length} orders.`);
  console.log(`Remaining before cutoff: ${remainingBeforeCutoff}`);
  console.log(`Total orders left: ${totalOrders}`);
  console.log(`Products drafted: ${drafted.count}`);
  console.log(`Latest SRV-202609*: ${latestSep?.orderNumber ?? "(none)"}`);
  console.log(`Next generateOrderNumber() → ${nextOrderNumber}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
