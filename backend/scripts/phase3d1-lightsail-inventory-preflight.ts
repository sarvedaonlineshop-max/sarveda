/**
 * Phase 3D1 read-only inventory preflight against pre-launch Lightsail Sarveda DB.
 *
 * Commerce/purchases/inventory tables: READ-ONLY. No writes.
 *
 * Usage (on Lightsail app server with backend/.env pointing at Lightsail Postgres):
 *   PHASE3D1_LIGHTSAIL_INVENTORY_PREFLIGHT_OK=1 \
 *   npx tsx scripts/phase3d1-lightsail-inventory-preflight.ts
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { isProductionLikeEnvironment } from "../src/modules/accounting/production-guard";

const prisma = new PrismaClient();

const EXPECTED_LIGHTSAIL_HOST_FRAGMENT = "c9oiska8wm8k.ap-south-1.rds.amazonaws.com";
const EXPECTED_DB = "sarveda_db";

function dbMeta(url: string) {
  try {
    const u = new URL(url.replace(/^postgresql:/i, "http:"));
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: (u.pathname || "/").replace(/^\//, "").split("?")[0]
    };
  } catch {
    return { host: "(parse-error)", port: "?", database: "?" };
  }
}

function redactHost(host: string): string {
  if (host.includes(EXPECTED_LIGHTSAIL_HOST_FRAGMENT)) {
    return `ls-***.${EXPECTED_LIGHTSAIL_HOST_FRAGMENT}`;
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return host;
  }
  const parts = host.split(".");
  if (parts.length >= 2) {
    return `***.${parts.slice(-3).join(".")}`;
  }
  return "***";
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function main() {
  if (process.env.PHASE3D1_LIGHTSAIL_INVENTORY_PREFLIGHT_OK !== "1") {
    throw new Error("Set PHASE3D1_LIGHTSAIL_INVENTORY_PREFLIGHT_OK=1 to run");
  }

  const dbUrl = process.env.DATABASE_URL ?? "";
  const meta = dbMeta(dbUrl);
  const intended =
    meta.database === EXPECTED_DB && meta.host.includes(EXPECTED_LIGHTSAIL_HOST_FRAGMENT);

  console.log("=== PHASE 3D1 LIGHTSAIL INVENTORY PREFLIGHT (READ-ONLY) ===");
  console.log(
    JSON.stringify(
      {
        environment: {
          nodeEnv: process.env.NODE_ENV ?? "(unset)",
          databaseHostRedacted: redactHost(meta.host),
          databasePort: meta.port,
          databaseName: meta.database,
          intendedPrelaunchLightsailDb: intended,
          isProductionLikeEnvironment: isProductionLikeEnvironment()
        }
      },
      null,
      2
    )
  );

  if (!intended) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not the intended pre-launch Lightsail Sarveda DB"
    );
  }

  const [
    totalVariants,
    variantsWithInventory,
    inventoryAgg,
    variantsWithCost,
    stockNoCost,
    negativeOnHand,
    negativeReserved,
    purchaseOrders,
    purchaseReceipts,
    purchaseReceiptLines,
    vendorBillsTotal,
    vendorBillsLinkedToPo,
    paidOrders,
    paidOrderItems,
    paidOrderItemsQty,
    refundRows,
    processedRefunds,
    refundedOrders,
    rtoShipments,
    returnedFulfillment,
    shipmentsDelivered
  ] = await Promise.all([
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: { inventory: { isNot: null } } }),
    prisma.inventory.aggregate({ _sum: { onHand: true, reserved: true }, _count: true }),
    prisma.productVariant.count({ where: { costInPaise: { gt: 0 } } }),
    prisma.productVariant.count({
      where: {
        inventory: { is: { onHand: { gt: 0 } } },
        OR: [{ costInPaise: null }, { costInPaise: 0 }]
      }
    }),
    prisma.inventory.count({ where: { onHand: { lt: 0 } } }),
    prisma.inventory.count({ where: { reserved: { lt: 0 } } }),
    tableExists("PurchaseOrder").then((ok) => (ok ? prisma.purchaseOrder.count() : null)),
    tableExists("PurchaseReceipt").then((ok) => (ok ? prisma.purchaseReceipt.count() : null)),
    tableExists("PurchaseReceiptLine").then((ok) => (ok ? prisma.purchaseReceiptLine.count() : null)),
    tableExists("VendorBill").then((ok) => (ok ? prisma.vendorBill.count() : null)),
    tableExists("VendorBill").then((ok) =>
      ok ? prisma.vendorBill.count({ where: { purchaseOrderId: { not: null } } }) : null
    ),
    prisma.order.count({
      where: {
        paymentStatus: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] },
        status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] }
      }
    }),
    prisma.orderItem.count({
      where: {
        order: {
          paymentStatus: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] },
          status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] }
        }
      }
    }),
    prisma.orderItem.aggregate({
      where: {
        order: {
          paymentStatus: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] },
          status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] }
        }
      },
      _sum: { qtyOrdered: true }
    }),
    prisma.refund.count(),
    prisma.refund.count({ where: { status: { in: ["processed", "completed", "succeeded"] } } }),
    prisma.order.count({
      where: {
        OR: [
          { status: "REFUNDED" },
          { paymentStatus: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } }
        ]
      }
    }),
    prisma.shipment.count({ where: { status: "RTO" } }),
    prisma.order.count({ where: { fulfillmentStatus: "RETURNED" } }),
    prisma.shipment.count({ where: { status: "DELIVERED" } })
  ]);

  const poByStatus = (await tableExists("PurchaseOrder"))
    ? await prisma.purchaseOrder.groupBy({ by: ["status"], _count: true })
    : null;

  const billByStatus = (await tableExists("VendorBill"))
    ? await prisma.vendorBill.groupBy({ by: ["status"], _count: true })
    : null;

  const topStockNoCost = await prisma.productVariant.findMany({
    where: {
      inventory: { is: { onHand: { gt: 0 } } },
      OR: [{ costInPaise: null }, { costInPaise: 0 }]
    },
    select: {
      sku: true,
      costInPaise: true,
      inventory: { select: { onHand: true, reserved: true } }
    },
    orderBy: { inventory: { onHand: "desc" } },
    take: 10
  });

  console.log(
    JSON.stringify(
      {
        inventory: {
          totalProductVariants: totalVariants,
          variantsWithInventoryRows: variantsWithInventory,
          inventoryRowCount: inventoryAgg._count,
          totalOnHand: inventoryAgg._sum.onHand ?? 0,
          totalReserved: inventoryAgg._sum.reserved ?? 0,
          variantsWithCostInPaiseGt0: variantsWithCost,
          variantsWithStockButZeroOrMissingCost: stockNoCost,
          negativeOnHandRows: negativeOnHand,
          negativeReservedRows: negativeReserved,
          topStockNoCostSample: topStockNoCost.map((v) => ({
            sku: v.sku,
            costInPaise: v.costInPaise,
            onHand: v.inventory?.onHand ?? 0,
            reserved: v.inventory?.reserved ?? 0
          }))
        },
        purchases: {
          purchaseOrders: purchaseOrders,
          purchaseOrdersByStatus: poByStatus,
          purchaseReceipts: purchaseReceipts,
          purchaseReceiptLines: purchaseReceiptLines,
          vendorBills: vendorBillsTotal,
          vendorBillsLinkedToPurchaseOrder: vendorBillsLinkedToPo,
          vendorBillsByStatus: billByStatus
        },
        salesAndReturns: {
          paidOrders: paidOrders,
          paidOrderItems: paidOrderItems,
          paidOrderItemsQtySum: paidOrderItemsQty._sum.qtyOrdered ?? 0,
          refundRows: refundRows,
          processedRefunds: processedRefunds,
          ordersRefundedOrPartial: refundedOrders,
          shipmentsRto: rtoShipments,
          ordersFulfillmentReturned: returnedFulfillment,
          shipmentsDelivered: shipmentsDelivered
        }
      },
      null,
      2
    )
  );

  console.log("PHASE 3D1 LIGHTSAIL INVENTORY PREFLIGHT COMPLETE (READ-ONLY)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
