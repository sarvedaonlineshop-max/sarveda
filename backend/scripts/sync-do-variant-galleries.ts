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
const DO_PRODUCTS = path.join(REPO_ROOT, "data/compare/do_products.csv");
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
  /** Full DO variation list when `variations` is a per-plan subset */
  allVariations?: CarouselProduct["variations"];
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

/** DO variation id → Woo parent product id (for LS-only splits sharing DO carousel). */
function loadVariationParents(): Map<string, number> {
  const map = new Map<string, number>();
  const rows = parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
  for (const r of rows) {
    const parentId = Number(r.parent_id);
    if (r.id && Number.isFinite(parentId) && parentId > 0) {
      map.set(String(r.id), parentId);
    }
  }
  return map;
}

/** Woo parent product id → featured gallery attachment ids (do_products.csv). */
function loadParentGalleries(): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!fs.existsSync(DO_PRODUCTS)) return map;
  const rows = parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
  for (const r of rows) {
    const id = Number(r.id);
    const gallery = (r.gallery || "").trim();
    if (!Number.isFinite(id) || !gallery) continue;
    const ids = gallery
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) map.set(id, ids);
    const thumb = (r.thumb_id || "").trim();
    if (thumb && thumb !== "0") {
      const existing = map.get(id) || [];
      if (!existing.includes(thumb)) map.set(id, [thumb, ...existing]);
    }
  }
  return map;
}

function attachmentFilenameStem(url: string): string {
  const base = url.split("/").pop() || "";
  return base.replace(/-\d+(?=\.[a-z0-9]+$)/i, "").replace(/\.[a-z0-9]+$/i, "");
}

function isSpecificImageStem(stem: string): boolean {
  if (stem.length < 14) return false;
  return !/^(img|image|dsc|whatsapp|artboard|lp-|gong_|gong-)/i.test(stem);
}

/** When DO gallery is sparse, pull sibling attachments that share a specific filename stem. */
function expandGalleryFromAttachmentStems(
  ids: string[],
  attachments: Map<string, string>
): string[] {
  const out = [...ids];
  const stems = new Set<string>();
  for (const id of out) {
    const url = attachments.get(id);
    if (!url) continue;
    const stem = attachmentFilenameStem(url);
    if (isSpecificImageStem(stem)) stems.add(stem);
  }
  if (!stems.size) return out;
  const seen = new Set(out);
  for (const [id, url] of attachments) {
    if (seen.has(id)) continue;
    if (!stems.has(attachmentFilenameStem(url))) continue;
    seen.add(id);
    out.push(id);
  }
  return expandAdjacentSameFolderAttachments(out, attachments);
}

/** Include nearby attachment IDs in the same upload folder (often extra product shots). */
function expandAdjacentSameFolderAttachments(
  ids: string[],
  attachments: Map<string, string>
): string[] {
  const out = [...ids];
  const seen = new Set(ids);
  for (const id of ids) {
    const n = Number(id);
    const url = attachments.get(id);
    if (!Number.isFinite(n) || !url) continue;
    const dir = url.split("/").slice(0, -1).join("/");
    for (const adj of [n - 2, n - 1, n + 1, n + 2]) {
      const aid = String(adj);
      if (seen.has(aid)) continue;
      const aurl = attachments.get(aid);
      if (!aurl) continue;
      if (aurl.split("/").slice(0, -1).join("/") !== dir) continue;
      seen.add(aid);
      out.push(aid);
    }
  }
  return out;
}

/** Woo parent product id → featured thumb attachment id (do_products.csv). */
function loadParentThumbs(): Map<number, string> {
  const map = new Map<number, string>();
  if (!fs.existsSync(DO_PRODUCTS)) return map;
  const rows = parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
  for (const r of rows) {
    const id = Number(r.id);
    const thumb = (r.thumb_id || "").trim();
    if (!Number.isFinite(id) || !thumb || thumb === "0") continue;
    map.set(id, thumb);
  }
  return map;
}

