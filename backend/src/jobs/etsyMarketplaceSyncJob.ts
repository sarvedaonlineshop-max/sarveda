import { isEtsyConfigured } from "../config/etsy";
import { logger } from "../config/logger";
import { syncEtsyMarketplace } from "../modules/marketplaces/etsy/etsy-sync";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runAutoSync() {
  if (running || !isEtsyConfigured()) return;
  running = true;
  try {
    await syncEtsyMarketplace({ maxPages: 25 });
  } catch (err) {
    logger.error("etsy_auto_sync_failed", { err });
  } finally {
    running = false;
  }
}

export function startEtsyMarketplaceSyncJob() {
  if (timer) return;
  if (!isEtsyConfigured()) {
    logger.info("etsy_auto_sync_skipped", { reason: "not_configured" });
    return;
  }

  const intervalMinutes = Number(process.env.ETSY_SYNC_EVERY_MINUTES ?? 30);
  void runAutoSync();

  timer = setInterval(() => {
    void runAutoSync();
  }, Math.max(10, intervalMinutes) * 60 * 1000);

  logger.info("etsy_auto_sync_started", { intervalMinutes });
}
