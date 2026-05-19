/**
 * Import published testimonials from WordPress WXR.
 * Usage: npx tsx scripts/import-testimonials-wxr.ts [--dry-run] [path.xml]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { loadPublishedItems } from "./wxr-loop";
import { resolveMediaRef } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath =
  process.argv.find((a) => a.endsWith(".xml")) ??
  path.resolve(__dirname, "../../data/testimonials.xml");

async function main() {
  const items = loadPublishedItems(xmlPath, "testimonial");
  let imported = 0;

  for (const item of items) {
    const body = item.meta.description?.trim() || item.content || null;
    const data = {
      authorName: item.title,
      role: item.meta.designation?.trim() || null,
      body,
      imageUrl: resolveMediaRef(item.meta.user_image, item.attachments),
      wpPostId: item.wpPostId || null,
      isPublished: true
    };

    console.log(`→ testimonial ${item.slug}`);
    if (dryRun) continue;

    await prisma.testimonial.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} testimonials.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
