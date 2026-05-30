/**
 * Import published retreats from WordPress WXR.
 * Usage: npx tsx scripts/import-retreats-wxr.ts [--dry-run] [path.xml]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { toPaise } from "../src/utils/money";
import { loadPublishedItems, thumbUrl } from "./wxr-loop";
import { may30 } from "./migration-paths";
import { parseIntSafe, parseWpDate } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath =
  process.argv.find((a) => a.endsWith(".xml")) ??
  may30.retreats();

function retreatDuration(meta: Record<string, string>): string | null {
  const start = parseWpDate(meta.retreat_start_date);
  const end = parseWpDate(meta.retreat_end_date);
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? `${days} days` : null;
}

function retreatPriceInPaise(meta: Record<string, string>): number | null {
  const raw = parseIntSafe(meta.pricing);
  if (raw <= 0) return null;
  // WP stores USD for international retreats (e.g. 1400); INR listings are usually < 500000 paise equiv
  if (raw >= 5000) return null;
  return toPaise(raw);
}

async function main() {
  const items = loadPublishedItems(xmlPath, "retreat");
  let imported = 0;

  for (const item of items) {
    const data = {
      title: item.title,
      description: item.content || null,
      imageUrl: thumbUrl(item),
      location: item.meta.retreat_location?.trim() || null,
      duration: retreatDuration(item.meta),
      priceInPaise: retreatPriceInPaise(item.meta),
      wpPostId: item.wpPostId || null,
      seoTitle: item.meta._yoast_wpseo_title?.trim() || null,
      seoDescription: item.meta._yoast_wpseo_metadesc?.trim() || null,
      isActive: true
    };

    console.log(`→ retreat /retreat/${item.slug}`);
    if (dryRun) continue;

    await prisma.retreat.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} retreats.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
