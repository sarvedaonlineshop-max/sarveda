import { logger } from "../config/logger";
import { isAmazonSpConfigured } from "../config/amazon";
import { startAmazonMarketplaceSync } from "../modules/marketplaces/amazon/amazon-orders-sync";

let ordersTimer: NodeJS.Timeout | null = null;
let catalogTimer: NodeJS.Timeout | null = null;

function kickAutoSync(monthsBack: number) {
  if (!isAmazonSpConfigured()) return;
  const result = startAmazonMarketplaceSync({
    monthsBack,
    includeShipped: true,
    maxPagesPerMonth: 8
  });
  if (!result.started) {
    logger.info("amazon_auto_sync_skipped", { reason: result.message });
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

  // Recent months only for frequent auto sync; full history via manual Sync now.
  void kickAutoSync(3);

  ordersTimer = setInterval(() => {
    void kickAutoSync(2);
  }, Math.max(5, ordersMinutes) * 60 * 1000);

  catalogTimer = setInterval(() => {
    void kickAutoSync(3);
  }, Math.max(30, catalogMinutes) * 60 * 1000);

  logger.info("amazon_auto_sync_started", { ordersMinutes, catalogMinutes });
}
