/**
 * Import WooCommerce shop_order_refund from May-30 refund.xml
 */
import { PaymentStatus, PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

import { assertFile, may30 } from "./migration-paths";
import { moneyToMinor } from "./woo-order-map";
import { readWxr, cdata, parseIntSafe, parseItems, parseMeta } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const xmlPath = may30.refunds();
  assertFile(xmlPath, "refunds WXR");
  const xml = readWxr(xmlPath);
  const items = parseItems(xml);

  let imported = 0;
  let skipped = 0;

  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[shop_order_refund]]></wp:post_type>")) continue;

    const parentWooId = parseIntSafe(cdata("wp:post_parent", block));
    const refundWooId = parseIntSafe(cdata("wp:post_id", block));
    const meta = parseMeta(block);
    const currency = (meta._order_currency ?? "INR").toUpperCase();
    const amount = moneyToMinor(meta._refund_amount ?? meta._order_total ?? "0", currency);

    if (!parentWooId || amount <= 0) {
      skipped++;
      continue;
    }

    if (dryRun) {
      imported++;
      continue;
    }

    const order = await prisma.order.findUnique({ where: { wooCommerceId: parentWooId } });
    if (!order) {
      skipped++;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "REFUNDED",
        paymentStatus: PaymentStatus.REFUNDED
      }
    });

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    if (payment) {
      const exists = await prisma.refund.findFirst({
        where: { paymentId: payment.id, providerRefundId: String(refundWooId) }
      });
      if (!exists) {
        await prisma.refund.create({
          data: {
            paymentId: payment.id,
            amountInPaise: amount,
            reason: meta._refund_reason || "WooCommerce import",
            providerRefundId: String(refundWooId),
            status: "completed"
          }
        });
      }
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          refundedInPaise: amount
        }
      });
    }

    imported++;
  }

  console.log(`Refunds: imported ${imported}, skipped ${skipped}${dryRun ? " (dry)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
