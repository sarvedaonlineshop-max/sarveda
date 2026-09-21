/**
 * Provision a store ADMIN + Tasks/Chats whitelist member.
 *
 * Usage (Lightsail):
 *   cd backend && npm run provision:admin -- sowmya@sarveda.com Sowmya --reset-password
 *
 * Default password is the team whitelist password. Never commit a one-off secret.
 */
import { provisionStoreAdmin } from "../src/modules/complaints/whitelist-auth";
import { prisma } from "../src/config/db";

function parseArgs(argv: string[]) {
  const resetPassword = argv.includes("--reset-password");
  const positional = argv.filter((arg) => arg !== "--reset-password");
  const email = positional[0]?.trim().toLowerCase();
  const name = positional.slice(1).join(" ").trim() || undefined;
  return { email, name, resetPassword };
}

async function main() {
  const { email, name, resetPassword } = parseArgs(process.argv.slice(2));
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run provision:admin -- email@sarveda.com [Name] [--reset-password]");
    process.exit(1);
  }

  const result = await provisionStoreAdmin({ email, name, resetPassword });
  console.log(
    `Provisioned ${result.email} (userId=${result.userId}, created=${result.created}, promoted=${result.promoted})`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
