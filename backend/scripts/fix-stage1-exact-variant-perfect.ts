/**
 * Stage 1: mapped products with exact variant names + perfect count.
 * - Rename product name (and slug if free) from sheet
 * - Update variant SKUs from sheet
 *
 * Usage:
 *   npx tsx scripts/fix-stage1-exact-variant-perfect.ts
 *   npx tsx scripts/fix-stage1-exact-variant-perfect.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const BATCH = path.join(__dirname, "../../data/compare/stage1-apply-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-stage1-backups");

type BatchItem = {
  productId: string;
  dbName: string;
  sheetName: string;
  dbSlug: string;
  sheetSlug: string;
  rename: boolean;
  skuUpdates: Array<{ variantId: string; from: string; to: string; variant: string }>;
};

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH, "utf8")) as BatchItem[];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Record<string, unknown>[] = [];

  for (const item of batch) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, deletedAt: null },
      include: { variants: true },
    });
    if (!product) {
      console.error("MISSING", item.dbName);
      continue;
    }

    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${product.slug}.json`),
      JSON.stringify(
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          variants: product.variants.map((v) => ({ id: v.id, sku: v.sku, status: v.status })),
        },
        null,
        2
      )
    );

    const actions: string[] = [];
    let renamed = false;
    let slugUpdated = false;
    let skuUpdated = 0;

    if (item.rename && product.name !== item.sheetName) {
      actions.push(`RENAME "${product.name}" -> "${item.sheetName}"`);
      renamed = true;
      if (APPLY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { name: item.sheetName },
        });
      }
    }

    if (product.slug !== item.sheetSlug) {
      const clash = await prisma.product.findFirst({
        where: { slug: item.sheetSlug, NOT: { id: product.id }, deletedAt: null },
      });
      if (clash) {
        actions.push(`SLUG KEEP "${product.slug}" (target "${item.sheetSlug}" taken by ${clash.name})`);
      } else {
        actions.push(`SLUG "${product.slug}" -> "${item.sheetSlug}"`);
        slugUpdated = true;
        if (APPLY) {
          await prisma.product.update({
            where: { id: product.id },
            data: { slug: item.sheetSlug },
          });
        }
      }
    }

    for (const u of item.skuUpdates) {
      const v = product.variants.find((x) => x.id === u.variantId);
      if (!v) {
        actions.push(`MISS variant ${u.variantId}`);
        continue;
      }
      if (v.sku === u.to) continue;
      const clash = await prisma.productVariant.findFirst({
        where: { sku: u.to, NOT: { id: v.id } },
      });
      if (clash) {
        actions.push(`SKU CONFLICT ${u.from} -> ${u.to} (held elsewhere)`);
        continue;
      }
      actions.push(`SKU ${u.from} -> ${u.to} (${u.variant || "blank"})`);
      skuUpdated += 1;
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { sku: u.to },
        });
      }
    }

    summary.push({
      sheetName: item.sheetName,
      dbName: item.dbName,
      renamed,
      slugUpdated,
      skuUpdated,
      mode: APPLY ? "APPLY" : "DRY_RUN",
      actions,
    });
    console.log(
      `\n=== ${item.sheetName} === rename=${renamed} slug=${slugUpdated} skus=${skuUpdated}`
    );
    for (const a of actions) console.log(" ", a);
  }

  const out = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`Summary: ${out}`);
  console.log(
    `Totals: products=${batch.length} renames=${summary.filter((s: any) => s.renamed).length} skuUpdates=${summary.reduce((n: number, s: any) => n + s.skuUpdated, 0)}`
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
