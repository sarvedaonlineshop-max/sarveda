/**
 * Link WooCommerce variation thumbnail images to ProductImage.variantId.
 *
 * Sources (in order):
 * 1. variations WXR `_thumbnail_id` → attachment URL map
 * 2. CSV variation `Images` column (matched by SKU)
 *
 * URLs are rewritten via data/media-migration-map.json when present (S3).
 * Parent product galleries are left intact; variant rows are upserted separately.
 *
 * Usage:
 *   npx tsx scripts/link-variation-images.ts [--dry-run]
 */
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { may30 } from "./migration-paths";
import { loadAttachmentMapFromWxr } from "./wxr-attachments";
import { cdata, parseItems, parseMeta, readWxr } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const REPO_ROOT = path.resolve(__dirname, "../..");
const MAP_FILE = path.join(REPO_ROOT, "data/media-migration-map.json");
const CSV_PATH = may30.wcProductsCsv();

type MapEntry = { from: string; to: string; ok: boolean };

function loadCdnMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(MAP_FILE)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) as MapEntry[];
    for (const row of raw) {
      if (row.ok && row.from && row.to) map.set(row.from, row.to);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function toCdnUrl(url: string, cdnMap: Map<string, string>): string {
  const trimmed = url.trim();
  if (cdnMap.has(trimmed)) return cdnMap.get(trimmed)!;
  const cdn = process.env.AWS_CLOUDFRONT_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, "");
  if (cdn && trimmed.startsWith("https://sarveda.com/wp-content/uploads/")) {
    return `${cdn}/media/wp/uploads/${trimmed.slice("https://sarveda.com/wp-content/uploads/".length)}`;
  }
  return trimmed;
}

function normalizeUrl(url: string): string {
  return url.trim().split("?")[0]!.replace(/\/$/, "");
}

async function main(): Promise<void> {
  const attachments = loadAttachmentMapFromWxr(REPO_ROOT);
  const cdnMap = loadCdnMap();
  console.log(`Attachments: ${attachments.size}, CDN map: ${cdnMap.size}`);

  const variationsXml = may30.variations();
  if (!fs.existsSync(variationsXml)) {
    throw new Error(`Missing variations WXR: ${variationsXml}`);
  }
  const items = parseItems(readWxr(variationsXml));

  /** woo post id → resolved image URL */
  const thumbByWooVarId = new Map<number, string>();

  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[product_variation]]></wp:post_type>")) continue;
    const wooId = parseInt(cdata("wp:post_id", block), 10);
    if (!Number.isFinite(wooId) || wooId <= 0) continue;
    const meta = parseMeta(block);
    const thumbRaw = (meta._thumbnail_id ?? "").trim();
    if (!thumbRaw || !/^\d+$/.test(thumbRaw)) continue;
    const attUrl = attachments.get(parseInt(thumbRaw, 10));
    if (!attUrl) continue;
    thumbByWooVarId.set(wooId, toCdnUrl(attUrl, cdnMap));
  }
  console.log(`WXR variation thumbs: ${thumbByWooVarId.size}`);

  /** SKU → image URL from CSV (fallback) */
  const csvBySku = new Map<string, string>();
  if (fs.existsSync(CSV_PATH)) {
    const rows = parse(fs.readFileSync(CSV_PATH, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true
    }) as Record<string, string>[];
    for (const row of rows) {
      const type = (row.Type ?? "").trim().toLowerCase();
      if (type !== "variation") continue;
      const sku = (row.SKU ?? "").trim();
      const img = (row.Images ?? "").split(",")[0]?.trim() ?? "";
      if (!sku || !img.startsWith("http")) continue;
      csvBySku.set(sku, toCdnUrl(img, cdnMap));
    }
  }
  console.log(`CSV variation images: ${csvBySku.size}`);

  const variants = await prisma.productVariant.findMany({
    select: { id: true, sku: true, productId: true }
  });

  let linked = 0;
  let created = 0;
  let skipped = 0;

  for (const variant of variants) {
    let url: string | null = null;

    const wooMatch = /^woo-var-(\d+)$/.exec(variant.sku);
    if (wooMatch) {
      const wooId = parseInt(wooMatch[1]!, 10);
      url = thumbByWooVarId.get(wooId) ?? null;
    }
    if (!url) {
      url = csvBySku.get(variant.sku) ?? null;
    }
    if (!url) {
      skipped++;
      continue;
    }

    const existingForVariant = await prisma.productImage.findFirst({
      where: { variantId: variant.id },
      orderBy: { position: "asc" }
    });

    if (existingForVariant) {
      if (normalizeUrl(existingForVariant.url) === normalizeUrl(url)) {
        linked++;
        continue;
      }
      if (!dryRun) {
        await prisma.productImage.update({
          where: { id: existingForVariant.id },
          data: { url, isPrimary: false, altText: existingForVariant.altText ?? variant.sku }
        });
      }
      linked++;
      continue;
    }

    // Prefer attaching to an existing product gallery row with the same URL (no duplicate).
    const sameUrl = await prisma.productImage.findFirst({
      where: {
        productId: variant.productId,
        variantId: null,
        OR: [{ url }, { url: { contains: path.basename(normalizeUrl(url)) } }]
      }
    });

    if (sameUrl && normalizeUrl(sameUrl.url) === normalizeUrl(url)) {
      // Keep shared gallery; add a dedicated variant-linked copy so other variants still see shared images.
    }

    if (!dryRun) {
      await prisma.productImage.create({
        data: {
          productId: variant.productId,
          variantId: variant.id,
          url,
          altText: variant.sku,
          position: 0,
          // Keep product-card primaries on shared gallery rows only.
          isPrimary: false
        }
      });
    }
    created++;
    linked++;
  }

  console.log(
    `\nDone${dryRun ? " (dry-run)" : ""}. Linked/updated: ${linked}, created: ${created}, no image: ${skipped}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
