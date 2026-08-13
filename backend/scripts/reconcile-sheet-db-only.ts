/**
 * Apply sheet-db-only-plan.json on Lightsail Postgres.
 *
 * - rename_skus: align DB SKU to team sheet
 * - create_variants: add missing variants on existing products
 * - draft_variants: INACTIVE variants not on team sheet
 * - create_products: stub simple products (name + SKU + clone pricing from template)
 *
 * Usage:
 *   npx tsx scripts/reconcile-sheet-db-only.ts
 *   npx tsx scripts/reconcile-sheet-db-only.ts --apply
 */
import fs from "fs";
import path from "path";

import dotenv from "dotenv";
import { PrismaClient, ProductStatus, ProductType, VariantStatus } from "@prisma/client";

import { syncVariantAttributes } from "../src/modules/products/variant-attributes";
import { slugify } from "../src/utils/slugify";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const PLAN_PATH = path.join(__dirname, "../../data/compare/sheet-db-only-plan.json");
const BACKUP_DIR = path.join(__dirname, "../../data/compare/live-sheet-db-only-backups");
const TEMPLATE_SLUG = "standard-shankh";

const prisma = new PrismaClient();

type Plan = {
  rename_skus: Array<{ fromSku: string; toSku: string; reason?: string }>;
  create_variants: Array<{
    productSlug: string;
    sku: string;
    variantName: string;
    productName?: string;
  }>;
  create_products: Array<{ sku: string; productName: string; variantName: string }>;
  draft_variants: Array<{ sku: string; productName?: string; variantName?: string }>;
};

function variantLabel(variant: {
  attributeValues: Array<{ attributeValue: { value: string } }>;
}) {
  return variant.attributeValues.map((a) => a.attributeValue.value).join(" / ");
}

function attrsFromLabel(label: string) {
  const v = label.trim();
  if (!v) return [];
  return [{ name: "Option", slug: "option", value: v }];
}

