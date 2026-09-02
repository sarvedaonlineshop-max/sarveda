/**
 * Import Crystal Bowl Mallets (Woo 49604 + variations 49605–49607) into Lightsail catalog.
 * Source: live Woo Store API + CTX authoritative prices/images.
 * Run BEFORE apply-ctx-manual-decisions batch3 publish rows.
 *
 *   npx tsx scripts/import-crystal-bowl-mallets-from-ctx.ts
 *   npx tsx scripts/import-crystal-bowl-mallets-from-ctx.ts --apply
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  PrismaClient,
  ProductStatus,
  ProductType,
  VariantStatus
} from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const PRODUCT_SLUG = "crystal-bowl-accessories";
const PRODUCT_WOO_ID = 49604;
const TEMPLATE_SLUG = "crystal-bowls-frosted-white";
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-crystal-bowl-mallets-import");

/** Assigned SKUs (Woo had no variation SKUs). */
const VARIANTS = [
  {
    wooVariationId: 49605,
    sku: "MI-CB-MA-B",
    type: "Ball Mallet",
    ctxImage:
      "https://sarveda.com/wp-content/uploads/2026/03/mallet.jpg",
    mrpInPaise: 175_000,
    saleInPaise: 160_000
  },
  {
    wooVariationId: 49606,
    sku: "MI-CB-MA-R",
    type: "Rimming Mallet",
    ctxImage:
      "https://sarveda.com/wp-content/uploads/2026/03/mallet-copy-8.jpg",
    mrpInPaise: 165_000,
    saleInPaise: 155_000
  },
  {
    wooVariationId: 49607,
    sku: "MI-CB-MA-S",
    type: "Silicon Mallet",
    ctxImage:
      "https://sarveda.com/wp-content/uploads/2026/03/Silicon-mallet_.jpg",
    mrpInPaise: 175_000,
    saleInPaise: 160_000
  }
] as const;

type WooStoreProduct = {
  id: number;
  name: string;
  slug: string;
  short_description?: string;
  description?: string;
  images?: Array<{ src: string; alt?: string }>;
  prices?: {
    regular_price?: string;
    sale_price?: string;
    price?: string;
  };
};

