/**
 * Set DO pair-it-with relations for Etched Chau Gongs (49115 → Gong Bags 45152, Gong Stand 45289).
 *
 * Usage: npx tsx scripts/set-etched-chau-pair-with.ts
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const FROM_WOO = 49115;
const PAIR_WITH = [
  { wooId: 45152, position: 0 },
  { wooId: 45289, position: 1 }
];

async function main(): Promise<void> {
  const from = await prisma.product.findFirst({
    where: { wooCommerceId: FROM_WOO, deletedAt: null },
    select: { id: true, slug: true, name: true }
  });
  if (!from) throw new Error(`Product woo ${FROM_WOO} not found`);

  for (const { wooId, position } of PAIR_WITH) {
    const to = await prisma.product.findFirst({
      where: { wooCommerceId: wooId, deletedAt: null },
      select: { id: true, name: true, slug: true }
    });
    if (!to) {
      console.warn(`Skip woo ${wooId} — not in LS`);
      continue;
    }
    await prisma.productRelation.upsert({
      where: {
        fromProductId_toProductId_type: {
          fromProductId: from.id,
          toProductId: to.id,
          type: "PAIR_WITH"
        }
      },
      create: {
        fromProductId: from.id,
        toProductId: to.id,
        type: "PAIR_WITH",
        position
      },
      update: { position }
    });
    console.log(`${from.slug} → ${to.slug} (${to.name})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