function resolveWooProductId(
  wooCommerceId: number | null | undefined,
  pullRows: PullRow[],
  variationParents: Map<string, number>
): number | undefined {
  if (wooCommerceId) return wooCommerceId;
  for (const r of pullRows) {
    if (!r.do_variation_id) continue;
    const parent = variationParents.get(r.do_variation_id);
    if (parent) return parent;
  }
  return undefined;
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
function inferTermNamesFromSingleTermSlots(carousel: CarouselProduct): Record<string, string> {
  const extra: Record<string, string> = {};
  const singleSlots = carousel.slots.filter((s) => s.termIds.length === 1);
  if (!singleSlots.length) return extra;

  const sortedVars = [...carousel.variations].sort((a, b) => a.variationId - b.variationId);
  const usedVars = new Set<number>();

  for (const slot of singleSlots.sort((a, b) => a.index - b.index)) {
    const tid = slot.termIds[0]!;
    if (extra[tid]) continue;
    const match = sortedVars.find(
      (v) => !usedVars.has(v.variationId) && primaryAttrValue(v)
    );
    if (!match) continue;
    const label = primaryAttrValue(match)!;
    extra[tid] = label;
    usedVars.add(match.variationId);
  }

  return extra;
}

/** Yoga mats etc.: slots with exactly 2 termIds = grip + color. Maps grip term ids only (color ids are reused per grip). */
function inferDualGripColorTermNames(carousel: CarouselProduct): Record<string, string> {
  const extra: Record<string, string> = {};
  const dualSlots = carousel.slots.filter((s) => s.termIds.length === 2);
  if (!dualSlots.length) return extra;

  const gripTermIds = [...new Set(dualSlots.map((s) => s.termIds[0]!))];
  if (gripTermIds.length !== 2) return extra;

  const allVars = carousel.allVariations ?? carousel.variations;
  const grips = [
    ...new Set(
      allVars
        .map((v) => v.attrs.grip || v.attrs.Grip)
        .filter((g): g is string => Boolean(g?.trim()))
    ),
  ].sort();
  if (grips.length === 2) {
    const mod = grips.find((g) => g.toLowerCase().includes("moderate")) || grips[0]!;
    const sup = grips.find((g) => g.toLowerCase().includes("superior")) || grips[1]!;
    extra[gripTermIds[0]!] = mod;
    extra[gripTermIds[1]!] = sup;
  }

  return extra;
}

function hasDualGripColorSlots(carousel: CarouselProduct): boolean {
  const dualSlots = carousel.slots.filter((s) => s.termIds.length === 2);
  if (dualSlots.length < 2) return false;
  return new Set(dualSlots.map((s) => s.termIds[0]!)).size === 2;
}

/** Multi-term slots listing every pa_color id (± one grip) — shared lifestyle shots. */
function isDualGripColorBundleSlot(slot: CarouselSlot, carousel: CarouselProduct): boolean {
  if (slot.termIds.length <= 2 || !hasDualGripColorSlots(carousel)) return false;
  const dual = carousel.slots.filter((s) => s.termIds.length === 2);
  const colorIds = new Set(dual.map((s) => s.termIds[1]!));
  const terms = new Set(slot.termIds);
  return [...colorIds].filter((c) => terms.has(c)).length >= colorIds.size;
}

function dualGripBundleAppliesToVariation(
  slot: CarouselSlot,
  variation: CarouselProduct["variations"][0],
  carousel: CarouselProduct,
  gripTermNames: Record<string, string>
): boolean {
  const dual = carousel.slots.filter((s) => s.termIds.length === 2);
  const gripIds = [...new Set(dual.map((s) => s.termIds[0]!))];
  const terms = new Set(slot.termIds);
  const gripHits = gripIds.filter((g) => terms.has(g));
  const g = variation.attrs.grip || variation.attrs.Grip;
  if (!gripHits.length || !g) return false;
  if (gripHits.length === 1) return g === gripTermNames[gripHits[0]!];
  return gripHits.length === gripIds.length;
}

/** Color label for a grip+color slot — color term ids repeat across grips so cannot map globally. */
function expectedColorForGripColorSlot(
  carousel: CarouselProduct,
  gripId: string,
  colorId: string,
  gripTermNames: Record<string, string>
): string | null {
  const gripLabel = gripTermNames[gripId];
  if (!gripLabel) return null;
  const dualSlots = carousel.slots
    .filter((s) => s.termIds.length === 2 && s.termIds[0] === gripId)
    .sort((a, b) => a.index - b.index);
  const slotIdx = dualSlots.findIndex((s) => s.termIds[1] === colorId);
  if (slotIdx < 0) return null;
  const allVars = carousel.allVariations ?? carousel.variations;
  const vars = allVars
    .filter((v) => (v.attrs.grip || v.attrs.Grip) === gripLabel)
    .sort((a, b) =>
      (a.attrs.color || a.attrs.colour || "").localeCompare(b.attrs.color || b.attrs.colour || "")
    );
  const v = vars[slotIdx];
  return v?.attrs.color || v?.attrs.colour || v?.attrs.colours || null;
}

/** Plain yoga mats: slots with exactly 3 termIds = moderate grip + superior grip + color. */
function hasTripleGripColorSlots(carousel: CarouselProduct): boolean {
  const triple = carousel.slots.filter((s) => s.termIds.length === 3);
  if (triple.length < 2) return false;
  return new Set(triple.map((s) => `${s.termIds[0]}:${s.termIds[1]}`)).size === 1;
}

function inferTripleGripColorTermNames(carousel: CarouselProduct): Record<string, string> {
  const extra: Record<string, string> = {};
  const triple = carousel.slots.filter((s) => s.termIds.length === 3);
  if (!triple.length) return extra;

  const allVars = carousel.allVariations ?? carousel.variations;
  const grips = [
    ...new Set(
      allVars
        .map((v) => v.attrs.grip || v.attrs.Grip)
        .filter((g): g is string => Boolean(g?.trim()))
    ),
  ].sort();
  if (grips.length === 2) {
    const mod = grips.find((g) => g.toLowerCase().includes("moderate")) || grips[0]!;
    const sup = grips.find((g) => g.toLowerCase().includes("superior")) || grips[1]!;
    extra[triple[0]!.termIds[0]!] = mod;
    extra[triple[0]!.termIds[1]!] = sup;
  }

  const sorted = [...triple].sort((a, b) => a.index - b.index);
  const colors = [
    ...new Set(
      allVars
        .map((v) => v.attrs.color || v.attrs.colour || v.attrs.colours)
        .filter((c): c is string => Boolean(c?.trim()))
    ),
  ].sort();
  for (let i = 0; i < sorted.length && i < colors.length; i++) {
    extra[sorted[i]!.termIds[2]!] = colors[i]!;
  }
  return extra;
}

function tripleGripColorSlotApplies(
  slot: CarouselSlot,
  variation: CarouselProduct["variations"][0],
  carousel: CarouselProduct,
  termNames: Record<string, string>
): boolean {
  const labels = { ...termNames, ...inferTripleGripColorTermNames(carousel) };
  const colorId = slot.termIds[2]!;
  const expectedColor = labels[colorId];
  const mod = labels[slot.termIds[0]!];
  const sup = labels[slot.termIds[1]!];
  const c = variation.attrs.color || variation.attrs.colour || variation.attrs.colours;
  const g = variation.attrs.grip || variation.attrs.Grip;
  if (!expectedColor || !mod || !sup || !c || !g) return false;
  return c === expectedColor && (g === mod || g === sup);
}

/** Wind chimes etc.: 2-term slots = pa_color + pa_size (no grip axis). */
function hasDualColorSizeSlots(carousel: CarouselProduct): boolean {
  if (hasDualGripColorSlots(carousel) || hasTripleGripColorSlots(carousel)) return false;
  const dual = carousel.slots.filter((s) => s.termIds.length === 2);
  if (dual.length < 2) return false;
  const allVars = carousel.allVariations ?? carousel.variations;
  const hasColor = allVars.some((v) => v.attrs.color || v.attrs.colours || v.attrs.colour);
  const hasSize = allVars.some((v) => v.attrs.size || v.attrs.Size);
  const hasGrip = allVars.some((v) => v.attrs.grip || v.attrs.Grip);
  return hasColor && hasSize && !hasGrip;
}

function inferDualColorSizeTermNames(
  carousel: CarouselProduct,
  attachments: Map<string, string> = new Map()
): Record<string, string> {
  const extra: Record<string, string> = {};
  const dual = carousel.slots.filter((s) => s.termIds.length === 2);
  if (!dual.length) return extra;
  const allVars = carousel.allVariations ?? carousel.variations;

  const colorIds = [...new Set(dual.map((s) => s.termIds[0]!))];
  const sizeIds = [...new Set(dual.map((s) => s.termIds[1]!))];

  const minSlot = (tid: string) =>
    Math.min(...dual.filter((s) => s.termIds.includes(tid)).map((s) => s.index), 999);

  const inferColorFromUrl = (url: string): string | null => {
    const tokens = urlColorTokens(url);
    if (!tokens.length) return null;
    for (const v of allVars) {
      const c = v.attrs.colours || v.attrs.colour || v.attrs.color;
      if (!c) continue;
      const n = c.toLowerCase();
      if (tokens.some((t) => n.includes(t) || (t === "antique" && n.includes("antique")))) return c;
    }
    return null;
  };

  for (const cid of colorIds.sort((a, b) => minSlot(a) - minSlot(b))) {
    const slot = dual.find((s) => s.termIds[0] === cid && s.imageId);
    const url = slot?.imageId ? attachments.get(slot.imageId) : undefined;
    const label = url ? inferColorFromUrl(url) : null;
    if (label) extra[cid] = label;
  }

  const sizes = [
    ...new Set(
      allVars
        .map((v) => v.attrs.size || v.attrs.Size)
        .filter((s): s is string => Boolean(s?.trim()))
    ),
  ].sort((a, b) => {
    const ord = (x: string) => (x.toLowerCase().includes("small") ? 0 : 1);
    return ord(a) - ord(b) || a.localeCompare(b);
  });
  for (const [i, sid] of [...sizeIds].sort((a, b) => minSlot(a) - minSlot(b)).entries()) {
    if (sizes[i]) extra[sid] = sizes[i]!;
  }

  return extra;
}

function expectedColorForColorSizeSlot(
  carousel: CarouselProduct,
  colorId: string,
  sizeId: string,
  termNames: Record<string, string>
): { color: string; size: string } | null {
  const colorLabel = termNames[colorId];
  const sizeLabel = termNames[sizeId];
  if (colorLabel && sizeLabel) return { color: colorLabel, size: sizeLabel };
  const dual = carousel.slots
    .filter((s) => s.termIds.length === 2)
    .sort((a, b) => a.index - b.index);
  const idx = dual.findIndex((s) => s.termIds[0] === colorId && s.termIds[1] === sizeId);
  if (idx < 0) return null;
  const allVars = carousel.allVariations ?? carousel.variations;
  const colors = [
    ...new Set(
      allVars
        .map((v) => v.attrs.color || v.attrs.colours || v.attrs.colour)
        .filter((c): c is string => Boolean(c?.trim()))
    ),
  ].sort();
  const sizes = [
    ...new Set(
      allVars
        .map((v) => v.attrs.size || v.attrs.Size)
        .filter((s): s is string => Boolean(s?.trim()))
    ),
  ].sort((a, b) => {
    const ord = (x: string) => (x.toLowerCase().includes("small") ? 0 : 1);
    return ord(a) - ord(b) || a.localeCompare(b);
  });
  const colorIdx = [...new Set(dual.map((s) => s.termIds[0]!))].sort().indexOf(colorId);
  const sizeIdx = [...new Set(dual.map((s) => s.termIds[1]!))].sort().indexOf(sizeId);
  if (colorIdx < 0 || sizeIdx < 0 || colorIdx >= colors.length || sizeIdx >= sizes.length) return null;
  return { color: colors[colorIdx]!, size: sizes[sizeIdx]! };
}

function isTripleGripColorBundleSlot(slot: CarouselSlot, carousel: CarouselProduct): boolean {
  if (slot.termIds.length <= 3 || !hasTripleGripColorSlots(carousel)) return false;
  const triple = carousel.slots.filter((s) => s.termIds.length === 3);
  const colorIds = new Set(triple.map((s) => s.termIds[2]!));
  const terms = new Set(slot.termIds);
  return [...colorIds].filter((c) => terms.has(c)).length >= colorIds.size;
}

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

function slotExclusiveColorTerm(slot: CarouselSlot, varTermIds: Set<string>): string | null {
  const exclusive = slot.termIds.filter((t) => !varTermIds.has(t));
  return exclusive.length === 1 ? exclusive[0]! : null;
}

/** Terms that discriminate color (not the size bundle repeated on every slot). */
function colorDiscriminatorTerms(carousel: CarouselProduct, varTermIds: Set<string>): string[] {
  const imageSlots = carousel.slots.filter((s) => s.imageId);
  if (!imageSlots.length) return [];

  const allExclusive = [
    ...new Set(imageSlots.flatMap((s) => s.termIds.filter((t) => !varTermIds.has(t)))),
  ];
  const onEverySlot = allExclusive.filter((tid) =>
    imageSlots.every((s) => s.termIds.includes(tid))
  );
  return allExclusive.filter((tid) => {
    if (onEverySlot.includes(tid)) return false;
    const withT = imageSlots.filter((s) => s.termIds.includes(tid));
    return withT.length > 0 && withT.length < imageSlots.length;
  });
}

function slotColorTermsInAssignment(
  slot: CarouselSlot,
  varTermIds: Set<string>,
  colorTermNames: Record<string, string>
): string[] {
  return slot.termIds.filter((t) => !varTermIds.has(t) && colorTermNames[t]);
}

function scoreColorTermAssignment(
  carousel: CarouselProduct,
  assignment: Record<string, string>,
  varTermIds: Set<string>,
  termNames: Record<string, string>
): number {
  let score = 0;
  for (const v of carousel.variations) {
    const varAxis = primaryAttrValue(v);
    if (!varAxis) continue;
    for (const slot of carousel.slots) {
      if (!slot.imageId && !slot.youtube && !slot.iframe) continue;
      const exclusive = slotExclusiveColorTerm(slot, varTermIds);
      if (exclusive && assignment[exclusive]) {
        score += assignment[exclusive] === varAxis ? 1 : -1;
        continue;
      }
      if (slotAppliesToVariation(slot, v, termNames, false, varTermIds, assignment, false, undefined, undefined, {}, carousel)) score += 1;
    }
  }
  return score;
}

/** Map ACF color term ids (not on variations) → color label. */
function variationHasLabel(
  variation: CarouselProduct["variations"][0],
  label: string
): boolean {
  return Object.values(variation.attrs).some((a) => a?.trim() === label);
}

function primaryAttrValue(variation: CarouselProduct["variations"][0]): string | null {
  for (const k of ["color", "Color", "colour", "type", "Type", "size", "Size", "option"]) {
    const v = variation.attrs[k];
    if (v?.trim()) return v.trim();
  }
  const first = Object.values(variation.attrs).find((a) => a?.trim());
  return first?.trim() ?? null;
}

function inferExclusiveColorTermNames(
  carousel: CarouselProduct,
  termNames: Record<string, string>
): Record<string, string> {
  const colors = carouselColorValues(carousel);
  const varTermIds = new Set(carousel.variations.flatMap((v) => v.termIds));
  let exclusiveTerms = colorDiscriminatorTerms(carousel, varTermIds);
  if (hasDualGripColorSlots(carousel)) {
    const gripIds = new Set(
      carousel.slots.filter((s) => s.termIds.length === 2).map((s) => s.termIds[0]!)
    );
    exclusiveTerms = exclusiveTerms.filter((t) => !gripIds.has(t));
  }
  if (hasTripleGripColorSlots(carousel)) {
    const triple = carousel.slots.filter((s) => s.termIds.length === 3);
    const gripIds = new Set(triple.flatMap((s) => s.termIds.slice(0, 2)));
    exclusiveTerms = exclusiveTerms.filter((t) => !gripIds.has(t));
  }
  if (colors.length < 2 || exclusiveTerms.length < 2) return {};

  const sortedTerms = exclusiveTerms.sort((a, b) => {
    const minA = Math.min(
      ...carousel.slots.filter((s) => s.termIds.includes(a)).map((s) => s.index),
      999
    );
    const minB = Math.min(
      ...carousel.slots.filter((s) => s.termIds.includes(b)).map((s) => s.index),
      999
    );
    return minA - minB;
  });

  const colorExtrema = (label: string, pick: "min" | "max") => {
    const ids = carousel.variations
      .filter((v) => variationHasLabel(v, label))
      .map((v) => v.variationId);
    return pick === "min" ? Math.min(...ids) : Math.max(...ids);
  };

  const orderings = [
    [...colors].sort((a, b) => colorExtrema(b, "max") - colorExtrema(a, "max")),
    [...colors].sort((a, b) => colorExtrema(a, "min") - colorExtrema(b, "min")),
    [...colors].sort((a, b) => a.localeCompare(b)),
  ];

  function firstImageIdForColor(
    assign: Record<string, string>,
    label: string
  ): string | null {
    for (const slot of [...carousel.slots].sort((a, b) => a.index - b.index)) {
      if (!slot.imageId) continue;
      for (const v of carousel.variations) {
        if (!variationHasLabel(v, label)) continue;
        if (
          slotAppliesToVariation(slot, v, termNames, false, varTermIds, assign, false, undefined, undefined, {}, carousel)
        ) {
          return slot.imageId;
        }
      }
    }
    return null;
  }

  let best: Record<string, string> = {};
  let bestScore = -Infinity;

  for (const colorOrder of orderings) {
    const assign: Record<string, string> = {};
    for (let i = 0; i < sortedTerms.length && i < colorOrder.length; i++) {
      assign[sortedTerms[i]!] = colorOrder[i]!;
    }
    const firsts = new Set(
      colors.map((c) => firstImageIdForColor(assign, c)).filter(Boolean)
    );
    const score = firsts.size * 100 + scoreColorTermAssignment(carousel, assign, varTermIds, termNames);
    if (score > bestScore) {
      bestScore = score;
      best = assign;
    }
  }

  return best;
}

function urlColorTokens(url: string): string[] {
  const base =
    url
      .split("/")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ") || "";
  const known = [
    "yellow",
    "gold",
    "green",
    "silver",
    "antique",
    "copper",
    "blue",
    "pink",
    "teal",
    "orange",
    "grey",
    "gray",
    "navy",
    "lavender",
    "sage",
    "mahogany",
    "ivory",
    "white",
    "black",
    "red",
    "rose",
    "misty",
    "dark",
  ];
  return known.filter((c) => base.includes(c));
}

/** Design/type hints from filename (etched bowls, gong types, mallet shapes). */
function urlTypeTokens(url: string): string[] {
  const base =
    url
      .split("/")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ") || "";
  const known = [
    "mantra",
    "yinyang",
    "yin yang",
    "buddha",
    "dorje",
    "chakra",
    "chakras",
    "tara",
    "flower",
    "geometry",
    "golden",
    "feet",
    "rimmer",
    "curved",
    "straight",
    "etched",
    "plain",
    "mandala",
    "shakti",
    "om",
    "flc",
    "meridian",
    "misty",
    "lavender",
    "sage",
    "rouge",
  ];
  return known.filter((t) => base.includes(t.replace(/\s+/g, "")) || base.includes(t));
}

/** SKU segment hints (MI-SB-HM-ET-M-7 → mantra, 7). */
function skuDesignTokens(sku: string): string[] {
  const parts = sku.toUpperCase().split("-").filter(Boolean);
  const out = new Set<string>();
  const codeMap: Record<string, string[]> = {
    M: ["mantra"],
    YY: ["yinyang", "yin"],
    B: ["buddha"],
    BE: ["buddha"],
    FL: ["flower"],
    SG: ["geometry", "sacred"],
    GF: ["golden", "feet"],
    DJ: ["dorje"],
    C: ["chakra", "chakras"],
    T: ["tara"],
    BR: ["brown"],
    BK: ["black"],
    Y: ["yellow"],
    G: ["green"],
    R: ["red"],
    O: ["orange"],
    NB: ["navy"],
    PK: ["pink"],
    ST: ["straight"],
    CR: ["curved"],
    ET: ["etched"],
    PL: ["plain"],
    MD: ["mandala"],
    SC: ["shakti"],
    TR: ["tara"],
    OM: ["om"],
    FLC: ["flower"],
  };
  for (const p of parts) {
    const mapped = codeMap[p];
    if (mapped) mapped.forEach((t) => out.add(t));
    if (/^\d+(?:\.\d+)?$/.test(p)) out.add(p);
  }
  return [...out];
}

function filenameNumbers(url: string): string[] {
  const base = url.split("/").pop()?.toLowerCase() || "";
  return [...base.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => m[1]!);
}

function scoreAttachmentForVariant(
  doUrl: string,
  ls?: LsVariantAttrs,
  doVariation?: CarouselProduct["variations"][0],
  sku?: string
): number {
  if (!ls && !doVariation && !sku) return 0;
  let score = 0;
  const hay = [
    ls ? lsVariantAttrHaystack(ls) : "",
    doVariation ? doVariationAttrHaystack(doVariation) : "",
    sku ? sku.toLowerCase() : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (imageUrlMatchesSizeAttrs(doUrl, ls, doVariation)) score += 80;
  if (imageUrlMatchesVariantAttrs(doUrl, ls, doVariation)) score += 60;

  for (const tok of urlTypeTokens(doUrl)) {
    if (hay.includes(tok.replace(/\s+/g, "")) || hay.includes(tok)) score += 40;
  }
  for (const tok of skuDesignTokens(sku || ls?.sku || "")) {
    if (urlTypeTokens(doUrl).some((t) => t.includes(tok) || tok.includes(t))) score += 35;
    if (urlColorTokens(doUrl).some((c) => tok.includes(c) || c.includes(tok))) score += 35;
  }
  for (const n of filenameNumbers(doUrl)) {
    if (hay.includes(n)) score += 15;
    if (hay.includes(`${n} in`) || hay.includes(`${n}in`)) score += 25;
  }

  const base =
    doUrl
      .split("/")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ") || "";
  const typeAttr = ls?.attributeValues
    .find((a) => a.attributeValue.attribute.slug === "type")
    ?.attributeValue.value.trim()
    .toLowerCase();
  const typeFilenameHints: Record<string, string[]> = {
    mantra: ["om", "mantra"],
    "yin yang": ["yinyang", "yin-yang", "yy"],
    buddha: ["buddha"],
    "golden feet": ["golden", "feet"],
    "flower of life": ["flower", "life"],
    "sacred geometry": ["geometry", "sacred"],
    dorje: ["dorje"],
    chakras: ["chakra", "chakras", "7-chakra"],
    tara: ["tara"],
    "flower of life-center": ["flc", "flower"],
    "shakti chakra": ["shakti", "sc"],
    mandala: ["mandala", "md"],
    "7 chakras": ["7c", "chakra"],
  };
  if (typeAttr && typeFilenameHints[typeAttr]) {
    for (const hint of typeFilenameHints[typeAttr]) {
      if (base.includes(hint.replace(/-/g, " ")) || base.includes(hint)) score += 120;
    }
  }

  const colourAttr = ls
    ? getLsAttrValue(ls, "colour") ||
      getLsAttrValue(ls, "color") ||
      getLsAttrValue(ls, "colours")
    : "";
  if (ls && colourAttr) {
    const colour = colourAttr.toLowerCase();
    if (urlColorTokens(doUrl).some((c) => colour.includes(c) || c.includes(colour))) score += 120;
    for (const tok of skuDesignTokens(sku || ls.sku)) {
      if (["orange", "red", "green", "yellow", "blue", "pink", "brown", "black", "navy"].includes(tok)) {
        if (colour.includes(tok)) score += 40;
      }
    }
  }

  if (ls) {
    const styleAttr = getLsAttrValue(ls, "type") || getLsAttrValue(ls, "style");
    if (styleAttr.toLowerCase() === "weighted" && base.includes("weighted")) score += 120;
    if (styleAttr.toLowerCase() === "unweighted" && (base.includes("unweighted") || base.includes("un-weighted")))
      score += 120;
  }

  return score;
}

function urlSizeTokens(url: string): string[] {
  const base = url.split("/").pop()?.toLowerCase() || "";
  const out = new Set<string>();
  const m = base.match(/(\d+(?:\.\d+)?)\s*-?\s*in(?:ch|ches)?/);
  if (m) {
    out.add(`${m[1]} in`);
    out.add(`${m[1]}-in`);
    out.add(m[1]!);
  }
  return [...out];
}

function imageUrlMatchesSizeAttrs(
  doUrl: string,
  lsVariant?: LsVariantAttrs,
  doVariation?: CarouselProduct["variations"][0]
): boolean {
  const tokens = urlSizeTokens(doUrl);
  if (!tokens.length) return true;
  const hay = [lsVariant ? lsVariantAttrHaystack(lsVariant) : "", doVariation ? doVariationAttrHaystack(doVariation) : ""]
    .filter(Boolean)
    .join(" ");
  if (!hay) return true;
  return tokens.some((t) => hay.includes(t.replace(/-/g, " ")) || hay.includes(t));
}

function lsVariantAttrHaystack(v: LsVariantAttrs): string {
  return v.attributeValues
    .map((av) => av.attributeValue.value.trim().toLowerCase())
    .join(" ");
}

function doVariationAttrHaystack(v: CarouselProduct["variations"][0]): string {
  return Object.values(v.attrs)
    .map((x) => x.trim().toLowerCase())
    .join(" ");
}

function imageUrlMatchesVariantAttrs(
  doUrl: string,
  lsVariant?: LsVariantAttrs,
  doVariation?: CarouselProduct["variations"][0]
): boolean {
  const tokens = urlColorTokens(doUrl);
  if (!tokens.length) return true;
  const hay = [lsVariant ? lsVariantAttrHaystack(lsVariant) : "", doVariation ? doVariationAttrHaystack(doVariation) : ""]
    .filter(Boolean)
    .join(" ");
  if (!hay) return true;
  return tokens.some((t) => {
    if (t === "gray" && hay.includes("grey")) return true;
    if (t === "grey" && hay.includes("gray")) return true;
    if (t === "copper" && hay.includes("antique")) return true;
    if (t === "antique" && hay.includes("copper")) return true;
    if (t === "dark" && hay.includes("dark grey")) return true;
    if (t === "misty" && hay.includes("misty blue")) return true;
    return hay.includes(t);
  });
}

function slotAppliesToVariation(
  slot: CarouselSlot,
  variation: CarouselProduct["variations"][0],
  termNames: Record<string, string>,
  strictColorRouting = false,
  varTermIds: Set<string> = new Set(),
  colorTermNames: Record<string, string> = {},
  singleVariationStrict = false,
  doUrl?: string,
  lsVariant?: LsVariantAttrs,
  singleTermLabels: Record<string, string> = {},
  carousel?: CarouselProduct
): boolean {
  if (
    Object.keys(singleTermLabels).length > 0 &&
    slot.termIds.length === 1 &&
    singleTermLabels[slot.termIds[0]!]
  ) {
    const label = singleTermLabels[slot.termIds[0]!]!;
    const varLabel = primaryAttrValue(variation);
    if (varLabel && varLabel.trim().toLowerCase() === label.trim().toLowerCase()) return true;
    if (lsVariant) {
      const hay = lsVariantAttrHaystack(lsVariant);
      if (hay.includes(label.trim().toLowerCase())) return true;
    }
    return false;
  }

  if (slot.termIds.length === 2) {
    if (carousel && hasDualColorSizeSlots(carousel)) {
      const colorId = slot.termIds[0]!;
      const sizeId = slot.termIds[1]!;
      const expected = expectedColorForColorSizeSlot(carousel, colorId, sizeId, termNames);
      if (expected) {
        const c = variation.attrs.color || variation.attrs.colours || variation.attrs.colour;
        const s = variation.attrs.size || variation.attrs.Size;
        return c === expected.color && s === expected.size;
      }
      return false;
    }

    const gripId = slot.termIds[0]!;
    const colorId = slot.termIds[1]!;
    const gripTerms = carousel ? inferDualGripColorTermNames(carousel) : {};
    const gripLabel = gripTerms[gripId] || termNames[gripId];
    const g = variation.attrs.grip || variation.attrs.Grip;
    const c = variation.attrs.color || variation.attrs.colour || variation.attrs.colours;

    if (carousel && hasDualGripColorSlots(carousel) && gripLabel) {
      const expectedColor = expectedColorForGripColorSlot(carousel, gripId, colorId, {
        ...termNames,
        ...gripTerms,
      });
      if (expectedColor) return g === gripLabel && c === expectedColor;
      return false;
    }

    const colorLabel = termNames[colorId] || colorTermNames[colorId];
    if (gripLabel && colorLabel) {
      return g === gripLabel && c === colorLabel;
    }
    if (gripLabel || colorLabel) return false;
  }

  if (slot.termIds.length === 3 && carousel && hasTripleGripColorSlots(carousel)) {
    return tripleGripColorSlotApplies(slot, variation, carousel, termNames);
  }

  if (carousel && isDualGripColorBundleSlot(slot, carousel)) {
    const gripTerms = inferDualGripColorTermNames(carousel);
    return dualGripBundleAppliesToVariation(slot, variation, carousel, {
      ...termNames,
      ...gripTerms,
    });
  }

  if (carousel && isTripleGripColorBundleSlot(slot, carousel)) {
    return true;
  }

  const varAxis = primaryAttrValue(variation);
  const slotColorTerms = slotColorTermsInAssignment(slot, varTermIds, colorTermNames);
  if (slotColorTerms.length && varAxis) {
    if (slotColorTerms.some((ct) => colorTermNames[ct] !== varAxis)) return false;
  } else {
    const exclusive = slotExclusiveColorTerm(slot, varTermIds);
    if (exclusive && colorTermNames[exclusive] && varAxis) {
      if (colorTermNames[exclusive] !== varAxis) return false;
    }
  }

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
  if (
    !singleVariationStrict &&
    (slot.imageId || slot.youtube || slot.iframe) &&
    slot.termIds.length >= 2
  ) {
    if (!slotTermsResolve(slot, termNames)) {
      const hasTypeAxis = Boolean(variation.attrs.type || variation.attrs.Type);
      if (strictColorRouting && varAxis) return false;
      if (Object.keys(colorTermNames).length > 0 && varAxis) return false;
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
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  lsVariantsById: Map<string, LsVariantAttrs>,
  strictRouting = false
): Set<string> {
  const out = new Set<string>();
  if (!slot.imageId) return out;
  const doUrl = attachments.get(slot.imageId) || "";

  const thumbToDo = buildThumbToDoVariationIds(carousel, doVariantMedia);
  const matchedDo = thumbToDo.get(slot.imageId) || [];

  if (matchedDo.length) {
    for (const doId of matchedDo) {
      const ls = doToLs.get(doId);
      if (ls) out.add(ls);
    }
    return out;
  }

  if (!thumbToDo.has(slot.imageId)) {
    for (const [doId, ls] of doToLs.entries()) {
      if (!strictRouting) {
        out.add(ls);
        continue;
      }
      const doVar = carousel.variations.find((v) => String(v.variationId) === doId);
      const lsVar = lsVariantsById.get(ls);
      if (!doUrl || imageUrlMatchesVariantAttrs(doUrl, lsVar, doVar)) out.add(ls);
    }
  }
  return out;
}

type LsVariantAttrs = {
  sku: string;
  attributeValues: Array<{
    attributeValue: { value: string; attribute: { slug: string } };
  }>;
};

function productHasColorAxis(variants: LsVariantAttrs[]): boolean {
  const colors = new Set<string>();
  for (const v of variants) {
    for (const av of v.attributeValues) {
      const slug = av.attributeValue.attribute.slug;
      if (slug === "color" || slug === "colour") {
        colors.add(av.attributeValue.value.trim().toLowerCase());
      }
    }
  }
  return colors.size > 1;
}

function variantCompositeKey(v: LsVariantAttrs, axisSlugs: string[]): string {
  const parts: string[] = [];
  for (const slug of axisSlugs) {
    const av = v.attributeValues.find((a) => a.attributeValue.attribute.slug === slug);
    parts.push(av?.attributeValue.value.trim().toLowerCase() || "");
  }
  return parts.join("|");
}

function partitionAxesForVariants(
  lsVariants: LsVariantAttrs[]
): { slug: string; values: string[] } | { composite: string[]; axisSlugs: string[] } | null {
  const slugPriority = ["color", "colour", "colours", "type", "size", "option", "tunes", "grip"];
  const active: Array<{ slug: string; values: string[] }> = [];
  for (const slug of slugPriority) {
    const values = new Set<string>();
    for (const v of lsVariants) {
      for (const av of v.attributeValues) {
        if (av.attributeValue.attribute.slug === slug) {
          const val = av.attributeValue.value.trim();
          if (val) values.add(val);
        }
      }
    }
    if (values.size >= 2) active.push({ slug, values: [...values].sort() });
  }
  if (!active.length) return null;
  if (active.length >= 2) {
    const axisSlugs = active.map((a) => a.slug);
    const keys = new Set(lsVariants.map((v) => variantCompositeKey(v, axisSlugs)));
    if (keys.size >= 2) return { composite: [...keys].sort(), axisSlugs };
  }
  return active[0]!;
}

function lsVariantsForPartition(
  lsVariants: LsVariantAttrs[],
  partition: { slug: string; values: string[] } | { composite: string[]; axisSlugs: string[] },
  key: string
): LsVariantAttrs[] {
  if ("composite" in partition) {
    return lsVariants.filter((v) => variantCompositeKey(v, partition.axisSlugs) === key);
  }
  return lsVariantsForAxisValue(lsVariants, partition.slug, key);
}

function carouselVariationsForPartition(
  carousel: CarouselProduct,
  partition: { slug: string; values: string[] } | { composite: string[]; axisSlugs: string[] },
  key: string
): CarouselProduct["variations"] {
  if ("composite" in partition) {
    const parts = key.split("|");
    return carousel.variations.filter((v) =>
      partition.axisSlugs.every((slug, i) => {
        const raw =
          v.attrs[slug] ||
          v.attrs[slug.charAt(0).toUpperCase() + slug.slice(1)] ||
          v.attrs[slug.toUpperCase()];
        return raw?.trim().toLowerCase() === parts[i];
      })
    );
  }
  return carouselVariationsForAxisValue(carousel, partition.slug, key);
}

function pullRowsForPartition(
  pullRows: PullRow[],
  partition: { slug: string; values: string[] } | { composite: string[]; axisSlugs: string[] },
  key: string,
  lsVariants: LsVariantAttrs[]
): PullRow[] {
  const skus = new Set(lsVariantsForPartition(lsVariants, partition, key).map((v) => v.sku.trim()));
  return pullRows.filter((r) => skus.has(r.ls_sku.trim()));
}

function primaryPartitionAxis(
  lsVariants: LsVariantAttrs[]
): { slug: string; values: string[] } | null {
  const slugPriority = ["color", "colour", "colours", "type", "size", "option", "tunes", "grip"];
  for (const slug of slugPriority) {
    const values = new Set<string>();
    for (const v of lsVariants) {
      for (const av of v.attributeValues) {
        if (av.attributeValue.attribute.slug === slug) {
          const val = av.attributeValue.value.trim();
          if (val) values.add(val);
        }
      }
    }
    if (values.size >= 2) return { slug, values: [...values].sort() };
  }
  return null;
}

function lsVariantsForAxisValue(
  lsVariants: LsVariantAttrs[],
  slug: string,
  value: string
): LsVariantAttrs[] {
  return lsVariants.filter((v) =>
    v.attributeValues.some(
      (av) => av.attributeValue.attribute.slug === slug && av.attributeValue.value.trim() === value
    )
  );
}

function carouselVariationsForAxisValue(
  carousel: CarouselProduct,
  slug: string,
  value: string
): CarouselProduct["variations"] {
  const norm = value.trim().toLowerCase();
  return carousel.variations.filter((v) => {
    const raw = v.attrs[slug] || v.attrs[slug.charAt(0).toUpperCase() + slug.slice(1)];
    return raw?.trim().toLowerCase() === norm;
  });
}

function enrichTermNamesFromLsVariants(
  carousel: CarouselProduct,
  pullRows: PullRow[],
  variants: LsVariantAttrs[],
  axisSlug?: string
): Record<string, string> {
  const extra: Record<string, string> = {};
  const skuToVal = new Map<string, string>();
  const slugs = axisSlug ? [axisSlug] : ["color", "colour", "type", "size", "option"];
  for (const v of variants) {
    for (const av of v.attributeValues) {
      const slug = av.attributeValue.attribute.slug;
      if (slugs.includes(slug)) {
        skuToVal.set(v.sku.trim(), av.attributeValue.value.trim());
      }
    }
  }
  for (const row of pullRows) {
    const val = skuToVal.get(row.ls_sku.trim());
    if (!val) continue;
    extra[row.do_variation_id] = val;
    const cv = carousel.variations.find((v) => String(v.variationId) === row.do_variation_id);
    if (cv) {
      extra[String(cv.variationId)] = val;
      for (const tid of cv.termIds) extra[tid] = val;
    }
  }
  return extra;
}

function carouselColorValues(carousel: CarouselProduct): string[] {
  const axisSlugs = ["color", "colour", "type", "size", "option"] as const;
  for (const slug of axisSlugs) {
    const values = new Set<string>();
    for (const v of carousel.variations) {
      const c =
        v.attrs[slug] ||
        v.attrs[slug.charAt(0).toUpperCase() + slug.slice(1)] ||
        v.attrs[slug.toUpperCase()];
      if (c?.trim()) values.add(c.trim());
    }
    if (values.size >= 2) return [...values];
  }
  return [];
}

function lsVariantsForSlot(
  slot: CarouselSlot,
  carousel: CarouselProduct,
  doToLs: Map<string, string>,
  termNames: Record<string, string>,
  ignoreTermFilter = false,
  doVariantMedia?: Map<string, { thumbId: string; video: string }>,
  strictColorRouting = false,
  varTermIds: Set<string> = new Set(),
  colorTermNames: Record<string, string> = {},
  attachments: Map<string, string> = new Map(),
  lsVariantsById: Map<string, LsVariantAttrs> = new Map(),
  singleVariationStrict = false,
  doUrl?: string,
  lsVariant?: LsVariantAttrs,
  singleTermLabels: Record<string, string> = {}
): Set<string> {
  const out = new Set<string>();

  const useThumbRouting =
    Boolean(doVariantMedia && slot.imageId && !ignoreTermFilter) &&
    carouselVariationsLackTermIds(carousel) &&
    !Object.keys(singleTermLabels).length &&
    !hasDualGripColorSlots(carousel) &&
    !hasTripleGripColorSlots(carousel) &&
    !hasDualColorSizeSlots(carousel);

  if (useThumbRouting && doVariantMedia && attachments.size) {
    return lsVariantsForSlotByThumb(
      slot,
      carousel,
      doToLs,
      doVariantMedia,
      attachments,
      lsVariantsById,
      strictColorRouting || singleVariationStrict
    );
  }

  if (ignoreTermFilter || !slot.termIds.length) {
    for (const vid of doToLs.values()) out.add(vid);
    return out;
  }

  for (const v of carousel.variations) {
    const mapped = doToLs.get(String(v.variationId));
    if (!mapped) continue;
    const vLs = lsVariantsById.get(mapped);
    if (
      slotAppliesToVariation(
        slot,
        v,
        termNames,
        strictColorRouting,
        varTermIds,
        colorTermNames,
        singleVariationStrict,
        doUrl,
        vLs ?? lsVariant,
        singleTermLabels,
        carousel
      )
    ) {
      out.add(mapped);
    }
  }

  return out;
}

async function planCarouselProductCore(
  carousel: CarouselProduct,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  termNames: Record<string, string>,
  ignoreTermFilter = false,
  doVariantMedia?: Map<string, { thumbId: string; video: string }>,
  lsVariants: LsVariantAttrs[] = [],
  precomputedColorTerms?: Record<string, string>
): Promise<{ media: PlannedMedia[]; videoByVariantId: Map<string, string> }> {
  const singleVariationStrict =
    !ignoreTermFilter && carousel.variations.length === 1 && pullRows.length === 1;
  const strictColorRouting =
    !ignoreTermFilter &&
    (singleVariationStrict ||
      Boolean(precomputedColorTerms && Object.keys(precomputedColorTerms).length > 0) ||
      lsVariants.length >= 2 ||
      productHasColorAxis(lsVariants));
  const lsColorTerms = enrichTermNamesFromLsVariants(carousel, pullRows, lsVariants);
  const singleTermLabels = inferTermNamesFromSingleTermSlots(carousel);
  const dualGripColorTerms = inferDualGripColorTermNames(carousel);
  const tripleGripColorTerms = inferTripleGripColorTermNames(carousel);
  const dualColorSizeTerms = inferDualColorSizeTermNames(carousel, attachments);
  const baseTerms = {
    ...withEtchedChauTypeTerms(carousel.wooProductId, termNames),
    ...lsColorTerms,
    ...singleTermLabels,
    ...dualGripColorTerms,
    ...tripleGripColorTerms,
    ...dualColorSizeTerms,
  };
  const resolvedTerms = enrichTermNames(carousel, baseTerms);
  const varTermIds = new Set(carousel.variations.flatMap((v) => v.termIds));
  const colorTermNames =
    precomputedColorTerms ?? inferExclusiveColorTermNames(carousel, resolvedTerms);
  const mergedTerms = { ...resolvedTerms, ...colorTermNames };
  const doToLs = buildDoToLsVariantMap(pullRows, skuToVariantId);
  const lsVariantsById = new Map<string, LsVariantAttrs>();
  for (const r of pullRows) {
    const vid = skuToVariantId.get(r.ls_sku.trim());
    const lsVar = lsVariants.find((v) => v.sku.trim() === r.ls_sku.trim());
    if (vid && lsVar) lsVariantsById.set(vid, lsVar);
  }
  const media: PlannedMedia[] = [];
  const videoByVariantId = new Map<string, string>();
  const positionByVariant = new Map<string, number>();

  const sortedSlots = [...carousel.slots].sort((a, b) => a.index - b.index);

  for (const slot of sortedSlots) {
    const doUrl = slot.imageId ? attachments.get(slot.imageId) : undefined;
    const soleLs =
      pullRows.length === 1
        ? lsVariantsById.get(skuToVariantId.get(pullRows[0]!.ls_sku.trim()) || "")
        : undefined;

    // Per-variation: skip color-hinted slots that belong to another variant.
    if (singleVariationStrict && doUrl && soleLs && carousel.variations[0]) {
      const tokens = urlColorTokens(doUrl);
      if (tokens.length && !imageUrlMatchesVariantAttrs(doUrl, soleLs, carousel.variations[0])) {
        continue;
      }
    }

    const targetVariants = lsVariantsForSlot(
      slot,
      carousel,
      doToLs,
      mergedTerms,
      ignoreTermFilter,
      doVariantMedia,
      strictColorRouting,
      varTermIds,
      colorTermNames,
      attachments,
      lsVariantsById,
      singleVariationStrict,
      doUrl,
      soleLs,
      singleTermLabels
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

/** Every slot lists the same term-id set — route one slot image per matched variant. */
function isBroadcastCarousel(carousel: CarouselProduct): boolean {
  const tagged = carousel.slots.filter(
    (s) => s.termIds.length >= 2 && (s.imageId || s.youtube || s.iframe)
  );
  if (tagged.length < 2) return false;
  const sig = (s: CarouselSlot) => [...s.termIds].sort().join(",");
  const first = sig(tagged[0]!);
  return tagged.every((s) => sig(s) === first);
}

async function planBroadcastCarousel(
  carousel: CarouselProduct,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>
): Promise<{ media: PlannedMedia[]; videoByVariantId: Map<string, string> }> {
  const media: PlannedMedia[] = [];
  const videoByVariantId = new Map<string, string>();
  const imageSlots = [...carousel.slots]
    .filter((s) => s.imageId)
    .sort((a, b) => a.index - b.index);
  const sortedRows = [...pullRows].sort((a, b) => a.ls_variant.localeCompare(b.ls_variant));

  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i]!;
    const variantId = skuToVariantId.get(row.ls_sku.trim());
    if (!variantId) continue;

    const slot = imageSlots[i % imageSlots.length];
    const primaryId = slot?.imageId || "";
    const orderedIds = [
      primaryId,
      ...imageSlots.map((s) => s.imageId || "").filter((id) => id && id !== primaryId),
    ];
    const seen = new Set<string>();
    let pos = 0;
    for (const imageId of orderedIds) {
      if (!imageId || seen.has(imageId)) continue;
      seen.add(imageId);
      const doUrl = attachments.get(imageId);
      if (!doUrl) continue;
      const s3Url = await resolveS3Url(doUrl, cdnMap);
      media.push({
        lsSku: row.ls_sku,
        variantId,
        position: pos,
        kind: "image",
        doUrl,
        s3Url,
        isPrimary: pos === 0,
      });
      pos += 1;
    }

    for (let si = 0; si < imageSlots.length; si++) {
      const vslot = imageSlots[si]!;
      if (!vslot.youtube && !vslot.iframe) continue;
      const embed = vslot.youtube || vslot.iframe || "";
      const yt = extractYoutube(embed) || embed;
      if (!isRealVideo(yt)) continue;
      if (!videoByVariantId.has(variantId)) videoByVariantId.set(variantId, yt);
      media.push({
        lsSku: row.ls_sku,
        variantId,
        position: media.filter((m) => m.variantId === variantId).length,
        kind: "video",
        doUrl: yt,
        s3Url: yt,
        isPrimary: false,
      });
    }
  }

  return { media, videoByVariantId };
}

/** Multi-axis / multi-variant carousels: plan gallery per matched DO variation (most reliable). */
async function planCarouselProduct(
  carousel: CarouselProduct,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  termNames: Record<string, string>,
  ignoreTermFilter = false,
  doVariantMedia?: Map<string, { thumbId: string; video: string }>,
  lsVariants: LsVariantAttrs[] = []
): Promise<{ media: PlannedMedia[]; videoByVariantId: Map<string, string> }> {
  if (!ignoreTermFilter && isBroadcastCarousel(carousel) && pullRows.length >= 2) {
    return planBroadcastCarousel(carousel, pullRows, skuToVariantId, attachments, cdnMap);
  }

  const lsColorTerms = enrichTermNamesFromLsVariants(carousel, pullRows, lsVariants);
  const singleTermLabels = inferTermNamesFromSingleTermSlots(carousel);
  const dualGripColorTerms = inferDualGripColorTermNames(carousel);
  const tripleGripColorTerms = inferTripleGripColorTermNames(carousel);
  const dualColorSizeTerms = inferDualColorSizeTermNames(carousel, attachments);
  const baseTerms = {
    ...withEtchedChauTypeTerms(carousel.wooProductId, termNames),
    ...lsColorTerms,
    ...singleTermLabels,
    ...dualGripColorTerms,
    ...tripleGripColorTerms,
    ...dualColorSizeTerms,
  };
  const resolvedTerms = enrichTermNames(carousel, baseTerms);
  const globalColorTermNames = inferExclusiveColorTermNames(carousel, resolvedTerms);

  const usePerVariation =
    !ignoreTermFilter &&
    pullRows.length >= 2 &&
    carousel.variations.length >= 2 &&
    pullRows.every((r) => r.do_variation_id && skuToVariantId.has(r.ls_sku.trim()));

  if (usePerVariation) {
    const allMedia: PlannedMedia[] = [];
    const videoByVariantId = new Map<string, string>();

    for (const row of pullRows) {
      const doVar = carousel.variations.find(
        (v) => String(v.variationId) === row.do_variation_id
      );
      if (!doVar) continue;
      const lsVar = lsVariants.filter((v) => v.sku.trim() === row.ls_sku.trim());
      if (!lsVar.length) continue;

      const subset: CarouselProduct = {
        ...carousel,
        variations: [doVar],
        allVariations: carousel.variations,
      };
      // pull_fallback: plan donor variation strictly (not whole-carousel broadcast)
      const rowIgnore = ignoreTermFilter;
      const planned = await planCarouselProductCore(
        subset,
        [row],
        skuToVariantId,
        attachments,
        cdnMap,
        termNames,
        rowIgnore,
        doVariantMedia,
        lsVariants,
        globalColorTermNames
      );
      allMedia.push(...planned.media);
      for (const [k, v] of planned.videoByVariantId) videoByVariantId.set(k, v);
    }

    if (allMedia.length) return { media: allMedia, videoByVariantId };
  }

  const partition = partitionAxesForVariants(lsVariants);
  if (partition && lsVariants.length > 0 && !ignoreTermFilter) {
    const values = "composite" in partition ? partition.composite : partition.values;
    const allMedia: PlannedMedia[] = [];
    const videoByVariantId = new Map<string, string>();

    for (const value of values) {
      const subset: CarouselProduct = {
        ...carousel,
        variations: carouselVariationsForPartition(carousel, partition, value),
        allVariations: carousel.variations,
      };
      const valuePull = pullRowsForPartition(pullRows, partition, value, lsVariants);
      if (!valuePull.length || !subset.variations.length) continue;

      const planned = await planCarouselProductCore(
        subset,
        valuePull,
        skuToVariantId,
        attachments,
        cdnMap,
        termNames,
        ignoreTermFilter,
        doVariantMedia,
        lsVariants,
        globalColorTermNames
      );
      allMedia.push(...planned.media);
      for (const [k, v] of planned.videoByVariantId) videoByVariantId.set(k, v);
    }

    if (allMedia.length) return { media: allMedia, videoByVariantId };
  }

  return planCarouselProductCore(
    carousel,
    pullRows,
    skuToVariantId,
    attachments,
    cdnMap,
    termNames,
    ignoreTermFilter,
    doVariantMedia,
    lsVariants,
    globalColorTermNames
  );
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
  const merged = [...media];
  const posByVariant = new Map<string, number>();
  for (const m of media) {
    posByVariant.set(m.variantId, Math.max(posByVariant.get(m.variantId) ?? 0, m.position + 1));
  }

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId) continue;

    const rowMedia = doVariantMedia.get(r.do_variation_id);
    if (!rowMedia?.thumbId) continue;
    const doUrl = attachments.get(rowMedia.thumbId);
    if (!doUrl) continue;

    const s3Url = await resolveS3Url(doUrl, cdnMap);
    const alreadyHas = merged.some(
      (m) => m.variantId === variantId && m.kind === "image" && m.s3Url === s3Url
    );
    if (alreadyHas) continue;

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

/** Pad sparse variant galleries with parent product gallery images (distinct primaries). */
async function mergeParentGalleryFallback(
  media: PlannedMedia[],
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  parentGalleryIds: string[],
  attachments: Map<string, string>,
  cdnMap: Map<string, string>
): Promise<PlannedMedia[]> {
  if (!parentGalleryIds.length) return media;
  const merged = [...media];

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId) continue;
    const imageCount = merged.filter(
      (m) => m.variantId === variantId && m.kind === "image"
    ).length;
    if (imageCount >= 3) continue;

    let pos = merged
      .filter((m) => m.variantId === variantId)
      .reduce((max, m) => Math.max(max, m.position + 1), 0);

    for (const gid of parentGalleryIds) {
      const doUrl = attachments.get(gid);
      if (!doUrl) continue;
      const s3Url = await resolveS3Url(doUrl, cdnMap);
      if (merged.some((m) => m.variantId === variantId && m.s3Url === s3Url)) continue;
      merged.push({
        lsSku: r.ls_sku,
        variantId,
        position: pos,
        kind: "image",
        doUrl,
        s3Url,
        isPrimary: pos === 0,
      });
      pos += 1;
    }
  }

  return merged;
}

/** Guarantee every matched pull SKU has at least one resolvable image before DB write. */
async function ensurePullRowVariantImages(
  media: PlannedMedia[],
  activePullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  parentGalleryIds: string[] = [],
  parentThumbId?: string
): Promise<PlannedMedia[]> {
  const merged = [...media];

  for (const r of activePullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId) continue;
    const hasImage = merged.some((m) => m.variantId === variantId && m.kind === "image");
    if (hasImage) continue;

    const rowMedia = doVariantMedia.get(r.do_variation_id);
    const thumbId = rowMedia?.thumbId;
    const candidates: string[] = [];
    if (thumbId && thumbId !== "0") candidates.push(thumbId);
    if (parentThumbId) candidates.push(parentThumbId);
    candidates.push(...parentGalleryIds);

    for (const id of candidates) {
      const doUrl = attachments.get(id);
      if (!doUrl) continue;
      const s3Url = await resolveS3Url(doUrl, cdnMap);
      merged.push({
        lsSku: r.ls_sku,
        variantId,
        position: 0,
        kind: "image",
        doUrl,
        s3Url,
        isPrimary: true,
      });
      break;
    }
  }

  return merged;
}

/** Each variant gets its DO featured thumb first — fixes identical galleries across colors/sizes. */
async function enforceVariantPrimaryThumbs(
  media: PlannedMedia[],
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>
): Promise<PlannedMedia[]> {
  const byVariant = new Map<string, PlannedMedia[]>();
  for (const m of media) {
    const list = byVariant.get(m.variantId) || [];
    list.push(m);
    byVariant.set(m.variantId, list);
  }

  const out: PlannedMedia[] = [];
  const seen = new Set<string>();

  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId || seen.has(variantId)) continue;
    seen.add(variantId);

    let items = (byVariant.get(variantId) || []).sort((a, b) => a.position - b.position);
    const rowMedia = doVariantMedia.get(r.do_variation_id);

    if (rowMedia?.thumbId) {
      const doUrl = attachments.get(rowMedia.thumbId);
      if (doUrl) {
        const s3Url = await resolveS3Url(doUrl, cdnMap);
        const alreadyFirst = items[0]?.kind === "image" && items[0].s3Url === s3Url;
        if (!alreadyFirst) {
          items = items.filter((m) => m.kind !== "image" || m.s3Url !== s3Url);
          items = items.map((m) => ({ ...m, isPrimary: false }));
          items.unshift({
            lsSku: r.ls_sku,
            variantId,
            position: 0,
            kind: "image",
            doUrl,
            s3Url,
            isPrimary: true,
          });
        }
      }
    }

    items.forEach((m, i) => {
      m.position = i;
      m.isPrimary = i === 0 && m.kind === "image";
    });
    out.push(...items);
  }

  for (const [variantId, items] of byVariant.entries()) {
    if (seen.has(variantId)) continue;
    out.push(...items.sort((a, b) => a.position - b.position));
  }

  return out;
}

