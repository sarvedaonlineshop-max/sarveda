/**
 * Import published blog posts from WordPress WXR.
 * Usage: npx tsx scripts/import-posts-wxr.ts [--dry-run] [path.xml]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { loadPublishedItems, thumbUrl } from "./wxr-loop";
import { may30 } from "./migration-paths";
import { cdata, parseWpDate } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath = process.argv.find((a) => a.endsWith(".xml")) ?? may30.posts();

async function main() {
  const items = loadPublishedItems(xmlPath, "post");
  let imported = 0;

  for (const item of items) {
    const publishedAt =
      parseWpDate(cdata("wp:post_date", item.block)) ??
      parseWpDate(cdata("wp:post_date_gmt", item.block));

    const data = {
      title: item.title,
      content: item.content || "",
      excerpt: item.excerpt?.trim() || null,
      imageUrl: thumbUrl(item),
      wpPostId: item.wpPostId || null,
      status: "PUBLISHED" as const,
      publishedAt,
      seoTitle: item.meta._yoast_wpseo_title?.trim() || null,
      seoDescription: item.meta._yoast_wpseo_metadesc?.trim() || null,
      seoKeyword: item.meta._yoast_wpseo_focuskw?.trim() || null
    };

    console.log(`→ post /${item.slug}`);
    if (dryRun) continue;

    await prisma.blogPost.upsert({
      where: { slug: item.slug },
      create: { slug: item.slug, ...data },
      update: data
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} posts.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
