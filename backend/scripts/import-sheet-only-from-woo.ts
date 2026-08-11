/**
 * Import sheet-only products from Woo payloads.
 * - Product name / descriptions / images: Woo
 * - SKU + variant labels/attrs: sheet (batch JSON)
 *
 * Usage:
 *   npx tsx scripts/import-sheet-only-from-woo.ts
 *   npx tsx scripts/import-sheet-only-from-woo.ts --apply
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, ProductStatus, ProductType, VariantStatus } from "@prisma/client";
import { mirrorUrlToS3 } from "../src/config/s3";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";
import { slugify } from "../src/utils/slugify";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const BATCH_PATH = path.join(__dirname, "../../data/compare/sheet-only-woo-import-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-sheet-only-woo-import-backups");
const TEMPLATE_SLUG = "standard-shankh";

type Attr = { name: string; slug: string; value: string };
type BatchVariant = {
  sku: string;
  label: string;
  attrs: Attr[];
  mrpInPaise: number;
  saleInPaise: number;
  imageUrl?: string | null;
};
type BatchProduct = {
  wooSlug: string;
  wooId: number;
  wooName: string;
  wooType: string;
  sheetProducts: string[];
  description: string;
  shortDescription: string;
  imageUrls: string[];
  primaryImage: string | null;
  variants: BatchVariant[];
  special?: {
    moveExistingSkus?: boolean;
    mergeIntoExistingOcarinaBig?: boolean;
    reactivateDraftDnaSlug?: boolean;
    naFlutesConsolidate?: boolean;
  };
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  await prisma.productVariant.updateMany({
    where: { productId },
    data: { isDefault: false },
  });
  if (actives[0]) {
    await prisma.productVariant.update({
      where: { id: actives[0].id },
      data: { isDefault: true },
    });
  }
}

async function mirrorImages(productSlug: string, urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url) continue;
    try {
      const ext = path.extname(new URL(url).pathname) || ".jpg";
      const key = `products/${productSlug}/${i === 0 ? "primary" : `gallery-${i}`}${ext}`;
      const mirrored = await mirrorUrlToS3(url, key);
      out.push(mirrored || url);
    } catch (err) {
      console.warn(`  image mirror fail: ${(err as Error).message}`);
      out.push(url);
    }
  }
  return out;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(BATCH_PATH, "utf8")) as {
    imports: BatchProduct[];
    skipped: string[];
  };
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const template = await prisma.product.findFirst({
    where: { slug: TEMPLATE_SLUG, deletedAt: null },
    include: {
      categories: true,
      variants: {
        where: { status: "ACTIVE" },
        include: { shippingRates: true },
        take: 1,
      },
    },
  });
  if (!template?.variants[0]) throw new Error("Missing shipping template product");
  const donorRates = template.variants[0].shippingRates;
  const donorUsd = {
    mrpUsdCents: template.variants[0].mrpUsdCents,
    saleUsdCents: template.variants[0].saleUsdCents,
    mrpGbpPence: template.variants[0].mrpGbpPence,
    saleGbpPence: template.variants[0].saleGbpPence,
  };

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Skipped (no Woo): ${raw.skipped.join(", ") || "-"}\n`);

  const summary: Record<string, unknown>[] = [];

  for (const item of raw.imports) {
    console.log(`\n=== ${item.wooName} (${item.wooSlug}) ===`);
    console.log(`  sheets: ${item.sheetProducts.join(" | ")}`);
    console.log(`  variants: ${item.variants.map((v) => v.sku).join(", ")}`);

    // Resolve existing product targets (prefer wooCommerceId, incl. ARCHIVED/DRAFT)
    let product =
      (await prisma.product.findFirst({
        where: { wooCommerceId: item.wooId },
        include: { variants: true, images: true, categories: true },
      })) ||
      (await prisma.product.findFirst({
        where: { slug: item.wooSlug, deletedAt: null },
        include: { variants: true, images: true, categories: true },
      }));

    if (item.special?.mergeIntoExistingOcarinaBig) {
      const big = await prisma.product.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { slug: "ocarina-big" },
            { slug: "clay-ocarinas" },
            { name: { equals: "Ocarina - Big", mode: "insensitive" } },
            { name: { equals: "Clay Ocarinas", mode: "insensitive" } },
          ],
        },
        include: { variants: true, images: true, categories: true },
      });
      if (big) product = big;
    }

    // Bar chime: Woo id already on "32 Rods - Bar Chime" — reuse & rename to Woo 25 Rods name
    // NA flutes: Woo id already on Triple — reuse, rename, add sheet variants
    // DNA / archived copper / etched: reuse via wooCommerceId above

    const actions: string[] = [];

    if (!APPLY) {
      console.log(
        `  target product: ${
          product
            ? `${product.status} ${product.name} (${product.slug})`
            : "(new)"
        }`
      );
      for (const v of item.variants) {
        const existing = await prisma.productVariant.findUnique({
          where: { sku: v.sku },
          include: { productRel: { select: { name: true, slug: true } } },
        });
        if (existing) {
          actions.push(
            `MOVE/UPDATE ${v.sku} currently on ${existing.productRel?.name} (${existing.productRel?.slug}) sale=${v.saleInPaise}`
          );
        } else {
          actions.push(`CREATE ${v.sku} label=${v.label || "(blank)"} sale=${v.saleInPaise} mrp=${v.mrpInPaise}`);
        }
      }
      actions.forEach((a) => console.log(" ", a));
      summary.push({ wooName: item.wooName, dryRun: actions });
      continue;
    }

    const productSlug = item.wooSlug;
    const seoDescription = stripHtml(item.shortDescription || item.description).slice(0, 160);
    const mirrored = await mirrorImages(productSlug, item.imageUrls.slice(0, 8));

    if (!product) {
      product = await prisma.product.create({
        data: {
          slug: productSlug,
          name: item.wooName,
          description: item.description || null,
          shortDescription: item.shortDescription || null,
          productType:
            item.variants.length > 1 || item.wooType === "variable"
              ? ProductType.VARIABLE
              : ProductType.SIMPLE,
          status: ProductStatus.ACTIVE,
          taxClass: template.taxClass,
          expressShippingEnabled: template.expressShippingEnabled,
          seoTitle: item.wooName,
          seoDescription: seoDescription || null,
          wooCommerceId: item.wooId,
          sortOrder: (template.sortOrder ?? 100) + 1,
          categories: {
            create: template.categories.map((c) => ({ categoryId: c.categoryId })),
          },
        },
        include: { variants: true, images: true, categories: true },
      });
      actions.push(`CREATED product ${product.id}`);
    } else {
      const slugTaken = await prisma.product.findFirst({
        where: { slug: productSlug, deletedAt: null, NOT: { id: product.id } },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: item.wooName,
          ...(slugTaken ? {} : { slug: productSlug }),
          description: item.description || product.description,
          shortDescription: item.shortDescription || product.shortDescription,
          status: ProductStatus.ACTIVE,
          seoTitle: item.wooName,
          seoDescription: seoDescription || product.seoDescription,
          wooCommerceId: item.wooId,
          productType:
            item.variants.length > 1 || (product.variants?.length ?? 0) > 1
              ? ProductType.VARIABLE
              : ProductType.VARIABLE,
        },
      });
      actions.push(`UPDATED product ${product.id} (was ${product.status} ${product.name})`);

      // DNA: draft leftover woo-var-* stubs
      if (item.special?.reactivateDraftDnaSlug) {
        const keep = new Set(item.variants.map((v) => v.sku));
        const leftovers = await prisma.productVariant.findMany({
          where: { productId: product.id, status: "ACTIVE", sku: { notIn: [...keep] } },
        });
        for (const lv of leftovers) {
          await prisma.productVariant.update({
            where: { id: lv.id },
            data: { status: "INACTIVE", isDefault: false },
          });
          actions.push(`DRAFTED leftover ${lv.sku}`);
        }
      }

      // Bar chime 25: draft old MI-BCH-32 if present
      if (item.wooSlug === "32-bar-rod-chime") {
        const keep = new Set(item.variants.map((v) => v.sku));
        const leftovers = await prisma.productVariant.findMany({
          where: { productId: product.id, status: "ACTIVE", sku: { notIn: [...keep] } },
        });
        for (const lv of leftovers) {
          await prisma.productVariant.update({
            where: { id: lv.id },
            data: { status: "INACTIVE", isDefault: false },
          });
          actions.push(`DRAFTED leftover ${lv.sku}`);
        }
      }
    }

    // Refresh product id after updates
    const productId = product.id;

    if (mirrored.length) {
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.productImage.createMany({
        data: mirrored.map((url, i) => ({
          productId,
          url,
          altText: item.wooName,
          position: i,
          isPrimary: i === 0,
        })),
      });
    }

    for (const v of item.variants) {
      const mrp = v.mrpInPaise > 0 ? v.mrpInPaise : 0;
      const sale = v.saleInPaise > 0 ? v.saleInPaise : mrp;
      const existing = await prisma.productVariant.findUnique({ where: { sku: v.sku } });

      let variantId: string;
      if (existing) {
        await prisma.productVariant.update({
          where: { id: existing.id },
          data: {
            productId,
            status: VariantStatus.ACTIVE,
            mrpInPaise: mrp || existing.mrpInPaise,
            saleInPaise: sale || existing.saleInPaise,
            isDefault: false,
          },
        });
        variantId = existing.id;
        // ensure inventory
        await prisma.inventory.upsert({
          where: { variantId },
          create: { variantId, onHand: 0, reserved: 0, lowStockThreshold: 5 },
          update: {},
        });
        const shipCount = await prisma.variantShippingRate.count({ where: { variantId } });
        if (!shipCount) await cloneShipping(variantId, donorRates);
        actions.push(`MOVED/UPDATED ${v.sku}`);
      } else {
        const created = await prisma.productVariant.create({
          data: {
            productId,
            sku: v.sku,
            mrpInPaise: mrp,
            saleInPaise: sale,
            mrpUsdCents: donorUsd.mrpUsdCents,
            saleUsdCents: donorUsd.saleUsdCents,
            mrpGbpPence: donorUsd.mrpGbpPence,
            saleGbpPence: donorUsd.saleGbpPence,
            isDefault: false,
            status: VariantStatus.ACTIVE,
            inventory: { create: { onHand: 0, reserved: 0, lowStockThreshold: 5 } },
          },
        });
        variantId = created.id;
        await cloneShipping(variantId, donorRates);
        actions.push(`CREATED ${v.sku}`);
      }

      const attrs =
        v.attrs?.length > 0
          ? v.attrs
          : v.label
            ? [{ name: "Type", slug: "type", value: v.label }]
            : [];
      await syncVariantAttributes(variantId, attrs);
    }

    await ensureDefault(productId);

    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${slugify(item.wooSlug)}.json`),
      JSON.stringify({ productId, actions, item: { wooSlug: item.wooSlug, variants: item.variants.map((v) => v.sku) } }, null, 2)
    );
    actions.forEach((a) => console.log(" ", a));
    summary.push({ wooName: item.wooName, productId, actions });
  }

  const out = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(`\nSummary → ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
