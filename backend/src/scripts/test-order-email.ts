/**
 * Fire transactional order email(s) through the same path as production.
 *
 * Usage:
 *   npx tsx src/scripts/test-order-email.ts <orderNumber|orderId> [event|all] [--to=email@example.com]
 *
 * Events: order_confirmed | payment_failed | payment_reminder | order_processing
 *         order_shipped | order_delivered | order_returned | refund_initiated | order_cancelled
 *         all
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

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let toOverride: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--to=")) {
      toOverride = a.slice("--to=".length).trim();
    } else if (!a.startsWith("--")) {
      positional.push(a);
    }
  }
  return {
    key: positional[0]?.trim(),
    eventArg: (positional[1]?.trim() || "order_confirmed") as string,
    toOverride
  };
}

async function main() {
  const { key, eventArg, toOverride } = parseArgs(process.argv.slice(2));

  if (!key) {
    console.error(
      "Usage: npm run test:order-email -- <orderNumber|orderId> [event|all] [--to=you@email.com]"
    );
    console.error(`Events: ${EVENTS.join(" | ")} | all`);
    process.exitCode = 1;
    return;
  }

  const events: OrderEmailEvent[] =
    eventArg === "all"
      ? [...EVENTS]
      : EVENTS.includes(eventArg as OrderEmailEvent)
        ? [eventArg as OrderEmailEvent]
        : [];

  if (!events.length) {
    console.error(`Unknown event "${eventArg}". Use one of: ${EVENTS.join(", ")}, all`);
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

  const originalEmail = order.email;
  if (toOverride) {
    await prisma.order.update({
      where: { id: order.id },
      data: { email: toOverride }
    });
  }

  const deliverTo = toOverride || originalEmail;
  console.log(`Provider: ${config.provider} (${config.host})`);
  console.log(`From:     ${config.fromEmail}`);
  console.log(`Order:    ${order.orderNumber} (${order.id})`);
  console.log(`To:       ${deliverTo}${toOverride ? " (override)" : ""}`);
  console.log(`Events:   ${events.join(", ")}`);
  console.log("");

  try {
    for (const event of events) {
      process.stdout.write(`→ ${event} … `);
      await sendOrderEmail(order.id, event);
      console.log("sent");
      // Brief pause so ZeptoMail / Gmail don’t throttle a burst
      await new Promise((r) => setTimeout(r, 800));
    }
    console.log("\n✅ All requested order emails sent (check inbox / spam).");
  } finally {
    if (toOverride) {
      await prisma.order.update({
        where: { id: order.id },
        data: { email: originalEmail }
      });
      console.log(`Restored order email to ${originalEmail}`);
    }
  }
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
