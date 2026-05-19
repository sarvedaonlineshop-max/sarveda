/**
 * Import WordPress pages (corporate wellness, programs, etc.)
 * Usage: npx tsx scripts/import-pages-wxr.ts [--dry-run]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import {
  buildAttachmentMap,
  cdata,
  parseIntSafe,
  parseItems,
  parseMeta,
  readWxr,
  toPrismaJson
} from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath = path.resolve(__dirname, "../../data/pages.xml");

/** WP system/duplicate pages — not public marketing URLs */
const SKIP_SLUGS = new Set([
  "checkout",
  "checkout-1",
  "home-2",
  "users-account",
  "subscriber-login",
  "subscriber-register",
  "subscriber-forgot-password",
  "reset-password",
  "serenity-strength-2"
]);

function buildPageExtra(meta: Record<string, string>): object | null {
  const acf: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key.startsWith("_")) continue;
    const trimmed = value?.trim();
    if (trimmed) acf[key] = trimmed;
  }
  return toPrismaJson(acf);
}

async function main() {
  const xml = readWxr(xmlPath);
  const items = parseItems(xml);
  const attachments = buildAttachmentMap(items);

  let imported = 0;
  let skipped = 0;
  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[page]]></wp:post_type>")) continue;
    if (!block.includes("<wp:status><![CDATA[publish]]></wp:status>")) continue;

    const slug = cdata("wp:post_name", block);
    if (SKIP_SLUGS.has(slug)) {
      skipped++;
      console.log(`⊘ skip ${slug}`);
      continue;
    }

    const title = cdata("title", block);
    const content = cdata("content:encoded", block);
    const meta = parseMeta(block);
    const wpPostId = parseIntSafe(cdata("wp:post_id", block));
    const thumbId = meta._thumbnail_id;
    const imageUrl = thumbId ? attachments.get(thumbId) ?? null : null;
    const template = meta._wp_page_template || null;
    const extra = buildPageExtra(meta);

    console.log(`→ page /${slug} — ${title.slice(0, 50)}`);

    if (dryRun) continue;

    await prisma.cmsPage.upsert({
      where: { slug },
      create: {
        slug,
        title,
        content: content || null,
        template,
        imageUrl,
        extra,
        wpPostId: wpPostId || null,
        status: "PUBLISHED",
        seoTitle: meta._yoast_wpseo_title || null,
        seoDescription: meta._yoast_wpseo_metadesc || null
      },
      update: {
        title,
        content: content || null,
        template,
        imageUrl,
        extra,
        wpPostId: wpPostId || null,
        status: "PUBLISHED",
        seoTitle: meta._yoast_wpseo_title || null,
        seoDescription: meta._yoast_wpseo_metadesc || null
      }
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} pages, skipped ${skipped}.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
