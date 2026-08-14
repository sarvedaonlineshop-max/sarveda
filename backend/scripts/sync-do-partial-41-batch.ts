/**
 * Full DO → Lightsail sync for 41 partial fuzzy-match products.
 * Retains LS SKUs; matches DO variations by attribute tokens (not SKU/name).
 * Updates prices, stock, variant + product media, description, accordion, pair-with.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/sync-do-partial-41-batch.ts
 *   npx tsx scripts/sync-do-partial-41-batch.ts --apply
 *   npx tsx scripts/sync-do-partial-41-batch.ts --apply --skip-gallery
 */
import { execSync } from "child_process";
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
const SKIP_GALLERY = process.argv.includes("--skip-gallery");
const prisma = new PrismaClient();

const REPO = path.resolve(__dirname, "../..");
const DO_PRODUCTS = path.join(REPO, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const WC_PRODUCTS = path.join(REPO, "backend/prisma/wc-products.csv");
const PULL_V2 = path.join(REPO, "data/compare/do-ls-media-pull-v2.json");
const BACKUP_DIR = path.join(REPO, "data/compare/live-partial-41-sync-backups");

const STOCK_DEFAULT = 100;

/** Known LS slug → correct DO woo id (when LS wooCommerceId is stale). */
const WOO_OVERRIDES: Record<string, number> = {
  "7-chakras-plain-copper-bottles": 5675,
};

const PARTIAL_SLUGS = [
  "7-chakras-copper-bottles-with-handle",
  "7-chakras-plain-copper-bottles",
  "7-chakras-vintage-copper-bottles",
  "7-chakras-yoga-mats",
  "angel-tuning-forks",
  "ankh",
  "bamboo-castanet",
  "bamboo-rainstick-wide-80cm",
  "32-bar-rod-chime",
  "box-tanpura",
  "caxixi",
  "chau-gongs",
  "coconut-maracas-shakers",
  "crescent-zafu-cushion-compact-buck-wheat",
  "crescent-zafu-cushion-wide-cotton",
  "large-tuning-fork",
  "dotted-singing-bowl",
  "elemental-chimes",
  "etched-gongs",
  "etched-handmade-singing-bowls",
  "handheld-natural-coconut-shaker",
  "jala-neti-pot-ceramic-185-ml",
  "macrame-yoga-mat-straps",
  "mini-coconut-shakers-3-types",
  "painted-egg-shakers",
  "plain-yoga-mats",
  "pulse-tubes",
  "rectangular-yoga-bolster",
  "sacred-symbols-singing-bowls",
  "shruti-box",
  "singing-bowl-bags",
  "singing-bowls-silk-ring-cushion-accessories",
  "singing-bowls-with-sacred-mantra-printed",
  "thunder-tube-basic-edition",
  "tingsha-bell",
  "universal-bowl",
  "wind-gong-plain",
  "wooden-hand-taal-khartal",
  "yoga-mats-lotus",
  "zafu-zabuton-combo-lotus-embroidery",
  "zafu-zabuton-combo-plain",
];

type DoVariant = {
  id: string;
  parentId: string;
  sku: string;
  attrs: string;
  regularPrice: string;
  salePrice: string;
  thumbId: string;
  video: string;
  title: string;
};

type DoProduct = Record<string, string>;

const actions: string[] = [];
const pullPatches: Array<Record<string, string>> = [];

function log(msg: string) {
  console.log(msg);
  actions.push(msg);
}

function normToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[\u2013\u2014–—]/g, "-")
    .replace(/_/g, " ")
    .replace(/(\d)\s*in(ch(es)?)?\b/g, "$1 in")
    .replace(/\b1\s*l\b/g, "1l")
    .replace(/\b500\s*ml\b/g, "500ml")
    .replace(/\s+/g, " ")
    .replace(/-/g, " ")
    .trim();
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const na = a.replace(/[^a-z0-9]/g, "");
  const nb = b.replace(/[^a-z0-9]/g, "");
  return na === nb || na.includes(nb) || nb.includes(na);
}

function parseDoAttrs(attrs: string): string[] {
  const vals: string[] = [];
  for (const seg of (attrs || "").split(";")) {
    if (!seg.includes("=")) continue;
    const v = seg.split("=").slice(1).join("=").trim();
    if (v) vals.push(v.replace(/-/g, " "));
  }
  return vals;
}

