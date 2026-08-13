/**
 * Lightsail catalog counts — products, variants, duplicates.
 *
 * Usage (on Lightsail):
 *   cd ~/sarveda/backend && npx tsx scripts/catalog-audit-lightsail.ts
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

function normName(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const [
    productsActive,
    productsDraft,
    productsArchived,
    productsHidden,
    productsDeleted,
    variantsActive,
    variantsInactive,
    allProducts,
    allVariants,
  ] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.product.count({ where: { deletedAt: null, status: "DRAFT" } }),
    prisma.product.count({ where: { deletedAt: null, status: "ARCHIVED" } }),
    prisma.product.count({ where: { deletedAt: null, catalogHidden: true } }),
    prisma.product.count({ where: { deletedAt: { not: null } } }),
    prisma.productVariant.count({ where: { status: "ACTIVE" } }),
    prisma.productVariant.count({ where: { status: "INACTIVE" } }),
    prisma.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        catalogHidden: true,
        _count: { select: { variants: true } },
        variants: { select: { status: true } },
      },
    }),
    prisma.productVariant.findMany({
      select: {
        sku: true,
        status: true,
        productRel: { select: { deletedAt: true, status: true, catalogHidden: true } },
      },
    }),
  ]);

  const storefrontProducts = allProducts.filter(
    (p) =>
      p.status === "ACTIVE" &&
      !p.catalogHidden &&
      !p.slug.startsWith("course-checkout-") &&
      p.variants.some((v) => v.status === "ACTIVE")
  ).length;

  const storefrontVariants = allVariants.filter(
    (v) =>
      v.status === "ACTIVE" &&
      !v.productRel.deletedAt &&
      v.productRel.status === "ACTIVE" &&
      !v.productRel.catalogHidden
  ).length;

  const activeVariantsOnActiveProducts = allVariants.filter(
    (v) =>
      v.status === "ACTIVE" &&
      !v.productRel.deletedAt &&
      v.productRel.status === "ACTIVE"
  ).length;

  const inactiveVariantsOnActiveProducts = allVariants.filter(
    (v) =>
      v.status === "INACTIVE" &&
      !v.productRel.deletedAt &&
      v.productRel.status === "ACTIVE"
  ).length;

  const emptyActiveProducts = allProducts.filter(
    (p) =>
      p.status === "ACTIVE" &&
      !p.catalogHidden &&
      !p.variants.some((v) => v.status === "ACTIVE")
  );

  // Duplicate product names (same normalized name, 2+ products)
  const byName = new Map<string, Array<{ slug: string; status: string; catalogHidden: boolean }>>();
  for (const p of allProducts) {
    const key = normName(p.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push({ slug: p.slug, status: p.status, catalogHidden: p.catalogHidden });
    byName.set(key, list);
  }
  const duplicateNames = [...byName.entries()]
    .filter(([name, rows]) => rows.length > 1 && !name.includes("course-checkout"))
    .sort((a, b) => b[1].length - a[1].length);

  // Duplicate slugs shouldn't exist; check anyway among non-deleted
  const bySlug = new Map<string, number>();
  for (const p of allProducts) {
    bySlug.set(p.slug, (bySlug.get(p.slug) ?? 0) + 1);
  }
  const duplicateSlugs = [...bySlug.entries()].filter(([, n]) => n > 1);

  console.log(JSON.stringify({
    products: {
      active: productsActive,
      draft: productsDraft,
      archived: productsArchived,
      catalogHidden: productsHidden,
      deleted: productsDeleted,
      totalNonDeleted: allProducts.length,
      storefrontVisible: storefrontProducts,
      activeButNoActiveVariants: emptyActiveProducts.length,
    },
    variants: {
      active: variantsActive,
      inactive: variantsInactive,
      total: variantsActive + variantsInactive,
      activeOnActiveProduct: activeVariantsOnActiveProducts,
      inactiveOnActiveProduct: inactiveVariantsOnActiveProducts,
      storefrontVisible: storefrontVariants,
    },
    duplicates: {
      duplicateNameGroups: duplicateNames.length,
      duplicateNameProducts: duplicateNames.reduce((n, [, r]) => n + r.length, 0),
      duplicateSlugGroups: duplicateSlugs.length,
    },
  }, null, 2));

  if (duplicateNames.length) {
    console.log("\n--- Duplicate product names (top 20 groups) ---");
    for (const [name, rows] of duplicateNames.slice(0, 20)) {
      console.log(`\n"${name}" (${rows.length} products)`);
      for (const r of rows) {
        console.log(`  - ${r.slug} [${r.status}${r.catalogHidden ? ", hidden" : ""}]`);
      }
    }
    if (duplicateNames.length > 20) {
      console.log(`\n... +${duplicateNames.length - 20} more name groups`);
    }
  }

  if (emptyActiveProducts.length) {
    console.log("\n--- Active products with zero active variants (sample 10) ---");
    for (const p of emptyActiveProducts.slice(0, 10)) {
      console.log(`  ${p.slug} (${p.name})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
