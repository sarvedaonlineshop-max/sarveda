/**
 * Import published vaidyas from WordPress WXR.
 * Usage: npx tsx scripts/import-vaidya-wxr.ts [--dry-run] [path.xml]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { loadPublishedItems, thumbUrl } from "./wxr-loop";
import { resolveMediaRef } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath =
  process.argv.find((a) => a.endsWith(".xml")) ??
  path.resolve(__dirname, "../../data/vaidya.xml");

async function main() {
  const items = loadPublishedItems(xmlPath, "vaidya");
  let imported = 0;

  for (const item of items) {
    const speciality = item.meta.designation?.trim() || null;
    const photoUrl =
      thumbUrl(item) ?? resolveMediaRef(item.meta.user_image, item.attachments);
    const data = {
      name: item.title,
      bio: item.content || null,
      photoUrl,
      speciality,
      wpPostId: item.wpPostId || null,
      seoTitle: item.meta._yoast_wpseo_title?.trim() || null,
      seoDescription: item.meta._yoast_wpseo_metadesc?.trim() || null,
      isActive: true
    };

    console.log(`→ vaidya /vaidya/${item.slug}`);
    if (dryRun) continue;

    await prisma.vaidya.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} vaidyas.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
