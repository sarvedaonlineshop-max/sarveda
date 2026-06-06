import { Queue, Worker, type Job } from "bullmq";

import { getRedisConnection } from "../config/redisConnection";
import { logger } from "../config/logger";
import { notifyOrderEmail } from "../modules/notifications/email";
import { prisma } from "../config/db";
import { cancelUnpaidOrderWithRelease } from "../modules/orders/orders.service";

export const PAYMENT_TIMEOUT_QUEUE = "payment-timeout";
const DELAY_MS = 15 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;

function getQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queue) {
    queue = new Queue(PAYMENT_TIMEOUT_QUEUE, { connection: conn });
  }
  return queue;
}

export async function schedulePaymentTimeout(orderId: string): Promise<void> {
  const q = getQueue();
  if (!q) {
    logger.warn("payment_timeout_queue_disabled", { orderId, reason: "REDIS_URL not set" });
    return;
  }
  await q.add(
    "expire-pending-payment",
    { orderId },
    {
      delay: DELAY_MS,
      jobId: `payment-timeout-${orderId}`,
      removeOnComplete: true,
      removeOnFail: 100
    }
  );
  logger.info("payment_timeout_scheduled", { orderId, delayMs: DELAY_MS });
}

async function processTimeout(job: Job<{ orderId: string }>): Promise<void> {
  const { orderId } = job.data;
  // BUG 3: COD orders use paymentStatus PENDING but must not be auto-cancelled
  const codPayment = await prisma.payment.findFirst({
    where: { orderId, provider: "COD" }
  });
  if (codPayment) {
    logger.warn("payment_timeout_skipped_cod", { orderId });
    return;
  }
  const changed = await cancelUnpaidOrderWithRelease(
    orderId,
    "Payment not completed within 15 minutes — stock released",
    { source: "payment_timeout_job" }
  );
  if (changed) {
    notifyOrderEmail(orderId, "payment_failed");
    logger.info("payment_timeout_cancelled_order", { orderId });
  }
}

export function startPaymentTimeoutWorker(): void {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("payment_timeout_worker_skipped", { reason: "REDIS_URL not set" });
    return;
  }
  if (worker) return;

  worker = new Worker(PAYMENT_TIMEOUT_QUEUE, (job) => processTimeout(job), { connection: conn });
  worker.on("failed", (job, err) => {
    logger.error("payment_timeout_job_failed", { jobId: job?.id, err });
  });
  logger.info("payment_timeout_worker_started");
}
