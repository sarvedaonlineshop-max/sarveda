/**
 * Test Zoho item upsert for one product (by slug).
 * Usage: PRODUCT_SLUG=svaram-sound-ships npx ts-node scripts/test-zoho-item-sync.ts
 */
import { prisma } from "../src/config/db";
import { syncProductVariantsToZoho } from "../src/modules/zoho/zoho-items";

async function main() {
  const slug = process.env.PRODUCT_SLUG?.trim();
  if (!slug) {
    console.error("Set PRODUCT_SLUG=your-product-slug");
    process.exit(1);
  }
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, name: true }
  });
  if (!product) {
    console.error("Product not found:", slug);
    process.exit(1);
  }
  console.log("Syncing Zoho items for:", product.name);
  const result = await syncProductVariantsToZoho(product.id);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
