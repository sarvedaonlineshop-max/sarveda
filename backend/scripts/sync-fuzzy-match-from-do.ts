/**
 * Sync Lightsail variants from DO using Fuzzy Match sheet (pending-do-vs-ls-launch.xlsx).
 * Updates LS only: INR prices, stock (100 if DO in stock), variant images + videos from DO.
 *
 * Usage (Lightsail after git pull + fresh DO CSVs):
 *   npx tsx scripts/sync-fuzzy-match-from-do.ts
 *   npx tsx scripts/sync-fuzzy-match-from-do.ts --apply
 *   npx tsx scripts/sync-fuzzy-match-from-do.ts --apply --limit=10
 *   npx tsx scripts/sync-fuzzy-match-from-do.ts --apply --overwrite-media
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import { parseDecimal, toPaise } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY || process.argv.includes("--dry-run");
const OVERWRITE_MEDIA = process.argv.includes("--overwrite-media");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : undefined;
const offsetArg = process.argv.find((a) => a.startsWith("--offset="));
const OFFSET = offsetArg ? parseInt(offsetArg.split("=")[1]!, 10) : 0;

const REPO_ROOT = path.resolve(__dirname, "../..");
const FUZZY_XLSX = path.join(REPO_ROOT, "data/compare/pending-do-vs-ls-launch.xlsx");
const DO_PRODUCTS = path.join(REPO_ROOT, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO_ROOT, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO_ROOT, "data/compare/do_attachments.csv");
const MAP_FILE = path.join(REPO_ROOT, "data/media-migration-map.json");
const OUT_JSON = path.join(REPO_ROOT, "data/compare/fuzzy-do-sync-results.json");

const prisma = new PrismaClient();
const IN_STOCK_PLACEHOLDER = 100;

type FuzzyRow = {
  doProduct: string;
  lsProduct: string;
  doVariant: string;
  lsVariant: string;
  doSku: string;
  lsSku: string;
};

type DoVariant = {
  id: string;
  parentId: string;
  parentSlug: string;
  sku: string;
  variantName: string;
  thumbId: string;
  video: string;
  regularPrice: string;
  salePrice: string;
  stockQty: string;
  stockStatus: string;
};

type SyncResult = FuzzyRow & {
  status: string;
  detail: string;
  doVariantId: string;
  lsVariantId: string;
  priceBefore: string;
  priceAfter: string;
  stockBefore: number | null;
  stockAfter: number | null;
  media: string;
};

function normText(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normVariant(s: string): string {
  return normText(s).replace(/[\s|/·,–—-]+/g, " ").trim();
}

function normSku(s: string): string {
  return (s || "").trim().toUpperCase();
}

function parseDoVariantName(attrs: string, title: string, productName: string): string {
  if (attrs) {
    const parts: string[] = [];
    for (const seg of attrs.split(";")) {
      if (seg.includes("=")) parts.push(seg.split("=").slice(1).join("=").trim());
    }
    if (parts.length) return parts.join(" / ");
  }
  if (title.includes(" - ")) {
    const tail = title.split(" - ").slice(1).join(" - ").trim();
    if (tail && normText(tail) !== normText(productName)) return tail;
  }
  return "";
}

function isRealVideo(v: string): boolean {
  const s = (v || "").trim();
  if (!s || s.startsWith("field_")) return false;
  return /^https?:\/\//i.test(s) || /youtube\.com|youtu\.be/i.test(s);
}

function doOnHand(v: DoVariant): number {
  const status = (v.stockStatus || "").trim().toLowerCase();
  if (status === "outofstock") return 0;
  if (status === "instock" || status === "onbackorder") return IN_STOCK_PLACEHOLDER;
  const q = parseInt(v.stockQty, 10);
  if (!Number.isNaN(q) && q > 0) return IN_STOCK_PLACEHOLDER;
  if (!v.stockStatus && !v.stockQty) return IN_STOCK_PLACEHOLDER;
  return 0;
}

function priceFromDo(v: DoVariant): { mrpInPaise: number; saleInPaise: number } | null {
  const sale = parseDecimal(v.salePrice);
  const regular = parseDecimal(v.regularPrice);
  const effective = sale ?? regular;
  if (effective == null || effective <= 0) return null;
  const mrp = regular ?? effective;
  const saleP = sale ?? regular ?? effective;
  return {
    mrpInPaise: toPaise(Math.max(mrp, saleP)),
    saleInPaise: toPaise(saleP),
  };
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

function keyForDoImage(productSlug: string, sku: string, sourceUrl: string): string {
  const ext = path.extname(new URL(sourceUrl).pathname) || ".jpg";
  const safeSku = (sku || "variant").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return `products/${productSlug}/variants/${safeSku}${ext}`;
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

function loadDoData() {
  const products = parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  const productNameById = new Map<string, string>();
  const productSlugById = new Map<string, string>();
  const productVideoById = new Map<string, string>();
  const productThumbById = new Map<string, string>();
  const productGalleryById = new Map<string, string[]>();

  for (const p of products) {
    if ((p.status || "").toLowerCase() !== "publish") continue;
    productNameById.set(p.id, p.name || "");
    productSlugById.set(p.id, p.slug || "");
    productVideoById.set(p.id, p.video || "");
    productThumbById.set(p.id, p.thumb_id || "");
    const gal = (p.gallery || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    productGalleryById.set(p.id, gal);
  }

  const attachments = new Map<string, string>();
  if (fs.existsSync(DO_ATTACHMENTS)) {
    const rows = parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as Record<string, string>[];
    for (const r of rows) {
      const url = (r.url || "").trim();
      if (url) attachments.set(String(r.id), url);
    }
  }

  const bySku = new Map<string, DoVariant>();
  const byKey = new Map<string, DoVariant>();

  const variants = parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  for (const v of variants) {
    if ((v.status || "").toLowerCase() !== "publish") continue;
    const parentId = v.parent_id || "";
    const productName = productNameById.get(parentId) || "";
    const dv: DoVariant = {
      id: v.id || "",
      parentId,
      parentSlug: v.parent_slug || productSlugById.get(parentId) || "",
      sku: (v.sku || "").trim(),
      variantName: parseDoVariantName(v.attrs || "", v.title || "", productName),
      thumbId: (v.thumb_id || "").trim(),
      video: (v.video || "").trim(),
      regularPrice: v.regular_price || "",
      salePrice: v.sale_price || "",
      stockQty: v.stock_qty || "",
      stockStatus: v.stock_status || "",
    };
    if (dv.sku) bySku.set(normSku(dv.sku), dv);
    byKey.set(`${normText(productName)}::${normVariant(dv.variantName)}`, dv);
    byKey.set(`${normText(v.parent_slug || "")}::${normVariant(dv.variantName)}`, dv);
  }

  for (const p of products) {
    if ((p.status || "").toLowerCase() !== "publish") continue;
    if ((p.product_type || "").toLowerCase() !== "simple") continue;
    const dv: DoVariant = {
      id: p.id,
      parentId: p.id,
      parentSlug: p.slug || "",
      sku: (p.sku || "").trim(),
      variantName: "",
      thumbId: (p.thumb_id || "").trim(),
      video: (p.video || "").trim(),
      regularPrice: p.regular_price || "",
      salePrice: p.sale_price || "",
      stockQty: "",
      stockStatus: "",
    };
    if (dv.sku) bySku.set(normSku(dv.sku), dv);
    byKey.set(`${normText(p.name || "")}::`, dv);
  }

  return { attachments, bySku, byKey, productVideoById, productThumbById, productGalleryById };
}

function resolveDoVariant(row: FuzzyRow, doData: ReturnType<typeof loadDoData>): DoVariant | null {
  if (row.doSku) {
    const hit = doData.bySku.get(normSku(row.doSku));
    if (hit) return hit;
  }
  if (row.lsSku) {
    const hit = doData.bySku.get(normSku(row.lsSku));
    if (hit) return hit;
  }
  const keys = [
    `${normText(row.doProduct)}::${normVariant(row.doVariant)}`,
    `${normText(row.doProduct)}::${normVariant(row.lsVariant)}`,
    `${normText(row.lsProduct)}::${normVariant(row.doVariant)}`,
    `${normText(row.lsProduct)}::${normVariant(row.lsVariant)}`,
  ];
  for (const k of keys) {
    const hit = doData.byKey.get(k);
    if (hit) return hit;
  }
  return null;
}

function resolveImageUrl(doVar: DoVariant, doData: ReturnType<typeof loadDoData>): string | null {
  if (doVar.thumbId) {
    const u = doData.attachments.get(doVar.thumbId);
    if (u) return u;
  }
  const parentThumb = doData.productThumbById.get(doVar.parentId);
  if (parentThumb) {
    const u = doData.attachments.get(parentThumb);
    if (u) return u;
  }
  for (const gid of doData.productGalleryById.get(doVar.parentId) || []) {
    const u = doData.attachments.get(gid);
    if (u) return u;
  }
  return null;
}

async function readFuzzyRows(): Promise<FuzzyRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FUZZY_XLSX);
  const ws = wb.getWorksheet("Fuzzy Match");
  if (!ws) throw new Error('Missing "Fuzzy Match" sheet');
  const out: FuzzyRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const doProduct = String(row.getCell(1).value ?? "").trim();
    const lsProduct = String(row.getCell(2).value ?? "").trim();
    const doVariant = String(row.getCell(3).value ?? "").trim();
    const lsVariant = String(row.getCell(4).value ?? "").trim();
    const doSku = String(row.getCell(5).value ?? "").trim();
    const lsSku = String(row.getCell(6).value ?? "").trim();
    if (!lsProduct && !lsSku) return;
    out.push({ doProduct, lsProduct, doVariant, lsVariant, doSku, lsSku });
  });
  return out;
}

async function findLsVariant(row: FuzzyRow) {
  if (row.lsSku) {
    const hit = await prisma.productVariant.findFirst({
      where: {
        sku: { equals: row.lsSku, mode: "insensitive" },
        status: "ACTIVE",
        productRel: { deletedAt: null, status: "ACTIVE" },
      },
      include: {
        inventory: true,
        images: { orderBy: { position: "asc" } },
        productRel: { select: { id: true, slug: true, name: true, videoUrl: true } },
      },
    });
    if (hit) return hit;
  }
  if (!row.lsProduct) return null;
  const candidates = await prisma.productVariant.findMany({
    where: {
      status: "ACTIVE",
      productRel: {
        deletedAt: null,
        status: "ACTIVE",
        name: { equals: row.lsProduct, mode: "insensitive" },
      },
    },
    include: {
      inventory: true,
      images: { orderBy: { position: "asc" } },
      attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
      productRel: { select: { id: true, slug: true, name: true, videoUrl: true } },
    },
  });
  const target = normVariant(row.lsVariant);
  for (const v of candidates) {
    const label = v.attributeValues
      .slice()
      .sort((a, b) => a.attributeValue.attribute.slug.localeCompare(b.attributeValue.attribute.slug))
      .map((a) => a.attributeValue.value)
      .join(" / ");
    if (normVariant(label) === target || (!target && !label)) return v;
  }
  return candidates[0] ?? null;
}

async function syncRow(
  row: FuzzyRow,
  doData: ReturnType<typeof loadDoData>,
  cdnMap: Map<string, string>
): Promise<SyncResult> {
  const base: SyncResult = {
    ...row,
    status: "pending",
    detail: "",
    doVariantId: "",
    lsVariantId: "",
    priceBefore: "",
    priceAfter: "",
    stockBefore: null,
    stockAfter: null,
    media: "",
  };

  const doVar = resolveDoVariant(row, doData);
  if (!doVar) {
    return { ...base, status: "conflict_no_do", detail: "Could not resolve DO variant" };
  }
  base.doVariantId = doVar.id;

  const variant = await findLsVariant(row);
  if (!variant) {
    return { ...base, status: "conflict_no_ls", detail: "Could not resolve Lightsail variant" };
  }
  base.lsVariantId = variant.id;

  const parts: string[] = [];
  base.priceBefore = `${variant.saleInPaise / 100}`;
  base.stockBefore = variant.inventory?.onHand ?? null;

  const prices = priceFromDo(doVar);
  if (prices) {
    base.priceAfter = `${prices.saleInPaise / 100}`;
    if (variant.mrpInPaise !== prices.mrpInPaise || variant.saleInPaise !== prices.saleInPaise) {
      if (!DRY_RUN) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { mrpInPaise: prices.mrpInPaise, saleInPaise: prices.saleInPaise },
        });
      }
      parts.push("price");
    } else {
      parts.push("price_ok");
    }
  } else {
    parts.push("price_missing_do");
  }

  const targetStock = doOnHand(doVar);
  base.stockAfter = targetStock;
  if ((variant.inventory?.onHand ?? 0) !== targetStock) {
    if (!DRY_RUN) {
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: targetStock, reserved: 0 },
        update: { onHand: targetStock },
      });
    }
    parts.push("stock");
  } else {
    parts.push("stock_ok");
  }

  const doImageUrl = resolveImageUrl(doVar, doData);
  const productVideo = doData.productVideoById.get(doVar.parentId) || "";
  const doVideoUrl = isRealVideo(doVar.video)
    ? doVar.video
    : isRealVideo(productVideo)
      ? productVideo
      : "";

  const existingImg = variant.images[0];
  let mediaPart = "media_none";
  if (doImageUrl) {
    const same =
      existingImg &&
      (existingImg.url === doImageUrl ||
        cdnMap.get(doImageUrl) === existingImg.url ||
        existingImg.url.includes(path.basename(doImageUrl)));
    if (same) {
      mediaPart = "image_ok";
    } else if (existingImg && !OVERWRITE_MEDIA) {
      mediaPart = "image_diff_kept";
    } else if (!DRY_RUN) {
      try {
        const s3Key =
          keyForWpUpload(doImageUrl) ||
          keyForDoImage(variant.productRel.slug, variant.sku, doImageUrl);
        const mirrored = await mirrorUrlToS3(doImageUrl, s3Key);
        if (!mirrored) throw new Error("S3 mirror failed");
        if (existingImg) {
          await prisma.productImage.update({
            where: { id: existingImg.id },
            data: { url: mirrored, altText: existingImg.altText || variant.sku },
          });
        } else {
          await prisma.productImage.create({
            data: {
              productId: variant.productId,
              variantId: variant.id,
              url: mirrored,
              altText: variant.sku,
              position: 0,
              isPrimary: false,
            },
          });
        }
        await appendMap(doImageUrl, mirrored, s3Key, true);
        mediaPart = "image_pulled";
      } catch (e) {
        return {
          ...base,
          status: "failed",
          detail: [...parts, `image_fail:${(e as Error).message}`].join("; "),
          media: "image_fail",
        };
      }
    } else {
      mediaPart = "image_would_pull";
    }
  }

  if (doVideoUrl) {
    if (!variant.videoUrl || (OVERWRITE_MEDIA && variant.videoUrl !== doVideoUrl)) {
      if (!DRY_RUN) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { videoUrl: doVideoUrl },
        });
      }
      mediaPart += "+video";
    } else {
      mediaPart += "+video_ok";
    }
  }

  base.media = mediaPart;
  base.detail = [...parts, mediaPart].join("; ");
  base.status = base.detail.includes("fail") ? "failed" : "synced";
  return base;
}

async function main() {
  for (const f of [FUZZY_XLSX, DO_PRODUCTS, DO_VARIANTS]) {
    if (!fs.existsSync(f)) throw new Error(`Missing ${f}`);
  }

  let rows = await readFuzzyRows();
  rows = rows.slice(OFFSET, LIMIT != null ? OFFSET + LIMIT : undefined);

  const doData = loadDoData();
  const cdnMap = loadCdnMap();
  const results: SyncResult[] = [];
  const conflicts: SyncResult[] = [];

  console.log(
    `Mode: ${DRY_RUN ? "DRY_RUN" : "APPLY"} | rows: ${rows.length} | overwrite-media: ${OVERWRITE_MEDIA}`
  );

  for (let i = 0; i < rows.length; i++) {
    const res = await syncRow(rows[i]!, doData, cdnMap);
    results.push(res);
    if (res.status.startsWith("conflict") || res.status === "failed") conflicts.push(res);
    if ((i + 1) % 50 === 0) console.log(`  … ${i + 1}/${rows.length}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? "DRY_RUN" : "APPLY",
    offset: OFFSET,
    limit: LIMIT ?? rows.length,
    processed: results.length,
    synced: results.filter((r) => r.status === "synced").length,
    conflicts: conflicts.length,
    priceUpdated: results.filter((r) => r.detail.includes("price;") || r.detail.startsWith("price;")).length,
    stockUpdated: results.filter((r) => r.detail.includes("; stock") || r.detail.startsWith("stock;")).length,
    mediaPulled: results.filter((r) => r.media.includes("image_pulled") || r.media.includes("image_would_pull"))
      .length,
    overwriteMedia: OVERWRITE_MEDIA,
    conflictRows: conflicts.slice(0, 100).map((r) => ({
      lsSku: r.lsSku,
      lsProduct: r.lsProduct,
      doProduct: r.doProduct,
      status: r.status,
      detail: r.detail,
    })),
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT_JSON}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
