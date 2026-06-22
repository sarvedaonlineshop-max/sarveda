/**
 * Hide Svaram Sound Ships from storefront catalog (slug: svaram-sound-ships).
 * Run: cd backend && npx tsx scripts/archive-svaram-product.ts
 */
import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SLUG = "svaram-sound-ships";
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findFirst({
    where: { slug: SLUG, deletedAt: null }
  });
  if (!product) {
    console.log(`Product ${SLUG} not found — nothing to do.`);
    return;
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { catalogHidden: true, status: "ARCHIVED" }
  });
  console.log(`Archived and hidden: ${product.name} (${product.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
