import { Queue, Worker } from "bullmq";

import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { getRedisConnection } from "../config/redisConnection";

const QUEUE_NAME = "cart-cleanup";
/** 2:00 AM IST daily */
const CRON_PATTERN = "0 0 2 * * *";
const CRON_TZ = "Asia/Kolkata";

const GUEST_CART_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_CART_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

let queue: Queue | null = null;

function getQueue(): Queue | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

export type CartCleanupResult = {
  guestCartsDeleted: number;
  emptyCartsDeleted: number;
};

async function deleteCartsByIds(cartIds: string[]): Promise<number> {
  if (!cartIds.length) return 0;
  await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
  const deleted = await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  return deleted.count;
}

export async function runCartCleanupJob(): Promise<CartCleanupResult> {
  const cutoffGuest = new Date(Date.now() - GUEST_CART_MAX_AGE_MS);
  const cutoffUser = new Date(Date.now() - EMPTY_CART_MAX_AGE_MS);

  const staleGuestCarts = await prisma.cart.findMany({
    where: {
      userId: null,
      updatedAt: { lt: cutoffGuest }
    },
    select: { id: true }
  });

  const guestCartsDeleted = await deleteCartsByIds(staleGuestCarts.map((c) => c.id));

  const staleEmptyCarts = await prisma.cart.findMany({
    where: {
      items: { none: {} },
      updatedAt: { lt: cutoffUser }
    },
    select: { id: true }
  });

  const emptyCartsDeleted = await deleteCartsByIds(staleEmptyCarts.map((c) => c.id));

  const result = { guestCartsDeleted, emptyCartsDeleted };
  logger.info("cart_cleanup_complete", result);
  return result;
}

export async function startCartCleanupWorker(): Promise<void> {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn("cart_cleanup_worker_skipped_no_redis");
    return;
  }

  const q = getQueue();
  if (!q) return;

  await q.add(
    "cart_cleanup",
    {},
    {
      repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
      jobId: "cart-cleanup-daily"
    }
  );

  new Worker(
    QUEUE_NAME,
    async () => {
      try {
        await runCartCleanupJob();
      } catch (err) {
        logger.error("cart_cleanup_failed", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    },
    { connection, concurrency: 1 }
  );

  logger.info("cart_cleanup_worker_started", { pattern: CRON_PATTERN, tz: CRON_TZ });
}