/** When DO variations lack termIds, prepend each variant's single-term slot image. */
async function enforceSingleTermSlotPrimaries(
  media: PlannedMedia[],
  carousel: CarouselProduct,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  lsVariants: LsVariantAttrs[]
): Promise<PlannedMedia[]> {
  const singleTermLabels = inferTermNamesFromSingleTermSlots(carousel);
  if (!Object.keys(singleTermLabels).length) return media;

  const tuneForSku = new Map<string, string>();
  for (const v of lsVariants) {
    for (const av of v.attributeValues) {
      const slug = av.attributeValue.attribute.slug;
      if (["tunes", "option", "type", "size", "color", "colour", "colours"].includes(slug)) {
        tuneForSku.set(v.sku.trim(), av.attributeValue.value.trim());
      }
    }
  }

  const slotByLabel = new Map<string, CarouselSlot>();
  for (const slot of carousel.slots) {
    if (slot.termIds.length !== 1 || !slot.imageId) continue;
    const label = singleTermLabels[slot.termIds[0]!];
    if (label) slotByLabel.set(label.trim().toLowerCase(), slot);
  }

  const byVariant = new Map<string, PlannedMedia[]>();
  for (const m of media) {
    const list = byVariant.get(m.variantId) || [];
    list.push(m);
    byVariant.set(m.variantId, list);
  }

  const out: PlannedMedia[] = [];
  for (const r of pullRows) {
    const variantId = skuToVariantId.get(r.ls_sku.trim());
    if (!variantId) continue;
    let items = (byVariant.get(variantId) || []).sort((a, b) => a.position - b.position);
    const tune = tuneForSku.get(r.ls_sku.trim());
    const slot = tune ? slotByLabel.get(tune.toLowerCase()) : undefined;
    if (slot?.imageId) {
      const doUrl = attachments.get(slot.imageId);
      if (doUrl) {
        const s3Url = await resolveS3Url(doUrl, cdnMap);
        if (!items.some((m) => m.kind === "image" && m.s3Url === s3Url)) {
          items = items.map((m) => ({ ...m, isPrimary: false }));
          items.unshift({
            lsSku: r.ls_sku,
            variantId,
            position: 0,
            kind: "image",
            doUrl,
            s3Url,
            isPrimary: true,
          });
        }
      }
    }
    items.forEach((m, i) => {
      m.position = i;
      m.isPrimary = i === 0 && m.kind === "image";
    });
    out.push(...items);
    byVariant.delete(variantId);
  }

  for (const items of byVariant.values()) out.push(...items);
  return out;
}

