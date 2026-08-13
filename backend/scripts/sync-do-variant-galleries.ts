/**
 * Sync variant galleries from DO → Lightsail (Handpan-style PDP).
 *
 * Uses:
 *   data/compare/do-ls-media-pull-v2.json   — LS SKU ↔ DO variation (secondary fuzzy)
 *   data/compare/do_carousel_meta.json      — ACF carousel slots per Woo product
 *   data/compare/do_attachments.csv
 *   data/compare/do_variants.csv
 *
 * Rules:
 *   - LS SKU is source of truth; only rows with action pull | pull_fallback
 *   - Carousel products: rebuild per-variant gallery from ACF slots
 *   - Others: variant featured image (+ video) from DO _thumbnail_id
 *   - DNA Tuning Fork fallback: donor DO variation gallery/thumb for new Standard variant
 *   - Skips products on hold (no pull rows)
 *
 * Usage (run on Lightsail after git pull):
 *   npx tsx scripts/sync-do-variant-galleries.ts
 *   npx tsx scripts/sync-do-variant-galleries.ts --apply
 *   npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug handpan
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
const SLUG_FILTER = (() => {
  const i = process.argv.indexOf("--product-slug");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const REPO_ROOT = path.resolve(__dirname, "../..");
const PULL_V2 = path.join(REPO_ROOT, "data/compare/do-ls-media-pull-v2.json");
const CAROUSEL_META = path.join(REPO_ROOT, "data/compare/do_carousel_meta.json");
const DO_ATTACHMENTS = path.join(REPO_ROOT, "data/compare/do_attachments.csv");
const DO_VARIANTS = path.join(REPO_ROOT, "data/compare/do_variants.csv");
const MAP_FILE = path.join(REPO_ROOT, "data/media-migration-map.json");
const OUT_JSON = path.join(REPO_ROOT, "data/compare/do-gallery-sync-results.json");

const prisma = new PrismaClient();

type PullRow = {
  ls_product: string;
  do_product: string;
  ls_variant: string;
  do_variant: string;
  ls_sku: string;
  do_sku: string;
  note: string;
  action: string;
  do_variation_id: string;
};

type CarouselSlot = {
  index: number;
  imageId: string | null;
  iframe?: string | null;
  youtube?: string | null;
  termIds: string[];
};

type CarouselProduct = {
  wooProductId: number;
  slots: CarouselSlot[];
  variations: Array<{
    variationId: number;
    title: string;
    attrs: Record<string, string>;
    termIds: string[];
  }>;
};

type PlannedImage = {
  lsSku: string;
  variantId: string;
  position: number;
  doUrl: string;
  s3Url: string;
  isPrimary: boolean;
};

type ProductResult = {
  lsProduct: string;
  slug: string;
  mode: string;
  status: string;
  imagesCreated: number;
  variantsUpdated: number;
  detail: string;
};

function loadAttachments(): Map<string, string> {
  const map = new Map<string, string>();
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

function loadDoVariantMedia(): Map<string, { thumbId: string; video: string }> {
  const map = new Map<string, { thumbId: string; video: string }>();
  const rows = parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
  for (const r of rows) {
    map.set(String(r.id), {
      thumbId: (r.thumb_id || "").trim(),
      video: (r.video || "").trim(),
    });
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
  if (!mirrored) throw new Error(`S3 mirror returned null`);
  await appendMap(doUrl, mirrored, s3Key, true);
  cdnMap.set(doUrl, mirrored);
  return mirrored;
}

function isRealVideo(v: string): boolean {
  const s = (v || "").trim();
  if (!s || s.startsWith("field_")) return false;
  return /^https?:\/\//i.test(s) || /youtube\.com|youtu\.be/i.test(s);
}

function extractYoutube(url: string): string | null {
  const m = url.match(/youtube\.com\/embed\/([^"?]+)/i);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function buildCarouselMeta(): {
  byWooId: Map<number, CarouselProduct>;
  termNames: Record<string, string>;
} {
  const byWooId = new Map<number, CarouselProduct>();
  let termNames: Record<string, string> = {};
  if (!fs.existsSync(CAROUSEL_META)) return { byWooId, termNames };
  const raw = JSON.parse(fs.readFileSync(CAROUSEL_META, "utf8")) as {
    products: CarouselProduct[];
    termNames?: Record<string, string>;
  };
  termNames = raw.termNames ?? {};
  for (const p of raw.products) {
    byWooId.set(p.wooProductId, p);
  }
  return { byWooId, termNames };
}

function normText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function variationHaystack(v: CarouselProduct["variations"][0]): string {
  return normText(`${Object.values(v.attrs).join(" ")} ${v.title}`);
}

function slotAppliesToVariation(
  slot: CarouselSlot,
  variation: CarouselProduct["variations"][0],
  termNames: Record<string, string>
): boolean {
  if (!slot.termIds.length) return true;

  if (variation.termIds.some((t) => slot.termIds.includes(t))) return true;

  const hay = variationHaystack(variation);
  for (const tid of slot.termIds) {
    const tname = termNames[tid];
    if (!tname) continue;
    const n = normText(tname);
    if (!n) continue;
    if (hay.includes(n)) return true;
    if (hay.includes(n.replace(/\s+/g, "-"))) return true;
  }
  return false;
}

/** DO variation id → Lightsail variant id */
function buildDoToLsVariantMap(
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of pullRows) {
    if (!r.do_variation_id || !r.ls_sku) continue;
    const vid = skuToVariantId.get(r.ls_sku.trim());
    if (vid) map.set(r.do_variation_id, vid);
  }
  return map;
}

