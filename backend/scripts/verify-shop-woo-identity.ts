#!/usr/bin/env tsx
import { prisma } from "../src/config/db";
import { shopInventoryWhere } from "../src/utils/shop-catalog";

async function main() {
  const shop = await prisma.inventory.count({ where: shopInventoryWhere });
  const publish = await prisma.merchantCtxOffer.count({
    where: { classification: "PUBLISH", sarvedaVariantId: { not: null } }
  });
  const withWoo = await prisma.productVariant.count({
    where: {
      status: "ACTIVE",
      wooCommerceVariationId: { not: null },
      productRel: { deletedAt: null, catalogHidden: false, status: { not: "DRAFT" } },
      inventory: { isNot: null }
    }
  });
  const missing = await prisma.productVariant.findMany({
    where: {
      status: "ACTIVE",
      wooCommerceVariationId: null,
      productRel: { deletedAt: null, catalogHidden: false, status: { not: "DRAFT" } },
      inventory: { isNot: null }
    },
    select: { sku: true, productRel: { select: { slug: true } } },
    orderBy: { sku: "asc" }
  });

  const polished = await prisma.productVariant.findMany({
    where: { sku: { startsWith: "MI-SB-HP-" } },
    select: { sku: true, wooCommerceVariationId: true },
    orderBy: { sku: "asc" }
  });

  console.log(
    JSON.stringify(
      {
        shop_inventory: shop,
        ctx_publish_linked: publish,
        shop_variants_with_woo_id: withWoo,
        shop_variants_missing_woo_id: missing.length,
        missing_skus: missing.map((m) => m.sku),
        polished_bowls: polished
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