function variantImageFingerprint(items: PlannedMedia[]): string {
  return items
    .filter((m) => m.kind === "image")
    .map((m) => m.s3Url)
    .sort()
    .join("|");
}

/** First image URL — matches PDP hero / audit primary-thumb check. */
function variantPrimaryFingerprint(items: PlannedMedia[]): string {
  const images = items
    .filter((m) => m.kind === "image")
    .sort((a, b) => a.position - b.position);
  return images[0]?.s3Url || "";
}

/** Must match audit-variant-gallery-switch.ts colorKey priority exactly. */
const AUDIT_AXIS_PRIORITY = [
  "color",
  "colour",
  "colours",
  "type",
  "size",
  "style",
  "hertz",
  "no-of-holes",
  "option",
  "tunes",
] as const;

function lsAttrSlugs(v: LsVariantAttrs): Set<string> {
  return new Set(v.attributeValues.map((a) => a.attributeValue.attribute.slug));
}

function getLsAttrValue(v: LsVariantAttrs, slug: string): string {
  const av = v.attributeValues.find((a) => a.attributeValue.attribute.slug === slug);
  return av?.attributeValue.value.trim() || "";
}

function auditColorKey(attrSlugs: Set<string>): string | null {
  for (const slug of AUDIT_AXIS_PRIORITY) {
    if (attrSlugs.has(slug)) return slug;
  }
  return attrSlugs.values().next().value || null;
}

