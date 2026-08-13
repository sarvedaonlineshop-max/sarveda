/**
 * Pull DO Woo variant images (and videos when present) into Lightsail Postgres + S3.
 *
 * Uses matched rows from data/compare/do-ls-pull-list.xlsx (both LS + DO variant present).
 * Only fills empty variant images unless --overwrite-different.
 *
 * Usage (Lightsail backend):
 *   npx tsx scripts/pull-do-media-from-do.ts --dry-run
 *   npx tsx scripts/pull-do-media-from-do.ts --apply
 */
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY || process.argv.includes("--dry-run");
const OVERWRITE = process.argv.includes("--overwrite-different");

const REPO_ROOT = path.resolve(__dirname, "../..");
const PULL_LIST = path.join(REPO_ROOT, "data/compare/do-ls-pull-list.xlsx");
const DO_PRODUCTS = path.join(REPO_ROOT, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO_ROOT, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO_ROOT, "data/compare/do_attachments.csv");
const MAP_FILE = path.join(REPO_ROOT, "data/media-migration-map.json");
const OUT_JSON = path.join(REPO_ROOT, "data/compare/do-media-pull-results.json");
const OUT_XLSX = path.join(REPO_ROOT, "data/compare/do-ls-pull-list.xlsx");

const prisma = new PrismaClient();

type PullRow = {
  lsProduct: string;
  doProduct: string;
  lsVariant: string;
  doVariant: string;
  lsSku: string;
  doSku: string;
  note: string;
};

type DoVariant = {
  id: string;
  parentId: string;
  parentSlug: string;
  sku: string;
  variantName: string;
  thumbId: string;
  video: string;
};

type ResultRow = PullRow & {
  status: string;
  doImageUrl: string;
  lsImageUrlBefore: string;
  lsImageUrlAfter: string;
  doVideoUrl: string;
  lsVideoAfter: string;
  detail: string;
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
  return "Standard";
}

function isRealVideo(v: string): boolean {
  const s = (v || "").trim();
  if (!s || s.startsWith("field_")) return false;
  return /^https?:\/\//i.test(s) || /youtube\.com|youtu\.be/i.test(s);
}

function basename(url: string): string {
  try {
    return path.basename(new URL(url.split("?")[0]!).pathname);
  } catch {
    return path.basename((url || "").split("?")[0]!);
  }
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

function urlsSameAsset(lsUrl: string, doUrl: string, cdnMap: Map<string, string>): boolean {
  const a = (lsUrl || "").trim();
  const b = (doUrl || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (cdnMap.get(b) === a) return true;
  for (const [from, to] of cdnMap.entries()) {
    if (from === b && to === a) return true;
    if (from === a && to === b) return true;
  }
  const ba = basename(a);
  const bb = basename(b);
  if (ba && bb && ba === bb) return true;
  if (a.includes(bb) || b.includes(ba)) return true;
  return false;
}

function keyForDoImage(productSlug: string, sku: string, sourceUrl: string): string {
  const ext = path.extname(new URL(sourceUrl).pathname) || ".jpg";
  const safeSku = sku.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return `products/${productSlug}/variants/${safeSku}${ext}`;
}

function keyForWpUpload(url: string): string | null {
  const prefix = "https://sarveda.com/wp-content/uploads/";
  if (!url.startsWith(prefix)) return null;
  return `media/wp/uploads/${url.slice(prefix.length)}`;
}

async function readPullList(): Promise<PullRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PULL_LIST);
  const ws = wb.getWorksheet("Pull List");
  if (!ws) throw new Error("Missing Pull List sheet");
  const out: PullRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const lsProduct = String(row.getCell(1).value ?? "").trim();
    const doProduct = String(row.getCell(2).value ?? "").trim();
    const lsVariant = String(row.getCell(3).value ?? "").trim();
    const doVariant = String(row.getCell(4).value ?? "").trim();
    const lsSku = String(row.getCell(5).value ?? "").trim();
    const doSku = String(row.getCell(6).value ?? "").trim();
    const note = String(row.getCell(7).value ?? "").trim();
    if (!lsProduct || lsVariant === "—" || doVariant === "—") return;
    out.push({ lsProduct, doProduct, lsVariant, doVariant, lsSku, doSku, note });
  });
  return out;
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
  for (const p of products) {
    if ((p.status || "").toLowerCase() !== "publish") continue;
    productNameById.set(p.id, p.name || "");
    productSlugById.set(p.id, p.slug || "");
    productVideoById.set(p.id, p.video || "");
    productThumbById.set(p.id, p.thumb_id || "");
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
    };
    if (dv.sku) bySku.set(normSku(dv.sku), dv);
    byKey.set(`${normText(productName)}::${normVariant(dv.variantName)}`, dv);
    byKey.set(`${normText(v.parent_slug || "")}::${normVariant(dv.variantName)}`, dv);
  }

  return { attachments, bySku, byKey, productVideoById, productThumbById, productNameById };
}

