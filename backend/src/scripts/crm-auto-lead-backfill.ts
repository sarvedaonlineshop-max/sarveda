import dotenv from "dotenv";

dotenv.config();

async function main() {
  const { backfillAutoLeads } = await import("../modules/crm/auto-lead");
  const { prisma } = await import("../config/db");
  const result = await backfillAutoLeads();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
