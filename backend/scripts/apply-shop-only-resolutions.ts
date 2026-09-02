#!/usr/bin/env tsx
/**
 * Apply shop-only SKU resolutions (identity backfill, hide duplicates, deactivate etched gong plates).
 *
 *   npx tsx scripts/apply-shop-only-resolutions.ts --dry-run
 *   npx tsx scripts/apply-shop-only-resolutions.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { prisma } from "../src/config/db";
import { shopInventoryWhere } from "../src/utils/shop-catalog";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const DEFAULT_MANIFEST = path.join(
  REPO,
  "docs/audit/google-merchant-native-compatibility/shop_only_resolutions_batch1.json"
);
const OUT = path.join(REPO, "docs/audit/google-merchant-native-compatibility");

type Manifest = {
  identity_backfills: Array<{ sku: string; wooCommerceVariationId: number; notes?: string }>;
  product_woo_backfills?: Array<{ slug: string; wooCommerceId: number; notes?: string }>;
  deactivate_variants: { skus: string[]; reason: string };
  hide_products: Array<{ slug: string; reason: string }>;
};

function loadManifest(filePath: string): Manifest {
  return JSON.parse(readFileSync(filePath, "utf8")) as Manifest;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  const manifest = loadManifest(fileArg?.slice("--file=".length) || DEFAULT_MANIFEST);

  const log: Array<Record<string, unknown>> = [];

  for (const row of manifest.identity_backfills) {
    const variant = await prisma.productVariant.findFirst({
      where: { sku: row.sku },
      select: { id: true, sku: true, wooCommerceVariationId: true }
    });
    if (!variant) {
      log.push({ action: "identity", sku: row.sku, status: "skip", reason: "SKU_NOT_FOUND" });
      continue;
    }
    const owner = await prisma.productVariant.findFirst({
      where: {
        wooCommerceVariationId: row.wooCommerceVariationId,
        NOT: { id: variant.id }
      },
      select: { id: true, sku: true }
    });
    if (owner) {
      log.push({
        action: "identity",
        sku: row.sku,
        status: "skip",
        reason: "WOO_ID_OWNED",
        ownerSku: owner.sku
      });
      continue;
    }
    if (variant.wooCommerceVariationId === row.wooCommerceVariationId) {
      log.push({ action: "identity", sku: row.sku, status: "unchanged", wooId: row.wooCommerceVariationId });
      continue;
    }
    if (!dryRun) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { wooCommerceVariationId: row.wooCommerceVariationId }
      });
    }
    log.push({
      action: "identity",
      sku: row.sku,
      status: dryRun ? "dry_run" : "applied",
      from: variant.wooCommerceVariationId,
      to: row.wooCommerceVariationId,
      notes: row.notes
    });
  }

  for (const sku of manifest.deactivate_variants.skus) {
    const variant = await prisma.productVariant.findFirst({
      where: { sku },
      select: { id: true, sku: true, status: true }
    });
    if (!variant) {
      log.push({ action: "deactivate", sku, status: "skip", reason: "SKU_NOT_FOUND" });
      continue;
    }
    if (!dryRun) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: "INACTIVE" }
      });
      await prisma.inventory.deleteMany({ where: { variantId: variant.id } });
    }
    log.push({
      action: "deactivate",
      sku,
      status: dryRun ? "dry_run" : "applied",
      reason: manifest.deactivate_variants.reason
    });
  }

  for (const row of manifest.product_woo_backfills ?? []) {
    const product = await prisma.product.findFirst({
      where: { slug: row.slug },
      select: { id: true, slug: true, wooCommerceId: true }
    });
    if (!product) {
      log.push({ action: "product_woo", slug: row.slug, status: "skip", reason: "NOT_FOUND" });
      continue;
    }
    const owner = await prisma.product.findFirst({
      where: {
        wooCommerceId: row.wooCommerceId,
        NOT: { id: product.id }
      },
      select: { id: true, slug: true }
    });
    if (owner) {
      log.push({
        action: "product_woo",
        slug: row.slug,
        status: "skip",
        reason: "WOO_ID_OWNED",
        ownerSlug: owner.slug
      });
      continue;
    }
    if (product.wooCommerceId === row.wooCommerceId) {
      log.push({
        action: "product_woo",
        slug: row.slug,
        status: "unchanged",
        wooId: row.wooCommerceId
      });
      continue;
    }
    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: { wooCommerceId: row.wooCommerceId }
      });
    }
    log.push({
      action: "product_woo",
      slug: row.slug,
      status: dryRun ? "dry_run" : "applied",
      from: product.wooCommerceId,
      to: row.wooCommerceId,
      notes: row.notes
    });
  }

  for (const row of manifest.hide_products) {
    const product = await prisma.product.findFirst({
      where: { slug: row.slug },
      select: { id: true, slug: true, catalogHidden: true, variants: { select: { id: true } } }
    });
    if (!product) {
      log.push({ action: "hide_product", slug: row.slug, status: "skip", reason: "NOT_FOUND" });
      continue;
    }
    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: { catalogHidden: true }
      });
      await prisma.productVariant.updateMany({
        where: { productId: product.id },
        data: { status: "INACTIVE" }
      });
      await prisma.inventory.deleteMany({
        where: { variantId: { in: product.variants.map((v) => v.id) } }
      });
    }
    log.push({
      action: "hide_product",
      slug: row.slug,
      status: dryRun ? "dry_run" : "applied",
      reason: row.reason
    });
  }

  const shopInv = await prisma.inventory.count({ where: shopInventoryWhere });
  const publishActive = await prisma.merchantCtxOffer.count({
    where: { classification: "PUBLISH", sarvedaVariantId: { not: null } }
  });

  const summary = {
    dryRun,
    shop_inventory: shopInv,
    publish_registry_linked: publishActive,
    actions: log
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    path.join(OUT, "shop_only_resolutions_apply.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
