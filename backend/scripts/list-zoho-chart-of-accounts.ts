/**
 * List Zoho Books chart-of-accounts with account_id values.
 * Use the output to set ZOHO_ADJUSTMENT_ACCOUNT_ID in backend/.env on EC2.
 *
 *   cd ~/sarveda/backend && npx tsx scripts/list-zoho-chart-of-accounts.ts
 */
import dotenv from "dotenv";
import path from "path";

// Load backend/.env (must run before zoho-client import — use dynamic import below).
dotenv.config({ path: path.resolve(__dirname, "../.env") });

type CoaRow = {
  account_id: string;
  account_name: string;
  account_type: string;
  account_code?: string;
};

async function main() {
  const { zohoGet } = await import("../src/modules/zoho/zoho-client");

  const res = await zohoGet<{ chartofaccounts: CoaRow[] }>("/chartofaccounts");
  const rows = res.chartofaccounts ?? [];

  const keywords = /inventory|cost of goods|cogs|adjustment|stock/i;
  const suggested = rows.filter((r) => keywords.test(r.account_name));

  console.log("\n=== Zoho Chart of Accounts (for ZOHO_ADJUSTMENT_ACCOUNT_ID) ===\n");
  console.log("Suggested accounts (inventory / COGS / adjustment):\n");
  if (suggested.length === 0) {
    console.log("  (none matched by name — pick Cost of Goods Sold from full list below)\n");
  } else {
    for (const r of suggested) {
      console.log(`  ${r.account_id}  |  ${r.account_name}  (${r.account_type})`);
    }
    console.log("");
  }

  console.log(`All accounts (${rows.length}):\n`);
  for (const r of rows.sort((a, b) => a.account_name.localeCompare(b.account_name))) {
    console.log(`  ${r.account_id}  |  ${r.account_name}  (${r.account_type})`);
  }

  console.log(`
Copy one account_id into ~/sarveda/backend/.env:

  ZOHO_ADJUSTMENT_ACCOUNT_ID=<account_id>

Then: cd ~/sarveda/backend && npm run build && pm2 restart sarveda-backend

Typical choice: "Cost of Goods Sold" or an "Inventory Adjustment" expense account.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
