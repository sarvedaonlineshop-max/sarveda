import { seedAccountingChartOfAccounts } from "../src/modules/accounting/seed-coa";

async function main() {
  const result = await seedAccountingChartOfAccounts();
  console.info("[seed:accounting-coa]", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