function looksLikeSizeValue(value: string): boolean {
  return /\d+(?:\.\d+)?\s*-?\s*(in(?:ch(?:es)?)?|cm(?:s)?)\b/i.test(value.trim());
}

/** Some LS variants have type/size values swapped (type=22in, size=Etched). */
function normalizedLsAttrs(v: LsVariantAttrs): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const a of v.attributeValues) {
    attrs[a.attributeValue.attribute.slug] = a.attributeValue.value.trim();
  }
  const typeVal = attrs.type || "";
  const sizeVal = attrs.size || "";
  if (typeVal && sizeVal && looksLikeSizeValue(typeVal) && !looksLikeSizeValue(sizeVal)) {
    attrs.type = sizeVal;
    attrs.size = typeVal;
  }
  return attrs;
}

function axisValueForAudit(v: LsVariantAttrs, colorKey: string | null): string {
  if (!colorKey) return v.sku.trim();
  const attrs = normalizedLsAttrs(v);
  const direct = attrs[colorKey] || "";
  if (direct) return direct;
  if (colorKey === "colours" || colorKey === "colour" || colorKey === "color") {
    return attrs.option || attrs.colours || attrs.colour || attrs.color || v.sku.trim();
  }
  return v.sku.trim();
}

/** Unique DO attachment ids: carousel slots, parent gallery, then every matched variation thumb. */
function buildImageDiscriminatorPool(
  carousel: CarouselProduct | null,
  parentGalleryIds: string[],
  pullRows: PullRow[] = [],
  doVariantMedia: Map<string, { thumbId: string; video: string }> = new Map()
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  if (carousel) {
    for (const slot of [...carousel.slots].sort((a, b) => a.index - b.index)) {
      if (slot.imageId && !seen.has(slot.imageId)) {
        seen.add(slot.imageId);
        ids.push(slot.imageId);
      }
    }
  }
  for (const id of parentGalleryIds) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const r of pullRows) {
    const thumbId = doVariantMedia.get(r.do_variation_id)?.thumbId;
    if (thumbId && !seen.has(thumbId)) {
      seen.add(thumbId);
      ids.push(thumbId);
    }
  }
  return ids;
}