function lsVariantsForSlot(
  slot: CarouselSlot,
  carousel: CarouselProduct,
  doToLs: Map<string, string>,
  termNames: Record<string, string>,
  ignoreTermFilter = false
): Set<string> {
  const out = new Set<string>();

  if (ignoreTermFilter || !slot.termIds.length) {
    for (const vid of doToLs.values()) out.add(vid);
    return out;
  }

  for (const v of carousel.variations) {
    const mapped = doToLs.get(String(v.variationId));
    if (!mapped) continue;
    if (slotAppliesToVariation(slot, v, termNames)) out.add(mapped);
  }

  return out;
}

async function planCarouselProduct(
  carousel: CarouselProduct,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  termNames: Record<string, string>,
  ignoreTermFilter = false
): Promise<{ images: PlannedImage[]; videoByVariantId: Map<string, string> }> {
  const doToLs = buildDoToLsVariantMap(pullRows, skuToVariantId);
  const images: PlannedImage[] = [];
  const videoByVariantId = new Map<string, string>();
  const positionByVariant = new Map<string, number>();

  const sortedSlots = [...carousel.slots].sort((a, b) => a.index - b.index);

  for (const slot of sortedSlots) {
    const targetVariants = lsVariantsForSlot(slot, carousel, doToLs, termNames, ignoreTermFilter);

    if (slot.youtube) {
      for (const vid of targetVariants) {
        if (!videoByVariantId.has(vid)) videoByVariantId.set(vid, slot.youtube!);
      }
      continue;
    }

    if (slot.iframe) {
      const yt = extractYoutube(slot.iframe);
      if (yt) {
        for (const vid of targetVariants) {
          if (!videoByVariantId.has(vid)) videoByVariantId.set(vid, yt);
        }
      }
      continue;
    }

    if (!slot.imageId) continue;
    const doUrl = attachments.get(slot.imageId);
    if (!doUrl) continue;

    const s3Url = await resolveS3Url(doUrl, cdnMap);

    for (const variantId of targetVariants) {
      const lsSku =
        [...skuToVariantId.entries()].find(([, id]) => id === variantId)?.[0] || "";
      const pos = positionByVariant.get(variantId) ?? 0;
      images.push({
        lsSku,
        variantId,
        position: pos,
        doUrl,
        s3Url,
        isPrimary: pos === 0,
      });
      positionByVariant.set(variantId, pos + 1);
    }
  }

  return { images, videoByVariantId };
}

async function planThumbProduct(
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  isFallback: boolean
): Promise<{ images: PlannedImage[]; videoByVariantId: Map<string, string> }> {
  const images: PlannedImage[] = [];
  const videoByVariantId = new Map<string, string>();

  if (isFallback && pullRows.length === 1) {
    const donorId = pullRows[0]!.do_variation_id;
    const donor = doVariantMedia.get(donorId);
    const lsSku = pullRows[0]!.ls_sku;
    const variantId = skuToVariantId.get(lsSku);
    if (variantId && donor?.thumbId) {
      const doUrl = attachments.get(donor.thumbId);
      if (doUrl) {
        const s3Url = await resolveS3Url(doUrl, cdnMap);
        images.push({ lsSku, variantId, position: 0, doUrl, s3Url, isPrimary: true });
      }
      if (donor.video && isRealVideo(donor.video)) {
        videoByVariantId.set(variantId, donor.video);
      }
    }
    return { images, videoByVariantId };
  }

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku);
    if (!variantId) continue;
    const media = doVariantMedia.get(r.do_variation_id);
    if (!media?.thumbId) continue;
    const doUrl = attachments.get(media.thumbId);
    if (!doUrl) continue;
    const s3Url = await resolveS3Url(doUrl, cdnMap);
    images.push({
      lsSku: r.ls_sku,
      variantId,
      position: 0,
      doUrl,
      s3Url,
      isPrimary: true,
    });
    if (media.video && isRealVideo(media.video)) {
      videoByVariantId.set(variantId, media.video);
    }
  }

  return { images, videoByVariantId };
}

