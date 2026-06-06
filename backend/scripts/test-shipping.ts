/**
 * Dry-run shipping configuration checks (no real labels created).
 * Usage: npx tsx scripts/test-shipping.ts
 */
import dotenv from "dotenv";
import path from "path";

import { prisma } from "../src/config/db";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function testShippingSetup(): Promise<void> {
  console.log("\n=== SARVEDA SHIPPING SETUP TEST ===\n");

  const checks: Array<{
    name: string;
    pass: boolean;
    detail: string;
  }> = [];

  const envChecks: Array<[string, string | undefined]> = [
    ["SHIPROCKET_EMAIL", process.env.SHIPROCKET_EMAIL],
    ["SHIPROCKET_PASSWORD", process.env.SHIPROCKET_PASSWORD],
    ["SHIPPING_ORIGIN_PINCODE", process.env.SHIPPING_ORIGIN_PINCODE],
    ["SHIPROCKET_PICKUP_LOCATION", process.env.SHIPROCKET_PICKUP_LOCATION],
    ["DELHIVERY_API_KEY", process.env.DELHIVERY_API_KEY]
  ];

  for (const [name, value] of envChecks) {
    checks.push({
      name: `ENV: ${name}`,
      pass: !!value,
      detail: value ? "✓ Set" : "✗ Missing"
    });
  }

  const recentOrders = await prisma.order.findMany({
    where: {
      status: { in: ["PROCESSING", "PACKED", "SHIPPED"] },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    include: { shipments: true },
    take: 5,
    orderBy: { createdAt: "desc" }
  });

  checks.push({
    name: "Recent fulfillable orders",
    pass: recentOrders.length >= 0,
    detail: `${recentOrders.length} orders in PROCESSING/PACKED/SHIPPED`
  });

  const errorOrders = await prisma.order.findMany({
    where: {
      shippingLastError: { not: null },
      status: { in: ["PAID", "PROCESSING", "PACKED"] }
    },
    select: {
      orderNumber: true,
      shippingLastError: true,
      shippingLastErrorAt: true
    },
    take: 10
  });

  checks.push({
    name: "Orders with shipping errors",
    pass: errorOrders.length === 0,
    detail:
      errorOrders.length === 0
        ? "✓ No errors"
        : `✗ ${errorOrders.length} orders need attention`
  });

  const noAwb = await prisma.shipment.count({
    where: { awb: null }
  });
  checks.push({
    name: "Shipments without AWB",
    pass: noAwb === 0,
    detail:
      noAwb === 0 ? "✓ All shipments have AWB" : `✗ ${noAwb} shipments missing AWB`
  });

  const intlOrders = await prisma.order.findMany({
    where: {
      status: { in: ["PROCESSING", "PACKED"] },
      addresses: {
        some: { type: "SHIPPING", country: { not: "IN" } }
      }
    },
    select: { orderNumber: true },
    take: 5
  });
  checks.push({
    name: "Pending international orders",
    pass: true,
    detail:
      intlOrders.length === 0
        ? "✓ None pending"
        : `⚠ ${intlOrders.length} pending: ${intlOrders.map((o) => o.orderNumber).join(", ")}`
  });

  console.log("RESULTS:");
  console.log("─".repeat(60));
  for (const c of checks) {
    const icon = c.pass ? "✅" : "❌";
    console.log(`${icon} ${c.name}`);
    console.log(`   ${c.detail}`);
  }
  console.log("─".repeat(60));

  const failed = checks.filter((c) => !c.pass);
  if (failed.length === 0) {
    console.log("\n✅ Shipping setup looks good!\n");
  } else {
    console.log(`\n❌ ${failed.length} issue(s) need fixing\n`);
    if (errorOrders.length > 0) {
      console.log("Orders with errors:");
      for (const o of errorOrders) {
        console.log(`  ${o.orderNumber}: ${o.shippingLastError}`);
      }
    }
  }

  await prisma.$disconnect();
}

testShippingSetup().catch((err) => {
  console.error(err);
  process.exit(1);
});
