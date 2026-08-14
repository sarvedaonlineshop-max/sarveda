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
 *   - Carousel products: full ACF slot order (images + all YouTube iframes per variant)
 *   - Term mapping: JSON termNames + auto-inferred labels (size/colour/type) — no per-product hacks
 *   - Thumb fallback when carousel leaves a variant without images
 *   - Videos stored as ProductImage rows (embed URL) in carousel slot order; variant.videoUrl = first video
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

type PlannedMedia = {
  lsSku: string;
  variantId: string;
  position: number;
  kind: "image" | "video";
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

/** Woo pa_type term ids on etched-gongs (DO carousel slots). */
const ETCHED_CHAU_TYPE_TERM_NAMES: Record<string, string> = {
  "49222": "Chakra",
  "49224": "Mantra",
  "42040": "Buddhist Om",
};

function withEtchedChauTypeTerms(
  wooProductId: number,
  termNames: Record<string, string>
): Record<string, string> {
  if (wooProductId !== 49115) return termNames;
  return { ...termNames, ...ETCHED_CHAU_TYPE_TERM_NAMES };
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

function canonicalSizeLabel(v: CarouselProduct["variations"][0]): string | null {
  for (const val of Object.values(v.attrs)) {
    const m = val.match(/(\d+(?:\.\d+)?)\s*in(?:ch|ches)?/i);
    if (m) return `${m[1]} in`;
  }
  const tm = v.title.match(/(\d+(?:\.\d+)?)\s*in(?:ch|ches)?/i);
  if (tm) return `${tm[1]} in`;
  return null;
}

function sizeInches(v: CarouselProduct["variations"][0]): number {
  const label = canonicalSizeLabel(v);
  const m = label?.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]!) : 9999;
}

function labelForVariation(v: CarouselProduct["variations"][0]): string {
  const size = canonicalSizeLabel(v);
  if (size) return size;
  const attrs = Object.values(v.attrs).filter(Boolean);
  if (attrs.length) return attrs.join(" / ");
  const parts = v.title.split(" - ");
  return parts[parts.length - 1] || v.title;
}

function sortVariations(vars: CarouselProduct["variations"]): CarouselProduct["variations"] {
  if (vars.every((v) => canonicalSizeLabel(v))) {
    return [...vars].sort((a, b) => sizeInches(a) - sizeInches(b));
  }
  return [...vars].sort((a, b) =>
    normText(labelForVariation(a)).localeCompare(normText(labelForVariation(b)))
  );
}

function attrTokens(text: string): string[] {
  const n = normText(text);
  const out = new Set<string>([n, n.replace(/\s+/g, "-"), n.replace(/-/g, " ")]);
  const sizeM = n.match(/(\d+(?:\.\d+)?)\s*in(?:ch|ches)?/);
  if (sizeM) {
    out.add(`${sizeM[1]} in`);
    out.add(`${sizeM[1]}-in`);
  }
  return [...out];
}

/** Infer missing pa_* term labels from variation attrs + ordered slot term lists. */
function enrichTermNames(
  carousel: CarouselProduct,
  base: Record<string, string>
): Record<string, string> {
  const termNames = { ...base };
  const sortedVars = sortVariations(carousel.variations);

  for (const v of sortedVars) {
    const label = labelForVariation(v);
    termNames[String(v.variationId)] = label;
    for (const tid of v.termIds) {
      if (!termNames[tid]) termNames[tid] = label;
    }
  }

  const pairingSlots = [...carousel.slots]
    .filter((s) => s.termIds.length >= 2)
    .sort((a, b) => b.termIds.length - a.termIds.length);

  for (const slot of pairingSlots) {
    const missing = slot.termIds.filter((t) => !termNames[t]);
    if (!missing.length) continue;
    if (
      slot.termIds.length === sortedVars.length ||
      Math.abs(slot.termIds.length - sortedVars.length) <= 1
    ) {
      for (let i = 0; i < slot.termIds.length && i < sortedVars.length; i++) {
        const tid = slot.termIds[i]!;
        if (!termNames[tid]) termNames[tid] = labelForVariation(sortedVars[i]!);
      }
    }
  }

  return termNames;
}

function variationHaystack(v: CarouselProduct["variations"][0]): string {
  return normText(`${Object.values(v.attrs).join(" ")} ${v.title}`);
}

function slotTermsResolve(slot: CarouselSlot, termNames: Record<string, string>): boolean {
  return slot.termIds.some((t) => Boolean(termNames[t]?.trim()));
}