/** Add DO featured thumbs for pull rows that still have no carousel image. */
async function mergeThumbFallback(
  images: PlannedImage[],
  videoByVariantId: Map<string, string>,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>
): Promise<PlannedImage[]> {
  const covered = new Set(images.map((i) => i.variantId));
  const merged = [...images];
  const posByVariant = new Map<string, number>();
  for (const img of images) {
    posByVariant.set(img.variantId, Math.max(posByVariant.get(img.variantId) ?? 0, img.position + 1));
  }

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId || covered.has(variantId)) continue;

    const media = doVariantMedia.get(r.do_variation_id);
    if (!media?.thumbId) continue;
    const doUrl = attachments.get(media.thumbId);
    if (!doUrl) continue;

    const s3Url = await resolveS3Url(doUrl, cdnMap);
    const pos = posByVariant.get(variantId) ?? 0;
    merged.push({
      lsSku: r.ls_sku,
      variantId,
      position: pos,
      doUrl,
      s3Url,
      isPrimary: pos === 0,
    });
    covered.add(variantId);
    if (media.video && isRealVideo(media.video) && !videoByVariantId.has(variantId)) {
      videoByVariantId.set(variantId, media.video);
    }
  }

  return merged;
}

async function syncProduct(
  lsProductName: string,
  pullRows: PullRow[],
  carouselByWoo: Map<number, CarouselProduct>,
  termNames: Record<string, string>,
  attachments: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  cdnMap: Map<string, string>
): Promise<ProductResult> {
  const product = await prisma.product.findFirst({
    where: { name: lsProductName, deletedAt: null, status: "ACTIVE" },
    include: {
      variants: { where: { status: "ACTIVE" } },
      images: true,
    },
  });

  if (!product) {
    return {
      lsProduct: lsProductName,
      slug: "",
      mode: "skip",
      status: "skipped",
      imagesCreated: 0,
      variantsUpdated: 0,
      detail: "LS product not found in DB",
    };
  }

  if (SLUG_FILTER && product.slug !== SLUG_FILTER) {
    return {
      lsProduct: lsProductName,
      slug: product.slug,
      mode: "skip",
      status: "filtered",
      imagesCreated: 0,
      variantsUpdated: 0,
      detail: "Slug filter",
    };
  }

  const skuToVariantId = new Map(
    product.variants.map((v) => [v.sku.trim(), v.id] as const)
  );

  const missingSku = pullRows.filter((r) => !skuToVariantId.has(r.ls_sku.trim()));
  if (missingSku.length) {
    return {
      lsProduct: lsProductName,
      slug: product.slug,
      mode: "skip",
      status: "skipped",
      imagesCreated: 0,
      variantsUpdated: 0,
      detail: `LS SKU not in DB: ${missingSku.map((r) => r.ls_sku).join(", ")}`,
    };
  }

  const isFallback = pullRows.some((r) => r.action === "pull_fallback");
  const wooId = product.wooCommerceId ?? undefined;
  const carousel = wooId ? carouselByWoo.get(wooId) : undefined;

  let images: PlannedImage[] = [];
  let videoByVariantId = new Map<string, string>();
  let mode = "thumb";

  if (carousel && carousel.slots.length > 0) {
    mode = "carousel";
    const rowsForCarousel = isFallback
      ? pullRows.filter((r) => r.do_variation_id)
      : pullRows;
    const carouselUse =
      isFallback && rowsForCarousel[0]
        ? {
            ...carousel,
            variations: carousel.variations.filter(
              (v) => String(v.variationId) === rowsForCarousel[0]!.do_variation_id
            ),
          }
        : carousel;
    const planned = await planCarouselProduct(
      carouselUse,
      rowsForCarousel,
      skuToVariantId,
      attachments,
      cdnMap,
      termNames,
      isFallback
    );
    images = planned.images;
    videoByVariantId = planned.videoByVariantId;

    // Fill gaps: carousel term mapping often misses attrs — use DO featured thumb per variant
    const beforeThumb = images.length;
    images = await mergeThumbFallback(
      images,
      videoByVariantId,
      pullRows,
      skuToVariantId,
      doVariantMedia,
      attachments,
      cdnMap
    );
    if (images.length > beforeThumb && beforeThumb > 0) {
      mode = "carousel+thumb";
    } else if (images.length > 0 && beforeThumb === 0) {
      mode = "carousel+thumb";
    }

    // DNA-style fallback: if carousel yielded nothing, use donor thumb
    if (isFallback && images.length === 0) {
      const thumbPlan = await planThumbProduct(
        pullRows,
        skuToVariantId,
        doVariantMedia,
        attachments,
        cdnMap,
        true
      );
      images = thumbPlan.images;
      videoByVariantId = thumbPlan.videoByVariantId;
      mode = "fallback_thumb";
    }
  } else {
    const planned = await planThumbProduct(
      pullRows,
      skuToVariantId,
      doVariantMedia,
      attachments,
      cdnMap,
      isFallback
    );
    images = planned.images;
    videoByVariantId = planned.videoByVariantId;
  }

  if (!images.length && videoByVariantId.size === 0) {
    return {
      lsProduct: lsProductName,
      slug: product.slug,
      mode,
      status: "no_media",
      imagesCreated: 0,
      variantsUpdated: 0,
      detail: "No resolvable DO images for matched variants",
    };
  }

  if (DRY_RUN) {
    return {
      lsProduct: lsProductName,
      slug: product.slug,
      mode,
      status: "dry_run",
      imagesCreated: images.length,
      variantsUpdated: videoByVariantId.size,
      detail: `Would sync ${images.length} images, ${videoByVariantId.size} videos`,
    };
  }

  await prisma.$transaction(async (tx) => {
    // Remove images for variants we're updating (+ shared junk)
    const variantIds = new Set(images.map((i) => i.variantId));
    await tx.productImage.deleteMany({
      where: {
        productId: product.id,
        OR: [{ variantId: { in: [...variantIds] } }, { variantId: null }],
      },
    });

    for (const img of images) {
      await tx.productImage.create({
        data: {
          productId: product.id,
          variantId: img.variantId,
          url: img.s3Url,
          altText: img.lsSku,
          position: img.position,
          isPrimary: img.isPrimary,
        },
      });
    }

    for (const [variantId, videoUrl] of videoByVariantId.entries()) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { videoUrl },
      });
    }
  });

  return {
    lsProduct: lsProductName,
    slug: product.slug,
    mode,
    status: "synced",
    imagesCreated: images.length,
    variantsUpdated: videoByVariantId.size,
    detail: `Synced ${images.length} variant images (${mode})`,
  };
}

