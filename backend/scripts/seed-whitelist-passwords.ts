/**
 * Set default password (sarveda123) and ADMIN role on all active whitelist entries.
 * Creates matching User rows when missing.
 *
 * Usage: cd backend && npx tsx scripts/seed-whitelist-passwords.ts
 */
import { prisma } from "../src/config/db";
import {
  COMPLAINT_DEFAULT_PASSWORD,
  provisionWhitelistCredentials
} from "../src/modules/complaints/whitelist-auth";

async function main() {
  const rows = await prisma.complaintWhitelist.findMany({
    where: { isActive: true },
    orderBy: { addedAt: "asc" }
  });

  if (rows.length === 0) {
    console.log("No active whitelist entries found.");
    return;
  }

  console.log(`Provisioning ${rows.length} whitelist member(s) with default password…`);

  for (const row of rows) {
    const updated = await provisionWhitelistCredentials(row, {
      resetPassword: !row.passwordHash
    });
    console.log(`  ✓ ${updated.email} (${updated.role})`);
  }

  console.log(`\nDone. Default password for new setups: ${COMPLAINT_DEFAULT_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
