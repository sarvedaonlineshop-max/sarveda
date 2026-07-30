/**
 * Fire one transactional order email through the same path as production
 * (enqueue → sendOrderEmail → ZeptoMail/SES).
 *
 * Usage:
 *   npx tsx src/scripts/test-order-email.ts <orderNumber|orderId> [event]
 *
 * Events: order_confirmed | payment_failed | payment_reminder | order_processing
 *         order_shipped | order_delivered | order_returned | refund_initiated | order_cancelled
 */
import * as dotenv from "dotenv";

import { resolveEmailSmtpConfig } from "../config/email";
import { prisma } from "../config/db";
import {
  sendOrderEmail,
  type OrderEmailEvent
} from "../modules/notifications/email";

dotenv.config();

const EVENTS: OrderEmailEvent[] = [
  "order_confirmed",
  "payment_failed",
  "payment_reminder",
  "order_processing",
  "order_shipped",
  "order_delivered",
  "order_returned",
  "refund_initiated",
  "order_cancelled"
];

async function main() {
  const key = process.argv[2]?.trim();
  const event = (process.argv[3]?.trim() || "order_confirmed") as OrderEmailEvent;

  if (!key) {
    console.error("Usage: npm run test:order-email -- <orderNumber|orderId> [event]");
    console.error(`Events: ${EVENTS.join(" | ")}`);
    process.exitCode = 1;
    return;
  }

  if (!EVENTS.includes(event)) {
    console.error(`Unknown event "${event}". Use one of: ${EVENTS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const config = resolveEmailSmtpConfig();
  if (!config) {
    console.error("No email SMTP config. Set ZEPTOMAIL_SMTP_PASS + ZEPTOMAIL_FROM_EMAIL.");
    process.exitCode = 1;
    return;
  }

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const order = await prisma.order.findFirst({
    where: {
      deletedAt: null,
      ...(uuidRe.test(key) ? { id: key } : { orderNumber: key })
    },
    select: { id: true, orderNumber: true, email: true }
  });

  if (!order) {
    console.error(`Order not found: ${key}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Provider: ${config.provider} (${config.host})`);
  console.log(`From:     ${config.fromEmail}`);
  console.log(`Order:    ${order.orderNumber} (${order.id})`);
  console.log(`To:       ${order.email}`);
  console.log(`Event:    ${event}`);

  await sendOrderEmail(order.id, event);
  console.log("\n✅ Order email sent (check inbox / spam).");
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
