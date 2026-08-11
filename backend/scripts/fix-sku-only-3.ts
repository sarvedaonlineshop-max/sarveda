/**
 * Apply sheet SKUs for 3 exact-name same-count products.
 * Usage:
 *   npx tsx scripts/fix-sku-only-3.ts
 *   npx tsx scripts/fix-sku-only-3.ts --apply
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const BATCH = path.join(__dirname, "../../data/compare/sku-only-3-apply-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-sku-only-3-backups");

type BatchItem = {
  name: string;
  slug: string;
  updates: Array<{ db_sku: string; sheet_sku: string; variant: string; basis: string }>;
};

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH, "utf8")) as BatchItem[];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Record<string, unknown>[] = [];

  for (const item of batch) {
    const product = await prisma.product.findFirst({
      where: { slug: item.slug, deletedAt: null },
      include: { variants: true },
    });
    if (!product) {
      console.error("MISSING", item.name);
      continue;
    }
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${item.slug}.json`),
      JSON.stringify(product, null, 2)
    );

    const bySku = new Map(product.variants.map((v) => [v.sku, v]));
    let updated = 0;
    const actions: string[] = [];

    for (const u of item.updates) {
      const v = bySku.get(u.db_sku);
      if (!v) {
        actions.push(`MISS ${u.db_sku}`);
        continue;
      }
      if (v.sku === u.sheet_sku) continue;
      const clash = bySku.get(u.sheet_sku);
      if (clash && clash.id !== v.id) {
        actions.push(`CONFLICT ${u.db_sku} -> ${u.sheet_sku}`);
        continue;
      }
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { sku: u.sheet_sku },
        });
      }
      bySku.delete(u.db_sku);
      bySku.set(u.sheet_sku, { ...v, sku: u.sheet_sku });
      updated += 1;
      actions.push(`SKU ${u.db_sku} -> ${u.sheet_sku} (${u.variant || "blank"})`);
    }

    summary.push({ name: item.name, updated, mode: APPLY ? "APPLY" : "DRY_RUN", actions });
    console.log(`\n=== ${item.name} === updated=${updated}`);
    for (const a of actions) console.log(" ", a);
  }

  const out = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY_RUN"}\nSummary: ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