function lsVariantTokens(
  attributeValues: Array<{ attributeValue: { value: string; attribute: { slug: string } } }>,
  axisOrder?: string[] | null
): string[] {
  const rows = [...attributeValues];
  if (axisOrder?.length) {
    const order = new Map(axisOrder.map((s, i) => [s, i]));
    rows.sort(
      (a, b) =>
        (order.get(a.attributeValue.attribute.slug) ?? 999) -
        (order.get(b.attributeValue.attribute.slug) ?? 999)
    );
  }
  const tokens = rows
    .map((r) => normToken(r.attributeValue.value))
    .filter(Boolean)
    .filter((t) => t !== "plain" && t !== "standard");
  return [...new Set(tokens)];
}

function doVariantTokenList(dv: DoVariant): string[] {
  return [...new Set(parseDoAttrs(dv.attrs).map(normToken).filter(Boolean))];
}

function tokensCompatible(lsTokens: string[], doTokens: string[]): boolean {
  if (!lsTokens.length) return doTokens.length === 0;
  if (lsTokens.length !== doTokens.length) {
    // allow LS extra "plain" already stripped; try subset match
    if (lsTokens.length > doTokens.length) return false;
  }
  for (const lt of lsTokens) {
    if (!doTokens.some((dt) => tokenMatch(lt, dt))) return false;
  }
  for (const dt of doTokens) {
    if (!lsTokens.some((lt) => tokenMatch(lt, dt))) return false;
  }
  return true;
}

function matchDoVariant(lsTokens: string[], pool: DoVariant[]): DoVariant | null {
  const hits = pool.filter((dv) => tokensCompatible(lsTokens, doVariantTokenList(dv)));
  if (hits.length === 1) return hits[0];

  // size-only fallback (gongs / bowls with single axis on LS)
  if (lsTokens.length === 1) {
    const sizeHits = pool.filter((dv) => {
      const dt = doVariantTokenList(dv);
      return dt.some((t) => tokenMatch(lsTokens[0]!, t));
    });
    if (sizeHits.length === 1) return sizeHits[0];
  }

  // numeric size extract: "22 in" from SKU MI-GO-CH-ET-22
  const num = lsTokens.join(" ").match(/(\d+)\s*in/)?.[1];
  if (num) {
    const sizeHits = pool.filter((dv) => {
      const blob = doVariantTokenList(dv).join(" ");
      return blob.includes(`${num} in`) || blob.includes(num);
    });
    if (sizeHits.length === 1) return sizeHits[0];
  }

  return null;
}

