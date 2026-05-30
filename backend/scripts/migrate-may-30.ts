/**
 * Full May-30 WooCommerce → Sarveda migration (no SEO).
 *
 * Usage:
 *   npx tsx scripts/migrate-may-30.ts --dry-run
 *   npx tsx scripts/migrate-may-30.ts --skip-flush
 *   npx tsx scripts/migrate-may-30.ts --only=users,orders
 *
 * On EC2 (after git pull):
 *   npx prisma migrate deploy
 *   npm run migrate:may-30
 */
import { execSync } from "child_process";
import path from "path";

const dryRun = process.argv.includes("--dry-run");
const skipFlush = process.argv.includes("--skip-flush");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.split("=")[1]!.split(",").map((s) => s.trim())) : null;

const backendDir = path.resolve(__dirname, "..");
const dry = dryRun ? " --dry-run" : "";

function run(label: string, script: string) {
  if (only && !only.has(label)) return;
  console.log(`\n=== ${label} ===`);
  execSync(`npx tsx scripts/${script}${dry}`, {
    cwd: backendDir,
    stdio: "inherit",
    env: process.env
  });
}

function npmRun(cmd: string) {
  console.log(`\n=== ${cmd} ===`);
  execSync(`npm run ${cmd}${dryRun ? " -- --dry-run" : ""}`, {
    cwd: backendDir,
    stdio: "inherit",
    env: process.env
  });
}

async function main() {
  console.log("Sarveda May-30 migration", dryRun ? "(DRY RUN)" : "");
  console.log("Data dir:", process.env.SARVEDA_DATA_DIR ?? "data/May-30");

  if (!skipFlush && !dryRun && (!only || only.has("flush"))) {
    run("flush", "flush-transactional-data.ts");
  }

  if (!only || only.has("users")) run("users", "import-users-wc-csv.ts");
  if (!only || only.has("content")) npmRun("import:full");
  if (!only || only.has("variations")) npmRun("import:variations");
  if (!only || only.has("reviews")) run("reviews", "import-reviews-from-products.ts");
  if (!only || only.has("orders")) run("orders", "import-orders-wxr.ts");
  if (!only || only.has("refunds")) run("refunds", "import-refunds-wxr.ts");
  if (!only || only.has("media")) {
    if (!dryRun) npmRun("sync:audio");
    if (!dryRun) npmRun("sync:galleries");
  }

  console.log("\nDone. Next: verify admin orders + spot-check PDP reviews.");
  console.log(
    "Note: Woo order XML has no line items — request WooCommerce Orders CSV export for SKU-level history if needed."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