/** Rebuild colliding variants so each keeps an exclusive image (+ variant-only extras). */
async function applyExclusivePoolToCollisionGroup(
  vids: string[],
  collidingSorted: Array<{ vid: string; axis: string }>,
  pool: string[],
  pullRows: PullRow[],
  skuByVarId: Map<string, string>,
  lsBySku: Map<string, LsVariantAttrs>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  byVariant: Map<string, PlannedMedia[]>,
  stripShared = false,
  carousel: CarouselProduct | null = null
): Promise<void> {
  const resolvedPool: Array<{ doUrl: string; s3Url: string }> = [];
  const seen = new Set<string>();
  for (const id of pool) {
    const doUrl = attachments.get(id);
    if (!doUrl || seen.has(doUrl)) continue;
    seen.add(doUrl);
    resolvedPool.push({ doUrl, s3Url: await resolveS3Url(doUrl, cdnMap) });
  }
  for (const r of pullRows) {
    const thumbId = doVariantMedia.get(r.do_variation_id)?.thumbId;
    if (!thumbId) continue;
    const doUrl = attachments.get(thumbId);
    if (!doUrl || seen.has(doUrl)) continue;
    seen.add(doUrl);
    resolvedPool.push({ doUrl, s3Url: await resolveS3Url(doUrl, cdnMap) });
  }
  /** Also treat images already on colliding variants as swap candidates (promote alt carousel slot). */
  for (const vid of vids) {
    for (const m of (byVariant.get(vid) || []).filter((x) => x.kind === "image")) {
      if (!m.doUrl || seen.has(m.doUrl)) continue;
      seen.add(m.doUrl);
      resolvedPool.push({ doUrl: m.doUrl, s3Url: m.s3Url });
    }
  }
  if (!resolvedPool.length) return;

  const usedExclusive = new Set<string>();
  const doVarBySku = new Map<string, CarouselProduct["variations"][0]>();
  if (carousel) {
    for (const r of pullRows) {
      if (!r.do_variation_id) continue;
      const d = carousel.variations.find((v) => String(v.variationId) === r.do_variation_id);
      if (d) doVarBySku.set(r.ls_sku.trim(), d);
    }
  }

  /** One exclusive image per primary-axis value (type/size/color) in the collision group. */
  const axisGroups = new Map<string, string[]>();
  for (const { vid, axis } of collidingSorted) {
    const list = axisGroups.get(axis) || [];
    list.push(vid);
    axisGroups.set(axis, list);
  }
  const sortedAxes = [...axisGroups.keys()].sort((a, b) => a.localeCompare(b));

  const pickExclusiveForAxis = (
    axis: string,
    vidsForAxis: string[]
  ): { doUrl: string; s3Url: string } => {
    const sampleVid = vidsForAxis[0] || "";
    const sku = skuByVarId.get(sampleVid) || "";
    const ls = lsBySku.get(sku.trim());
    const doVar = doVarBySku.get(sku.trim());

    /** Prefer an unused image already on this axis group's variants (rotate carousel slot). */
    let bestExisting: { doUrl: string; s3Url: string; score: number } | null = null;
    for (const vid of vidsForAxis) {
      for (const m of (byVariant.get(vid) || [])
        .filter((x) => x.kind === "image")
        .sort((a, b) => a.position - b.position)) {
        if (!m.doUrl || usedExclusive.has(m.s3Url)) continue;
        const score = scoreAttachmentForVariant(
          m.doUrl,
          lsBySku.get(skuByVarId.get(vid) || "") || ls,
          doVarBySku.get(skuByVarId.get(vid) || "") || doVar,
          skuByVarId.get(vid)
        );
        if (!bestExisting || score > bestExisting.score) {
          bestExisting = { doUrl: m.doUrl, s3Url: m.s3Url, score };
        }
      }
    }
    if (bestExisting && (bestExisting.score > 0 || !usedExclusive.has(bestExisting.s3Url))) {
      if (!usedExclusive.has(bestExisting.s3Url)) {
        usedExclusive.add(bestExisting.s3Url);
        return { doUrl: bestExisting.doUrl, s3Url: bestExisting.s3Url };
      }
    }

    let best: { doUrl: string; s3Url: string; score: number } | null = null;
    for (const candidate of resolvedPool) {
      if (usedExclusive.has(candidate.s3Url)) continue;
      const score = scoreAttachmentForVariant(candidate.doUrl, ls, doVar, sku);
      if (!best || score > best.score) {
        best = { ...candidate, score };
      }
    }
    if (best && best.score > 0) {
      usedExclusive.add(best.s3Url);
      return { doUrl: best.doUrl, s3Url: best.s3Url };
    }
    for (const candidate of resolvedPool) {
      if (!usedExclusive.has(candidate.s3Url)) {
        usedExclusive.add(candidate.s3Url);
        return candidate;
      }
    }
    if (bestExisting) {
      usedExclusive.add(bestExisting.s3Url);
      return { doUrl: bestExisting.doUrl, s3Url: bestExisting.s3Url };
    }
    const idx = sortedAxes.indexOf(axis);
    const fallback = resolvedPool[idx >= 0 ? idx % resolvedPool.length : 0]!;
    usedExclusive.add(fallback.s3Url);
    return fallback;
  };

  for (const axis of sortedAxes) {
    const vidsForAxis = axisGroups.get(axis) || [];
    if (!vidsForAxis.length) continue;
    const exclusive = pickExclusiveForAxis(axis, vidsForAxis);

    for (const vid of vidsForAxis) {
      const sku = skuByVarId.get(vid) || "";
      const items = byVariant.get(vid) || [];
      const videos = items.filter((m) => m.kind !== "image");

      const otherImages = items
        .filter((m) => m.kind === "image" && m.s3Url !== exclusive.s3Url)
        .map((m, j) => ({ ...m, position: j + 1, isPrimary: false }));

      const images: PlannedMedia[] = [
        {
          lsSku: sku,
          variantId: vid,
          position: 0,
          kind: "image",
          doUrl: exclusive.doUrl,
          s3Url: exclusive.s3Url,
          isPrimary: true,
        },
        ...otherImages,
      ];
      const reindexed = [
        ...images,
        ...videos.map((m, j) => ({ ...m, position: images.length + j, isPrimary: false })),
      ];
      byVariant.set(vid, reindexed);
    }
  }
}

