import { Queue, Worker } from "bullmq";

import { logger } from "../config/logger";
import { getRedisConnection } from "../config/redisConnection";
import { processDueEnquiryFollowUps } from "../modules/enquiries/enquiry-follow-up.service";

const QUEUE_NAME = "enquiry-follow-ups";
const REPEAT_EVERY_MS = 30 * 1000;

let queue: Queue | null = null;

function getQueue(): Queue | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

export async function startEnquiryFollowUpWorker(): Promise<void> {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn("enquiry_follow_up_worker_skipped_no_redis");
    return;
  }

  const q = getQueue();
  if (!q) return;

  await q.add(
    "poll",
    {},
    {
      repeat: { every: REPEAT_EVERY_MS },
      jobId: "enquiry-follow-up-repeat"
    }
  );

  new Worker(
    QUEUE_NAME,
    async () => {
      await processDueEnquiryFollowUps();
    },
    { connection, concurrency: 1 }
  );

  logger.info("enquiry_follow_up_worker_started", { everyMs: REPEAT_EVERY_MS });
}
