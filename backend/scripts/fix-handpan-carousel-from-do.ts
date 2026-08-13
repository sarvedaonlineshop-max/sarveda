/**
 * Rebuild Handpan (wooCommerceId 8058) variant galleries from DO carousel meta.
 *
 * Live sarveda.com uses ACF product_gallery_carousel_image_linked_with_* slots
 * filtered per variation — not the full Woo _product_image_gallery dump.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-handpan-carousel-from-do.ts
 *   npx tsx scripts/fix-handpan-carousel-from-do.ts --apply
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

const WOO_PRODUCT_ID = 8058;
const REPO_ROOT = path.resolve(__dirname, "../..");
const DO_ATTACHMENTS = path.join(REPO_ROOT, "data/compare/do_attachments.csv");
const MAP_FILE = path.join(REPO_ROOT, "data/media-migration-map.json");

/** DO pa_type term IDs → LS variant SKU */
const TERM_TO_SKU: Record<string, string> = {
  "43957": "MI-HP-DC-9", // D Celtic Minor 9
  "43958": "MI-HP-DK-10", // D Kurd 10
};

/** Carousel slots from live DO (product 8058), Aug 2026 */
const CAROUSEL_SLOTS: Array<{
  slot: number;
  imageId: string | null;
  terms: string[];
  youtube: string | null;
}> = [
  { slot: 0, imageId: "46695", terms: ["43958"], youtube: null },
  { slot: 1, imageId: "10328", terms: ["43957"], youtube: null },
  { slot: 2, imageId: "10333", terms: ["43957"], youtube: null },
  { slot: 3, imageId: "46699", terms: ["43957"], youtube: null },
  { slot: 4, imageId: "46698", terms: ["43958"], youtube: null },
  { slot: 5, imageId: "46697", terms: ["43958"], youtube: null },
  { slot: 6, imageId: "46700", terms: ["43957", "43958"], youtube: null },
  { slot: 7, imageId: "46701", terms: ["43957", "43958"], youtube: null },
  { slot: 8, imageId: "46702", terms: ["43957"], youtube: null },
  { slot: 9, imageId: null, terms: ["43957"], youtube: "https://www.youtube.com/embed/1n-lA4fS69U" },
  { slot: 10, imageId: null, terms: ["43958"], youtube: "https://www.youtube.com/embed/q6fN3rm5N1U" },
];

const prisma = new PrismaClient();

function loadAttachments(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(DO_ATTACHMENTS)) throw new Error(`Missing ${DO_ATTACHMENTS}`);
  const rows = parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
  for (const r of rows) {
    const url = (r.url || "").trim();
    if (url) map.set(String(r.id), url);
  }
  return map;
}

function loadCdnMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(MAP_FILE)) return map;
  const raw = JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) as Array<{ from: string; to: string; ok: boolean }>;
  for (const row of raw) {
    if (row.ok && row.from && row.to) map.set(row.from.trim(), row.to.trim());
  }
  return map;
}

function keyForWpUpload(url: string): string | null {
  const prefix = "https://sarveda.com/wp-content/uploads/";
  if (!url.startsWith(prefix)) return null;
  return `media/wp/uploads/${url.slice(prefix.length)}`;
}

async function appendMap(from: string, to: string, key: string, ok: boolean, error?: string) {
  let entries: Array<{ from: string; to: string; key: string; ok: boolean; error?: string }> = [];
  if (fs.existsSync(MAP_FILE)) {
    entries = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  }
  entries = entries.filter((e) => e.from !== from);
  entries.push({ from, to, key, ok, error });
  fs.writeFileSync(MAP_FILE, JSON.stringify(entries, null, 2));
}

