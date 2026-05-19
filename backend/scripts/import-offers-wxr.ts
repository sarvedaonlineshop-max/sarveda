/**
 * Import published offers (offers_post CPT) from WordPress WXR.
 * Usage: npx tsx scripts/import-offers-wxr.ts [--dry-run] [path.xml]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { loadPublishedItems, thumbUrl } from "./wxr-loop";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath =
  process.argv.find((a) => a.endsWith(".xml")) ??
  path.resolve(__dirname, "../../data/offers.xml");

const SKIP_SLUGS = new Set(["testing"]);

async function main() {
  const items = loadPublishedItems(xmlPath, "offers_post");
  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    if (SKIP_SLUGS.has(item.slug)) {
      skipped++;
      console.log(`⊘ skip ${item.slug}`);
      continue;
    }

    const data = {
      title: item.title,
      description: item.content || item.excerpt || null,
      imageUrl: thumbUrl(item),
      wpPostId: item.wpPostId || null,
      seoTitle: item.meta._yoast_wpseo_title?.trim() || null,
      seoDescription: item.meta._yoast_wpseo_metadesc?.trim() || null,
      isActive: true
    };

    console.log(`→ offer /offers/${item.slug}`);
    if (dryRun) continue;

    await prisma.offer.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} offers, skipped ${skipped}.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
