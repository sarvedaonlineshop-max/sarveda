/**
 * Import Annapurna / Sughosh / Gomukhi (Gaumukhi on Woo) Shankhs from
 * data/compare/shankh-import-batch.json into Lightsail DB.
 * Clones categories + shipping from Standard Shankh; mirrors images to S3.
 *
 * Usage:
 *   npx tsx scripts/import-shankh-specialties-from-woo.ts
 *   npx tsx scripts/import-shankh-specialties-from-woo.ts --apply
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, ProductStatus, ProductType, VariantStatus } from "@prisma/client";
import { mirrorUrlToS3 } from "../src/config/s3";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const BATCH_PATH = path.join(__dirname, "../../data/compare/shankh-import-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-shankh-import-backups");
const TEMPLATE_SLUG = "standard-shankh";

type BatchRow = {
  wooId: number;
  wooName: string;
  wooSlug: string;
  description: string;
  shortDescription: string;
  saleInPaise: number;
  mrpInPaise: number;
  imageUrl: string | null;
  sheetName: string;
  sheetSlug: string;
  sku: string;
  variant: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH_PATH, "utf8")) as BatchRow[];
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const template = await prisma.product.findFirst({
    where: { slug: TEMPLATE_SLUG, deletedAt: null },
    include: {
      categories: true,
      variants: {
        where: { status: "ACTIVE" },
        include: { shippingRates: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!template) throw new Error(`Template product missing: ${TEMPLATE_SLUG}`);
  const donor =
    template.variants.find((v) => v.sku === "MI-SK-ST-M") || template.variants[0];
  if (!donor) throw new Error("Standard Shankh has no active variants for shipping clone");

  console.log(`Template: ${template.name} (${template.slug}) donor=${donor.sku}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const summary: Record<string, unknown>[] = [];

  for (const row of batch) {
    console.log(`=== ${row.sheetName} (${row.sku}) ===`);
    const existingBySlug = await prisma.product.findFirst({
      where: { slug: row.sheetSlug, deletedAt: null },
      include: { variants: true, images: true },
    });
    const existingSku = await prisma.productVariant.findUnique({
      where: { sku: row.sku },
      include: { productRel: { select: { name: true, slug: true } } },
    });

    if (existingSku && existingBySlug && existingSku.productId === existingBySlug.id) {
      console.log("  already present — skip create");
      summary.push({ sheetName: row.sheetName, action: "exists", sku: row.sku });
      continue;
    }
    if (existingSku && (!existingBySlug || existingSku.productId !== existingBySlug?.id)) {
      console.log(
        `  SKU CONFLICT ${row.sku} on ${existingSku.productRel?.name} (${existingSku.productRel?.slug})`
      );
      summary.push({ sheetName: row.sheetName, action: "sku_conflict", sku: row.sku });
      continue;
    }
    if (existingBySlug && !existingSku) {
      console.log(`  slug exists without SKU — will add variant if --apply`);
    }

    const seoDescription = stripHtml(row.shortDescription || row.description).slice(0, 160);
    const plan = {
      sheetName: row.sheetName,
      sheetSlug: row.sheetSlug,
      sku: row.sku,
      variant: row.variant,
      mrpInPaise: row.mrpInPaise,
      saleInPaise: row.saleInPaise,
      wooId: row.wooId,
      imageUrl: row.imageUrl,
      categories: template.categories.map((c) => c.categoryId),
      shippingCountries: donor.shippingRates.map((r) => r.country),
    };
    console.log("  plan:", JSON.stringify(plan, null, 2).split("\n").join("\n  "));

    if (!APPLY) {
      summary.push({ ...plan, action: "would_create" });
      continue;
    }

    let imageUrl = row.imageUrl;
    if (row.imageUrl) {
      const ext = path.extname(new URL(row.imageUrl).pathname) || ".jpg";
      const key = `products/${row.sheetSlug}/primary${ext}`;
      try {
        const mirrored = await mirrorUrlToS3(row.imageUrl, key);
        if (mirrored) {
          imageUrl = mirrored;
          console.log(`  S3 image: ${mirrored}`);
        } else {
          console.log("  S3 skip (no creds) — keeping Woo URL temporarily");
        }
      } catch (err) {
        console.warn(`  S3 mirror failed: ${(err as Error).message} — keeping Woo URL`);
      }
    }

    const product =
      existingBySlug ||
      (await prisma.product.create({
        data: {
          slug: row.sheetSlug,
          name: row.sheetName,
          description: row.description || null,
          shortDescription: row.shortDescription || null,
          productType: ProductType.SIMPLE,
          status: ProductStatus.ACTIVE,
          taxClass: template.taxClass,
          expressShippingEnabled: template.expressShippingEnabled,
          seoTitle: row.sheetName,
          seoDescription: seoDescription || null,
          wooCommerceId: row.wooId,
          sortOrder: (template.sortOrder ?? 93) + 1,
          categories: {
            create: template.categories.map((c) => ({ categoryId: c.categoryId })),
          },
        },
      }));

    if (existingBySlug) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: row.sheetName,
          description: row.description || null,
          shortDescription: row.shortDescription || null,
          status: ProductStatus.ACTIVE,
          taxClass: template.taxClass,
          seoTitle: row.sheetName,
          seoDescription: seoDescription || null,
          wooCommerceId: row.wooId,
        },
      });
      const haveCats = await prisma.productCategory.findMany({
        where: { productId: product.id },
      });
      if (haveCats.length === 0) {
        await prisma.productCategory.createMany({
          data: template.categories.map((c) => ({
            productId: product.id,
            categoryId: c.categoryId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: row.sku,
        mrpInPaise: row.mrpInPaise,
        saleInPaise: row.saleInPaise,
        mrpUsdCents: donor.mrpUsdCents,
        saleUsdCents: donor.saleUsdCents,
        mrpGbpPence: donor.mrpGbpPence,
        saleGbpPence: donor.saleGbpPence,
        weightGrams: donor.weightGrams,
        isDefault: true,
        status: VariantStatus.ACTIVE,
        inventory: { create: { onHand: 0, reserved: 0, lowStockThreshold: 5 } },
        shippingRates: {
          create: donor.shippingRates.map((r) => ({
            country: r.country,
            standardPerProduct: r.standardPerProduct,
            standardAdditional: r.standardAdditional,
            expeditedPerProduct: r.expeditedPerProduct,
            expeditedAdditional: r.expeditedAdditional,
            codPerProduct: r.codPerProduct,
            codAdditional: r.codAdditional,
            estimatedDays: r.estimatedDays,
          })),
        },
      },
    });

    await syncVariantAttributes(variant.id, [
      { name: "Type", slug: "type", value: row.variant },
    ]);

    if (imageUrl) {
      const existingImg = await prisma.productImage.findFirst({
        where: { productId: product.id, isPrimary: true },
      });
      if (existingImg) {
        await prisma.productImage.update({
          where: { id: existingImg.id },
          data: { url: imageUrl, altText: row.sheetName },
        });
      } else {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: imageUrl,
            altText: row.sheetName,
            position: 0,
            isPrimary: true,
          },
        });
      }
    }

    const backup = {
      productId: product.id,
      slug: row.sheetSlug,
      variantId: variant.id,
      sku: row.sku,
      imageUrl,
    };
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${row.sheetSlug}.json`),
      JSON.stringify(backup, null, 2)
    );
    console.log(`  CREATED product=${product.id} variant=${variant.id}`);
    summary.push({ ...plan, action: "created", productId: product.id, variantId: variant.id, imageUrl });
  }

  const outPath = path.join(BACKUP_DIR, `${stamp}-summary.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary → ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
