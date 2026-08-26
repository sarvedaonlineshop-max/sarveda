/**
 * Hide accounting test products from the storefront (catalogHidden=true).
 * Does not delete data — admin inventory/accounting can still reference variants.
 *
 *   npx tsx scripts/hide-accounting-test-products.ts
 *   npx tsx scripts/hide-accounting-test-products.ts --apply
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import {
  isAccountingTestProductSku,
  isAccountingTestProductSlug
} from "../src/modules/admin/launch-order-rules";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      catalogHidden: true,
      variants: { select: { sku: true } }
    }
  });

  const targets = products.filter(
    (p) =>
      isAccountingTestProductSlug(p.slug) ||
      p.name.toLowerCase().includes("accounting test") ||
      p.variants.some((v) => isAccountingTestProductSku(v.sku))
  );

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`Accounting test products matched: ${targets.length}`);
  for (const p of targets) {
    console.log(`  ${p.slug}  hidden=${p.catalogHidden}  ${p.name}`);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to set catalogHidden=true.");
    return;
  }

  if (!targets.length) {
    console.log("Nothing to update.");
    return;
  }

  const res = await prisma.product.updateMany({
    where: { id: { in: targets.map((p) => p.id) } },
    data: { catalogHidden: true }
  });

  console.log(`Updated ${res.count} products (catalogHidden=true). Storefront /shop will exclude them.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
