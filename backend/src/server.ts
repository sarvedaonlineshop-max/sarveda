import { app } from "./app";
import { startPaymentTimeoutWorker } from "./jobs/paymentTimeoutJob";

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  process.stdout.write(`Sarveda backend running on http://localhost:${port}\n`);
  startPaymentTimeoutWorker();
});
