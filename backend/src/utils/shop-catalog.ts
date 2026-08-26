import type { Prisma } from "@prisma/client";

/** Shop-facing catalog products (WooCommerce) — excludes hidden checkout products. */
export const shopCatalogProductWhere: Prisma.ProductWhereInput = {
  deletedAt: null,
  catalogHidden: false
};

export const shopCatalogVariantSkuWhere: Prisma.ProductVariantWhereInput = {
  NOT: {
    OR: [
      { sku: { startsWith: "COURSE-" } },
      { sku: { startsWith: "EVENT-" } },
      { sku: { startsWith: "ACCT-SKU-" } },
      { sku: { startsWith: "TEST-SKU-" } },
      { sku: { startsWith: "TEST-ACC-" } }
    ]
  }
};

export const shopInventoryWhere: Prisma.InventoryWhereInput = {
  variant: {
    ...shopCatalogVariantSkuWhere,
    productRel: shopCatalogProductWhere
  }
};

export function isShopCatalogSku(sku: string): boolean {
  return !sku.startsWith("COURSE-") && !sku.startsWith("EVENT-");
}
