/**
 * Fix crystal-bowl-accessories ProductImage URLs for Merchant certification.
 * Mirrors Woo media to S3 (media/wp/uploads/...) and updates ProductImage rows.
 *
 *   npx tsx scripts/fix-crystal-bowl-mallet-images.ts
 *   npx tsx scripts/fix-crystal-bowl-mallet-images.ts --apply
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { getPublicMediaUrl, mirrorUrlToS3 } from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const PRODUCT_SLUG = "crystal-bowl-accessories";
const EXPECTED_DB_HOST = "c9oiska8wm8k.ap-south-1.rds.amazonaws.com";

const PRIMARY = {
  sourceUrl: "https://sarveda.com/wp-content/uploads/2026/04/Crystal-bowl-accessories.jpg",
  s3Key: "media/wp/uploads/2026/04/Crystal-bowl-accessories.jpg",
  altText: "Crystal Bowl Mallets",
  position: 0,
  isPrimary: true
} as const;

const VARIANT_IMAGES = [
  {
    sku: "MI-CB-MA-B",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2026/03/mallet.jpg",
    s3Key: "media/wp/uploads/2026/03/mallet.jpg",
    altText: "Crystal Bowl Mallets - Ball Mallet",
    position: 1
  },
  {
    sku: "MI-CB-MA-R",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2026/03/mallet-copy-8.jpg",
    s3Key: "media/wp/uploads/2026/03/mallet-copy-8.jpg",
    altText: "Crystal Bowl Mallets - Rimming Mallet",
    position: 2
  },
  {
    sku: "MI-CB-MA-S",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2026/03/Silicon-mallet_.jpg",
    s3Key: "media/wp/uploads/2026/03/Silicon-mallet_.jpg",
    altText: "Crystal Bowl Mallets - Silicon Mallet",
    position: 3
  }
] as const;

function assertLightsailDb(): void {
  const url = process.env.DATABASE_URL || "";
  if (!url.includes(EXPECTED_DB_HOST) && !url.includes("13.204.112.165")) {
    throw new Error(
      `Refusing to run on non-Lightsail DATABASE_URL (expected host fragment ${EXPECTED_DB_HOST})`
    );
  }
}

async function ensurePublicUrl(sourceUrl: string, s3Key: string): Promise<string> {
  const existing = getPublicMediaUrl(s3Key);
  try {
    const head = await fetch(existing, { method: "HEAD", redirect: "follow" });
    if (head.ok) {
      console.log(`  reuse S3 ${s3Key}`);
      return existing;
    }
  } catch {
    /* mirror below */
  }
  console.log(`  mirror ${sourceUrl} -> ${s3Key}`);
  const mirrored = await mirrorUrlToS3(sourceUrl, s3Key);
  if (!mirrored) throw new Error(`S3 mirror failed for ${sourceUrl}`);
  const verify = await fetch(mirrored, { method: "HEAD", redirect: "follow" });
  if (!verify.ok) throw new Error(`Mirrored URL not reachable: ${mirrored} (${verify.status})`);
  return mirrored;
}

async function main() {
  assertLightsailDb();
  const prisma = new PrismaClient();

  const product = await prisma.product.findFirst({
    where: { slug: PRODUCT_SLUG, deletedAt: null },
    include: { images: true }
  });
  if (!product) throw new Error(`Product not found: ${PRODUCT_SLUG}`);

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Product: ${product.id} (${PRODUCT_SLUG})\n`);

  const primaryUrl = await ensurePublicUrl(PRIMARY.sourceUrl, PRIMARY.s3Key);
  const variantUrls: Array<{ position: number; altText: string; url: string }> = [];
  for (const row of VARIANT_IMAGES) {
    const url = await ensurePublicUrl(row.sourceUrl, row.s3Key);
    variantUrls.push({ position: row.position, altText: row.altText, url });
  }

  const plan = {
    primary: primaryUrl,
    variants: variantUrls
  };
  console.log("\nPlan:", JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("\nRe-run with --apply to update ProductImage rows.");
    return;
  }

  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  await prisma.productImage.create({
    data: {
      productId: product.id,
      url: primaryUrl,
      altText: PRIMARY.altText,
      position: PRIMARY.position,
      isPrimary: true
    }
  });
  for (const v of variantUrls) {
    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: v.url,
        altText: v.altText,
        position: v.position,
        isPrimary: false
      }
    });
  }

  const count = await prisma.productImage.count({ where: { productId: product.id } });
  console.log(`\nUpdated ProductImage rows: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await new PrismaClient().$disconnect();
  });
