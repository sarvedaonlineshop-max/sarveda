import { logger } from "../config/logger";
import { isFlipkartConfigured } from "../config/flipkart";
import { syncFlipkartMarketplace } from "../modules/marketplaces/flipkart/flipkart-sync";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runAutoSync() {
  if (running || !isFlipkartConfigured()) return;
  running = true;
  try {
    await syncFlipkartMarketplace({ daysBack: 90, maxPages: 25 });
  } catch (err) {
    logger.error("flipkart_auto_sync_failed", { err });
  } finally {
    running = false;
  }
}

export function startFlipkartMarketplaceSyncJob() {
  if (timer) return;
  if (!isFlipkartConfigured()) {
    logger.info("flipkart_auto_sync_skipped", { reason: "not_configured" });
    return;
  }

  const intervalMinutes = Number(process.env.FLIPKART_SYNC_EVERY_MINUTES ?? 30);

  void runAutoSync();

  timer = setInterval(() => {
    void runAutoSync();
  }, Math.max(10, intervalMinutes) * 60 * 1000);

  logger.info("flipkart_auto_sync_started", { intervalMinutes });
}