function resolveDoVariant(row: PullRow, doData: ReturnType<typeof loadDoData>): DoVariant | null {
  if (row.doSku) {
    const hit = doData.bySku.get(normSku(row.doSku));
    if (hit) return hit;
  }
  if (row.lsSku) {
    const hit = doData.bySku.get(normSku(row.lsSku));
    if (hit) return hit;
  }
  return (
    doData.byKey.get(`${normText(row.doProduct)}::${normVariant(row.doVariant)}`) ||
    doData.byKey.get(`${normText(row.doProduct)}::${normVariant(row.lsVariant)}`) ||
    null
  );
}

function resolveImageUrl(thumbId: string, attachments: Map<string, string>): string | null {
  if (!thumbId) return null;
  return attachments.get(thumbId) || null;
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

async function processRow(
  row: PullRow,
  doData: ReturnType<typeof loadDoData>,
  cdnMap: Map<string, string>
): Promise<ResultRow> {
  const base: ResultRow = {
    ...row,
    status: "pending",
    doImageUrl: "",
    lsImageUrlBefore: "",
    lsImageUrlAfter: "",
    doVideoUrl: "",
    lsVideoAfter: "",
    detail: "",
  };

  const doVar = resolveDoVariant(row, doData);
  if (!doVar) {
    return { ...base, status: "skipped_no_do_variant", detail: "Could not resolve DO variant row" };
  }

  const doImageUrl = resolveImageUrl(doVar.thumbId, doData.attachments);
  base.doImageUrl = doImageUrl || "";

  const productVideo = doData.productVideoById.get(doVar.parentId) || "";
  const doVideoUrl = isRealVideo(doVar.video)
    ? doVar.video
    : isRealVideo(productVideo)
      ? productVideo
      : "";
  base.doVideoUrl = doVideoUrl;

  const variant = await prisma.productVariant.findFirst({
    where: {
      sku: row.lsSku,
      status: "ACTIVE",
      productRel: { deletedAt: null, status: "ACTIVE", name: row.lsProduct },
    },
    include: {
      images: { orderBy: { position: "asc" } },
      productRel: { select: { id: true, slug: true, videoUrl: true } },
    },
  });

  if (!variant) {
    return { ...base, status: "skipped_no_ls_variant", detail: `LS variant not found for SKU ${row.lsSku}` };
  }

  const existingImg = variant.images[0];
  base.lsImageUrlBefore = existingImg?.url || "";

  if (!doImageUrl && !doVideoUrl) {
    return { ...base, status: "skipped_no_do_media", detail: "DO has no image or video URL" };
  }

  let imageStatus = "unchanged";
  let finalImageUrl = existingImg?.url || "";

  if (doImageUrl) {
    if (existingImg && urlsSameAsset(existingImg.url, doImageUrl, cdnMap)) {
      imageStatus = "already_same_as_do";
      finalImageUrl = existingImg.url;
    } else if (existingImg && !OVERWRITE) {
      imageStatus = "ls_image_different";
      finalImageUrl = existingImg.url;
    } else {
      const s3Key =
        keyForWpUpload(doImageUrl) ||
        keyForDoImage(variant.productRel.slug, variant.sku, doImageUrl);
      if (DRY_RUN) {
        imageStatus = "would_pull_image";
        finalImageUrl = `[dry-run] ${doImageUrl}`;
      } else {
        try {
          const mirrored = await mirrorUrlToS3(doImageUrl, s3Key);
          if (!mirrored) throw new Error("S3 mirror returned null");
          finalImageUrl = mirrored;
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
          imageStatus = "pulled_same_as_do";
        } catch (e) {
          return {
            ...base,
            status: "failed_image",
            detail: (e as Error).message,
            lsImageUrlAfter: existingImg?.url || "",
          };
        }
      }
    }
  }

  let videoStatus = "unchanged";
  let finalVideo = variant.videoUrl || variant.productRel.videoUrl || "";
  if (doVideoUrl && !variant.videoUrl && !variant.productRel.videoUrl) {
    if (DRY_RUN) {
      videoStatus = "would_pull_video";
      finalVideo = doVideoUrl;
    } else {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { videoUrl: doVideoUrl },
      });
      videoStatus = "pulled_video";
      finalVideo = doVideoUrl;
    }
  } else if (doVideoUrl && variant.videoUrl === doVideoUrl) {
    videoStatus = "video_already_same";
  }

  base.lsImageUrlAfter = finalImageUrl;
  base.lsVideoAfter = finalVideo;

  if (imageStatus === "already_same_as_do" || imageStatus === "pulled_same_as_do") {
    base.status = doVideoUrl ? `${imageStatus}+video_${videoStatus}` : imageStatus;
    base.detail =
      imageStatus === "already_same_as_do"
        ? "LS variant image already matches DO source"
        : "Mirrored DO image to S3 and linked to variant";
  } else if (imageStatus === "ls_image_different") {
    base.status = "ls_image_different";
    base.detail = "LS has a different image; not overwritten";
  } else if (!doImageUrl && doVideoUrl) {
    base.status = videoStatus;
    base.detail = "Video only on DO";
  } else {
    base.status = imageStatus;
    base.detail = base.detail || imageStatus;
  }

  return base;
}

