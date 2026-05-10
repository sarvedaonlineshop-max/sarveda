import { PrismaClient } from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import path from "path";

loadDotenv({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

/** Same fallback as prisma/seed.ts when Woo CSV omits quantities. */
const DEFAULT_ON_HAND = 999;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INVENTORY_REPLENISH !== "1") {
    console.error("Refusing to run in production without ALLOW_INVENTORY_REPLENISH=1.");
    process.exit(1);
  }

  const result = await prisma.inventory.updateMany({
    where: {
      onHand: { lt: 1 },
      variant: {
        status: "ACTIVE",
        productRel: { status: "ACTIVE", deletedAt: null }
      }
    },
    data: { onHand: DEFAULT_ON_HAND }
  });

  console.log(`Replenished onHand for ${result.count} inventory row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
