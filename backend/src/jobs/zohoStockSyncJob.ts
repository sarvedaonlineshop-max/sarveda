import { Queue, Worker } from "bullmq";

import { logger } from "../config/logger";
import { getRedisConnection } from "../config/redisConnection";
import { syncStockFromZoho } from "../modules/zoho/zoho-inventory";
import { isZohoInventorySyncEnabled } from "../modules/zoho/zoho-inventory-sync-flag";

const QUEUE_NAME = "zoho_stock_sync";
/** 2:00 AM IST daily */
const CRON_PATTERN = "0 0 2 * * *";
const CRON_TZ = "Asia/Kolkata";

let queue: Queue | null = null;

function getQueue(): Queue | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection });
  }
  return queue;
}

export async function startZohoStockSyncWorker(): Promise<void> {
  if (!isZohoInventorySyncEnabled()) {
    logger.info("zoho_stock_sync_worker_skipped_disabled");
    return;
  }
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn("zoho_stock_sync_worker_skipped_no_redis");
    return;
  }

  const q = getQueue();
  if (!q) return;

  await q.add(
    "zoho_stock_sync",
    {},
    {
      repeat: { pattern: CRON_PATTERN, tz: CRON_TZ },
      jobId: "zoho-stock-sync-nightly"
    }
  );

  new Worker(
    QUEUE_NAME,
    async () => {
      try {
        const result = await syncStockFromZoho();
        logger.info("zoho_stock_sync_complete", result);
      } catch (err) {
        logger.error("zoho_stock_sync_failed", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    },
    { connection, concurrency: 1 }
  );

  logger.info("zoho_stock_sync_worker_started", { pattern: CRON_PATTERN, tz: CRON_TZ });
}
