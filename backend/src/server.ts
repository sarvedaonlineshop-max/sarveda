import { app } from "./app";
import { initSentry } from "./config/sentry";
import { startAbandonedNotificationWorker } from "./jobs/abandonedNotificationJob";
import { startPaymentTimeoutWorker } from "./jobs/paymentTimeoutJob";
import { startTrackingSyncWorker } from "./jobs/trackingSyncJob";
import { startZohoStockSyncWorker } from "./jobs/zohoStockSyncJob";

void initSentry();

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  process.stdout.write(`Sarveda backend running on http://localhost:${port}\n`);
  startPaymentTimeoutWorker();
  startAbandonedNotificationWorker();
  void startTrackingSyncWorker();
  void startZohoStockSyncWorker();
});
