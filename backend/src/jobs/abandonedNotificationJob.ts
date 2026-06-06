import { Queue, Worker, type Job } from "bullmq";

import { getRedisConnection } from "../config/redisConnection";
import { logger } from "../config/logger";
import { prisma } from "../config/db";
import { notifyOrderEmail, sendAbandonedCartEmail } from "../modules/notifications/email";

export const ABANDONED_QUEUE = "abandoned-notifications";
const CART_DELAY_MS = 2 * 60 * 60 * 1000;
const PAYMENT_REMINDER_MS = 2 * 60 * 60 * 1000;
const SCAN_INTERVAL_MS = 30 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;

function getQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queue) queue = new Queue(ABANDONED_QUEUE, { connection: conn });
  return queue;
}

async function scanAbandonedCarts(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - CART_DELAY_MS);
  const carts = await prisma.cart.findMany({
    where: {
      updatedAt: { lt: twoHoursAgo },
      userId: { not: null },
      items: { some: {} },
      abandonedEmailSentAt: null
    },
    include: {
      user: { select: { email: true, name: true } },
      items: { take: 1 }
    },
    take: 50
  });

  for (const cart of carts) {
    if (!cart.user?.email || !cart.userId) continue;

    const sent = await sendAbandonedCartEmail(cart.userId);
    if (!sent) continue;

    await prisma.cart.update({
      where: { id: cart.id },
      data: { abandonedEmailSentAt: new Date() }
    });
    logger.info("abandoned_cart_email_sent", { cartId: cart.id });
  }
}

async function scanPaymentReminders(): Promise<void> {
  const cutoff = new Date(Date.now() - PAYMENT_REMINDER_MS);
  const orders = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      deletedAt: null,
      createdAt: { lte: cutoff }
    },
    take: 50
  });

  const redis = getRedisConnection();

  for (const order of orders) {
    const dedupeKey = `payment-reminder:${order.id}`;
    if (redis) {
      const sent = await redis.get(dedupeKey);
      if (sent) continue;
    }

    notifyOrderEmail(order.id, "payment_reminder");
    if (redis) {
      await redis.set(dedupeKey, "1", "EX", 7 * 24 * 60 * 60);
    }
    logger.info("payment_reminder_sent", { orderId: order.id, orderNumber: order.orderNumber });
  }
}

async function processScan(_job: Job): Promise<void> {
  await scanAbandonedCarts();
  await scanPaymentReminders();
}

export async function scheduleAbandonedScan(): Promise<void> {
  const q = getQueue();
  if (!q) return;
  await q.add(
    "scan",
    {},
    {
      repeat: { every: SCAN_INTERVAL_MS },
      jobId: "abandoned-scan-repeat",
      removeOnComplete: true
    }
  );
}

export function startAbandonedNotificationWorker(): void {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("abandoned_notification_worker_skipped", { reason: "REDIS_URL not set" });
    return;
  }
  if (worker) return;

  worker = new Worker(ABANDONED_QUEUE, () => processScan({} as Job), { connection: conn });
  void scheduleAbandonedScan();
  logger.info("abandoned_notification_worker_started");
}