function parsePhpIntList(raw: string): number[] {
  const ids: number[] = [];
  for (const m of (raw || "").matchAll(/i:\d+;i:(\d+);/g)) ids.push(Number(m[1]));
  return [...new Set(ids.filter((n) => n > 0))];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

function loadDoCatalog() {
  const products = new Map<string, DoProduct>();
  for (const row of parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    products.set(row.id, row);
  }

  const variantsByParent = new Map<string, DoVariant[]>();
  for (const row of parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if ((row.status || "").toLowerCase() !== "publish") continue;
    const dv: DoVariant = {
      id: row.id,
      parentId: row.parent_id,
      sku: row.sku || "",
      attrs: row.attrs || "",
      regularPrice: row.regular_price || "",
      salePrice: row.sale_price || "",
      thumbId: row.thumb_id || "",
      video: row.video || "",
      title: row.title || "",
    };
    const list = variantsByParent.get(dv.parentId) || [];
    list.push(dv);
    variantsByParent.set(dv.parentId, list);
  }

  const attachments = new Map<string, string>();
  for (const row of parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    if (row.url) attachments.set(String(row.id), row.url.trim());
  }

  return { products, variantsByParent, attachments };
}

function loadWcRow(wooId: number): Record<string, string> | null {
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

function loadAccordion(wooId: number) {
  const rows = parse(fs.readFileSync(WC_PRODUCTS, "utf8"), {
    relax_column_count: true,
    bom: true,
  }) as string[][];
  const header = rows[0];
  if (!header) return [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const row = rows.find((r) => r[0] === String(wooId));
  if (!row) return [];
  const items: Array<{ title: string; content: string }> = [];
  for (let n = 1; n <= 30; n++) {
    const title = (row[idx[`Meta: product_description_accordion_item_${n}_title`]] || "").trim();
    const content = (row[idx[`Meta: product_description_accordion_item_${n}_description`]] || "").trim();
    if (!title && !content) continue;
    if (title.startsWith("field_")) continue;
    items.push({ title, content });
  }
  return items;
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

function priceFromDo(regular: string, sale: string) {
  const saleN = parseDecimal(sale);
  const regN = parseDecimal(regular);
  const effective = saleN ?? regN;
  if (effective == null || effective <= 0) return null;
  const mrp = regN ?? effective;
  const saleP = saleN ?? regN ?? effective;
  return { mrpInPaise: toPaise(Math.max(mrp, saleP)), saleInPaise: toPaise(saleP) };
}

function resolveImageUrl(
  doVar: DoVariant,
  doP: DoProduct,
  attachments: Map<string, string>
): string | null {
  if (doVar.thumbId) {
    const u = attachments.get(doVar.thumbId);
    if (u) return u;
  }
  if (doP.thumb_id) {
    const u = attachments.get(doP.thumb_id);
    if (u) return u;
  }
  for (const id of (doP.gallery || "").split(",").map((s) => s.trim())) {
    const u = attachments.get(id);
    if (u) return u;
  }
  return null;
}

async function mirrorImages(slug: string, urls: string[]): Promise<string[]> {
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
      const key = `products/${slug}/${i === 0 ? "primary" : `gallery-${i}`}${ext}`;
      out.push((await mirrorUrlToS3(url, key)) || url);
    } catch {
      out.push(url);
    }
  }
  return out;
}

async function mirrorVariantImage(slug: string, sku: string, url: string): Promise<string> {
  if (!APPLY) return url;
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const key = `products/${slug}/variants/${sku}${ext}`;
  return (await mirrorUrlToS3(url, key)) || url;
}

async function setPairWith(fromProductId: string, wooIds: number[]) {
  for (let position = 0; position < wooIds.length; position++) {
    const wooId = wooIds[position]!;
    const to = await prisma.product.findFirst({
      where: { wooCommerceId: wooId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!to) continue;
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

async function syncSlug(
  slug: string,
  catalog: ReturnType<typeof loadDoCatalog>
): Promise<{ synced: number; missed: number }> {
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null },
    include: {
      variants: { where: { status: "ACTIVE" } },
      accordionItems: true,
    },
  });
  if (!product) {
    log(`SKIP ${slug} — not found`);
    return { synced: 0, missed: 0 };
  }

  const wooId = WOO_OVERRIDES[slug] ?? product.wooCommerceId;
  if (!wooId) {
    log(`SKIP ${slug} — no wooCommerceId`);
    return { synced: 0, missed: product.variants.length };
  }

  const doP = catalog.products.get(String(wooId));
  if (!doP) {
    log(`SKIP ${slug} — DO ${wooId} missing`);
    return { synced: 0, missed: product.variants.length };
  }

  const doPool = catalog.variantsByParent.get(String(wooId)) || [];
  const isSimple = (doP.product_type || "").toLowerCase() === "simple" && doPool.length === 0;

  log(`\n=== ${product.name} (${slug}) DO woo ${wooId} variants=${doPool.length} ===`);

  const wc = loadWcRow(wooId);
  const description = normalizeHtml(wc?.Description || product.description || "");
  const shortDescription = normalizeHtml(wc?.["Short description"] || product.shortDescription || "");
  const accordion = loadAccordion(wooId);
  const images = galleryUrls(doP, catalog.attachments);
  const pairIds = parsePhpIntList(doP.upsell || "");
  const productVideo = isRealVideo(doP.video || "") ? doP.video : null;

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        wooCommerceId: wooId,
        description: description || product.description,
        shortDescription: shortDescription || product.shortDescription,
        seoTitle: doP.name || product.name,
        seoDescription: stripHtml(shortDescription || description).slice(0, 160),
        taxClass: doP.tax_class || product.taxClass,
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

    const mirrored = await mirrorImages(slug, images);
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

    if (pairIds.length) await setPairWith(product.id, pairIds);
  }

  let synced = 0;
  let missed = 0;

  for (const variant of product.variants) {
    const full = await prisma.productVariant.findFirst({
      where: { id: variant.id },
      include: {
        attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
        images: { orderBy: { position: "asc" } },
      },
    });
    if (!full?.sku) continue;

    const lsTokens = lsVariantTokens(full.attributeValues, product.variantAxisOrder);
    let doVar: DoVariant | null = null;

    if (isSimple) {
      doVar = {
        id: String(wooId),
        parentId: String(wooId),
        sku: doP.sku || "",
        attrs: "",
        regularPrice: doP.regular_price || "",
        salePrice: doP.sale_price || "",
        thumbId: doP.thumb_id || "",
        video: doP.video || "",
        title: doP.name || "",
      };
    } else {
      doVar = matchDoVariant(lsTokens, doPool);
    }

    if (!doVar) {
      log(`  MISS ${full.sku} tokens=[${lsTokens.join(", ")}]`);
      missed++;
      continue;
    }

    const prices = priceFromDo(doVar.regularPrice || doP.regular_price, doVar.salePrice || doP.sale_price);
    if (!prices) {
      log(`  MISS ${full.sku} — no DO price`);
      missed++;
      continue;
    }

    log(`  OK ${full.sku} → DO var ${doVar.id} ₹${prices.saleInPaise / 100} [${lsTokens.join(" / ")}]`);

    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: full.id },
        data: prices,
      });
      await prisma.inventory.upsert({
        where: { variantId: full.id },
        create: { variantId: full.id, onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 },
        update: { onHand: STOCK_DEFAULT },
      });

      const imgUrl = resolveImageUrl(doVar, doP, catalog.attachments);
      if (imgUrl) {
        const mirrored = await mirrorVariantImage(slug, full.sku, imgUrl);
        const existing = full.images[0];
        if (existing) {
          await prisma.productImage.update({
            where: { id: existing.id },
            data: { url: mirrored, altText: product.name },
          });
        } else {
          await prisma.productImage.create({
            data: {
              productId: product.id,
              variantId: full.id,
              url: mirrored,
              altText: product.name,
              position: 0,
              isPrimary: false,
            },
          });
        }
      }

      const vVideo = isRealVideo(doVar.video) ? doVar.video : productVideo;
      if (vVideo) {
        await prisma.productVariant.update({ where: { id: full.id }, data: { videoUrl: vVideo } });
      }
    }

    pullPatches.push({
      ls_product: product.name,
      do_product: doP.name,
      ls_variant: lsTokens.join(" / ") || full.sku,
      do_variant: doVariantTokenList(doVar).join(" / "),
      ls_sku: full.sku,
      do_sku: doVar.sku,
      do_variation_id: doVar.id,
      note: "partial-41 attr sync",
      action: "pull",
    });

    synced++;
  }

  return { synced, missed };
}

