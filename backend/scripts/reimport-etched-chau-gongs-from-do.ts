/**
 * Full DO → Lightsail rebuild for Etched Chau Gongs (woo id 49115).
 * Replaces size-only LS variants with DO's 21 type×size variations.
 *
 * Source: do_products/do_variants CSVs, woo-import-products-raw.json, wc-products accordion.
 * Stock: 100 per variant. SKUs auto: MI-GO-CH-ET-{CH|MN|BO}-{size}.
 *
 * Usage (Lightsail after git pull):
 *   npx tsx scripts/reimport-etched-chau-gongs-from-do.ts
 *   npx tsx scripts/reimport-etched-chau-gongs-from-do.ts --apply
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { PrismaClient, ProductStatus, ProductType, VariantStatus } from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";
import { toPaise } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const REPO = path.resolve(__dirname, "../..");
const DO_PRODUCTS = path.join(REPO, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const WOO_RAW = path.join(REPO, "data/compare/woo-import-products-raw.json");
const WC_PRODUCTS = path.join(REPO, "backend/prisma/wc-products.csv");
const PULL_V2 = path.join(REPO, "data/compare/do-ls-media-pull-v2.json");
const BACKUP_DIR = path.join(REPO, "data/compare/live-etched-chau-reimport-backups");

const WOO_PRODUCT_ID = 49115;
const WOO_SLUG = "etched-gongs";
const PRODUCT_NAME = "Etched Chau Gongs";
const STOCK_ON_HAND = 100;
const TEMPLATE_SLUGS = ["standard-shankh", "etched-gongs", "wind-gong-plain", "handpan"];

const TYPE_CODES: Record<string, string> = {
  Chakra: "CH",
  Mantra: "MN",
  "Buddhist Om": "BO",
};

const TYPE_SORT_ORDER = ["Chakra", "Mantra", "Buddhist Om"];

type DoVariantRow = {
  id: string;
  size: string;
  type: string;
  regularPrice: string;
  salePrice: string;
  title: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttrs(attrs: string): { size: string; type: string } {
  let size = "";
  let type = "";
  for (const seg of (attrs || "").split(";")) {
    if (!seg.includes("=")) continue;
    const [k, ...rest] = seg.split("=");
    const v = rest.join("=").trim();
    const key = k.trim().toLowerCase();
    if (key.includes("size")) size = v;
    else if (key.includes("type")) type = v;
  }
  return { size, type };
}

function skuFor(type: string, size: string): string {
  const code = TYPE_CODES[type] || type.replace(/\s+/g, "").slice(0, 2).toUpperCase();
  const num = size.match(/(\d+)/)?.[1] || size.replace(/\D/g, "");
  return `MI-GO-CH-ET-${code}-${num}`;
}

function parseDecimal(s: string): number | null {
  const n = parseFloat((s || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function loadDoVariants(): DoVariantRow[] {
  const rows = parse(fs.readFileSync(DO_VARIANTS, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];

  return rows
    .filter((r) => r.parent_id === String(WOO_PRODUCT_ID) && (r.status || "").toLowerCase() === "publish")
    .map((r) => {
      const { size, type } = parseAttrs(r.attrs || "");
      return {
        id: r.id,
        size,
        type,
        regularPrice: r.regular_price || "",
        salePrice: r.sale_price || "",
        title: r.title || "",
      };
    })
    .filter((r) => r.size && r.type)
    .sort((a, b) => {
      const ta = TYPE_SORT_ORDER.indexOf(a.type);
      const tb = TYPE_SORT_ORDER.indexOf(b.type);
      const typeCmp = (ta === -1 ? 999 : ta) - (tb === -1 ? 999 : tb);
      if (typeCmp !== 0) return typeCmp;
      return parseInt(a.size, 10) - parseInt(b.size, 10);
    });
}

function loadProductGalleryUrls(): string[] {
  const attachments = new Map<string, string>();
  if (fs.existsSync(DO_ATTACHMENTS)) {
    for (const r of parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as Record<string, string>[]) {
      if (r.url) attachments.set(String(r.id), r.url.trim());
    }
  }

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const id of ["49180", "49181", "49182", "49183", "49184", "49185", "49186"]) {
    const u = attachments.get(id);
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }

  const woo = JSON.parse(fs.readFileSync(WOO_RAW, "utf8")) as Record<
    string,
    { images?: Array<{ src: string }> }
  >;
  for (const img of woo[WOO_SLUG]?.images || []) {
    if (img.src && !seen.has(img.src)) {
      seen.add(img.src);
      urls.push(img.src);
    }
  }
  return urls;
}

function loadAccordionItems(): Array<{ title: string; content: string }> {
  const text = fs.readFileSync(WC_PRODUCTS, "utf8");
  const rows = parse(text, { relax_column_count: true, bom: true }) as string[][];
  const header = rows[0];
  if (!header) return [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const row = rows.find((r) => r[0] === String(WOO_PRODUCT_ID));
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

async function cloneShipping(
  variantId: string,
  donorRates: Array<{
    country: string;
    standardPerProduct: number;
    standardAdditional: number;
    expeditedPerProduct: number;
    expeditedAdditional: number;
    codPerProduct: number | null;
    codAdditional: number | null;
    estimatedDays: string | null;
  }>
) {
  if (!donorRates.length) return;
  await prisma.variantShippingRate.createMany({
    data: donorRates.map((r) => ({ variantId, ...r })),
    skipDuplicates: true,
  });
}

function patchPullV2ForGallery(rows: Array<{ sku: string; doVarId: string; label: string }>) {
  const data = JSON.parse(fs.readFileSync(PULL_V2, "utf8")) as { rows: Array<Record<string, string>> };
  data.rows = data.rows.filter((r) => r.ls_product !== PRODUCT_NAME);
  for (const r of rows) {
    data.rows.push({
      ls_product: PRODUCT_NAME,
      do_product: PRODUCT_NAME,
      ls_variant: r.label,
      do_variant: r.label,
      ls_sku: r.sku,
      do_sku: "",
      do_variation_id: r.doVarId,
      note: "etched chau full DO reimport",
      action: "pull",
    });
  }
  fs.writeFileSync(PULL_V2, JSON.stringify(data, null, 2));
}

async function runGallerySync() {
  execSync("npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug etched-gongs", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });
}

async function main() {
  const doVariants = loadDoVariants();
  if (doVariants.length !== 21) {
    console.warn(`Expected 21 DO variants, found ${doVariants.length}`);
  }

  const woo = JSON.parse(fs.readFileSync(WOO_RAW, "utf8"))[WOO_SLUG] as {
    description: string;
    short_description: string;
  };
  const accordion = loadAccordionItems();
  const galleryUrls = loadProductGalleryUrls();

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`DO variants: ${doVariants.length}`);
  console.log(`Gallery URLs: ${galleryUrls.length}, Accordion items: ${accordion.length}`);
  console.log("\nPlanned SKUs:");
  for (const dv of doVariants) {
    const sale = parseDecimal(dv.salePrice) ?? parseDecimal(dv.regularPrice) ?? 0;
    console.log(`  ${skuFor(dv.type, dv.size)}  ${dv.type} / ${dv.size}  ₹${sale}`);
  }

  let template = null;
  for (const slug of TEMPLATE_SLUGS) {
    template = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: {
        variants: { where: { status: "ACTIVE" }, include: { shippingRates: true }, take: 1 },
      },
    });
    if (template?.variants[0]?.shippingRates.length) break;
  }
  if (!template?.variants[0]) {
    template = await prisma.product.findFirst({
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
  }
  if (!template?.variants[0]) throw new Error("Missing shipping template");
  const donorRates = template.variants[0].shippingRates;
  const donorUsd = {
    mrpUsdCents: template.variants[0].mrpUsdCents,
    saleUsdCents: template.variants[0].saleUsdCents,
    mrpGbpPence: template.variants[0].mrpGbpPence,
    saleGbpPence: template.variants[0].saleGbpPence,
  };

  let product = await prisma.product.findFirst({
    where: {
      OR: [{ wooCommerceId: WOO_PRODUCT_ID }, { slug: WOO_SLUG, deletedAt: null }],
    },
    include: { variants: true, images: true, accordionItems: true },
  });

  if (!product) {
    console.log("\nProduct not found — would create etched-gongs");
    if (!APPLY) return;
    product = await prisma.product.create({
      data: {
        slug: WOO_SLUG,
        name: PRODUCT_NAME,
        wooCommerceId: WOO_PRODUCT_ID,
        productType: ProductType.VARIABLE,
        status: ProductStatus.ACTIVE,
        taxClass: "gst-5",
        description: woo.description,
        shortDescription: woo.short_description,
        seoTitle: PRODUCT_NAME,
        seoDescription: stripHtml(woo.short_description).slice(0, 160),
        variantAxisOrder: ["type", "size"],
      },
      include: { variants: true, images: true, accordionItems: true },
    });
  }

  const actions: string[] = [];
  const galleryPullRows: Array<{ sku: string; doVarId: string; label: string }> = [];

  if (!APPLY) {
    console.log(`\nTarget: ${product.name} (${product.slug}) id=${product.id}`);
    console.log(`Would inactivate ${product.variants.filter((v) => v.status === "ACTIVE").length} existing variants`);
    console.log(`Would create ${doVariants.length} new variants`);
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(
    path.join(BACKUP_DIR, `${stamp}-before.json`),
    JSON.stringify(
      {
        productId: product.id,
        variants: product.variants.map((v) => ({ id: v.id, sku: v.sku, status: v.status })),
      },
      null,
      2
    )
  );

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: PRODUCT_NAME,
      slug: WOO_SLUG,
      wooCommerceId: WOO_PRODUCT_ID,
      status: ProductStatus.ACTIVE,
      productType: ProductType.VARIABLE,
      taxClass: "gst-5",
      description: woo.description,
      shortDescription: woo.short_description,
      seoTitle: PRODUCT_NAME,
      seoDescription: stripHtml(woo.short_description).slice(0, 160),
      variantAxisOrder: ["type", "size"],
      deletedAt: null,
    },
  });
  actions.push("UPDATED product metadata from DO/Woo");

  await prisma.accordionItem.deleteMany({ where: { productId: product.id } });
  for (let i = 0; i < accordion.length; i++) {
    const a = accordion[i]!;
    await prisma.accordionItem.create({
      data: { productId: product.id, title: a.title, content: a.content, position: i },
    });
  }
  actions.push(`ACCORDION ${accordion.length} items (Key features, etc.)`);

  const mirrored = await mirrorImages(WOO_SLUG, galleryUrls);
  await prisma.productImage.deleteMany({ where: { productId: product.id, variantId: null } });
  if (mirrored.length) {
    await prisma.productImage.createMany({
      data: mirrored.map((url, i) => ({
        productId: product.id,
        url,
        altText: PRODUCT_NAME,
        position: i,
        isPrimary: i === 0,
      })),
    });
  }
  actions.push(`PRODUCT GALLERY ${mirrored.length} images`);

  for (const v of product.variants) {
    if (v.status === "ACTIVE") {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { status: VariantStatus.INACTIVE, isDefault: false },
      });
      actions.push(`INACTIVATED old ${v.sku}`);
    }
  }

  const newSkuSet = new Set(doVariants.map((dv) => skuFor(dv.type, dv.size)));
  let firstVariantId: string | null = null;

  for (const dv of doVariants) {
    const sku = skuFor(dv.type, dv.size);
    const label = `${dv.size} / ${dv.type}`;
    const regular = parseDecimal(dv.regularPrice) ?? 0;
    const sale = parseDecimal(dv.salePrice) ?? regular;
    const mrpInPaise = toPaise(Math.max(regular, sale));
    const saleInPaise = toPaise(sale);

    let variant = await prisma.productVariant.findUnique({ where: { sku } });
    if (variant) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          productId: product.id,
          status: VariantStatus.ACTIVE,
          mrpInPaise,
          saleInPaise,
          isDefault: false,
        },
      });
      actions.push(`REACTIVATED ${sku}`);
    } else {
      variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          mrpInPaise,
          saleInPaise,
          mrpUsdCents: donorUsd.mrpUsdCents,
          saleUsdCents: donorUsd.saleUsdCents,
          mrpGbpPence: donorUsd.mrpGbpPence,
          saleGbpPence: donorUsd.saleGbpPence,
          isDefault: false,
          status: VariantStatus.ACTIVE,
          inventory: { create: { onHand: STOCK_ON_HAND, reserved: 0, lowStockThreshold: 5 } },
        },
      });
      await cloneShipping(variant.id, donorRates);
      actions.push(`CREATED ${sku}`);
    }

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { variantId: variant.id, onHand: STOCK_ON_HAND, reserved: 0, lowStockThreshold: 5 },
      update: { onHand: STOCK_ON_HAND },
    });

    await syncVariantAttributes(variant.id, [
      { name: "Type", slug: "type", value: dv.type },
      { name: "Size", slug: "size", value: dv.size },
    ]);

    if (!firstVariantId) firstVariantId = variant.id;
    galleryPullRows.push({ sku, doVarId: dv.id, label });
  }

  await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { isDefault: false } });
  const defaultVariant = await prisma.productVariant.findFirst({
    where: { productId: product.id, sku: "MI-GO-CH-ET-CH-18", status: "ACTIVE" },
  });
  const defaultId = defaultVariant?.id ?? firstVariantId;
  if (defaultId) {
    await prisma.productVariant.update({ where: { id: defaultId }, data: { isDefault: true } });
  }

  patchPullV2ForGallery(galleryPullRows);
  actions.push("PATCHED do-ls-media-pull-v2.json for carousel sync");
  console.log("\nRunning variant carousel gallery sync…");
  await runGallerySync();
  actions.push("CAROUSEL variant images synced");

  const pairTargets = [
    { wooId: 45152, position: 0 },
    { wooId: 45289, position: 1 }
  ];
  for (const { wooId, position } of pairTargets) {
    const toProduct = await prisma.product.findFirst({
      where: { wooCommerceId: wooId, deletedAt: null },
      select: { id: true, name: true }
    });
    if (!toProduct) {
      console.warn(`Pair-with target woo ${wooId} not found in LS`);
      continue;
    }
    await prisma.productRelation.upsert({
      where: {
        fromProductId_toProductId_type: {
          fromProductId: product.id,
          toProductId: toProduct.id,
          type: "PAIR_WITH"
        }
      },
      create: {
        fromProductId: product.id,
        toProductId: toProduct.id,
        type: "PAIR_WITH",
        position
      },
      update: { position }
    });
    actions.push(`PAIR_WITH → ${toProduct.name} (woo ${wooId})`);
  }

  fs.writeFileSync(
    path.join(BACKUP_DIR, `${stamp}-actions.json`),
    JSON.stringify({ productId: product.id, newSkus: [...newSkuSet], actions }, null, 2)
  );

  console.log("\n=== Done ===");
  for (const a of actions) console.log(" ", a);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
