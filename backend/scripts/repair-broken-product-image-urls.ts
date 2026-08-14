/**
 * Repair ProductImage rows pointing at broken `products/{slug}/...` S3 keys (403).
 * Remap to migrated `media/wp/uploads/...` URLs from DO attachment IDs.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/repair-broken-product-image-urls.ts
 *   npx tsx scripts/repair-broken-product-image-urls.ts --apply
 *   npx tsx scripts/repair-broken-product-image-urls.ts --apply --slug the-head-bowl
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const SLUG_FILTER = (() => {
  const i = process.argv.indexOf("--slug");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const REPO = path.resolve(__dirname, "../..");
const DO_PRODUCTS = path.join(REPO, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const MAP_FILE = path.join(REPO, "data/media-migration-map.json");
const CDN_BASE =
  process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.trim()?.replace(/\/$/, "") ||
  "https://sarveda-media.s3.amazonaws.com";

const prisma = new PrismaClient();

function loadCdnMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(MAP_FILE)) return map;
  const rows = JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) as Array<{
    from: string;
    to: string;
    ok: boolean;
  }>;
  for (const r of rows) {
    if (r.ok && r.from && r.to) map.set(r.from.trim(), r.to.trim());
  }
  return map;
}

function wpToPublic(doUrl: string, cdnMap: Map<string, string>): string | null {
  const u = doUrl.trim();
  if (!u) return null;
  const cached = cdnMap.get(u);
  if (cached) return cached;
  const prefix = "https://sarveda.com/wp-content/uploads/";
  if (u.startsWith(prefix)) {
    return `${CDN_BASE}/media/wp/uploads/${u.slice(prefix.length)}`;
  }
  const idx = u.indexOf("/wp-content/uploads/");
  if (idx >= 0) {
    return `${CDN_BASE}/media/wp/uploads/${u.slice(idx + "/wp-content/uploads/".length)}`;
  }
  return null;
}

function loadAttachments(): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if (row.url) map.set(String(row.id), row.url.trim());
  }
  return map;
}

function loadDoProduct(wooId: number): Record<string, string> | null {
  for (const row of parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if (row.id === String(wooId)) return row;
  }
  return null;
}

function galleryAttachmentUrls(doP: Record<string, string>, attachments: Map<string, string>): string[] {
  const ids = [doP.thumb_id, ...(doP.gallery || "").split(",").map((s) => s.trim())].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const u = attachments.get(id);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function doVariantBySku(sku: string): Record<string, string> | null {
  for (const row of parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if ((row.sku || "").trim().toUpperCase() === sku.trim().toUpperCase()) return row;
  }
  return null;
}

function isBrokenUrl(url: string): boolean {
  return url.includes("/products/");
}

async function urlOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(12_000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  const cdnMap = loadCdnMap();
  const attachments = loadAttachments();

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      ...(SLUG_FILTER ? { slug: SLUG_FILTER } : {}),
    },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { include: { images: { orderBy: { position: "asc" } } } },
    },
  });

  let fixed = 0;
  let skipped = 0;

  for (const product of products) {
    const broken = product.images.filter((im) => isBrokenUrl(im.url));
    if (!broken.length) continue;

    const wooId = product.wooCommerceId;
    if (!wooId) {
      console.log(`SKIP ${product.slug} — no wooCommerceId (${broken.length} broken imgs)`);
      skipped += broken.length;
      continue;
    }

    const doP = loadDoProduct(wooId);
    if (!doP) {
      console.log(`SKIP ${product.slug} — DO product ${wooId} missing`);
      skipped += broken.length;
      continue;
    }

    const galleryDo = galleryAttachmentUrls(doP, attachments);
    const galleryPublic = galleryDo
      .map((u) => wpToPublic(u, cdnMap))
      .filter((u): u is string => Boolean(u));

    console.log(`\n${product.slug} — ${broken.length} broken, DO gallery ${galleryPublic.length} urls`);

    const sharedBroken = broken.filter((im) => !im.variantId);
    for (let i = 0; i < sharedBroken.length; i++) {
      const im = sharedBroken[i]!;
      const next =
        galleryPublic[i] ?? galleryPublic[galleryPublic.length - 1] ?? galleryPublic[0];
      if (!next) {
        skipped++;
        continue;
      }
      if (!(await urlOk(next))) {
        console.log(`  WARN unreachable ${next.slice(-40)}`);
        skipped++;
        continue;
      }
      console.log(`  product img ${im.position} → ${next.split("/").slice(-1)[0]}`);
      if (APPLY) {
        await prisma.productImage.update({ where: { id: im.id }, data: { url: next } });
      }
      fixed++;
    }

    for (const variant of product.variants) {
      for (const im of variant.images.filter((x) => isBrokenUrl(x.url))) {
        let next: string | null = null;
        const doVar = doVariantBySku(variant.sku);
        if (doVar?.thumb_id) {
          const doUrl = attachments.get(doVar.thumb_id);
          if (doUrl) next = wpToPublic(doUrl, cdnMap);
        }
        if (!next) next = galleryPublic[0] ?? null;
        if (!next || !(await urlOk(next))) {
          skipped++;
          continue;
        }
        console.log(`  ${variant.sku} variant img → ${next.split("/").slice(-1)[0]}`);
        if (APPLY) {
          await prisma.productImage.update({ where: { id: im.id }, data: { url: next } });
        }
        fixed++;
      }
    }

    // If product has zero shared images but gallery exists, add them
    const sharedCount = product.images.filter((im) => !im.variantId).length;
    if (sharedCount === 0 && galleryPublic.length && APPLY) {
      for (let i = 0; i < galleryPublic.length; i++) {
        const url = galleryPublic[i]!;
        if (!(await urlOk(url))) continue;
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url,
            altText: product.name,
            position: i,
            isPrimary: i === 0,
          },
        });
        fixed++;
      }
      console.log(`  added ${galleryPublic.length} shared gallery rows`);
    }
  }

  console.log(`\nMode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Fixed: ${fixed} | Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
