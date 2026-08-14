/**
 * Full DO → Lightsail sync for the 21 formerly "dead" fuzzy-match products.
 * LS SKU retained; prices, media, copy, accordion, pair-with from DO parent/simple product.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/sync-do-dead-21-batch.ts
 *   npx tsx scripts/sync-do-dead-21-batch.ts --apply
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import {
  PrismaClient,
  ProductRelationType,
  ProductStatus,
  VariantStatus,
} from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import { parseDecimal, toPaise } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const REPO = path.resolve(__dirname, "../..");
const DO_PRODUCTS = path.join(REPO, "data/compare/do_products.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const WC_PRODUCTS = path.join(REPO, "backend/prisma/wc-products.csv");
const BACKUP_DIR = path.join(REPO, "data/compare/live-dead-21-sync-backups");

const STOCK_DEFAULT = 100;

/** LS slug + DO woo id + SKUs to keep (unchanged). */
const BATCH: Array<{ lsSlug: string; wooId: number; lsSkus: string[] }> = [
  { lsSlug: "8-keys-wooden-xylophone", wooId: 42340, lsSkus: ["MI-XY-W-8"] },
  { lsSlug: "annapurna-shankh", wooId: 51249, lsSkus: ["MI-SK-AP"] },
  { lsSlug: "belly-bowls", wooId: 47924, lsSkus: ["MI-SB-BB"] },
  { lsSlug: "bendo-chimes", wooId: 47751, lsSkus: ["MI-BE-CH"] },
  { lsSlug: "conscious-cards", wooId: 45533, lsSkus: ["ME-CC"] },
  { lsSlug: "crystal-bowl-with-handle", wooId: 45661, lsSkus: ["MI-CB-H"] },
  { lsSlug: "gomukhi-shankh", wooId: 51250, lsSkus: ["MI-SK-GM"] },
  { lsSlug: "handpan-stand", wooId: 46907, lsSkus: ["MI-HP-S"] },
  { lsSlug: "heart-chakra-singing-bowl", wooId: 45473, lsSkus: ["MI-SB-HC"] },
  { lsSlug: "root-chakra-singing-bowl", wooId: 45469, lsSkus: ["MI-SB-RC"] },
  { lsSlug: "shruti-box-pedal", wooId: 51090, lsSkus: ["MI-STB-P"] },
  { lsSlug: "singing-bowl-set-g-a-b", wooId: 49832, lsSkus: ["MI-SB-GAB-SET3"] },
  { lsSlug: "singing-bowl-with-handle", wooId: 48931, lsSkus: ["MI-SB-H"] },
  { lsSlug: "sleigh-bells-wooden-jingle-stick", wooId: 50608, lsSkus: ["MI-JE-S"] },
  { lsSlug: "solar-bell", wooId: 49816, lsSkus: ["MI-BL-SR"] },
  { lsSlug: "sughosh-shankh", wooId: 51251, lsSkus: ["MI-SK-SG"] },
  {
    lsSlug: "the-four-bowl-set-root-heart-third-eye-and-universal",
    wooId: 45334,
    lsSkus: ["MI-SB-RHTU-SET4"],
  },
  { lsSlug: "the-head-bowl", wooId: 45518, lsSkus: ["MI-SB-HB"] },
  {
    lsSlug: "the-three-bowl-set-root-heart-and-third-eye",
    wooId: 45327,
    lsSkus: ["MI-SB-RHT-SET3"],
  },
  { lsSlug: "third-eye-chakra-singing-bowl", wooId: 45477, lsSkus: ["MI-SB-TEC"] },
  { lsSlug: "wooden-guiro", wooId: 50572, lsSkus: ["MI-GRO"] },
];

type DoProduct = Record<string, string>;

const actions: string[] = [];

function log(msg: string) {
  console.log(msg);
  actions.push(msg);
}

function parsePhpIntList(raw: string): number[] {
  const ids: number[] = [];
  for (const m of (raw || "").matchAll(/i:\d+;i:(\d+);/g)) {
    ids.push(Number(m[1]));
  }
  return [...new Set(ids.filter((n) => n > 0))];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(<\/p>)\s+(<p)/gi, "$1$2")
    .trim();
}

function isRealVideo(v: string): boolean {
  const s = (v || "").trim();
  if (!s || s.startsWith("field_")) return false;
  return /^https?:\/\//i.test(s) || /youtube\.com|youtu\.be/i.test(s);
}

function loadAttachments(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(DO_ATTACHMENTS)) return map;
  for (const row of parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if (row.url) map.set(String(row.id), row.url.trim());
  }
  return map;
}

function loadDoProduct(wooId: number): DoProduct | null {
  for (const row of parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if (row.id === String(wooId)) return row;
  }
  return null;
}

