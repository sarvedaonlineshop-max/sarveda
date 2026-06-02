/**
 * Set reportingTotalInInrPaise + ensure placedAt on all orders (Woo import + native).
 * Run after migrate:may-30: npm run backfill:order-reporting
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

import { reportingNetSalesInrPaiseFromOrder } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      currency: true,
      grandTotalInPaise: true,
      shippingInPaise: true,
      taxInPaise: true,
      placedAt: true,
      createdAt: true
    }
  });

  let updated = 0;
  for (const o of orders) {
    const reporting = reportingNetSalesInrPaiseFromOrder(
      o.currency,
      o.grandTotalInPaise,
      o.shippingInPaise,
      o.taxInPaise
    );
    const placedAt = o.placedAt ?? o.createdAt;
    if (dryRun) {
      updated++;
      continue;
    }
    await prisma.order.update({
      where: { id: o.id },
      data: {
        reportingTotalInInrPaise: reporting,
        ...(o.placedAt ? {} : { placedAt })
      }
    });
    updated++;
  }

  console.log(`Backfill reporting INR: ${updated} orders${dryRun ? " (dry)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
