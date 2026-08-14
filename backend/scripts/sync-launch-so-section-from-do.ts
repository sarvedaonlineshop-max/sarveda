/**
 * Sheet-Only (SO) section — final DO → Lightsail sync (Aug 2026).
 *
 * Operations:
 *  - DELETE 7-key-kalimba-made-from-coconut-shell → IMPORT 8 Key Kalimba (woo 51149, MI-KK-8)
 *  - DELETE kenari-shaker → IMPORT Kenari Seed Shell Shakers (woo 7472)
 *  - SYNC eye-shaped-eye-pillows (woo 9220): prices, variants, media, pair-with (keep YO-EP-* SKUs)
 *  - IMPORT Rectangle Wooden Maracas (51190) + Mini Flat Maracas (51110)
 *  - FIX 7-chakras-plain-copper-bottles from DO 5675 (variants bottle-type × size, retain CB-7C* SKUs)
 *
 * LS-only (no DO swap): crystal-bowls-coloured, incense-stick-stand,
 *   shruthi-thali-gong-plates-etched, gong-plates-shruti-plates-stand — left unchanged.
 *
 * Usage (Lightsail after git pull):
 *   npx tsx scripts/sync-launch-so-section-from-do.ts
 *   npx tsx scripts/sync-launch-so-section-from-do.ts --apply
 *   npx tsx scripts/sync-launch-so-section-from-do.ts --apply --only=kalimba,kenari,copper,eye-pillows,maracas
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
  ProductType,
  VariantStatus,
} from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";
import { parseDecimal, toPaise } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const ONLY = new Set(
  (
    process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? ""
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const prisma = new PrismaClient();
const REPO = path.resolve(__dirname, "../..");
const DO_PRODUCTS = path.join(REPO, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const WC_PRODUCTS = path.join(REPO, "backend/prisma/wc-products.csv");
const PULL_V2 = path.join(REPO, "data/compare/do-ls-media-pull-v2.json");
const BACKUP_DIR = path.join(REPO, "data/compare/live-so-section-sync-backups");

const STOCK_DEFAULT = 100;
const TEMPLATE_SLUG = "standard-shankh";

type DoProduct = {
  id: string;
  slug: string;
  name: string;
  status: string;
  product_type: string;
  sku: string;
  tax_class: string;
  thumb_id: string;
  gallery: string;
  upsell: string;
  regular_price: string;
  sale_price: string;
};

type DoVariant = {
  id: string;
  parent_id: string;
  sku: string;
  status: string;
  title: string;
  thumb_id: string;
  video: string;
  attrs: string;
  regular_price: string;
  sale_price: string;
};

const actions: string[] = [];

function shouldRun(key: string): boolean {
  return ONLY.size === 0 || ONLY.has(key);
}

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

function parseAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seg of (attrs || "").split(";")) {
    if (!seg.includes("=")) continue;
    const [k, ...rest] = seg.split("=");
    const key = k.trim().toLowerCase().replace(/^attribute_pa_/, "").replace(/^attribute_/, "");
    const val = rest.join("=").trim();
    if (key && val) out[key] = val.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return out;
}

function normalizeDescriptionHtml(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(<\/p>)\s+(<p)/gi, "$1$2")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br />")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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

function loadDoProducts(): Map<string, DoProduct> {
  const map = new Map<string, DoProduct>();
  for (const row of parse(fs.readFileSync(DO_PRODUCTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[]) {
    map.set(row.id, row as unknown as DoProduct);
  }
  return map;
}

function loadDoVariants(parentId: string): DoVariant[] {
  return (
    parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as Record<string, string>[]
  )
    .filter((r) => r.parent_id === parentId && (r.status || "").toLowerCase() === "publish")
    .map((r) => r as unknown as DoVariant);
}

function galleryUrls(doProduct: DoProduct, attachments: Map<string, string>, extraIds: string[] = []): string[] {
  const ids = [
    doProduct.thumb_id,
    ...parsePhpIntList(doProduct.gallery),
    ...extraIds,
  ].filter(Boolean);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const id of ids) {
    const u = attachments.get(id);
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  return urls;
}

function loadWcProductRow(wooId: number): Record<string, string> | null {
  if (!fs.existsSync(WC_PRODUCTS)) return null;
  const text = fs.readFileSync(WC_PRODUCTS, "utf8");
  const rows = parse(text, { relax_column_count: true, bom: true }) as string[][];
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
  const raw = row.Images || row.images || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((u) => u.startsWith("http"));
}

function wcDescription(row: Record<string, string> | null): { description: string; shortDescription: string } {
  if (!row) return { description: "", shortDescription: "" };
  return {
    description: normalizeDescriptionHtml(row.Description || ""),
    shortDescription: normalizeDescriptionHtml(row["Short description"] || row.Short_description || ""),
  };
}

async function fetchWooStoreProduct(slug: string): Promise<{
  name: string;
  description: string;
  short_description: string;
  images: string[];
} | null> {
  try {
    const res = await fetch(`https://sarveda.com/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      name: string;
      description: string;
      short_description: string;
      images?: Array<{ src: string }>;
    }>;
    const p = data[0];
    if (!p) return null;
    return {
      name: p.name,
      description: normalizeDescriptionHtml(p.description || ""),
      short_description: normalizeDescriptionHtml(p.short_description || ""),
      images: (p.images || []).map((i) => i.src).filter(Boolean),
    };
  } catch {
    return null;
  }
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

async function getShippingTemplate() {
  const slugs = [TEMPLATE_SLUG, "etched-gongs", "wind-gong-plain", "handpan", "kenari-chimes"];
  for (const slug of slugs) {
    const template = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: {
        variants: { where: { status: "ACTIVE" }, include: { shippingRates: true }, take: 1 },
      },
    });
    if (template?.variants[0]?.shippingRates.length) {
      return {
        rates: template.variants[0].shippingRates,
        usd: {
          mrpUsdCents: template.variants[0].mrpUsdCents,
          saleUsdCents: template.variants[0].saleUsdCents,
          mrpGbpPence: template.variants[0].mrpGbpPence,
          saleGbpPence: template.variants[0].saleGbpPence,
        },
      };
    }
  }

  const fallback = await prisma.product.findFirst({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      variants: { some: { status: "ACTIVE", shippingRates: { some: {} } } },
    },
    include: {
      variants: {
        where: { status: "ACTIVE", shippingRates: { some: {} } },
        include: { shippingRates: true },
        take: 1,
      },
    },
  });
  if (!fallback?.variants[0]) {
    if (!APPLY) {
      return {
        rates: [],
        usd: { mrpUsdCents: null, saleUsdCents: null, mrpGbpPence: null, saleGbpPence: null },
      };
    }
    throw new Error("Missing shipping template");
  }
  return {
    rates: fallback.variants[0].shippingRates,
    usd: {
      mrpUsdCents: fallback.variants[0].mrpUsdCents,
      saleUsdCents: fallback.variants[0].saleUsdCents,
      mrpGbpPence: fallback.variants[0].mrpGbpPence,
      saleGbpPence: fallback.variants[0].saleGbpPence,
    },
  };
}

async function cloneShipping(
  variantId: string,
  donorRates: Awaited<ReturnType<typeof getShippingTemplate>>["rates"]
) {
  if (!donorRates.length || !APPLY) return;
  await prisma.variantShippingRate.createMany({
    data: donorRates.map((r) => ({
      variantId,
      country: r.country,
      standardPerProduct: r.standardPerProduct,
      standardAdditional: r.standardAdditional,
      expeditedPerProduct: r.expeditedPerProduct,
      expeditedAdditional: r.expeditedAdditional,
      codPerProduct: r.codPerProduct,
      codAdditional: r.codAdditional,
      estimatedDays: r.estimatedDays,
    })),
    skipDuplicates: true,
  });
}

async function ensureDefault(productId: string) {
  const actives = await prisma.productVariant.findMany({
    where: { productId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  await prisma.productVariant.updateMany({ where: { productId }, data: { isDefault: false } });
  if (actives[0]) {
    await prisma.productVariant.update({ where: { id: actives[0].id }, data: { isDefault: true } });
  }
}

async function linkCategories(productId: string, categorySlugs: string[]) {
  for (const slug of categorySlugs) {
    const cat = await prisma.category.findFirst({ where: { slug } });
    if (!cat) {
      log(`  WARN category missing: ${slug}`);
      continue;
    }
    if (!APPLY) continue;
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId, categoryId: cat.id } },
      create: { productId, categoryId: cat.id },
      update: {},
    });
  }
}

async function setPairWith(fromProductId: string, wooIds: number[]) {
  if (!wooIds.length) return;
  for (let position = 0; position < wooIds.length; position++) {
    const wooId = wooIds[position]!;
    const toProduct = await prisma.product.findFirst({
      where: { wooCommerceId: wooId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!toProduct) {
      log(`  WARN pair-with target woo ${wooId} not in LS`);
      continue;
    }
    log(`  PAIR_WITH → ${toProduct.name} (woo ${wooId})`);
    if (!APPLY) continue;
    await prisma.productRelation.upsert({
      where: {
        fromProductId_toProductId_type: {
          fromProductId,
          toProductId: toProduct.id,
          type: ProductRelationType.PAIR_WITH,
        },
      },
      create: {
        fromProductId,
        toProductId: toProduct.id,
        type: ProductRelationType.PAIR_WITH,
        position,
      },
      update: { position },
    });
  }
}

async function purgeBySlug(slug: string) {
  const product = await prisma.product.findFirst({ where: { slug } });
  if (!product) {
    log(`  purge ${slug}: not found`);
    return;
  }
  log(`  PURGE ${slug} (${product.name})`);
  if (!APPLY) return;

  const variants = await prisma.productVariant.findMany({
    where: { productId: product.id },
    select: { id: true },
  });
  const variantIds = variants.map((v) => v.id);
  if (variantIds.length) {
    await prisma.orderItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantShippingRate.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productImage.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.marketplaceListing.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productXlStagingPrice.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.stockNotification.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  await prisma.productCategory.deleteMany({ where: { productId: product.id } });
  await prisma.accordionItem.deleteMany({ where: { productId: product.id } });
  await prisma.productRelation.deleteMany({
    where: { OR: [{ fromProductId: product.id }, { toProductId: product.id }] },
  });
  await prisma.review.deleteMany({ where: { productId: product.id } });
  await prisma.wishlist.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
}

async function upsertSimpleProduct(opts: {
  wooId: number;
  slug: string;
  name: string;
  sku: string;
  taxClass: string;
  mrpInPaise: number;
  saleInPaise: number;
  description: string;
  shortDescription: string;
  imageUrls: string[];
  categorySlugs: string[];
  pairWooIds?: number[];
}) {
  const dupSku = await prisma.productVariant.findFirst({
    where: { sku: opts.sku, productRel: { slug: { not: opts.slug } } },
    include: { productRel: { select: { slug: true } } },
  });
  if (dupSku) throw new Error(`SKU ${opts.sku} already on ${dupSku.productRel.slug}`);

  const { rates, usd } = await getShippingTemplate();
  let product = await prisma.product.findFirst({
    where: { OR: [{ wooCommerceId: opts.wooId }, { slug: opts.slug }] },
    include: { variants: true, images: true },
  });

  log(`  UPSERT simple ${opts.name} (${opts.slug}) SKU=${opts.sku}`);
  if (!APPLY) return product?.id ?? "(new)";

  if (!product) {
    product = await prisma.product.create({
      data: {
        slug: opts.slug,
        name: opts.name,
        wooCommerceId: opts.wooId,
        productType: ProductType.SIMPLE,
        status: ProductStatus.ACTIVE,
        taxClass: opts.taxClass || "gst-5",
        description: opts.description,
        shortDescription: opts.shortDescription,
        seoTitle: opts.name,
        seoDescription: stripHtml(opts.shortDescription).slice(0, 160),
      },
      include: { variants: true, images: true },
    });
  } else {
    product = await prisma.product.update({
      where: { id: product.id },
      data: {
        slug: opts.slug,
        name: opts.name,
        wooCommerceId: opts.wooId,
        productType: ProductType.SIMPLE,
        status: ProductStatus.ACTIVE,
        taxClass: opts.taxClass || product.taxClass,
        description: opts.description || product.description,
        shortDescription: opts.shortDescription || product.shortDescription,
        seoTitle: opts.name,
        seoDescription: stripHtml(opts.shortDescription || product.shortDescription || "").slice(0, 160),
        deletedAt: null,
      },
      include: { variants: true, images: true },
    });
  }

  await linkCategories(product.id, opts.categorySlugs);

  const mirrored = await mirrorImages(opts.slug, opts.imageUrls);
  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  if (mirrored.length) {
    await prisma.productImage.createMany({
      data: mirrored.map((url, i) => ({
        productId: product.id,
        url,
        altText: opts.name,
        position: i,
        isPrimary: i === 0,
      })),
    });
  }

  let variant = product.variants.find((v) => v.sku === opts.sku);
  if (variant) {
    variant = await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        mrpInPaise: opts.mrpInPaise,
        saleInPaise: opts.saleInPaise,
        status: VariantStatus.ACTIVE,
        isDefault: true,
      },
    });
  } else {
    variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: opts.sku,
        mrpInPaise: opts.mrpInPaise,
        saleInPaise: opts.saleInPaise,
        mrpUsdCents: usd.mrpUsdCents,
        saleUsdCents: usd.saleUsdCents,
        mrpGbpPence: usd.mrpGbpPence,
        saleGbpPence: usd.saleGbpPence,
        isDefault: true,
        status: VariantStatus.ACTIVE,
        inventory: { create: { onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 } },
      },
    });
    await cloneShipping(variant.id, rates);
  }

  await prisma.inventory.upsert({
    where: { variantId: variant.id },
    create: { variantId: variant.id, onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 },
    update: { onHand: STOCK_DEFAULT },
  });

  if (opts.pairWooIds?.length) await setPairWith(product.id, opts.pairWooIds);
  return product.id;
}

async function upsertVariableProduct(opts: {
  wooId: number;
  slug: string;
  name: string;
  taxClass: string;
  description: string;
  shortDescription: string;
  imageUrls: string[];
  categorySlugs: string[];
  variantAxisOrder: string[];
  variants: Array<{
    sku: string;
    doVarId: string;
    label: string;
    attrs: Array<{ name: string; slug: string; value: string }>;
    mrpInPaise: number;
    saleInPaise: number;
  }>;
  pairWooIds?: number[];
}) {
  const { rates, usd } = await getShippingTemplate();
  let product = await prisma.product.findFirst({
    where: { OR: [{ wooCommerceId: opts.wooId }, { slug: opts.slug }] },
    include: { variants: true },
  });

  log(`  UPSERT variable ${opts.name} (${opts.slug}) variants=${opts.variants.length}`);
  if (!APPLY) return { productId: product?.id ?? "(new)", pullRows: opts.variants };

  if (!product) {
    product = await prisma.product.create({
      data: {
        slug: opts.slug,
        name: opts.name,
        wooCommerceId: opts.wooId,
        productType: ProductType.VARIABLE,
        status: ProductStatus.ACTIVE,
        taxClass: opts.taxClass || "gst-5",
        description: opts.description,
        shortDescription: opts.shortDescription,
        seoTitle: opts.name,
        seoDescription: stripHtml(opts.shortDescription).slice(0, 160),
        variantAxisOrder: opts.variantAxisOrder,
      },
      include: { variants: true },
    });
  } else {
    product = await prisma.product.update({
      where: { id: product.id },
      data: {
        slug: opts.slug,
        name: opts.name,
        wooCommerceId: opts.wooId,
        productType: ProductType.VARIABLE,
        status: ProductStatus.ACTIVE,
        taxClass: opts.taxClass,
        description: opts.description || product.description,
        shortDescription: opts.shortDescription || product.shortDescription,
        variantAxisOrder: opts.variantAxisOrder,
        deletedAt: null,
      },
      include: { variants: true },
    });
  }

  await linkCategories(product.id, opts.categorySlugs);

  const mirrored = await mirrorImages(opts.slug, opts.imageUrls);
  await prisma.productImage.deleteMany({ where: { productId: product.id, variantId: null } });
  if (mirrored.length) {
    await prisma.productImage.createMany({
      data: mirrored.map((url, i) => ({
        productId: product.id,
        url,
        altText: opts.name,
        position: i,
        isPrimary: i === 0,
      })),
    });
  }

  const keepSkus = new Set(opts.variants.map((v) => v.sku));
  for (const v of product.variants) {
    if (v.status === "ACTIVE" && !keepSkus.has(v.sku)) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { status: VariantStatus.INACTIVE, isDefault: false },
      });
    }
  }

  for (const spec of opts.variants) {
    const dup = await prisma.productVariant.findFirst({
      where: { sku: spec.sku, productId: { not: product.id } },
      include: { productRel: { select: { slug: true } } },
    });
    if (dup) throw new Error(`SKU ${spec.sku} already on ${dup.productRel.slug}`);

    let variant = product.variants.find((v) => v.sku === spec.sku);
    if (variant) {
      variant = await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          mrpInPaise: spec.mrpInPaise,
          saleInPaise: spec.saleInPaise,
          status: VariantStatus.ACTIVE,
        },
      });
    } else {
      variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: spec.sku,
          mrpInPaise: spec.mrpInPaise,
          saleInPaise: spec.saleInPaise,
          mrpUsdCents: usd.mrpUsdCents,
          saleUsdCents: usd.saleUsdCents,
          mrpGbpPence: usd.mrpGbpPence,
          saleGbpPence: usd.saleGbpPence,
          isDefault: false,
          status: VariantStatus.ACTIVE,
          inventory: { create: { onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 } },
        },
      });
      await cloneShipping(variant.id, rates);
    }

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { variantId: variant.id, onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 },
      update: { onHand: STOCK_DEFAULT },
    });

    await syncVariantAttributes(variant.id, spec.attrs);
  }

  await ensureDefault(product.id);
  if (opts.pairWooIds?.length) await setPairWith(product.id, opts.pairWooIds);

  return {
    productId: product.id,
    pullRows: opts.variants.map((v) => ({
      ls_product: opts.name,
      do_product: opts.name,
      ls_variant: v.label,
      do_variant: v.label,
      ls_sku: v.sku,
      do_sku: v.sku,
      do_variation_id: v.doVarId,
      note: "SO section sync",
      action: "pull",
    })),
  };
}

function patchPullV2(rows: Array<Record<string, string>>, productName: string) {
  if (!fs.existsSync(PULL_V2)) return;
  const data = JSON.parse(fs.readFileSync(PULL_V2, "utf8")) as { rows: Array<Record<string, string>> };
  data.rows = data.rows.filter((r) => r.ls_product !== productName);
  data.rows.push(...rows);
  if (APPLY) fs.writeFileSync(PULL_V2, JSON.stringify(data, null, 2));
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

async function runGallerySync(slug: string) {
  if (!APPLY) return;
  execSync(`npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug ${slug}`, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });
}

async function opKalimba(doProducts: Map<string, DoProduct>, attachments: Map<string, string>) {
  log("\n=== 8 Key Kalimba (replace 7-key) ===");
  await purgeBySlug("7-key-kalimba-made-from-coconut-shell");

  const doP = doProducts.get("51149");
  if (!doP) throw new Error("DO product 51149 missing");

  const wc = loadWcProductRow(51149);
  let desc = wcDescription(wc);
  let images = wcImages(wc);
  if (!desc.description) {
    const live = await fetchWooStoreProduct("8-key-kalimba");
    if (live) {
      desc = { description: live.description, shortDescription: live.short_description };
      if (!images.length) images = live.images;
    }
  }
  if (!images.length) {
    images = galleryUrls(doP, attachments, ["51152", "51153", "51154", "51155"]);
  }

  const prices = priceFromDo(doP.regular_price, doP.sale_price);
  if (!prices) throw new Error("No price for 8 Key Kalimba");

  await upsertSimpleProduct({
    wooId: 51149,
    slug: "8-key-kalimba",
    name: doP.name,
    sku: "MI-KK-8",
    taxClass: "gst-5",
    ...prices,
    description: desc.description,
    shortDescription: desc.shortDescription,
    imageUrls: images,
    categorySlugs: ["sound-musical-instruments", "all-musical-instruments", "kids"],
  });
}

async function opKenari(doProducts: Map<string, DoProduct>, attachments: Map<string, string>) {
  log("\n=== Kenari Seed Shell Shakers (replace kenari-shaker) ===");
  await purgeBySlug("kenari-shaker");

  const doP = doProducts.get("7472");
  if (!doP) throw new Error("DO product 7472 missing");
  const wc = loadWcProductRow(7472);
  const desc = wcDescription(wc);
  const images = wcImages(wc).length ? wcImages(wc) : galleryUrls(doP, attachments);

  const doVars = loadDoVariants("7472");
  const variants = doVars.map((dv) => {
    const attrs = parseAttrs(dv.attrs);
    const size = attrs.size || dv.title.split(" - ").pop() || "Standard";
    const prices = priceFromDo(dv.regular_price, dv.sale_price);
    if (!prices) throw new Error(`No price for kenari variant ${dv.id}`);
    const sku = dv.sku || (size.toLowerCase().includes("large") ? "MI-KR-S-L" : "MI-KR-S-S");
    return {
      sku,
      doVarId: dv.id,
      label: size,
      attrs: [{ name: "Size", slug: "size", value: size }],
      ...prices,
    };
  });

  const result = await upsertVariableProduct({
    wooId: 7472,
    slug: "kenari-seed-shell-shakers",
    name: doP.name,
    taxClass: doP.tax_class || "gst-5",
    description: desc.description,
    shortDescription: desc.shortDescription,
    imageUrls: images,
    categorySlugs: ["sound-musical-instruments", "rattles-shakers", "all-musical-instruments"],
    variantAxisOrder: ["size"],
    variants,
    pairWooIds: parsePhpIntList(doP.upsell),
  });

  if (APPLY && result.pullRows) {
    patchPullV2(result.pullRows as Array<Record<string, string>>, doP.name);
    await runGallerySync("kenari-seed-shell-shakers");
  }
}

const EYE_SKU_BY_COLOUR: Record<string, string> = {
  Rose: "YO-EP-R",
  Grey: "YO-EP-GY",
  "Navy Blue": "YO-EP-NB",
  "Dark Grey": "YO-EP-DG",
  Sage: "YO-EP-SE",
};

async function opEyePillows(doProducts: Map<string, DoProduct>) {
  log("\n=== Eye Shaped Eye Pillows (sync from DO 9220) ===");
  const doP = doProducts.get("9220");
  if (!doP) throw new Error("DO product 9220 missing");

  const product = await prisma.product.findFirst({
    where: { slug: "eye-shaped-eye-pillows" },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  if (!product) {
    log("  WARN eye-shaped-eye-pillows not found on LS — skip");
    return;
  }

  const wc = loadWcProductRow(9220);
  const desc = wcDescription(wc);
  log(`  SYNC ${product.slug} — keep YO-EP-* SKUs, update attrs/prices/media/pair-with`);

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        wooCommerceId: 9220,
        description: desc.description || product.description,
        shortDescription: desc.shortDescription || product.shortDescription,
      },
    });
  }

  const doVars = loadDoVariants("9220");
  const pullRows: Array<Record<string, string>> = [];

  for (const dv of doVars) {
    const attrs = parseAttrs(dv.attrs);
    const colour = attrs.colour || attrs.color || "";
    const lsSku = EYE_SKU_BY_COLOUR[colour];
    if (!lsSku) {
      log(`  WARN unknown colour "${colour}" on DO var ${dv.id}`);
      continue;
    }
    const variant = product.variants.find((v) => v.sku === lsSku);
    if (!variant) {
      log(`  WARN LS variant missing for ${lsSku}`);
      continue;
    }
    const prices = priceFromDo(dv.regular_price, dv.sale_price);
    if (!prices) continue;

    log(`  ${lsSku} (${colour}): ₹${prices.saleInPaise / 100}`);
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: prices,
      });
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 },
        update: { onHand: STOCK_DEFAULT },
      });
      await syncVariantAttributes(variant.id, [{ name: "Colour", slug: "colour", value: colour }]);
    }

    pullRows.push({
      ls_product: product.name,
      do_product: doP.name,
      ls_variant: colour,
      do_variant: colour,
      ls_sku: lsSku,
      do_sku: dv.sku,
      do_variation_id: dv.id,
      note: "SO eye pillows sync",
      action: "pull",
    });
  }

  await setPairWith(product.id, parsePhpIntList(doP.upsell));

  if (APPLY && pullRows.length) {
    patchPullV2(pullRows, product.name);
    await runGallerySync("eye-shaped-eye-pillows");
  }
}

async function opMaracas(doProducts: Map<string, DoProduct>, attachments: Map<string, string>) {
  log("\n=== Rectangle + Mini Flat Maracas (new from DO) ===");

  for (const spec of [
    {
      wooId: 51190,
      slug: "rectangle-wooden-maracas-shaker",
      sku: "MI-RW-M",
      taxClass: "gst12",
      extraIds: ["51192", "51193", "51194", "51195", "51196", "51198"],
      categories: ["sound-musical-instruments", "rattles-shakers", "kids"],
    },
    {
      wooId: 51110,
      slug: "mini-flat-maracas",
      sku: "MI-MF-M",
      taxClass: "gst12",
      extraIds: ["51111", "51112", "51113", "51114", "51115", "51116", "51117", "51119", "51120"],
      categories: ["sound-musical-instruments", "rattles-shakers", "kids"],
    },
  ] as const) {
    const doP = doProducts.get(String(spec.wooId));
    if (!doP) throw new Error(`DO product ${spec.wooId} missing`);

    const wc = loadWcProductRow(spec.wooId);
    let desc = wcDescription(wc);
    let images = wcImages(wc);
    if (!desc.description) {
      const live = await fetchWooStoreProduct(doP.slug);
      if (live) {
        desc = { description: live.description, shortDescription: live.short_description };
        if (!images.length) images = live.images;
      }
    }
    if (!images.length) images = galleryUrls(doP, attachments, [...spec.extraIds]);

    const prices = priceFromDo(doP.regular_price, doP.sale_price);
    if (!prices) throw new Error(`No price for ${doP.name}`);

    await upsertSimpleProduct({
      wooId: spec.wooId,
      slug: spec.slug,
      name: doP.name,
      sku: spec.sku,
      taxClass: spec.taxClass,
      ...prices,
      description: desc.description,
      shortDescription: desc.shortDescription,
      imageUrls: images,
      categorySlugs: [...spec.categories],
    });
  }
}

const COPPER_SKU_MAP: Record<string, { bottleType: string; size: string }> = {
  "CB-7C-.5": { bottleType: "Without Brush", size: "500ml" },
  "CB-7C-B-.5": { bottleType: "With Brush", size: "500ml" },
  "CB-7C": { bottleType: "Without Brush", size: "1L" },
  "CB-7C-B": { bottleType: "With Brush", size: "1L" },
};

async function opCopperBottles(doProducts: Map<string, DoProduct>, attachments: Map<string, string>) {
  log("\n=== 7 Chakras Plain Copper Bottles ← DO 5675 ===");

  const doP = doProducts.get("5675");
  if (!doP) throw new Error("DO product 5675 missing");

  const product = await prisma.product.findFirst({
    where: { slug: "7-chakras-plain-copper-bottles" },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  if (!product) {
    log("  WARN 7-chakras-plain-copper-bottles not found on LS — skip");
    return;
  }

  const wc = loadWcProductRow(5675);
  const desc = wcDescription(wc);
  const images = wcImages(wc).length
    ? wcImages(wc)
    : galleryUrls(doP, attachments, ["5676", "5677", "5678", "5680", "5681", "5751", "6411"]);

  log(`  FIX variants: bottle-type × size (remove Plain/cleaning-brush axes)`);
  log(`  RETAIN SKUs: ${Object.keys(COPPER_SKU_MAP).join(", ")}`);

  const doVars = loadDoVariants("5675");
  const doByKey = new Map<string, DoVariant>();
  for (const dv of doVars) {
    const a = parseAttrs(dv.attrs);
    const bottleType = a["bottle-type"] || a["bottle type"] || "";
    const size = a.size || "";
    doByKey.set(`${bottleType}|${size}`.toLowerCase(), dv);
  }

  if (APPLY) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        wooCommerceId: 5675,
        description: normalizeDescriptionHtml(desc.description || product.description || ""),
        shortDescription: normalizeDescriptionHtml(desc.shortDescription || product.shortDescription || ""),
        variantAxisOrder: ["bottle-type", "size"],
        taxClass: doP.tax_class || "gst-5",
      },
    });

    const mirrored = await mirrorImages(product.slug, images);
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

  const pullRows: Array<Record<string, string>> = [];

  for (const variant of product.variants) {
    const mapping = COPPER_SKU_MAP[variant.sku];
    if (!mapping) {
      log(`  WARN unexpected SKU ${variant.sku} — drafting`);
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { status: VariantStatus.INACTIVE, isDefault: false },
        });
      }
      continue;
    }

    const dv = doByKey.get(`${mapping.bottleType}|${mapping.size}`.toLowerCase());
    if (!dv) {
      log(`  WARN no DO variant for ${variant.sku} (${mapping.bottleType} / ${mapping.size})`);
      continue;
    }

    const prices = priceFromDo(dv.regular_price, dv.sale_price);
    if (!prices) continue;

    log(`  ${variant.sku} → ${mapping.bottleType} / ${mapping.size} ₹${prices.saleInPaise / 100}`);

    if (APPLY) {
      await prisma.productVariant.update({ where: { id: variant.id }, data: prices });
      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, onHand: STOCK_DEFAULT, reserved: 0, lowStockThreshold: 5 },
        update: { onHand: STOCK_DEFAULT },
      });
      await syncVariantAttributes(variant.id, [
        { name: "Bottle Type", slug: "bottle-type", value: mapping.bottleType },
        { name: "Size", slug: "size", value: mapping.size },
      ]);
    }

    pullRows.push({
      ls_product: product.name,
      do_product: doP.name,
      ls_variant: `${mapping.bottleType} / ${mapping.size}`,
      do_variant: `${mapping.bottleType} / ${mapping.size}`,
      ls_sku: variant.sku,
      do_sku: dv.sku,
      do_variation_id: dv.id,
      note: "SO copper 5675 sync",
      action: "pull",
    });
  }

  await ensureDefault(product.id);
  await setPairWith(product.id, parsePhpIntList(doP.upsell));

  if (APPLY && pullRows.length) {
    patchPullV2(pullRows, product.name);
    await runGallerySync("7-chakras-plain-copper-bottles");
  }
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  if (ONLY.size) log(`Only: ${[...ONLY].join(", ")}`);

  const doProducts = loadDoProducts();
  const attachments = loadAttachments();

  if (shouldRun("kalimba")) await opKalimba(doProducts, attachments);
  if (shouldRun("kenari")) await opKenari(doProducts, attachments);
  if (shouldRun("eye-pillows")) await opEyePillows(doProducts);
  if (shouldRun("maracas")) await opMaracas(doProducts, attachments);
  if (shouldRun("copper")) await opCopperBottles(doProducts, attachments);

  log("\n=== LS-only products (unchanged) ===");
  for (const slug of [
    "crystal-bowls-coloured",
    "incense-stick-stand",
    "shruthi-thali-gong-plates-etched",
    "gong-plates-shruti-plates-stand",
  ]) {
    const p = await prisma.product.findFirst({ where: { slug }, select: { name: true, status: true } });
    log(`  ${slug}: ${p ? `${p.status} — ${p.name}` : "NOT FOUND"}`);
  }

  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-actions.json`), JSON.stringify(actions, null, 2));
  log(`\nLog → ${path.join(BACKUP_DIR, `${stamp}-actions.json`)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
