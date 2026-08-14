/**
 * Sacred Symbols Singing Bowls — remove bogus "Gold" LS-only duplicates and re-sync galleries.
 *
 * Problem: MI-SB-SS-GO-* variants duplicate Yellow; MI-SB-SS-GO-7 uses a broken "option" axis.
 * Gallery sync had wrong 5.5 in DO mappings so most colors shared identical carousel images.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-sacred-symbols-gold-variants.ts
 *   npx tsx scripts/fix-sacred-symbols-gold-variants.ts --apply
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const SLUG = "sacred-symbols-singing-bowls";
const DEACTIVATE_SKUS = ["MI-SB-SS-GO-3.5", "MI-SB-SS-GO-4", "MI-SB-SS-GO-5.5", "MI-SB-SS-GO-7"];
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-sacred-symbols-fix-backups");

const prisma = new PrismaClient();

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const log: string[] = [];
  const stamp = () => new Date().toISOString();

  const product = await prisma.product.findFirst({
    where: { slug: SLUG, deletedAt: null },
    include: {
      variants: {
        include: {
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
          images: true,
        },
      },
      images: true,
    },
  });

  if (!product) throw new Error(`Product not found: ${SLUG}`);

  log.push(`[${stamp()}] Product ${product.name} (${product.variants.length} variants)`);

  const backup = {
    productId: product.id,
    slug: SLUG,
    deactivated: [] as Array<{ sku: string; id: string; attrs: string[] }>,
    gallerySync: null as string | null,
  };

  for (const sku of DEACTIVATE_SKUS) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (!variant) {
      log.push(`  skip ${sku} — not in DB`);
      continue;
    }
    if (variant.status === "INACTIVE") {
      log.push(`  skip ${sku} — already inactive`);
      continue;
    }

    const attrs = variant.attributeValues.map(
      (a) => `${a.attributeValue.attribute.slug}=${a.attributeValue.value}`
    );
    backup.deactivated.push({ sku, id: variant.id, attrs });

    log.push(`  deactivate ${sku} (${attrs.join(", ")})`);

    if (APPLY) {
      await prisma.productImage.deleteMany({ where: { variantId: variant.id } });
      await prisma.variantAttributeValue.deleteMany({ where: { variantId: variant.id } });
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: "INACTIVE", isDefault: false },
      });
    }
  }

  if (APPLY) {
    const remaining = await prisma.productVariant.findMany({
      where: { productId: product.id, status: "ACTIVE" },
    });
    if (remaining.length && !remaining.some((v) => v.isDefault)) {
      await prisma.productVariant.update({
        where: { id: remaining[0]!.id },
        data: { isDefault: true },
      });
      log.push(`  set default variant ${remaining[0]!.sku}`);
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: ["size", "color"] },
    });
    log.push("  variantAxisOrder = [size, color]");

    try {
      const out = execSync(
        `npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug ${SLUG}`,
        { cwd: path.resolve(__dirname, ".."), encoding: "utf8" }
      );
      backup.gallerySync = out.trim().slice(-500);
      log.push("  gallery sync OK");
      log.push(out.trim().split("\n").slice(-5).join("\n"));
    } catch (e) {
      const msg = (e as { stdout?: string; stderr?: string }).stderr || String(e);
      log.push(`  gallery sync FAILED: ${msg.slice(-400)}`);
    }
  } else {
    log.push("  (dry-run) would re-run sync-do-variant-galleries.ts --apply");
  }

  const outPath = path.join(BACKUP_DIR, `${stamp().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ log, backup }, null, 2));

  console.log(log.join("\n"));
  console.log(`\nBackup: ${outPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
