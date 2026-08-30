/**
 * Import Woo ACF `related_articles` → Product.relatedArticleSlugs.
 *
 * Prefers match by wooCommerceId (stable), then product slug.
 * Persists slugs even if BlogPost rows are missing locally (PDP resolves later).
 *
 * Map sources (first that exists wins, unless --map= is set):
 *   1. data/compare/related-articles-from-wxr.json  (local WXR dump; gitignored)
 *   2. src/data/related-articles-map.json           (tracked; shipped with repo)
 *
 *   cd backend && npx tsx scripts/import-related-articles-from-wxr.ts [--dry-run]
 *   cd backend && npx tsx scripts/import-related-articles-from-wxr.ts --map=./src/data/related-articles-map.json
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const mapArg = process.argv.find((a) => a.startsWith("--map="))?.slice("--map=".length);

type MapEntry = { key: string; wooId?: number; relatedArticleSlugs: string[] };

function resolveMapPath(): string {
  if (mapArg) return path.resolve(mapArg);
  const candidates = [
    path.join(__dirname, "../../data/compare/related-articles-from-wxr.json"),
    path.join(__dirname, "../src/data/related-articles-map.json")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Missing map file. Tried:\n${candidates.map((p) => `  - ${p}`).join("\n")}\n` +
      `Or pass --map=/path/to/related-articles-map.json`
  );
}

/** Supports WXR dump shape OR tracked { byWooCommerceId, bySlug }. */
function normalizeMap(raw: unknown): MapEntry[] {
  if (!raw || typeof raw !== "object") return [];

  const obj = raw as Record<string, unknown>;

  // Tracked runtime map
  if (obj.byWooCommerceId || obj.bySlug) {
    const out: MapEntry[] = [];
    const byWoo = (obj.byWooCommerceId ?? {}) as Record<string, string[]>;
    for (const [wooIdStr, slugs] of Object.entries(byWoo)) {
      const wooId = Number(wooIdStr);
      if (!Number.isFinite(wooId)) continue;
      out.push({
        key: `woo:${wooId}`,
        wooId,
        relatedArticleSlugs: (slugs ?? []).map((s) => String(s).trim()).filter(Boolean)
      });
    }
    const bySlug = (obj.bySlug ?? {}) as Record<string, string[]>;
    for (const [slug, slugs] of Object.entries(bySlug)) {
      out.push({
        key: slug,
        relatedArticleSlugs: (slugs ?? []).map((s) => String(s).trim()).filter(Boolean)
      });
    }
    return out;
  }

  // WXR compare dump: { [productSlug]: { wooId?, relatedArticleSlugs } }
  const out: MapEntry[] = [];
  for (const [legacySlug, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as { wooId?: number; relatedArticleSlugs?: string[] };
    out.push({
      key: legacySlug,
      wooId: entry.wooId,
      relatedArticleSlugs: (entry.relatedArticleSlugs ?? []).map((s) => s.trim()).filter(Boolean)
    });
  }
  return out;
}

async function main(): Promise<void> {
  const mapPath = resolveMapPath();
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8")) as unknown;
  const entries = normalizeMap(raw);
  console.log(`Map file: ${mapPath}`);
  console.log(`Map entries: ${entries.length} (dryRun=${dryRun})`);

  let updated = 0;
  let skippedSame = 0;
  let missingProduct = 0;
  let missingBlog = 0;

  for (const entry of entries) {
    const slugs = entry.relatedArticleSlugs;
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
        where: { slug: entry.key, deletedAt: null },
        select: { id: true, slug: true, relatedArticleSlugs: true }
      }));

    if (!product) {
      missingProduct += 1;
      continue;
    }

    const prev = product.relatedArticleSlugs ?? [];
    const same = prev.length === toSave.length && prev.every((s, i) => s === toSave[i]);
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
      `${dryRun ? "[dry] " : ""}${product.slug} ← ${entry.key}: [${toSave.join(", ")}]`
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
