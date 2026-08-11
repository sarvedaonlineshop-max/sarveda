/**
 * Finish remaining Aug9 sheet gaps: Crystal Coloured, Gong Plates Etched/Stand,
 * GAB (Singing Bowl Head Set), Solar Bell.
 *
 *   npx tsx scripts/import-finish-remaining-aug9.ts
 *   npx tsx scripts/import-finish-remaining-aug9.ts --apply
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
const BATCH_PATH = path.join(__dirname, "../../data/compare/finish-remaining-import-batch.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-finish-remaining-backups");
const TEMPLATE_SLUG = "standard-shankh";

type Attr = { name: string; slug: string; value: string };
type V = { sku: string; label: string; attrs: Attr[]; mrpInPaise: number; saleInPaise: number };
type Item = {
  key: string;
  wooName: string;
  wooSlug: string;
  wooId: number | null;
  description: string;
  shortDescription: string;
  imageUrls: string[];
  variants: V[];
  action: "create" | "update_existing";
  findSlug?: string;
  draftOtherSkus?: boolean;
  notes?: string;
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

async function mirrorImages(productSlug: string, urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < Math.min(urls.length, 8); i++) {
    const url = urls[i];
    if (!url) continue;
    try {
      const ext = path.extname(new URL(url).pathname) || ".jpg";
      const key = `products/${productSlug}/${i === 0 ? "primary" : `gallery-${i}`}${ext}`;
      const mirrored = await mirrorUrlToS3(url, key);
      out.push(mirrored || url);
    } catch (e) {
      console.warn("  image fail", (e as Error).message);
      out.push(url);
    }
  }
  return out;
}

async function main() {
  const batch = JSON.parse(fs.readFileSync(BATCH_PATH, "utf8")) as { imports: Item[] };
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const template = await prisma.product.findFirst({
    where: { slug: TEMPLATE_SLUG, deletedAt: null },
    include: {
      categories: true,
      variants: { where: { status: "ACTIVE" }, include: { shippingRates: true }, take: 1 },
    },
  });
  if (!template?.variants[0]) throw new Error("template missing");
  const donor = template.variants[0];
  const donorRates = donor.shippingRates;

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const summary: unknown[] = [];

  for (const item of batch.imports) {
    console.log(`=== ${item.key}: ${item.wooName} ===`);
    console.log(`  ${item.notes || ""}`);

    let product =
      (item.findSlug
        ? await prisma.product.findFirst({
            where: { slug: item.findSlug },
            include: { variants: true, images: true, categories: true },
          })
        : null) ||
      (await prisma.product.findFirst({
        where: { slug: item.wooSlug, deletedAt: null },
        include: { variants: true, images: true, categories: true },
      }));

    if (item.wooId) {
      const byWoo = await prisma.product.findFirst({
        where: { wooCommerceId: item.wooId },
        include: { variants: true, images: true, categories: true },
      });
      if (byWoo) product = byWoo;
    }

    const actions: string[] = [];
    if (!APPLY) {
      console.log(`  product: ${product ? `${product.status} ${product.name}` : "(new)"}`);
      for (const v of item.variants) {
        const ex = await prisma.productVariant.findUnique({
          where: { sku: v.sku },
          include: { productRel: { select: { name: true } } },
        });
        actions.push(
          ex
            ? `UPDATE ${v.sku} on ${ex.productRel?.name}`
            : `CREATE ${v.sku} ${v.label || "(blank)"} sale=${v.saleInPaise}`
        );
      }
      actions.forEach((a) => console.log(" ", a));
      summary.push({ key: item.key, dryRun: actions });
      continue;
    }

    const seoDescription = stripHtml(item.shortDescription || item.description).slice(0, 160);
    const mirrored = await mirrorImages(item.wooSlug, item.imageUrls);

    if (!product) {
      product = await prisma.product.create({
        data: {
          slug: item.wooSlug,
          name: item.wooName,
          description: item.description || null,
          shortDescription: item.shortDescription || null,
          productType: item.variants.length > 1 ? ProductType.VARIABLE : ProductType.SIMPLE,
          status: ProductStatus.ACTIVE,
          taxClass: template.taxClass,
          expressShippingEnabled: template.expressShippingEnabled,
          seoTitle: item.wooName,
          seoDescription: seoDescription || null,
          wooCommerceId: item.wooId ?? undefined,
          sortOrder: (template.sortOrder ?? 100) + 1,
          deletedAt: null,
          categories: {
            create: template.categories.map((c) => ({ categoryId: c.categoryId })),
          },
        },
        include: { variants: true, images: true, categories: true },
      });
      actions.push(`CREATED ${product.id}`);
    } else {
      const slugTaken = await prisma.product.findFirst({
        where: { slug: item.wooSlug, deletedAt: null, NOT: { id: product.id } },
      });
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: item.wooName,
          ...(slugTaken ? {} : { slug: item.wooSlug }),
          description: item.description || product.description,
          shortDescription: item.shortDescription || product.shortDescription,
          status: ProductStatus.ACTIVE,
          deletedAt: null,
          seoTitle: item.wooName,
          seoDescription: seoDescription || product.seoDescription,
          ...(item.wooId ? { wooCommerceId: item.wooId } : {}),
          productType: item.variants.length > 1 ? ProductType.VARIABLE : product.productType,
        },
      });
      actions.push(`UPDATED ${product.id} (was ${product.status})`);
    }

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

    const keep = new Set(item.variants.map((v) => v.sku));
    for (const v of item.variants) {
      const existing = await prisma.productVariant.findUnique({ where: { sku: v.sku } });
      let variantId: string;
      if (existing) {
        await prisma.productVariant.update({
          where: { id: existing.id },
          data: {
            productId,
            status: VariantStatus.ACTIVE,
            mrpInPaise: v.mrpInPaise || existing.mrpInPaise,
            saleInPaise: v.saleInPaise || existing.saleInPaise,
            isDefault: false,
          },
        });
        variantId = existing.id;
        await prisma.inventory.upsert({
          where: { variantId },
          create: { variantId, onHand: 0, reserved: 0, lowStockThreshold: 5 },
          update: {},
        });
        actions.push(`UPDATED ${v.sku}`);
      } else {
        const created = await prisma.productVariant.create({
          data: {
            productId,
            sku: v.sku,
            mrpInPaise: v.mrpInPaise,
            saleInPaise: v.saleInPaise,
            mrpUsdCents: donor.mrpUsdCents,
            saleUsdCents: donor.saleUsdCents,
            mrpGbpPence: donor.mrpGbpPence,
            saleGbpPence: donor.saleGbpPence,
            isDefault: false,
            status: VariantStatus.ACTIVE,
            inventory: { create: { onHand: 0, reserved: 0, lowStockThreshold: 5 } },
          },
        });
        variantId = created.id;
        if (donorRates.length) {
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
          });
        }
        actions.push(`CREATED ${v.sku}`);
      }
      await syncVariantAttributes(
        variantId,
        v.attrs?.length ? v.attrs : v.label ? [{ name: "Type", slug: "type", value: v.label }] : []
      );
    }

    if (item.draftOtherSkus) {
      const leftovers = await prisma.productVariant.findMany({
        where: { productId, status: "ACTIVE", sku: { notIn: [...keep] } },
      });
      for (const lv of leftovers) {
        await prisma.productVariant.update({
          where: { id: lv.id },
          data: { status: "INACTIVE", isDefault: false },
        });
        actions.push(`DRAFTED ${lv.sku}`);
      }
    }

    const actives = await prisma.productVariant.findMany({
      where: { productId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    await prisma.productVariant.updateMany({ where: { productId }, data: { isDefault: false } });
    if (actives[0]) {
      await prisma.productVariant.update({
        where: { id: actives[0].id },
        data: { isDefault: true },
      });
    }

    fs.writeFileSync(
      path.join(BACKUP_DIR, `${stamp}-${slugify(item.key)}.json`),
      JSON.stringify({ productId, actions, skus: [...keep] }, null, 2)
    );
    actions.forEach((a) => console.log(" ", a));
    summary.push({ key: item.key, productId, actions });
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
