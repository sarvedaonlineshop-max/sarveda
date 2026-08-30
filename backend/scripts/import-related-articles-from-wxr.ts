/**
 * Import Woo ACF `related_articles` (post IDs) → Product.relatedArticleSlugs.
 *
 * Prefers match by wooCommerceId (stable), then product slug.
 * Persists slugs even if BlogPost rows are missing locally (PDP resolves later).
 *
 *   cd backend && npx tsx scripts/import-related-articles-from-wxr.ts [--dry-run]
 *   cd backend && npx tsx scripts/import-related-articles-from-wxr.ts --map=../data/compare/related-articles-from-wxr.json
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const mapArg = process.argv.find((a) => a.startsWith("--map="))?.slice("--map=".length);

type MapEntry = { wooId?: number; relatedArticleSlugs: string[] };

async function main(): Promise<void> {
  const mapPath = path.resolve(
    mapArg ?? path.join(__dirname, "../../data/compare/related-articles-from-wxr.json")
  );
  if (!fs.existsSync(mapPath)) {
    throw new Error(`Missing map file: ${mapPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8")) as Record<string, MapEntry>;
  const entries = Object.entries(raw);
  console.log(`Map entries: ${entries.length} (dryRun=${dryRun})`);

  let updated = 0;
  let skippedSame = 0;
  let missingProduct = 0;
  let missingBlog = 0;

  for (const [legacySlug, entry] of entries) {
    const slugs = (entry.relatedArticleSlugs ?? []).map((s) => s.trim()).filter(Boolean);
    if (!slugs.length) continue;

    const existingBlogs = await prisma.blogPost.findMany({
      where: { slug: { in: slugs } },
      select: { slug: true }
    });
    const ok = new Set(existingBlogs.map((b) => b.slug));
    const resolved = slugs.filter((s) => ok.has(s));
    if (resolved.length < slugs.length) {
      missingBlog += slugs.length - resolved.length;
    }
    const toSave = resolved.length ? resolved : slugs;

    const product =
      (entry.wooId
        ? await prisma.product.findFirst({
            where: { wooCommerceId: entry.wooId, deletedAt: null },
            select: { id: true, slug: true, relatedArticleSlugs: true }
          })
        : null) ??
      (await prisma.product.findFirst({
        where: { slug: legacySlug, deletedAt: null },
        select: { id: true, slug: true, relatedArticleSlugs: true }
      }));

    if (!product) {
      missingProduct += 1;
      continue;
    }

    const prev = product.relatedArticleSlugs ?? [];
    const same =
      prev.length === toSave.length && prev.every((s, i) => s === toSave[i]);
    if (same) {
      skippedSame += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: { relatedArticleSlugs: toSave }
      });
    }
    updated += 1;
    console.log(
      `${dryRun ? "[dry] " : ""}${product.slug} ← ${legacySlug}: [${toSave.join(", ")}]`
    );
  }

  console.log({ updated, skippedSame, missingProduct, missingBlog });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