async function cloneVariantFromSibling(productId: string, sku: string, variantName: string) {
  const sibling = await prisma.productVariant.findFirst({
    where: { productId, status: "ACTIVE" },
    include: { shippingRates: true, inventory: true },
    orderBy: { createdAt: "asc" },
  });
  const created = await prisma.productVariant.create({
    data: {
      productId,
      sku,
      mrpInPaise: sibling?.mrpInPaise ?? 0,
      saleInPaise: sibling?.saleInPaise ?? 0,
      mrpUsdCents: sibling?.mrpUsdCents ?? null,
      saleUsdCents: sibling?.saleUsdCents ?? null,
      mrpGbpPence: sibling?.mrpGbpPence ?? null,
      saleGbpPence: sibling?.saleGbpPence ?? null,
      weightGrams: sibling?.weightGrams ?? null,
      isDefault: false,
      status: "ACTIVE",
      inventory: { create: { onHand: 0 } },
    },
  });
  if (variantName.trim()) {
    await syncVariantAttributes(created.id, attrsFromLabel(variantName));
  }
  if (sibling?.shippingRates.length) {
    await prisma.variantShippingRate.createMany({
      data: sibling.shippingRates.map((r) => ({
        variantId: created.id,
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
  return created;
}

async function main() {
  if (!fs.existsSync(PLAN_PATH)) {
    throw new Error(`Missing ${PLAN_PATH} — run build-sheet-db-only-plan.py first`);
  }
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")) as Plan;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log: string[] = [];

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY_RUN"}`);

  for (const row of plan.rename_skus) {
    const v = await prisma.productVariant.findFirst({
      where: { sku: { equals: row.fromSku, mode: "insensitive" } },
      include: { attributeValues: { include: { attributeValue: { include: { attribute: true } } } } },
    });
    if (!v) {
      log.push(`SKIP rename ${row.fromSku} -> ${row.toSku} (from not found)`);
      continue;
    }
    const clash = await prisma.productVariant.findFirst({
      where: { sku: { equals: row.toSku, mode: "insensitive" }, NOT: { id: v.id } },
    });
    if (clash) {
      log.push(`CONFLICT rename ${row.fromSku} -> ${row.toSku} (target taken)`);
      continue;
    }
    log.push(`RENAME SKU ${v.sku} -> ${row.toSku} (${variantLabel(v) || "simple"})`);
    if (APPLY) {
      await prisma.productVariant.update({ where: { id: v.id }, data: { sku: row.toSku } });
    }
  }

  for (const row of plan.create_variants) {
    const product = await prisma.product.findFirst({
      where: { slug: row.productSlug, deletedAt: null },
    });
    if (!product) {
      log.push(`MISS product slug ${row.productSlug} for create ${row.sku}`);
      continue;
    }
    const existing = await prisma.productVariant.findFirst({
      where: { sku: { equals: row.sku, mode: "insensitive" } },
    });
    if (existing?.status === "ACTIVE") {
      log.push(`SKIP create variant ${row.sku} (exists)`);
      continue;
    }
    if (existing?.status === "INACTIVE") {
      log.push(`REACTIVATE ${row.sku} (${row.variantName})`);
      if (APPLY) {
        await prisma.productVariant.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
        if (row.variantName.trim()) {
          await syncVariantAttributes(existing.id, attrsFromLabel(row.variantName));
        }
      }
      continue;
    }
    log.push(`CREATE variant ${row.sku} on ${row.productSlug} (${row.variantName})`);
    if (APPLY) {
      await cloneVariantFromSibling(product.id, row.sku, row.variantName);
    }
  }

  for (const row of plan.draft_variants) {
    const v = await prisma.productVariant.findFirst({
      where: { sku: { equals: row.sku, mode: "insensitive" } },
    });
    if (!v || v.status === "INACTIVE") continue;
    log.push(`DRAFT ${row.sku} (${row.productName || ""})`);
    if (APPLY) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { status: "INACTIVE", isDefault: false },
      });
    }
  }

  const template = await prisma.product.findFirst({
    where: { slug: TEMPLATE_SLUG, deletedAt: null },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: { shippingRates: true },
        take: 1,
      },
      images: { orderBy: { position: "asc" }, take: 1 },
    },
  });

  for (const row of plan.create_products) {
    const existing = await prisma.productVariant.findFirst({
      where: { sku: { equals: row.sku, mode: "insensitive" } },
    });
    if (existing) {
      log.push(`SKIP create product ${row.sku} (SKU exists)`);
      continue;
    }
    const baseSlug = slugify(row.productName);
    const clash = await prisma.product.findFirst({ where: { slug: baseSlug, deletedAt: null } });
    const slug = clash ? `${baseSlug}-${row.sku.toLowerCase()}` : baseSlug;
    log.push(`CREATE product ${row.productName} [${row.sku}] slug=${slug}`);
    if (APPLY && template) {
      const donor = template.variants[0];
      const product = await prisma.product.create({
        data: {
          slug,
          name: row.productName,
          status: ProductStatus.ACTIVE,
          productType: ProductType.SIMPLE,
          shortDescription: template.shortDescription,
          description: template.description,
          images: template.images[0]
            ? {
                create: {
                  url: template.images[0].url,
                  altText: row.productName,
                  position: 0,
                  isPrimary: true,
                },
              }
            : undefined,
          variants: {
            create: {
              sku: row.sku,
              mrpInPaise: donor?.mrpInPaise ?? 99000,
              saleInPaise: donor?.saleInPaise ?? 89000,
              mrpUsdCents: donor?.mrpUsdCents ?? null,
              saleUsdCents: donor?.saleUsdCents ?? null,
              mrpGbpPence: donor?.mrpGbpPence ?? null,
              saleGbpPence: donor?.saleGbpPence ?? null,
              isDefault: true,
              status: VariantStatus.ACTIVE,
              inventory: { create: { onHand: 0 } },
            },
          },
        },
        include: { variants: true },
      });
      const variant = product.variants[0];
      if (variant && row.variantName.trim()) {
        await syncVariantAttributes(variant.id, attrsFromLabel(row.variantName));
      }
      if (variant && donor?.shippingRates.length) {
        await prisma.variantShippingRate.createMany({
          data: donor.shippingRates.map((r) => ({
            variantId: variant.id,
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
    }
  }

  // Hide products that have zero ACTIVE variants after draft
  if (APPLY) {
    const emptyProducts = await prisma.product.findMany({
      where: {
        deletedAt: null,
        status: ProductStatus.ACTIVE,
        catalogHidden: false,
        variants: { none: { status: "ACTIVE" } },
      },
      select: { id: true, name: true, slug: true },
    });
    for (const p of emptyProducts) {
      log.push(`HIDE empty product ${p.slug}`);
      await prisma.product.update({
        where: { id: p.id },
        data: { catalogHidden: true, status: ProductStatus.ARCHIVED },
      });
    }
  }

  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-log.txt`), log.join("\n") + "\n");
  console.log(log.join("\n"));
  console.log(`\n${log.length} actions logged`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
