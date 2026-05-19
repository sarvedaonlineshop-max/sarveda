/**
 * Import published mentors from WordPress WXR.
 * Usage: npx tsx scripts/import-mentors-wxr.ts [--dry-run] [path.xml]
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
  path.resolve(__dirname, "../../data/mentors.xml");

async function main() {
  const items = loadPublishedItems(xmlPath, "mentor");
  let imported = 0;

  for (const item of items) {
    const data = {
      name: item.title,
      bio: item.content || null,
      photoUrl: thumbUrl(item),
      expertise: item.meta.designation?.trim() || null,
      wpPostId: item.wpPostId || null,
      seoTitle: item.meta._yoast_wpseo_title?.trim() || null,
      seoDescription: item.meta._yoast_wpseo_metadesc?.trim() || null,
      isActive: true
    };

    console.log(`→ mentor /mentor/${item.slug}`);
    if (dryRun) continue;

    await prisma.mentor.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} mentors.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