function slotAppliesToVariation(
  slot: CarouselSlot,
  variation: CarouselProduct["variations"][0],
  termNames: Record<string, string>
): boolean {
  if (!slot.termIds.length) return true;

  if (variation.termIds.some((t) => slot.termIds.includes(t))) return true;
  if (slot.termIds.includes(String(variation.variationId))) return true;

  const hay = variationHaystack(variation);
  const varTokens = new Set<string>();
  for (const val of Object.values(variation.attrs)) {
    for (const tok of attrTokens(val)) varTokens.add(tok);
  }
  for (const tok of attrTokens(variation.title)) varTokens.add(tok);

  for (const tid of slot.termIds) {
    const tname = termNames[tid];
    if (!tname) continue;
    for (const tok of attrTokens(tname)) {
      if (hay.includes(tok) || varTokens.has(tok)) return true;
    }
  }

  // Size-only carousels: when term labels are missing, apply shared slots to all variations.
  if ((slot.imageId || slot.youtube || slot.iframe) && slot.termIds.length >= 2) {
    if (!slotTermsResolve(slot, termNames)) {
      const hasTypeAxis = Boolean(variation.attrs.type || variation.attrs.Type);
      if (!hasTypeAxis) return true;
    }
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

function carouselVariationsLackTermIds(carousel: CarouselProduct): boolean {
  return carousel.variations.length > 0 && carousel.variations.every((v) => v.termIds.length === 0);
}

/** DO variation ids that use this Woo attachment as their featured thumb. */
function buildThumbToDoVariationIds(
  carousel: CarouselProduct,
  doVariantMedia: Map<string, { thumbId: string; video: string }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const v of carousel.variations) {
    const media = doVariantMedia.get(String(v.variationId));
    if (!media?.thumbId) continue;
    const list = map.get(media.thumbId) || [];
    list.push(String(v.variationId));
    map.set(media.thumbId, list);
  }
  return map;
}

/** When ACF termIds are missing on variations, route slots by featured thumb attachment id. */
function lsVariantsForSlotByThumb(
  slot: CarouselSlot,
  carousel: CarouselProduct,
  doToLs: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>
): Set<string> {
  const out = new Set<string>();
  if (!slot.imageId) return out;

  const thumbToDo = buildThumbToDoVariationIds(carousel, doVariantMedia);
  const matchedDo = thumbToDo.get(slot.imageId) || [];

  if (matchedDo.length) {
    for (const doId of matchedDo) {
      const ls = doToLs.get(doId);
      if (ls) out.add(ls);
    }
    return out;
  }

  // Shared accessory / lifestyle images (e.g. mallet) — all synced LS variants.
  for (const ls of doToLs.values()) out.add(ls);
  return out;
}

function lsVariantsForSlot(
  slot: CarouselSlot,
  carousel: CarouselProduct,
  doToLs: Map<string, string>,
  termNames: Record<string, string>,
  ignoreTermFilter = false,
  doVariantMedia?: Map<string, { thumbId: string; video: string }>
): Set<string> {
  const out = new Set<string>();

  if (
    doVariantMedia &&
    carouselVariationsLackTermIds(carousel) &&
    slot.imageId &&
    !ignoreTermFilter
  ) {
    return lsVariantsForSlotByThumb(slot, carousel, doToLs, doVariantMedia);
  }

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
  ignoreTermFilter = false,
  doVariantMedia?: Map<string, { thumbId: string; video: string }>
): Promise<{ media: PlannedMedia[]; videoByVariantId: Map<string, string> }> {
  const resolvedTerms = enrichTermNames(
    carousel,
    withEtchedChauTypeTerms(carousel.wooProductId, termNames)
  );
  const doToLs = buildDoToLsVariantMap(pullRows, skuToVariantId);
  const media: PlannedMedia[] = [];
  const videoByVariantId = new Map<string, string>();
  const positionByVariant = new Map<string, number>();

  const sortedSlots = [...carousel.slots].sort((a, b) => a.index - b.index);

  for (const slot of sortedSlots) {
    const targetVariants = lsVariantsForSlot(
      slot,
      carousel,
      doToLs,
      resolvedTerms,
      ignoreTermFilter,
      doVariantMedia
    );

    let embedUrl = slot.youtube ?? null;
    if (!embedUrl && slot.iframe) {
      embedUrl = extractYoutube(slot.iframe);
    }

    if (embedUrl) {
      for (const variantId of targetVariants) {
        const lsSku =
          [...skuToVariantId.entries()].find(([, id]) => id === variantId)?.[0] || "";
        const pos = positionByVariant.get(variantId) ?? 0;
        media.push({
          lsSku,
          variantId,
          position: pos,
          kind: "video",
          doUrl: embedUrl,
          s3Url: embedUrl,
          isPrimary: pos === 0,
        });
        positionByVariant.set(variantId, pos + 1);
        if (!videoByVariantId.has(variantId)) videoByVariantId.set(variantId, embedUrl);
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
      media.push({
        lsSku,
        variantId,
        position: pos,
        kind: "image",
        doUrl,
        s3Url,
        isPrimary: pos === 0,
      });
      positionByVariant.set(variantId, pos + 1);
    }
  }

  return { media, videoByVariantId };
}

async function planThumbProduct(
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  isFallback: boolean
): Promise<{ media: PlannedMedia[]; videoByVariantId: Map<string, string> }> {
  const media: PlannedMedia[] = [];
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
        media.push({
          lsSku,
          variantId,
          position: 0,
          kind: "image",
          doUrl,
          s3Url,
          isPrimary: true,
        });
      }
      if (donor.video && isRealVideo(donor.video)) {
        videoByVariantId.set(variantId, donor.video);
        media.push({
          lsSku,
          variantId,
          position: media.filter((m) => m.variantId === variantId).length,
          kind: "video",
          doUrl: donor.video,
          s3Url: donor.video,
          isPrimary: false,
        });
      }
    }
    return { media, videoByVariantId };
  }

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku);
    if (!variantId) continue;
    const rowMedia = doVariantMedia.get(r.do_variation_id);
    if (!rowMedia?.thumbId) continue;
    const doUrl = attachments.get(rowMedia.thumbId);
    if (!doUrl) continue;
    const s3Url = await resolveS3Url(doUrl, cdnMap);
    media.push({
      lsSku: r.ls_sku,
      variantId,
      position: 0,
      kind: "image",
      doUrl,
      s3Url,
      isPrimary: true,
    });
    if (rowMedia.video && isRealVideo(rowMedia.video)) {
      videoByVariantId.set(variantId, rowMedia.video);
      media.push({
        lsSku: r.ls_sku,
        variantId,
        position: 1,
        kind: "video",
        doUrl: rowMedia.video,
        s3Url: rowMedia.video,
        isPrimary: false,
      });
    }
  }

  return { media, videoByVariantId };
}