/** Drop carousel images whose filename color/size tokens belong to another variant. */
function filterMisassignedVariantImages(
  media: PlannedMedia[],
  pullRows: PullRow[],
  carousel: CarouselProduct,
  lsVariants: LsVariantAttrs[]
): PlannedMedia[] {
  const lsBySku = new Map(lsVariants.map((v) => [v.sku.trim(), v]));
  const doVarBySku = new Map<string, CarouselProduct["variations"][0]>();
  for (const r of pullRows) {
    const d = carousel.variations.find((v) => String(v.variationId) === r.do_variation_id);
    if (d) doVarBySku.set(r.ls_sku.trim(), d);
  }

  const byVariantBefore = new Map<string, PlannedMedia[]>();
  for (const m of media) {
    const list = byVariantBefore.get(m.variantId) || [];
    list.push(m);
    byVariantBefore.set(m.variantId, list);
  }

  const filtered = media.filter((m) => {
    if (m.kind !== "image") return true;
    const ls = lsBySku.get(m.lsSku.trim());
    const doVar = doVarBySku.get(m.lsSku.trim());
    if (!ls) return true;
    const hasColorAttr = ["color", "colour", "colours"].some((s) => getLsAttrValue(ls, s));
    const hasSizeAttr = Boolean(getLsAttrValue(ls, "size"));
    if (
      hasColorAttr &&
      urlColorTokens(m.doUrl).length &&
      !imageUrlMatchesVariantAttrs(m.doUrl, ls, doVar)
    ) {
      return false;
    }
    if (hasSizeAttr && urlSizeTokens(m.doUrl).length && !imageUrlMatchesSizeAttrs(m.doUrl, ls, doVar)) {
      return false;
    }
    return true;
  });

  const out = [...filtered];
  const hasImage = new Set(
    filtered.filter((m) => m.kind === "image").map((m) => m.variantId)
  );
  for (const [vid, items] of byVariantBefore) {
    if (hasImage.has(vid)) continue;
    const fallback = items.find((m) => m.kind === "image");
    if (fallback) out.push(fallback);
  }
  return out;
}

/** Ensure variants on different axis values don't share the same primary hero image. */
async function promoteBestScoringPrimaryInGalleries(
  media: PlannedMedia[],
  lsVariants: LsVariantAttrs[],
  pullRows: PullRow[],
  carousel: CarouselProduct | null
): Promise<PlannedMedia[]> {
  const lsBySku = new Map(lsVariants.map((v) => [v.sku.trim(), v]));
  const doVarBySku = new Map<string, CarouselProduct["variations"][0]>();
  if (carousel) {
    for (const r of pullRows) {
      const d = carousel.variations.find((v) => String(v.variationId) === r.do_variation_id);
      if (d) doVarBySku.set(r.ls_sku.trim(), d);
    }
  }

  const byVariant = new Map<string, PlannedMedia[]>();
  for (const m of media) {
    const list = byVariant.get(m.variantId) || [];
    list.push({ ...m });
    byVariant.set(m.variantId, list);
  }

  for (const [vid, items] of byVariant) {
    const sku = items[0]?.lsSku || "";
    const ls = lsBySku.get(sku.trim());
    const doVar = doVarBySku.get(sku.trim());
    const images = items.filter((m) => m.kind === "image").sort((a, b) => a.position - b.position);
    if (images.length < 2) continue;

    let best = images[0]!;
    let bestScore = scoreAttachmentForVariant(best.doUrl || best.s3Url, ls, doVar, sku);
    for (const img of images.slice(1)) {
      const s = scoreAttachmentForVariant(img.doUrl || img.s3Url, ls, doVar, sku);
      if (s > bestScore) {
        bestScore = s;
        best = img;
      }
    }
    if (bestScore <= 0 || best.s3Url === images[0]!.s3Url) continue;

    const videos = items.filter((m) => m.kind !== "image");
    const rest = images
      .filter((m) => m.s3Url !== best.s3Url)
      .map((m, i) => ({ ...m, position: i + 1, isPrimary: false }));
    const reindexed: PlannedMedia[] = [
      { ...best, position: 0, isPrimary: true },
      ...rest,
      ...videos.map((m, i) => ({
        ...m,
        position: rest.length + 1 + i,
        isPrimary: false,
      })),
    ];
    byVariant.set(vid, reindexed);
  }

  const out: PlannedMedia[] = [];
  for (const items of byVariant.values()) out.push(...items);
  return out;
}

/** One exclusive hero image per audit axis value across the whole product. */
function forceUniquePrimaryPerAxisValue(
  media: PlannedMedia[],
  lsVariants: LsVariantAttrs[],
  extraPool: Array<{ doUrl: string; s3Url: string }> = []
): PlannedMedia[] {
  const lsBySku = new Map(lsVariants.map((v) => [v.sku.trim(), v]));
  const productAttrSlugs = new Set<string>();
  for (const v of lsVariants) {
    for (const slug of lsAttrSlugs(v)) productAttrSlugs.add(slug);
  }
  const colorKey = auditColorKey(productAttrSlugs);
  if (!colorKey) return media;

  const byVariant = new Map<string, PlannedMedia[]>();
  for (const m of media) {
    const list = byVariant.get(m.variantId) || [];
    list.push({ ...m });
    byVariant.set(m.variantId, list);
  }

  const productImages: Array<{ doUrl: string; s3Url: string }> = [];
  const seenPool = new Set<string>();
  const addPool = (doUrl: string, s3Url: string) => {
    if (!s3Url || seenPool.has(s3Url)) return;
    seenPool.add(s3Url);
    productImages.push({ doUrl: doUrl || s3Url, s3Url });
  };
  for (const items of byVariant.values()) {
    for (const m of items.filter((x) => x.kind === "image")) {
      addPool(m.doUrl || m.s3Url, m.s3Url);
    }
  }
  for (const img of extraPool) addPool(img.doUrl, img.s3Url);
  if (!productImages.length) return media;

  const axisToVids = new Map<string, string[]>();
  for (const [vid, items] of byVariant) {
    const sku = items[0]?.lsSku || "";
    const ls = lsBySku.get(sku.trim());
    if (!ls) continue;
    const axis = axisValueForAudit(ls, colorKey);
    const list = axisToVids.get(axis) || [];
    list.push(vid);
    axisToVids.set(axis, list);
  }
  if (axisToVids.size < 2) return media;

  const reorderWithPrimary = (vid: string, pick: { doUrl: string; s3Url: string }) => {
    const items = byVariant.get(vid) || [];
    const sku = items[0]?.lsSku || "";
    const videos = items.filter((m) => m.kind !== "image");
    const images = items
      .filter((m) => m.kind === "image")
      .sort((a, b) => a.position - b.position);
    const rest = images
      .filter((m) => m.s3Url !== pick.s3Url)
      .map((m, i) => ({ ...m, position: i + 1, isPrimary: false }));
    byVariant.set(vid, [
      {
        lsSku: sku,
        variantId: vid,
        position: 0,
        kind: "image",
        doUrl: pick.doUrl,
        s3Url: pick.s3Url,
        isPrimary: true,
      },
      ...rest,
      ...videos.map((m, i) => ({
        ...m,
        position: rest.length + 1 + i,
        isPrimary: false,
      })),
    ]);
  };

  const used = new Set<string>();
  const sortedAxes = [...axisToVids.keys()].sort((a, b) => a.localeCompare(b));
  for (const axis of sortedAxes) {
    const axisVids = axisToVids.get(axis) || [];
    if (!axisVids.length) continue;
    const sampleSku = (byVariant.get(axisVids[0]!) || [])[0]?.lsSku || "";
    const ls = lsBySku.get(sampleSku.trim());

    let pick: { doUrl: string; s3Url: string } | null = null;
    let bestScore = -1;
    for (const img of productImages) {
      if (used.has(img.s3Url)) continue;
      const score = scoreAttachmentForVariant(img.doUrl, ls, undefined, sampleSku);
      if (score > bestScore) {
        bestScore = score;
        pick = img;
      }
    }
    if (!pick) pick = productImages.find((img) => !used.has(img.s3Url)) || null;
    if (!pick) continue;
    used.add(pick.s3Url);
    for (const vid of axisVids) reorderWithPrimary(vid, pick);
  }

  const out: PlannedMedia[] = [];
  for (const items of byVariant.values()) out.push(...items);
  return out;
}

