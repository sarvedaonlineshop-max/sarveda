import { Queue, Worker } from "bullmq";

import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { getRedisConnection } from "../config/redisConnection";
import { syncTrackingByWaybill } from "../modules/shipping/orderLifecycle";

const QUEUE_NAME = "tracking-sync";
const REPEAT_EVERY_MS = 20 * 60 * 1000;

let queue: Queue | null = null;

function getQueue(): Queue | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

async function syncActiveShipments(): Promise<void> {
  const rows = await prisma.shipment.findMany({
    where: {
      awb: { not: null },
      status: { in: ["CREATED", "PICKED", "INTRANSIT", "OUT_FOR_DELIVERY"] },
      order: {
        status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED"] },
        deletedAt: null
      }
    },
    select: { awb: true },
    take: 200
  });

  for (const row of rows) {
    if (!row.awb || row.awb.startsWith("STUB-")) continue;
    const r = await syncTrackingByWaybill(row.awb);
    if (!r.success) {
      logger.warn("tracking_sync_poll_failed", { awb: row.awb, error: r.error });
    }
  }
  logger.info("tracking_sync_poll_done", { count: rows.length });
}

export async function startTrackingSyncWorker(): Promise<void> {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn("tracking_sync_worker_skipped_no_redis");
    return;
  }

  const q = getQueue();
  if (!q) return;

  await q.add(
    "poll",
    {},
    {
      repeat: { every: REPEAT_EVERY_MS },
      jobId: "tracking-sync-repeat"
    }
  );

  new Worker(
    QUEUE_NAME,
    async () => {
      await syncActiveShipments();
    },
    { connection, concurrency: 1 }
  );

  logger.info("tracking_sync_worker_started", { everyMs: REPEAT_EVERY_MS });
}
