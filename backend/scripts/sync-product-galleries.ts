/**
 * Sync ProductImage rows from WooCommerce CSV:
 * - Comma-separated Images column
 * - ACF product_gallery_carousel_image_linked_with_N_image (attachment IDs)
 * - Attachment URLs resolved from data/variations.xml (inherit attachments)
 *
 * Usage: npx tsx scripts/sync-product-galleries.ts [--dry-run]
 */
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { loadAttachmentMapFromWxr } from "./wxr-attachments";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const CSV_PATH = path.resolve(__dirname, "../prisma/wc-products.csv");
const REPO_ROOT = path.resolve(__dirname, "../..");

/** Products where CSV gallery attachment IDs are missing from variations.xml export */
const EXTRA_GALLERY_BY_WOO_ID: Record<number, string[]> = {
  49115: [
    "https://sarveda.com/wp-content/uploads/2026/02/Etched-Gong-1.jpg",
    "https://sarveda.com/wp-content/uploads/2026/02/Etched-Gong-2.jpg",
    "https://sarveda.com/wp-content/uploads/2026/02/Etched-Gong-3.jpg"
  ]
};


function collectUrlsFromRow(row: Record<string, string>, attachments: Map<number, string>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const u = raw.trim();
    if (!u.startsWith("http") || seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  };

  const imagesRaw = row["Images"] ?? "";
  for (const part of imagesRaw.split(",")) add(part);

  for (const [key, value] of Object.entries(row)) {
    if (!key || !value?.trim()) continue;
    if (value.startsWith("http") && (key === "Images" || key.includes("banner") || key.includes("gallery"))) {
      add(value);
    }
    if (
      key.includes("product_gallery_carousel_image_linked_with_") &&
      key.endsWith("_image") &&
      !key.startsWith("Meta: _") &&
      /^\d+$/.test(value.trim())
    ) {
      const attUrl = attachments.get(parseInt(value.trim(), 10));
      if (attUrl) add(attUrl);
    }
  }

  const wooId = parseInt(row["ID"] ?? "", 10);
  if (Number.isFinite(wooId) && EXTRA_GALLERY_BY_WOO_ID[wooId]) {
    for (const u of EXTRA_GALLERY_BY_WOO_ID[wooId]) add(u);
  }

  return urls;
}

async function main(): Promise<void> {
  const attachments = loadAttachmentMapFromWxr(REPO_ROOT);
  console.log(`Attachment map: ${attachments.size} entries (media + products + variations WXR)`);

  const csvRaw = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parse(csvRaw, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<
    string,
    string
  >[];

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const type = (row["Type"] ?? "").trim();
    if (type !== "simple" && type !== "variable") continue;

    const wooId = parseInt(row["ID"] ?? "", 10);
    if (!Number.isFinite(wooId)) continue;

    const product = await prisma.product.findFirst({
      where: { wooCommerceId: wooId, deletedAt: null }
    });
    if (!product) {
      skipped++;
      continue;
    }

    const urls = collectUrlsFromRow(row, attachments);
    if (!urls.length) continue;

    const existing = await prisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { position: "asc" }
    });
    const existingUrls = new Set(existing.map((i) => i.url));

    const needsUpdate =
      urls.length !== existing.length || urls.some((u, i) => existing[i]?.url !== u);

    if (!needsUpdate) continue;

    console.log(`→ ${product.slug} (${urls.length} images)`);

    if (dryRun) {
      updated++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId: product.id } });
      let pos = 0;
      for (const url of urls) {
        await tx.productImage.create({
          data: {
            productId: product.id,
            url,
            position: pos,
            isPrimary: pos === 0,
            altText: row["Name"] ?? product.name
          }
        });
        pos++;
      }
    });

    updated++;
  }

  console.log(`\nDone. Updated ${updated} products. Skipped ${skipped} (no DB product).${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
