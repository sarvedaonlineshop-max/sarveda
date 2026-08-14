/**
 * Carousel verification + sibling image fallback for 12 products with missing variant thumbs.
 *
 * 1. Re-run sync-do-variant-galleries.ts per slug
 * 2. Copy carousel/thumb from best-matching sibling for LS-only NEW variants still at 0 images
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-twelve-carousel-gaps.ts
 *   npx tsx scripts/fix-twelve-carousel-gaps.ts --apply
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const SLUGS = [
  "7-chakras-yoga-mats",
  "angel-tuning-forks",
  "chau-gongs",
  "macrame-yoga-mat-straps",
  "mini-coconut-shakers-3-types",
  "plain-yoga-mats",
  "pulse-tubes",
  "rectangular-yoga-bolster",
  "sacred-symbols-singing-bowls",
  "tingsha-bell",
  "yoga-mats-lotus",
  "zafu-zabuton-combo-lotus-embroidery",
];

const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-carousel-gap-fix-backups");
const actions: string[] = [];

function log(msg: string) {
  console.log(msg);
  actions.push(msg);
}

async function imageCount(variantId: string): Promise<number> {
  return prisma.productImage.count({ where: { variantId } });
}

async function fillSiblingGaps(slug: string): Promise<number> {
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: {
          images: true,
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
        },
      },
    },
  });
  if (!product) return 0;

  let filled = 0;

  for (const variant of product.variants) {
    const count = await imageCount(variant.id);
    if (count > 0) continue;

    const vAttrs = new Map(
      variant.attributeValues.map((a) => [
        a.attributeValue.attribute.slug,
        a.attributeValue.value.toLowerCase(),
      ])
    );

    let bestDonor: (typeof product.variants)[0] | null = null;
    let bestScore = -1;

    for (const donor of product.variants) {
      if (donor.id === variant.id) continue;
      const donorCount = await imageCount(donor.id);
      if (donorCount === 0) continue;

      let score = 0;
      for (const a of donor.attributeValues) {
        const key = a.attributeValue.attribute.slug;
        const val = a.attributeValue.value.toLowerCase();
        if (vAttrs.get(key) === val) score += 2;
        else if (vAttrs.has(key)) score -= 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestDonor = donor;
      }
    }

    if (!bestDonor) {
      for (const donor of product.variants) {
        if (donor.id === variant.id) continue;
        if ((await imageCount(donor.id)) > 0) {
          bestDonor = donor;
          break;
        }
      }
    }

    if (!bestDonor) {
      log(`  ${variant.sku} — no donor variant with images`);
      continue;
    }

    const donorImages = await prisma.productImage.findMany({
      where: { variantId: bestDonor.id },
      orderBy: { position: "asc" },
    });

    log(
      `  ${variant.sku} ← copy ${donorImages.length} media from ${bestDonor.sku} (score ${bestScore})`
    );

    if (APPLY) {
      for (const img of donorImages) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            url: img.url,
            altText: img.altText || product.name,
            position: img.position,
            isPrimary: img.isPrimary,
          },
        });
      }
      const donorVar = await prisma.productVariant.findUnique({ where: { id: bestDonor.id } });
      if (donorVar?.videoUrl && !variant.videoUrl) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { videoUrl: donorVar.videoUrl },
        });
      }
    }
    filled++;
  }

  return filled;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  log(`Products: ${SLUGS.length}`);

  let totalFilled = 0;

  for (const slug of SLUGS) {
    log(`\n=== ${slug} ===`);

    if (APPLY) {
      try {
        execSync(`npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug ${slug}`, {
          cwd: path.resolve(__dirname, ".."),
          stdio: "pipe",
        });
        log(`  carousel sync: OK`);
      } catch (e) {
        const msg = (e as { stderr?: Buffer }).stderr?.toString().slice(-120) || "failed";
        log(`  carousel sync: warn (${msg.trim()})`);
      }
    } else {
      log(`  carousel sync: (dry-run skip)`);
    }

    const before = await prisma.product.findFirst({
      where: { slug },
      include: { variants: { where: { status: "ACTIVE" } } },
    });
    let noThumbBefore = 0;
    if (before) {
      for (const v of before.variants) {
        if ((await imageCount(v.id)) === 0) noThumbBefore++;
      }
    }
    log(`  variants without images before sibling fill: ${noThumbBefore}`);

    const filled = await fillSiblingGaps(slug);
    totalFilled += filled;

    if (before) {
      let noThumbAfter = 0;
      for (const v of before.variants) {
        if ((await imageCount(v.id)) === 0) noThumbAfter++;
      }
      log(`  variants without images after: ${noThumbAfter}`);
    }
  }

  log(`\nTotal variants filled from siblings: ${totalFilled}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-actions.json`), JSON.stringify({ actions }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
