import { logger } from "../config/logger";
import { isAmazonSpConfigured } from "../config/amazon";
import { syncAmazonMarketplace } from "../modules/marketplaces/amazon/amazon-orders-sync";

let ordersTimer: NodeJS.Timeout | null = null;
let catalogTimer: NodeJS.Timeout | null = null;
let running = false;

async function runAutoSync(daysBack: number) {
  if (running || !isAmazonSpConfigured()) return;
  running = true;
  try {
    await syncAmazonMarketplace({
      daysBack,
      includeShipped: true,
      maxPages: 25
    });
  } catch (err) {
    logger.error("amazon_auto_sync_failed", { err });
  } finally {
    running = false;
  }
}

export function startAmazonMarketplaceSyncJob() {
  if (ordersTimer || catalogTimer) return;
  if (!isAmazonSpConfigured()) {
    logger.info("amazon_auto_sync_skipped", { reason: "not_configured" });
    return;
  }

  const ordersMinutes = Number(process.env.AMAZON_SYNC_ORDERS_EVERY_MINUTES ?? 15);
  const catalogMinutes = Number(process.env.AMAZON_SYNC_CATALOG_EVERY_MINUTES ?? 180);

  void runAutoSync(30);

  ordersTimer = setInterval(() => {
    void runAutoSync(30);
  }, Math.max(5, ordersMinutes) * 60 * 1000);

  catalogTimer = setInterval(() => {
    void runAutoSync(60);
  }, Math.max(30, catalogMinutes) * 60 * 1000);

  logger.info("amazon_auto_sync_started", { ordersMinutes, catalogMinutes });
}
