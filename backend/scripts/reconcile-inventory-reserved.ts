/**
 * One-off / ops: realign Inventory.reserved to PENDING_PAYMENT holds.
 * Usage: npx tsx scripts/reconcile-inventory-reserved.ts [--dry-run]
 */
import {
  getReservedStockSummary,
  reconcileInventoryReserved
} from "../src/modules/orders/inventory-reserved-reconcile.service";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const before = await getReservedStockSummary();
  console.log("BEFORE", before);
  const result = await reconcileInventoryReserved({ dryRun });
  console.log(
    dryRun ? "DRY_RUN" : "REPAIRED",
    JSON.stringify(
      {
        repairedCount: result.repaired.length,
        unchanged: result.unchanged,
        repaired: result.repaired,
        summaryAfter: result.summaryAfter
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
