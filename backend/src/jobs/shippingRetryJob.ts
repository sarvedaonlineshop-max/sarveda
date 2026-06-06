import { Queue, Worker, type Job } from "bullmq";

import { prisma } from "../config/db";
import { getRedisConnection } from "../config/redisConnection";
import { logger } from "../config/logger";
import { autoSelectAndCreate } from "../modules/shipping/router";

export const SHIPPING_RETRY_QUEUE = "shipping-retry";
const RETRY_DELAY_MS = 30 * 60 * 1000;
const MAX_AUTO_RETRIES = 3;

let queue: Queue | null = null;
let worker: Worker | null = null;

function getQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queue) {
    queue = new Queue(SHIPPING_RETRY_QUEUE, { connection: conn });
  }
  return queue;
}

export async function scheduleShippingRetry(orderId: string): Promise<void> {
  const q = getQueue();
  if (!q) {
    logger.warn("shipping_retry_queue_disabled", { orderId, reason: "REDIS_URL not set" });
    return;
  }
  await q.add(
    "retry",
    { orderId },
    {
      delay: RETRY_DELAY_MS,
      attempts: MAX_AUTO_RETRIES,
      backoff: { type: "exponential", delay: RETRY_DELAY_MS },
      jobId: `shipping-retry-${orderId}`,
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
  logger.info("shipping_retry_scheduled", { orderId });
}

async function processRetry(job: Job<{ orderId: string }>): Promise<void> {
  const { orderId } = job.data;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      shippingLastError: true,
      shipments: { take: 1, select: { id: true } }
    }
  });

  if (
    !order ||
    !["PAID", "PROCESSING", "PACKED"].includes(order.status) ||
    order.shipments.length > 0
  ) {
    logger.info("shipping_retry_skipped", { orderId, reason: "already_handled" });
    return;
  }

  const result = await autoSelectAndCreate(orderId);
  if (!result.success) {
    logger.warn("shipping_retry_failed", { orderId, error: result.error, code: result.code });
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { shippingLastError: null, shippingLastErrorAt: null }
  });
  logger.info("shipping_retry_attempted", { orderId, waybill: result.data.waybill });
}

export function startShippingRetryWorker(): void {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("shipping_retry_worker_skipped", { reason: "REDIS_URL not set" });
    return;
  }
  if (worker) return;

  worker = new Worker(SHIPPING_RETRY_QUEUE, (job) => processRetry(job), { connection: conn });
  worker.on("failed", (job, err) => {
    logger.error("shipping_retry_job_failed", { jobId: job?.id, err });
  });
  logger.info("shipping_retry_worker_started");
}