async function fetchWooProduct(id: number): Promise<WooStoreProduct | null> {
  try {
    const res = await fetch(`https://sarveda.com/wp-json/wc/store/products/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as WooStoreProduct;
  } catch {
    return null;
  }
}

function keyForWpUpload(url: string): string | null {
  const prefix = "https://sarveda.com/wp-content/uploads/";
  if (!url.startsWith(prefix)) return null;
  return `media/wp/uploads/${url.slice(prefix.length)}`;
}

async function mirrorImage(_productSlug: string, url: string, _suffix: string): Promise<string> {
  const key = keyForWpUpload(url);
  if (!key) throw new Error(`Unsupported image URL (expected wp-content/uploads): ${url}`);
  const mirrored = await mirrorUrlToS3(url, key);
  if (!mirrored) throw new Error(`S3 mirror failed for ${url}`);
  return mirrored;
}

async function cloneShipping(variantId: string, donorRates: Awaited<ReturnType<typeof loadTemplate>>["donorRates"]) {
  const count = await prisma.variantShippingRate.count({ where: { variantId } });
  if (count > 0) return;
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
      estimatedDays: r.estimatedDays
    }))
  });
}

async function loadTemplate() {
  const template = await prisma.product.findFirst({
    where: { slug: TEMPLATE_SLUG, deletedAt: null },
    include: {
      categories: true,
      variants: {
        where: { status: "ACTIVE" },
        include: { shippingRates: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!template) throw new Error(`Template product missing: ${TEMPLATE_SLUG}`);
  const donor = template.variants[0];
  if (!donor) throw new Error(`Template has no variants: ${TEMPLATE_SLUG}`);
  return { template, donor, donorRates: donor.shippingRates };
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const { template, donor, donorRates } = await loadTemplate();

  const parentWoo = await fetchWooProduct(PRODUCT_WOO_ID);
  const parentName = parentWoo?.name || "Crystal Bowl Mallets";
  const shortDescription =
    parentWoo?.short_description ||
    "<p>Enhance your sound healing and meditation experience with our thoughtfully crafted Crystal Bowl Accessories.</p>";
  const description =
    parentWoo?.description ||
    "<p>Enhance your sound healing and meditation experience with our thoughtfully crafted Crystal Bowl Accessories.</p>";
  const parentGalleryUrl =
    parentWoo?.images?.[0]?.src ||
    "https://sarveda.com/wp-content/uploads/2026/04/Crystal-bowl-accessories.jpg";

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Product: ${parentName} slug=${PRODUCT_SLUG} woo=${PRODUCT_WOO_ID}`);
  console.log(`Template categories/shipping from: ${TEMPLATE_SLUG} (${donor.sku})\n`);

  const existing = await prisma.product.findFirst({
    where: { slug: PRODUCT_SLUG, deletedAt: null },
    include: { variants: true, images: true }
  });

  if (existing && existing.variants.some((v) => VARIANTS.every((row) => row.sku !== v.sku))) {
    console.log(`Existing product ${existing.id} has other variants — will upsert mallet SKUs only`);
  }

  const plan = {
    productSlug: PRODUCT_SLUG,
    wooCommerceId: PRODUCT_WOO_ID,
    variants: VARIANTS.map((v) => ({
      sku: v.sku,
      wooVariationId: v.wooVariationId,
      type: v.type,
      mrpInPaise: v.mrpInPaise,
      saleInPaise: v.saleInPaise
    }))
  };
  console.log(JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("\nRe-run with --apply to write to DB.");
    return;
  }

  let parentGallery = parentGalleryUrl;
  parentGallery = await mirrorImage(PRODUCT_SLUG, parentGalleryUrl, "gallery-primary");

  let product = existing;
  if (!product) {
    product = await prisma.product.create({
      data: {
        slug: PRODUCT_SLUG,
        name: parentName,
        description,
        shortDescription,
        productType: ProductType.VARIABLE,
        status: ProductStatus.ACTIVE,
        taxClass: template.taxClass,
        expressShippingEnabled: template.expressShippingEnabled,
        seoTitle: parentName,
        seoDescription: parentName,
        wooCommerceId: PRODUCT_WOO_ID,
        variantAxisOrder: ["type"],
        variantOptionValueOrder: {
          type: ["Ball Mallet", "Rimming Mallet", "Silicon Mallet"]
        },
        sortOrder: (template.sortOrder ?? 100) + 1,
        categories: {
          create: template.categories.map((c) => ({ categoryId: c.categoryId }))
        }
      },
      include: { variants: true, images: true }
    });
    console.log(`CREATED product ${product.id}`);
  } else {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        name: parentName,
        description,
        shortDescription,
        status: ProductStatus.ACTIVE,
        productType: ProductType.VARIABLE,
        wooCommerceId: PRODUCT_WOO_ID,
        variantAxisOrder: ["type"],
        variantOptionValueOrder: {
          type: ["Ball Mallet", "Rimming Mallet", "Silicon Mallet"]
        }
      }
    });
    const haveCats = await prisma.productCategory.count({ where: { productId: product.id } });
    if (haveCats === 0) {
      await prisma.productCategory.createMany({
        data: template.categories.map((c) => ({
          productId: product.id,
          categoryId: c.categoryId
        })),
        skipDuplicates: true
      });
    }
    console.log(`UPDATED product ${product.id}`);
  }

  const productId = product!.id;

  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.productImage.create({
    data: {
      productId,
      url: parentGallery,
      altText: parentName,
      position: 0,
      isPrimary: true
    }
  });

  const createdVariants: Array<{ sku: string; variantId: string; wooVariationId: number }> = [];

  for (let i = 0; i < VARIANTS.length; i++) {
    const row = VARIANTS[i]!;
    const wooVar = await fetchWooProduct(row.wooVariationId);
    const mrpInPaise = wooVar?.prices?.regular_price
      ? Number(wooVar.prices.regular_price)
      : row.mrpInPaise;
    const saleInPaise = wooVar?.prices?.sale_price
      ? Number(wooVar.prices.sale_price)
      : row.saleInPaise;

    let variant = await prisma.productVariant.findUnique({ where: { sku: row.sku } });
    if (variant && variant.productId !== productId) {
      throw new Error(`SKU ${row.sku} already on another product`);
    }

    const imageUrl = await mirrorImage(
      PRODUCT_SLUG,
      wooVar?.images?.[0]?.src || row.ctxImage,
      `variant-${row.sku.toLowerCase()}`
    );

    if (variant) {
      variant = await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          productId,
          mrpInPaise,
          saleInPaise,
          mrpUsdCents: donor.mrpUsdCents,
          saleUsdCents: donor.saleUsdCents,
          mrpGbpPence: donor.mrpGbpPence,
          saleGbpPence: donor.saleGbpPence,
          weightGrams: donor.weightGrams ?? 200,
          isDefault: i === 0,
          status: VariantStatus.ACTIVE,
          wooCommerceVariationId: row.wooVariationId
        }
      });
      console.log(`UPDATED variant ${row.sku}`);
    } else {
      variant = await prisma.productVariant.create({
        data: {
          productId,
          sku: row.sku,
          mrpInPaise,
          saleInPaise,
          mrpUsdCents: donor.mrpUsdCents,
          saleUsdCents: donor.saleUsdCents,
          mrpGbpPence: donor.mrpGbpPence,
          saleGbpPence: donor.saleGbpPence,
          weightGrams: donor.weightGrams ?? 200,
          isDefault: i === 0,
          status: VariantStatus.ACTIVE,
          wooCommerceVariationId: row.wooVariationId,
          inventory: { create: { onHand: 100, reserved: 0, lowStockThreshold: 5 } }
        }
      });
      console.log(`CREATED variant ${row.sku}`);
    }

    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { variantId: variant.id, onHand: 100, reserved: 0, lowStockThreshold: 5 },
      update: {}
    });
    await cloneShipping(variant.id, donorRates);
    await syncVariantAttributes(variant.id, [{ name: "Type", slug: "type", value: row.type }]);

    const existingImg = await prisma.productImage.findFirst({
      where: { productId, url: imageUrl }
    });
    if (!existingImg) {
      await prisma.productImage.create({
        data: {
          productId,
          url: imageUrl,
          altText: `${parentName} - ${row.type}`,
          position: i + 1,
          isPrimary: false
        }
      });
    }

    createdVariants.push({
      sku: row.sku,
      variantId: variant.id,
      wooVariationId: row.wooVariationId
    });
  }

  const backup = {
    productId,
    slug: PRODUCT_SLUG,
    wooCommerceId: PRODUCT_WOO_ID,
    variants: createdVariants
  };
  const out = path.join(BACKUP_DIR, `${stamp}-crystal-bowl-mallets.json`);
  fs.writeFileSync(out, JSON.stringify(backup, null, 2));
  console.log(`\nBackup → ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