async function main(): Promise<void> {
  for (const f of [PULL_V2, DO_ATTACHMENTS, DO_VARIANTS]) {
    if (!fs.existsSync(f)) throw new Error(`Missing ${f}`);
  }

  const pullData = JSON.parse(fs.readFileSync(PULL_V2, "utf8")) as { rows: PullRow[] };
  const pullRows = pullData.rows.filter((r) => r.action === "pull" || r.action === "pull_fallback");

  const byProduct = new Map<string, PullRow[]>();
  for (const r of pullRows) {
    const list = byProduct.get(r.ls_product) || [];
    list.push(r);
    byProduct.set(r.ls_product, list);
  }

  const attachments = loadAttachments();
  const doVariantMedia = loadDoVariantMedia();
  const cdnMap = loadCdnMap();
  const { byWooId, termNames } = buildCarouselMeta();

  console.log(DRY_RUN ? "DRY RUN — pass --apply to write DB + S3\n" : "APPLY mode\n");
  console.log(`Products to sync: ${byProduct.size} (${pullRows.length} variant rows)\n`);

  const results: ProductResult[] = [];
  let synced = 0;
  let failed = 0;

  for (const [lsProduct, rows] of [...byProduct.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    try {
      const result = await syncProduct(
        lsProduct,
        rows,
        byWooId,
        termNames,
        attachments,
        doVariantMedia,
        cdnMap
      );
      results.push(result);
      if (result.status === "synced" || result.status === "dry_run") {
        synced++;
        console.log(`✓ ${result.slug || lsProduct}: ${result.detail}`);
      } else if (result.status !== "filtered") {
        console.log(`– ${lsProduct}: ${result.detail}`);
      }
    } catch (e) {
      failed++;
      const msg = (e as Error).message;
      results.push({
        lsProduct,
        slug: "",
        mode: "error",
        status: "failed",
        imagesCreated: 0,
        variantsUpdated: 0,
        detail: msg,
      });
      console.error(`✗ ${lsProduct}: ${msg}`);
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify({ results, synced, failed }, null, 2));
  console.log(`\nDone. ${synced} products processed, ${failed} failed.`);
  console.log(`Results: ${OUT_JSON}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