async function writeSegregatedXlsx(results: ResultRow[]) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(PULL_LIST)) {
    await wb.xlsx.readFile(PULL_LIST);
  }

  const headers = [
    "Lightsail Product name",
    "DO DB product name",
    "Lightsail variant name",
    "DO variant name",
    "Lightsail SKU",
    "DO SKU",
    "Status",
    "DO image URL",
    "LS image before",
    "LS image after",
    "DO video URL",
    "LS video after",
    "Detail",
  ];

  const groups: Record<string, ResultRow[]> = {
    "Media — Same as DO": [],
    "Media — Pulled from DO": [],
    "Media — LS image different": [],
    "Media — Skipped": [],
    "Media — Failed": [],
  };

  for (const r of results) {
    if (r.status.includes("already_same_as_do")) groups["Media — Same as DO"]!.push(r);
    else if (r.status.includes("pulled_same_as_do") || r.status.includes("would_pull_image"))
      groups["Media — Pulled from DO"]!.push(r);
    else if (r.status === "ls_image_different") groups["Media — LS image different"]!.push(r);
    else if (r.status.startsWith("failed")) groups["Media — Failed"]!.push(r);
    else groups["Media — Skipped"]!.push(r);
  }

  for (const [name, rows] of Object.entries(groups)) {
    const existing = wb.getWorksheet(name);
    if (existing) wb.removeWorksheet(existing.id);
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    for (const r of rows) {
      ws.addRow([
        r.lsProduct,
        r.doProduct,
        r.lsVariant,
        r.doVariant,
        r.lsSku,
        r.doSku,
        r.status,
        r.doImageUrl,
        r.lsImageUrlBefore,
        r.lsImageUrlAfter,
        r.doVideoUrl,
        r.lsVideoAfter,
        r.detail,
      ]);
    }
  }

  const sm = wb.getWorksheet("Media Summary");
  if (sm) wb.removeWorksheet(sm.id);
  const summary = wb.addWorksheet("Media Summary");
  const sameImage = results.filter((r) => r.status.includes("already_same_as_do") || r.status.includes("pulled_same_as_do"));
  const productsSame = new Set(sameImage.map((r) => r.lsProduct));
  summary.addRow(["Metric", "Value"]);
  summary.addRow(["Mode", DRY_RUN ? "DRY_RUN" : "APPLY"]);
  summary.addRow(["Matched variant rows processed", results.length]);
  summary.addRow(["Variants with image same as DO (final)", sameImage.length]);
  summary.addRow(["Products with ≥1 variant same as DO", productsSame.size]);
  summary.addRow(["Pulled new image from DO", results.filter((r) => r.status.includes("pulled_same_as_do")).length]);
  summary.addRow(["Already had same image as DO", results.filter((r) => r.status.includes("already_same_as_do")).length]);
  summary.addRow(["LS image different (not overwritten)", results.filter((r) => r.status === "ls_image_different").length]);
  summary.addRow(["Skipped", results.filter((r) => r.status.startsWith("skipped")).length]);
  summary.addRow(["Failed", results.filter((r) => r.status.startsWith("failed")).length]);
  summary.addRow(["DO videos in dump", results.filter((r) => r.doVideoUrl).length]);

  await wb.xlsx.writeFile(OUT_XLSX);
}

async function main() {
  for (const p of [PULL_LIST, DO_PRODUCTS, DO_VARIANTS]) {
    if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  }
  if (!fs.existsSync(DO_ATTACHMENTS)) {
    throw new Error(`Missing ${DO_ATTACHMENTS} — re-run dump_do_woo.py on DO server`);
  }

  console.log(`Mode: ${DRY_RUN ? "DRY_RUN" : "APPLY"}`);
  const rows = await readPullList();
  console.log(`Matched variant rows: ${rows.length}`);

  const doData = loadDoData();
  console.log(`DO attachments: ${doData.attachments.size}`);

  const cdnMap = loadCdnMap();
  const results: ResultRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${rows.length}`);
    results.push(await processRow(row, doData, cdnMap));
  }

  const sameImage = results.filter((r) => r.status.includes("already_same_as_do") || r.status.includes("pulled_same_as_do"));
  const productsSame = new Set(sameImage.map((r) => r.lsProduct));

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? "DRY_RUN" : "APPLY",
    processed: results.length,
    variantsSameImageAsDo: sameImage.length,
    productsSameImageAsDo: productsSame.size,
    pulled: results.filter((r) => r.status.includes("pulled_same_as_do")).length,
    alreadySame: results.filter((r) => r.status.includes("already_same_as_do")).length,
    different: results.filter((r) => r.status === "ls_image_different").length,
    skipped: results.filter((r) => r.status.startsWith("skipped")).length,
    failed: results.filter((r) => r.status.startsWith("failed")).length,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, results }, null, 2));
  await writeSegregatedXlsx(results);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Updated ${OUT_XLSX}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