async function enforceUniqueVariantFingerprints(
  media: PlannedMedia[],
  carousel: CarouselProduct | null,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  termNames: Record<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  lsVariants: LsVariantAttrs[],
  parentGalleryIds: string[] = []
): Promise<PlannedMedia[]> {
  const byVariant = new Map<string, PlannedMedia[]>();
  for (const m of media) {
    const list = byVariant.get(m.variantId) || [];
    list.push({ ...m });
    byVariant.set(m.variantId, list);
  }

  const skuByVarId = new Map([...skuToVariantId.entries()].map(([s, id]) => [id, s] as const));
  const lsBySku = new Map(lsVariants.map((v) => [v.sku.trim(), v]));
  const productAttrSlugs = new Set<string>();
  for (const v of lsVariants) {
    for (const slug of lsAttrSlugs(v)) productAttrSlugs.add(slug);
  }
  const colorKey = auditColorKey(productAttrSlugs);

  const fpToVars = new Map<string, string[]>();
  for (const [vid, items] of byVariant) {
    const fp = variantPrimaryFingerprint(items);
    if (!fp) continue;
    const list = fpToVars.get(fp) || [];
    list.push(vid);
    fpToVars.set(fp, list);
  }

  const pool = buildImageDiscriminatorPool(
    carousel,
    parentGalleryIds,
    pullRows,
    doVariantMedia
  );

  for (const vids of fpToVars.values()) {
    if (vids.length < 2) continue;
    const axisValues = vids.map((vid) => {
      const sku = skuByVarId.get(vid);
      const ls = sku ? lsBySku.get(sku.trim()) : undefined;
      return ls ? axisValueForAudit(ls, colorKey) : null;
    });
    if (new Set(axisValues.filter(Boolean)).size < 2) continue;

    const collidingSorted = vids
      .map((vid) => {
        const sku = skuByVarId.get(vid) || "";
        const ls = lsBySku.get(sku.trim());
        return {
          vid,
          axis: ls ? axisValueForAudit(ls, colorKey) : sku,
        };
      })
      .sort((a, b) => a.axis.localeCompare(b.axis));

    for (const vid of vids) {
      const sku = skuByVarId.get(vid);
      if (!sku) continue;
      const row = pullRows.find((r) => r.ls_sku.trim() === sku.trim());

      let items = byVariant.get(vid) || [];
      let discriminator: { doUrl: string; s3Url: string } | null = null;

      if (row?.do_variation_id) {
        const thumb = doVariantMedia.get(row.do_variation_id);
        if (thumb?.thumbId) {
          const doUrl = attachments.get(thumb.thumbId);
          if (doUrl) {
            const s3Url = await resolveS3Url(doUrl, cdnMap);
            const shared = vids.some(
              (oid) =>
                oid !== vid && byVariant.get(oid)?.some((m) => m.kind === "image" && m.s3Url === s3Url)
            );
            if (!shared) discriminator = { doUrl, s3Url };
          }
        }
      }

      if (!discriminator && pool.length) {
        const idx = collidingSorted.findIndex((x) => x.vid === vid);
        const start = idx >= 0 ? idx : 0;
        for (let pi = start; pi < pool.length; pi++) {
          const attachmentId = pool[pi]!;
          const doUrl = attachments.get(attachmentId);
          if (!doUrl) continue;
          const s3Url = await resolveS3Url(doUrl, cdnMap);
          const shared = vids.some(
            (oid) =>
              oid !== vid &&
              byVariant.get(oid)?.some((x) => x.kind === "image" && x.s3Url === s3Url)
          );
          if (!shared) {
            discriminator = { doUrl, s3Url };
            break;
          }
        }
      }

      if (discriminator && !items.some((m) => m.s3Url === discriminator!.s3Url)) {
        items = items.map((m) => ({ ...m, isPrimary: false }));
        items.unshift({
          lsSku: sku,
          variantId: vid,
          position: 0,
          kind: "image",
          doUrl: discriminator.doUrl,
          s3Url: discriminator.s3Url,
          isPrimary: true,
        });
        items.forEach((m, i) => {
          m.position = i;
          m.isPrimary = i === 0 && m.kind === "image";
        });
        byVariant.set(vid, items);
      }
    }

    if (pool.length) {
      const primariesAfter = vids.map((vid) =>
        variantPrimaryFingerprint(byVariant.get(vid) || [])
      );
      if (new Set(primariesAfter).size < vids.length) {
        await applyExclusivePoolToCollisionGroup(
          vids,
          collidingSorted,
          pool,
          pullRows,
          skuByVarId,
          lsBySku,
          attachments,
          cdnMap,
          doVariantMedia,
          byVariant,
          false,
          carousel
        );
      }
    }
  }

  const out: PlannedMedia[] = [];
  for (const items of byVariant.values()) out.push(...items);
  return out;
}

/** Run fingerprint dedupe twice — second pass clears nested collisions after stripShared. */
async function finalizeUniqueGalleries(
  media: PlannedMedia[],
  carousel: CarouselProduct | null,
  pullRows: PullRow[],
  skuToVariantId: Map<string, string>,
  attachments: Map<string, string>,
  cdnMap: Map<string, string>,
  termNames: Record<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  lsVariants: LsVariantAttrs[],
  parentGalleryIds: string[] = []
): Promise<PlannedMedia[]> {
  let out = media;
  for (let pass = 0; pass < 4; pass++) {
    out = await enforceUniqueVariantFingerprints(
      out,
      carousel,
      pullRows,
      skuToVariantId,
      attachments,
      cdnMap,
      termNames,
      doVariantMedia,
      lsVariants,
      parentGalleryIds
    );
  }
  return out;
}

async function syncProduct(
  lsProductName: string,
  pullRows: PullRow[],
  carouselByWoo: Map<number, CarouselProduct>,
  termNames: Record<string, string>,
  attachments: Map<string, string>,
  doVariantMedia: Map<string, { thumbId: string; video: string }>,
  cdnMap: Map<string, string>,
  variationParents: Map<string, number>,
  parentGalleries: Map<number, string[]>,
  parentThumbs: Map<number, string>
): Promise<ProductResult> {
  let product = await prisma.product.findFirst({
    where: { name: lsProductName, deletedAt: null, status: "ACTIVE" },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: {
          attributeValues: {
            include: { attributeValue: { include: { attribute: true } } },
          },
        },
      },
      images: true,
    },
  });

  if (!product) {
    const skus = pullRows.map((r) => r.ls_sku.trim()).filter(Boolean);
    if (skus.length) {
      product = await prisma.product.findFirst({
        where: {
          deletedAt: null,
          status: "ACTIVE",
          variants: { some: { sku: { in: skus }, status: "ACTIVE" } },
        },
        include: {
          variants: {
            where: { status: "ACTIVE" },
            include: {
              attributeValues: {
                include: { attributeValue: { include: { attribute: true } } },
              },
            },
          },
          images: true,
        },
      });
    }
  }

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
  const activePullRows = pullRows.filter((r) => skuToVariantId.has(r.ls_sku.trim()));
  if (!activePullRows.length) {
    return {
      lsProduct: lsProductName,
      slug: product.slug,
      mode: "skip",
      status: "skipped",
      imagesCreated: 0,
      variantsUpdated: 0,
      detail: `No pull SKUs in DB${missingSku.length ? ` (${missingSku.length} unmapped)` : ""}`,
    };
  }

  const isFallback = activePullRows.some((r) => r.action === "pull_fallback");
  const wooId = resolveWooProductId(product.wooCommerceId, activePullRows, variationParents);
  const carousel = wooId ? carouselByWoo.get(wooId) : undefined;
  const parentGalleryIds = expandGalleryFromAttachmentStems(
    wooId ? parentGalleries.get(wooId) ?? [] : [],
    attachments
  );
  const parentThumbId = wooId ? parentThumbs.get(wooId) : undefined;

  let media: PlannedMedia[] = [];
  let videoByVariantId = new Map<string, string>();
  let mode = "thumb";

  if (carousel && carousel.slots.length > 0) {
    mode = "carousel";
    const planned = await planCarouselProduct(
      carousel,
      activePullRows,
      skuToVariantId,
      attachments,
      cdnMap,
      termNames,
      false,
      doVariantMedia,
      product.variants
    );
    media = planned.media;
    videoByVariantId = planned.videoByVariantId;

    const beforeThumb = media.filter((m) => m.kind === "image").length;
    media = await mergeThumbFallback(
      media,
      videoByVariantId,
      activePullRows,
      skuToVariantId,
      doVariantMedia,
      attachments,
      cdnMap
    );
    media = await mergeParentGalleryFallback(
      media,
      activePullRows,
      skuToVariantId,
      parentGalleryIds,
      attachments,
      cdnMap
    );
    media = await enforceVariantPrimaryThumbs(
      media,
      activePullRows,
      skuToVariantId,
      doVariantMedia,
      attachments,
      cdnMap
    );
    if (carousel) {
      media = await enforceSingleTermSlotPrimaries(
        media,
        carousel,
        activePullRows,
        skuToVariantId,
        attachments,
        cdnMap,
        product.variants
      );
      media = filterMisassignedVariantImages(media, activePullRows, carousel, product.variants);
      media = await promoteBestScoringPrimaryInGalleries(
        media,
        product.variants,
        activePullRows,
        carousel
      );
      media = await finalizeUniqueGalleries(
        media,
        carousel,
        activePullRows,
        skuToVariantId,
        attachments,
        cdnMap,
        termNames,
        doVariantMedia,
        product.variants,
        parentGalleryIds
      );
      media = forceUniquePrimaryPerAxisValue(media, product.variants);
      media = forceUniquePrimaryPerAxisValue(media, product.variants);
    }
    const afterThumb = media.filter((m) => m.kind === "image").length;
    if (afterThumb > beforeThumb && beforeThumb > 0) {
      mode = "carousel+thumb";
    } else if (media.length > 0 && beforeThumb === 0) {
      mode = "carousel+thumb";
    }

    if (isFallback && media.length === 0) {
      const thumbPlan = await planThumbProduct(
        activePullRows,
        skuToVariantId,
        doVariantMedia,
        attachments,
        cdnMap,
        true
      );
      media = thumbPlan.media;
      videoByVariantId = thumbPlan.videoByVariantId;
      mode = "fallback_thumb";
      media = await finalizeUniqueGalleries(
        media,
        carousel ?? null,
        activePullRows,
        skuToVariantId,
        attachments,
        cdnMap,
        termNames,
        doVariantMedia,
        product.variants,
        parentGalleryIds
      );
      media = forceUniquePrimaryPerAxisValue(media, product.variants);
      media = forceUniquePrimaryPerAxisValue(media, product.variants);
    }
  } else {
    const planned = await planThumbProduct(
      activePullRows,
      skuToVariantId,
      doVariantMedia,
      attachments,
      cdnMap,
      isFallback
    );
    media = planned.media;
    videoByVariantId = planned.videoByVariantId;
    media = await finalizeUniqueGalleries(
      media,
      carousel ?? null,
      activePullRows,
      skuToVariantId,
      attachments,
      cdnMap,
      termNames,
      doVariantMedia,
      product.variants,
      parentGalleryIds
    );
    media = forceUniquePrimaryPerAxisValue(media, product.variants);
    media = forceUniquePrimaryPerAxisValue(media, product.variants);
  }

  media = await ensurePullRowVariantImages(
    media,
    activePullRows,
    skuToVariantId,
    doVariantMedia,
    attachments,
    cdnMap,
    parentGalleryIds,
    parentThumbId
  );
  const extraPool: Array<{ doUrl: string; s3Url: string }> = [];
  for (const img of product.images) {
    if (img.url) extraPool.push({ doUrl: img.url, s3Url: img.url });
  }
  const extraIds = new Set(parentGalleryIds);
  const filenameToId = new Map<string, string>();
  for (const [id, url] of attachments) {
    const fn = url.split("/").pop() || "";
    if (fn) filenameToId.set(fn, id);
  }
  for (const m of media) {
    if (m.kind !== "image") continue;
    const fn = (m.doUrl || m.s3Url).split("/").pop() || "";
    const id = filenameToId.get(fn);
    if (id) extraIds.add(id);
  }
  for (const id of expandAdjacentSameFolderAttachments([...extraIds], attachments)) {
    const doUrl = attachments.get(id);
    if (!doUrl) continue;
    extraPool.push({ doUrl, s3Url: await resolveS3Url(doUrl, cdnMap) });
  }
  media = forceUniquePrimaryPerAxisValue(media, product.variants, extraPool);

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
    const allVariantIds = product.variants.map((v) => v.id);
    await tx.productImage.deleteMany({
      where: {
        productId: product.id,
        OR: [{ variantId: { in: allVariantIds } }, { variantId: null }],
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
  const variationParents = loadVariationParents();
  const parentGalleries = loadParentGalleries();
  const parentThumbs = loadParentThumbs();
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
        cdnMap,
        variationParents,
        parentGalleries,
        parentThumbs
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
