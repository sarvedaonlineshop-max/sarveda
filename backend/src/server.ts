import { app } from "./app";

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  process.stdout.write(`Sarveda backend running on http://localhost:${port}\n`);
});
