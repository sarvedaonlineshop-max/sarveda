#!/usr/bin/env tsx
/**
 * Batch 2 corrections: restore etched gong plates; hide duplicate incense stand.
 *
 *   npx tsx scripts/apply-shop-only-corrections-batch2.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

import { prisma } from "../src/config/db";
import { shopInventoryWhere } from "../src/utils/shop-catalog";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "../..");
const MANIFEST = path.join(
  REPO,
  "docs/audit/google-merchant-native-compatibility/shop_only_resolutions_batch2.json"
);
const OUT = path.join(REPO, "docs/audit/google-merchant-native-compatibility");

type Manifest = {
  reactivate_variants: {
    skus: string[];
    reason: string;
    restore_inventory_on_hand: number;
  };
  hide_products: Array<{ slug: string; reason: string }>;
  clear_woo_identity: Array<{ sku: string; reason: string }>;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  const log: Array<Record<string, unknown>> = [];

  for (const sku of manifest.reactivate_variants.skus) {
    const variant = await prisma.productVariant.findFirst({
      where: { sku },
      select: { id: true, sku: true, status: true, inventory: true }
    });
    if (!variant) {
      log.push({ action: "reactivate", sku, status: "skip", reason: "NOT_FOUND" });
      continue;
    }
    if (!dryRun) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: "ACTIVE" }
      });
      if (!variant.inventory) {
        await prisma.inventory.create({
          data: {
            variantId: variant.id,
            onHand: manifest.reactivate_variants.restore_inventory_on_hand,
            reserved: 0
          }
        });
      }
    }
    log.push({
      action: "reactivate",
      sku,
      status: dryRun ? "dry_run" : "applied",
      reason: manifest.reactivate_variants.reason
    });
  }

  for (const row of manifest.hide_products) {
    const product = await prisma.product.findFirst({
      where: { slug: row.slug },
      select: { id: true, slug: true, variants: { select: { id: true } } }
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
    log.push({ action: "hide_product", slug: row.slug, status: dryRun ? "dry_run" : "applied", reason: row.reason });
  }

  for (const row of manifest.clear_woo_identity) {
    const variant = await prisma.productVariant.findFirst({
      where: { sku: row.sku },
      select: { id: true, sku: true, wooCommerceVariationId: true }
    });
    if (!variant) {
      log.push({ action: "clear_woo", sku: row.sku, status: "skip", reason: "NOT_FOUND" });
      continue;
    }
    if (!dryRun) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { wooCommerceVariationId: null }
      });
    }
    log.push({
      action: "clear_woo",
      sku: row.sku,
      status: dryRun ? "dry_run" : "applied",
      from: variant.wooCommerceVariationId,
      reason: row.reason
    });
  }

  const summary = {
    dryRun,
    shop_inventory: await prisma.inventory.count({ where: shopInventoryWhere }),
    publish_registry_linked: await prisma.merchantCtxOffer.count({
      where: { classification: "PUBLISH", sarvedaVariantId: { not: null } }
    }),
    actions: log
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "shop_only_resolutions_batch2_apply.json"), JSON.stringify(summary, null, 2));
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