/** Add DO featured thumbs for pull rows that still have no carousel image. */
async function mergeThumbFallback(
  media: PlannedMedia[],
  videoByVariantId: Map<string, string>,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>
): Promise<PlannedMedia[]> {
  const covered = new Set(
    media.filter((m) => m.kind === "image").map((m) => m.variantId)
  );
  const merged = [...media];
  const posByVariant = new Map<string, number>();
  for (const m of media) {
    posByVariant.set(m.variantId, Math.max(posByVariant.get(m.variantId) ?? 0, m.position + 1));
  }

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId || covered.has(variantId)) continue;

    const rowMedia = doVariantMedia.get(r.do_variation_id);
    if (!rowMedia?.thumbId) continue;
    const doUrl = attachments.get(rowMedia.thumbId);
    if (!doUrl) continue;

    const s3Url = await resolveS3Url(doUrl, cdnMap);
    const pos = posByVariant.get(variantId) ?? 0;
    merged.push({
      lsSku: r.ls_sku,
      variantId,
      position: pos,
      kind: "image",
      doUrl,
      s3Url,
      isPrimary: pos === 0,
    });
    covered.add(variantId);
    posByVariant.set(variantId, pos + 1);

    if (rowMedia.video && isRealVideo(rowMedia.video) && !videoByVariantId.has(variantId)) {
      videoByVariantId.set(variantId, rowMedia.video);
      merged.push({
        lsSku: r.ls_sku,
        variantId,
        position: posByVariant.get(variantId) ?? pos + 1,
        kind: "video",
        doUrl: rowMedia.video,
        s3Url: rowMedia.video,
        isPrimary: false,
      });
      posByVariant.set(variantId, (posByVariant.get(variantId) ?? pos + 1) + 1);
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

  let media: PlannedMedia[] = [];
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
      isFallback,
      doVariantMedia
    );
    media = planned.media;
    videoByVariantId = planned.videoByVariantId;

    const beforeThumb = media.filter((m) => m.kind === "image").length;
    media = await mergeThumbFallback(
      media,
      videoByVariantId,
      pullRows,
      skuToVariantId,
      doVariantMedia,
      attachments,
      cdnMap
    );
    const afterThumb = media.filter((m) => m.kind === "image").length;
    if (afterThumb > beforeThumb && beforeThumb > 0) {
      mode = "carousel+thumb";
    } else if (media.length > 0 && beforeThumb === 0) {
      mode = "carousel+thumb";
    }

    if (isFallback && media.length === 0) {
      const thumbPlan = await planThumbProduct(
        pullRows,
        skuToVariantId,
        doVariantMedia,
        attachments,
        cdnMap,
        true
      );
      media = thumbPlan.media;
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
    media = planned.media;
    videoByVariantId = planned.videoByVariantId;
  }

  const imageCount = media.filter((m) => m.kind === "image").length;
  const videoCount = media.filter((m) => m.kind === "video").length;

  if (!media.length) {
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
      imagesCreated: imageCount,
      variantsUpdated: videoCount,
      detail: `Would sync ${imageCount} images, ${videoCount} videos (${media.length} gallery items)`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const variantIds = new Set(media.map((m) => m.variantId));
    await tx.productImage.deleteMany({
      where: {
        productId: product.id,
        OR: [{ variantId: { in: [...variantIds] } }, { variantId: null }],
      },
    });

    for (const item of media) {
      await tx.productImage.create({
        data: {
          productId: product.id,
          variantId: item.variantId,
          url: item.s3Url,
          altText: item.kind === "video" ? `${item.lsSku} video` : item.lsSku,
          position: item.position,
          isPrimary: item.isPrimary,
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
    imagesCreated: imageCount,
    variantsUpdated: videoCount,
    detail: `Synced ${imageCount} images, ${videoCount} videos (${mode})`,
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