function galleryUrls(doP: DoProduct, attachments: Map<string, string>): string[] {
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

function loadWcRow(wooId: number): Record<string, string> | null {
  if (!fs.existsSync(WC_PRODUCTS)) return null;
  const rows = parse(fs.readFileSync(WC_PRODUCTS, "utf8"), {
    relax_column_count: true,
    bom: true,
  }) as string[][];
  const header = rows[0];
  if (!header) return null;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const row = rows.find((r) => r[0] === String(wooId));
  if (!row) return null;
  const out: Record<string, string> = {};
  for (const [k, i] of Object.entries(idx)) out[k] = row[i] ?? "";
  return out;
}

function wcImages(row: Record<string, string> | null): string[] {
  if (!row) return [];
  return (row.Images || "")
    .split(",")
    .map((s) => s.trim())
    .filter((u) => u.startsWith("http"));
}

function loadAccordion(wooId: number): Array<{ title: string; content: string }> {
  const row = loadWcRow(wooId);
  if (!row) return [];
  const text = fs.readFileSync(WC_PRODUCTS, "utf8");
  const rows = parse(text, { relax_column_count: true, bom: true }) as string[][];
  const header = rows[0];
  if (!header) return [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const dataRow = rows.find((r) => r[0] === String(wooId));
  if (!dataRow) return [];

  const items: Array<{ title: string; content: string }> = [];
  for (let n = 1; n <= 30; n++) {
    const title = (dataRow[idx[`Meta: product_description_accordion_item_${n}_title`]] || "").trim();
    const content = (dataRow[idx[`Meta: product_description_accordion_item_${n}_description`]] || "").trim();
    if (!title && !content) continue;
    if (title.startsWith("field_")) continue;
    items.push({ title, content });
  }
  return items;
}

async function fetchWooStore(slug: string) {
  try {
    const res = await fetch(
      `https://sarveda.com/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      description: string;
      short_description: string;
      images?: Array<{ src: string }>;
    }>;
    const p = data[0];
    if (!p) return null;
    return {
      description: normalizeHtml(p.description || ""),
      shortDescription: normalizeHtml(p.short_description || ""),
      images: (p.images || []).map((i) => i.src).filter(Boolean),
    };
  } catch {
    return null;
  }
}

function priceFromDo(doP: DoProduct): { mrpInPaise: number; saleInPaise: number } | null {
  const sale = parseDecimal(doP.sale_price);
  const regular = parseDecimal(doP.regular_price);
  const effective = sale ?? regular;
  if (effective == null || effective <= 0) return null;
  const mrp = regular ?? effective;
  const saleP = sale ?? regular ?? effective;
  return { mrpInPaise: toPaise(Math.max(mrp, saleP)), saleInPaise: toPaise(saleP) };
}

async function mirrorImages(productSlug: string, urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    if (!APPLY) {
      out.push(url);
      continue;
    }
    try {
      const ext = path.extname(new URL(url).pathname) || ".jpg";
      const key = `products/${productSlug}/${i === 0 ? "primary" : `gallery-${i}`}${ext}`;
      out.push((await mirrorUrlToS3(url, key)) || url);
    } catch {
      out.push(url);
    }
  }
  return out;
}

async function mirrorOne(productSlug: string, sku: string, url: string, label: string): Promise<string> {
  if (!APPLY) return url;
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const key = `products/${productSlug}/variants/${sku}-${label}${ext}`;
  return (await mirrorUrlToS3(url, key)) || url;
}

async function setPairWith(fromProductId: string, wooIds: number[]) {
  for (let position = 0; position < wooIds.length; position++) {
    const wooId = wooIds[position]!;
    const to = await prisma.product.findFirst({
      where: { wooCommerceId: wooId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!to) {
      log(`    pair-with woo ${wooId} not on LS`);
      continue;
    }
    log(`    PAIR_WITH → ${to.name}`);
    if (!APPLY) continue;
    await prisma.productRelation.upsert({
      where: {
        fromProductId_toProductId_type: {
          fromProductId,
          toProductId: to.id,
          type: ProductRelationType.PAIR_WITH,
        },
      },
      create: {
        fromProductId,
        toProductId: to.id,
        type: ProductRelationType.PAIR_WITH,
        position,
      },
      update: { position },
    });
  }
}

async function syncOne(
  entry: (typeof BATCH)[0],
  attachments: Map<string, string>
): Promise<void> {
  const doP = loadDoProduct(entry.wooId);
  if (!doP) throw new Error(`DO product ${entry.wooId} missing`);

  const product = await prisma.product.findFirst({
    where: { slug: entry.lsSlug, deletedAt: null },
    include: { variants: true, images: true, accordionItems: true },
  });
  if (!product) {
    log(`SKIP ${entry.lsSlug} — not on LS`);
    return;
  }

  log(`\n=== ${product.name} (${entry.lsSlug}) woo ${entry.wooId} ===`);

  const wc = loadWcRow(entry.wooId);
  let description = normalizeHtml(wc?.Description || "");
  let shortDescription = normalizeHtml(wc?.["Short description"] || "");
  let imageUrls = wcImages(wc);

  if (!description || !imageUrls.length) {
    const live = await fetchWooStore(doP.slug || entry.lsSlug);
    if (live) {
      if (!description) description = live.description;
      if (!shortDescription) shortDescription = live.shortDescription;
      if (!imageUrls.length) imageUrls = live.images;
    }
  }
  if (!imageUrls.length) imageUrls = galleryUrls(doP, attachments);

  const accordion = loadAccordion(entry.wooId);
  const prices = priceFromDo(doP);
  if (!prices) throw new Error(`No DO price for woo ${entry.wooId}`);

  const videoRaw = doP.video || "";
  const productVideo = isRealVideo(videoRaw) ? videoRaw : null;
  const pairIds = parsePhpIntList(doP.upsell || "");

  log(`  price → ₹${prices.saleInPaise / 100} (was checking SKUs: ${entry.lsSkus.join(", ")})`);
  log(`  gallery ${imageUrls.length} urls, accordion ${accordion.length}, pair-with ${pairIds.length}`);

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        wooCommerceId: entry.wooId,
        status: ProductStatus.ACTIVE,
        taxClass: doP.tax_class || product.taxClass,
        description: description || product.description,
        shortDescription: shortDescription || product.shortDescription,
        seoTitle: doP.name || product.name,
        seoDescription: stripHtml(shortDescription || description).slice(0, 160),
        videoUrl: productVideo || product.videoUrl,
      },
    });

    await prisma.accordionItem.deleteMany({ where: { productId: product.id } });
    for (let i = 0; i < accordion.length; i++) {
      const a = accordion[i]!;
      await prisma.accordionItem.create({
        data: { productId: product.id, title: a.title, content: a.content, position: i },
      });
    }

    const mirrored = await mirrorImages(entry.lsSlug, imageUrls);
    await prisma.productImage.deleteMany({ where: { productId: product.id, variantId: null } });
    if (mirrored.length) {
      await prisma.productImage.createMany({
        data: mirrored.map((url, i) => ({
          productId: product.id,
          url,
          altText: product.name,
          position: i,
          isPrimary: i === 0,
        })),
      });
    }
  }

  const keepSkus = new Set(entry.lsSkus.map((s) => s.toUpperCase()));
  const thumbUrl = imageUrls[0] || attachments.get(doP.thumb_id || "") || null;

  for (const variant of product.variants) {
    const sku = variant.sku?.trim() || "";
    if (!sku || !keepSkus.has(sku.toUpperCase())) {
      if (variant.status === "ACTIVE") {
        log(`  DRAFT variant ${sku || variant.id}`);
        if (APPLY) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { status: VariantStatus.INACTIVE, isDefault: false },
          });
        }
      }
      continue;
    }

    log(`  SYNC ${sku} ₹${prices.saleInPaise / 100}`);
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          mrpInPaise: prices.mrpInPaise,
          saleInPaise: prices.saleInPaise,
          status: VariantStatus.ACTIVE,
        },
      });
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 },
        update: { onHand: STOCK_DEFAULT },
      });

      if (thumbUrl) {
        const mirroredThumb = await mirrorOne(entry.lsSlug, sku, thumbUrl, "thumb");
        const existing = await prisma.productImage.findFirst({
          where: { variantId: variant.id },
          orderBy: { position: "asc" },
        });
        if (existing) {
          await prisma.productImage.update({
            where: { id: existing.id },
            data: { url: mirroredThumb, altText: product.name },
          });
        } else {
          await prisma.productImage.create({
            data: {
              productId: product.id,
              variantId: variant.id,
              url: mirroredThumb,
              altText: product.name,
              position: 0,
              isPrimary: false,
            },
          });
        }
      }

      if (productVideo) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { videoUrl: productVideo },
        });
      }
    }
  }

  const primary = product.variants.find(
    (v) => v.sku && keepSkus.has(v.sku.toUpperCase()) && v.status === "ACTIVE"
  );
  if (APPLY && primary) {
    await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { isDefault: false } });
    await prisma.productVariant.update({ where: { id: primary.id }, data: { isDefault: true } });
  }

  if (pairIds.length) await setPairWith(product.id, pairIds);
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  log(`Batch size: ${BATCH.length}`);

  const attachments = loadAttachments();

  for (const entry of BATCH) {
    await syncOne(entry, attachments);
  }

  const out = path.join(BACKUP_DIR, `${stamp}-actions.json`);
  fs.writeFileSync(out, JSON.stringify(actions, null, 2));
  log(`\nLog → ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