async function resolveS3Url(doUrl: string, cdnMap: Map<string, string>): Promise<string> {
  const cached = cdnMap.get(doUrl);
  if (cached) return cached;

  const s3Key = keyForWpUpload(doUrl);
  if (!s3Key) throw new Error(`Cannot derive S3 key for ${doUrl}`);

  if (DRY_RUN) return `[dry-run] ${doUrl}`;

  const mirrored = await mirrorUrlToS3(doUrl, s3Key);
  if (!mirrored) throw new Error(`S3 mirror returned null for ${doUrl}`);
  await appendMap(doUrl, mirrored, s3Key, true);
  cdnMap.set(doUrl, mirrored);
  return mirrored;
}

function galleryForTerm(termId: string): Array<{ doUrl: string | null; youtube: string | null }> {
  const out: Array<{ doUrl: string | null; youtube: string | null }> = [];
  for (const slot of CAROUSEL_SLOTS) {
    if (!slot.terms.includes(termId)) continue;
    if (slot.youtube) {
      out.push({ doUrl: null, youtube: slot.youtube });
      continue;
    }
    if (slot.imageId) out.push({ doUrl: slot.imageId, youtube: null });
  }
  return out;
}

async function main(): Promise<void> {
  const attachments = loadAttachments();
  const cdnMap = loadCdnMap();

  const product = await prisma.product.findFirst({
    where: { wooCommerceId: WOO_PRODUCT_ID, deletedAt: null },
    include: {
      variants: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } },
      images: true,
    },
  });

  if (!product) throw new Error(`Product wooCommerceId=${WOO_PRODUCT_ID} not found`);

  const variantBySku = new Map(product.variants.map((v) => [v.sku, v]));
  console.log(`Product: ${product.slug} (${product.id})`);
  console.log(`Existing images: ${product.images.length}`);
  console.log(`Variants: ${product.variants.map((v) => v.sku).join(", ")}`);
  console.log(DRY_RUN ? "DRY RUN — pass --apply to write\n" : "APPLY mode\n");

  type PlanRow = {
    sku: string;
    variantId: string;
    position: number;
    doUrl: string;
    s3Url: string;
    isPrimary: boolean;
    videoUrl: string | null;
  };

  const plan: PlanRow[] = [];
  const videoBySku = new Map<string, string>();

  for (const [termId, sku] of Object.entries(TERM_TO_SKU)) {
    const variant = variantBySku.get(sku);
    if (!variant) throw new Error(`Variant SKU ${sku} not found`);

    const items = galleryForTerm(termId);
    let position = 0;
    for (const item of items) {
      if (item.youtube) {
        videoBySku.set(sku, item.youtube);
        continue;
      }
      if (!item.doUrl) continue;
      const doUrl = attachments.get(item.doUrl);
      if (!doUrl) throw new Error(`Attachment ${item.doUrl} not in do_attachments.csv`);

      const s3Url = await resolveS3Url(doUrl, cdnMap);
      plan.push({
        sku,
        variantId: variant.id,
        position,
        doUrl,
        s3Url,
        isPrimary: position === 0,
        videoUrl: null,
      });
      position++;
    }
  }

  console.log("Planned variant galleries:");
  for (const sku of Object.values(TERM_TO_SKU)) {
    const rows = plan.filter((r) => r.sku === sku);
    console.log(`  ${sku}: ${rows.length} images, video=${videoBySku.get(sku) ?? "none"}`);
    for (const r of rows) {
      console.log(`    [${r.position}] ${path.basename(r.doUrl)}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run with --apply to update DB + S3.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId: product.id } });

    for (const row of plan) {
      await tx.productImage.create({
        data: {
          productId: product.id,
          variantId: row.variantId,
          url: row.s3Url,
          altText: row.sku,
          position: row.position,
          isPrimary: row.isPrimary,
        },
      });
    }

    for (const [sku, videoUrl] of videoBySku.entries()) {
      const variant = variantBySku.get(sku);
      if (!variant) continue;
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { videoUrl },
      });
    }
  });

  console.log(`\nDone. Created ${plan.length} variant-linked images for ${product.slug}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