function patchPullV2() {
  if (!APPLY || !pullPatches.length || !fs.existsSync(PULL_V2)) return;
  const data = JSON.parse(fs.readFileSync(PULL_V2, "utf8")) as { rows: Array<Record<string, string>> };
  for (const patch of pullPatches) {
    const idx = data.rows.findIndex((r) => r.ls_sku === patch.ls_sku);
    if (idx >= 0) data.rows[idx] = { ...data.rows[idx], ...patch };
    else data.rows.push(patch);
  }
  fs.writeFileSync(PULL_V2, JSON.stringify(data, null, 2));
}

async function runGallerySync(slug: string) {
  if (!APPLY || SKIP_GALLERY) return;
  try {
    execSync(`npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug ${slug}`, {
      cwd: path.resolve(__dirname, ".."),
      stdio: "pipe",
    });
    log(`  carousel synced: ${slug}`);
  } catch (e) {
    log(`  carousel warn ${slug}: ${(e as Error).message?.slice(0, 80)}`);
  }
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const catalog = loadDoCatalog();

  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"} | products: ${PARTIAL_SLUGS.length}`);

  let totalSynced = 0;
  let totalMissed = 0;

  for (const slug of PARTIAL_SLUGS) {
    const { synced, missed } = await syncSlug(slug, catalog);
    totalSynced += synced;
    totalMissed += missed;
  }

  patchPullV2();

  if (APPLY && !SKIP_GALLERY) {
    log("\n=== Variant carousel gallery pass ===");
    for (const slug of PARTIAL_SLUGS) {
      await runGallerySync(slug);
    }
  }

  log(`\nTotal variants synced: ${totalSynced}, missed: ${totalMissed}`);
  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-summary.json`), JSON.stringify({ actions, totalSynced, totalMissed }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
