import { app } from "./app";
import { initSentry } from "./config/sentry";
import { validateFirebaseConfig } from "./config/firebase";
import { startEmailWorker } from "./jobs/emailQueue";
import { startAbandonedNotificationWorker } from "./jobs/abandonedNotificationJob";
import { startCartCleanupWorker } from "./jobs/cartCleanupJob";
import { startAmazonMarketplaceSyncJob } from "./jobs/amazonMarketplaceSyncJob";
import { startEtsyMarketplaceSyncJob } from "./jobs/etsyMarketplaceSyncJob";
import { startFlipkartMarketplaceSyncJob } from "./jobs/flipkartMarketplaceSyncJob";
import { startPaymentTimeoutWorker } from "./jobs/paymentTimeoutJob";
import { startDueDateReminderWorker } from "./jobs/taskDueDateJob";
import { startShippingRetryWorker } from "./jobs/shippingRetryJob";
import { startTrackingSyncWorker } from "./jobs/trackingSyncJob";
import { startZohoStockSyncWorker } from "./jobs/zohoStockSyncJob";
import { warnZohoStockPushConfig } from "./modules/zoho/zoho-items";

void initSentry();

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  process.stdout.write(`Sarveda backend running on http://localhost:${port}\n`);
  validateFirebaseConfig();
  startPaymentTimeoutWorker();
  startDueDateReminderWorker();
  startShippingRetryWorker();
  startEmailWorker();
  startAbandonedNotificationWorker();
  startAmazonMarketplaceSyncJob();
  startEtsyMarketplaceSyncJob();
  startFlipkartMarketplaceSyncJob();
  void startTrackingSyncWorker();
  void startZohoStockSyncWorker();
  void startCartCleanupWorker();
  warnZohoStockPushConfig();
});
