/**
 * Sync related-article links + blog excerpts from a DO Woo/MySQL dump.
 *
 * Inputs (TSVs from DigitalOcean):
 *   data/compare/do-related-articles-raw.tsv  product_slug \t woo_id \t php_serialized_ids
 *   data/compare/do-posts.tsv                 post_id \t post_slug
 *   data/compare/do-blog-meta.tsv             slug \t thumb_url \t content_snippet \t post_date
 *
 * Usage:
 *   cd backend && npx tsx scripts/sync-related-articles-from-do.ts [--dry-run]
 */
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function stripHtmlToExcerpt(html: string, max = 220): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** Extract post IDs from PHP serialized related_articles value. */
function parseSerializedPostIds(raw: string): string[] {
  const ids: string[] = [];
  const re = /s:\d+:"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    ids.push(m[1]);
  }
  // also plain "a:1:{i:0;i:123;}" integer form
  const reInt = /(?:^|;|[^{])i:(\d+);/g;
  while ((m = reInt.exec(raw))) {
    const n = m[1];
    if (n !== "0" && !ids.includes(n)) ids.push(n);
  }
  return [...new Set(ids)];
}

function loadTsv(file: string): string[][] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((l) => l.split("\t"));
}

async function main() {
  const root = path.join(__dirname, "../../data/compare");
  const relatedRows = loadTsv(path.join(root, "do-related-articles-raw.tsv"));
  const postRows = loadTsv(path.join(root, "do-posts.tsv"));
  const idToSlug = new Map(postRows.map((r) => [r[0], r[1]]));

  console.log(`DO related products: ${relatedRows.length}, published posts: ${postRows.length}`);

  let productsUpdated = 0;
  let productsMissing = 0;
  for (const row of relatedRows) {
    const productSlug = row[0]?.trim();
    const wooIdRaw = row[1]?.trim();
    const serialized = row[2] ?? "";
    if (!productSlug || !serialized) continue;
    const ids = parseSerializedPostIds(serialized);
    const articleSlugs = ids.map((id) => idToSlug.get(id)).filter((s): s is string => Boolean(s));
    if (!articleSlugs.length) continue;

    const wooId = Number(wooIdRaw);
    const product =
      (await prisma.product.findFirst({
        where: { slug: productSlug },
        select: { id: true, slug: true, relatedArticleSlugs: true }
      })) ??
      (Number.isFinite(wooId) && wooId > 0
        ? await prisma.product.findFirst({
            where: { wooCommerceId: wooId },
            select: { id: true, slug: true, relatedArticleSlugs: true }
          })
        : null);

    if (!product) {
      productsMissing++;
      continue;
    }
    const same =
      product.relatedArticleSlugs.length === articleSlugs.length &&
      product.relatedArticleSlugs.every((s, i) => s === articleSlugs[i]);
    if (same) continue;
    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: { relatedArticleSlugs: articleSlugs }
      });
    }
    productsUpdated++;
    console.log(`${dryRun ? "[dry] " : ""}product ${product.slug} <- [${articleSlugs.join(", ")}]`);
  }

  // Backfill missing blog excerpts from stored HTML content (DO post_excerpt is mostly empty).
  const posts = await prisma.blogPost.findMany({
    select: { id: true, slug: true, excerpt: true, content: true, imageUrl: true }
  });
  let excerptsFilled = 0;
  for (const post of posts) {
    if (post.excerpt?.trim()) continue;
    if (!post.content?.trim()) continue;
    const excerpt = stripHtmlToExcerpt(post.content);
    if (!excerpt) continue;
    if (!dryRun) {
      await prisma.blogPost.update({ where: { id: post.id }, data: { excerpt } });
    }
    excerptsFilled++;
  }

  // Refresh featured image URLs from DO dump when present.
  const blogMeta = loadTsv(path.join(root, "do-blog-meta.tsv"));
  let imagesUpdated = 0;
  for (const [slug, thumb] of blogMeta) {
    if (!slug || !thumb?.startsWith("http")) continue;
    const existing = await prisma.blogPost.findFirst({
      where: { slug },
      select: { id: true, imageUrl: true }
    });
    if (!existing) continue;
    if (existing.imageUrl === thumb) continue;
    // Keep existing if already S3; only fill/replace WP origin URLs.
    if (existing.imageUrl?.includes("sarveda-media")) continue;
    if (!dryRun) {
      await prisma.blogPost.update({ where: { id: existing.id }, data: { imageUrl: thumb } });
    }
    imagesUpdated++;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        productsUpdated,
        productsMissing,
        excerptsFilled,
        imagesUpdated,
        relatedRows: relatedRows.length
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
