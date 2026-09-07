/**
 * Set India standardAdditional = ₹3 (300 paise) on Test Product + Dummy Product variants.
 *   npx tsx scripts/set-test-dummy-additional-shipping.ts
 */
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const SLUGS = ["test-product", "dummy-product"] as const;
const ADDITIONAL_PAISE = 300;

async function main() {
  for (const slug of SLUGS) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: { variants: { select: { id: true, sku: true } } }
    });
    if (!product) {
      console.log(`skip missing ${slug}`);
      continue;
    }
    for (const v of product.variants) {
      const updated = await prisma.variantShippingRate.updateMany({
        where: { variantId: v.id, country: "IN" },
        data: {
          standardAdditional: ADDITIONAL_PAISE,
          expeditedAdditional: ADDITIONAL_PAISE
        }
      });
      console.log(`${slug} ${v.sku}: updated ${updated.count} IN rate(s) additional=${ADDITIONAL_PAISE}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
