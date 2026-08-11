import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const PRODUCT_SLUG = "gong-bags";
const PRODUCT_NAME = "Gong Bags";

const SHEET_ROWS = [
  { variant: "Small", sku: "MI-BG-GO-S" },
  { variant: "Medium", sku: "MI-BG-GO-M" },
  { variant: "Large", sku: "MI-BG-GO-L" },
  { variant: "Extra Large", sku: "MI-BG-GO-XL" }
] as const;

function norm(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function labelFromVariant(variant: {
  attributeValues: Array<{ attributeValue: { value: string } }>;
}) {
  return variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-gong-bags-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    skuUpdates: 0,
    created: 0,
    drafted: 0,
    warnings: [] as string[]
  };

  const product = await prisma.product.findFirst({
    where: { slug: PRODUCT_SLUG, deletedAt: null, status: "ACTIVE" },
    include: {
      variants: {
        include: {
          attributeValues: {
            include: {
              attributeValue: {
                include: { attribute: true }
              }
            }
          },
          shippingRates: true
        }
      }
    }
  });
  if (!product) throw new Error(`Missing product ${PRODUCT_SLUG}`);
  if (product.name !== PRODUCT_NAME) throw new Error(`Name mismatch ${product.name}`);

  fs.writeFileSync(
    path.join(backupDir, `${stamp}-${PRODUCT_SLUG}.json`),
    JSON.stringify(
      {
        product: { id: product.id, slug: product.slug, name: product.name },
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          status: variant.status,
          label: labelFromVariant(variant)
        }))
      },
      null,
      2
    )
  );

  const active = product.variants.filter((variant) => variant.status === "ACTIVE");
  const remaining = [...active];

  // 1) Match exact variant names from sheet and update SKUs.
  for (const sheetRow of SHEET_ROWS) {
    const idx = remaining.findIndex(
      (variant) => norm(labelFromVariant(variant)) === norm(sheetRow.variant)
    );
    if (idx < 0) continue;
    const variant = remaining.splice(idx, 1)[0]!;
    if (norm(variant.sku) !== norm(sheetRow.sku)) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: sheetRow.sku, NOT: { id: variant.id } }
      });
      if (clash) {
        summary.warnings.push(`SKU clash ${sheetRow.sku}`);
        continue;
      }
      summary.skuUpdates += 1;
      console.log(`[SKU] ${sheetRow.variant} :: ${variant.sku} -> ${sheetRow.sku}`);
      if (apply) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { sku: sheetRow.sku }
        });
      }
    }
  }

  // 2) Draft leftover active DB variants (Standard).
  for (const variant of remaining) {
    summary.drafted += 1;
    console.log(`[DRAFT] ${labelFromVariant(variant)} :: ${variant.sku}`);
    if (apply) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: "INACTIVE" }
      });
    }
  }

  // 3) Add sheet variants that do not exist yet.
  const activeAfter = apply
    ? await prisma.productVariant.findMany({
        where: { productId: product.id, status: "ACTIVE" },
        include: {
          attributeValues: {
            include: { attributeValue: { include: { attribute: true } } }
          }
        }
      })
    : active.filter((variant) =>
        SHEET_ROWS.some((row) => norm(labelFromVariant(variant)) === norm(row.variant))
      );

  const sibling = active.find((variant) => norm(labelFromVariant(variant)) === "large") ?? active[0];

  for (const sheetRow of SHEET_ROWS) {
    const exists = activeAfter.some(
      (variant) => norm(labelFromVariant(variant)) === norm(sheetRow.variant)
    );
    // In dry-run, also treat matched-before-update as existing.
    const existedBefore = active.some(
      (variant) => norm(labelFromVariant(variant)) === norm(sheetRow.variant)
    );
    if (exists || existedBefore) continue;

    const clash = await prisma.productVariant.findUnique({ where: { sku: sheetRow.sku } });
    if (clash) {
      summary.warnings.push(`Create blocked, SKU exists: ${sheetRow.sku}`);
      continue;
    }

    summary.created += 1;
    console.log(
      `[CREATE] ${sheetRow.variant} :: ${sheetRow.sku} (pricing from ${sibling?.sku ?? "none"})`
    );
    if (apply) {
      const created = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: sheetRow.sku,
          mrpInPaise: sibling?.mrpInPaise ?? 0,
          saleInPaise: sibling?.saleInPaise ?? 0,
          mrpUsdCents: sibling?.mrpUsdCents ?? null,
          saleUsdCents: sibling?.saleUsdCents ?? null,
          mrpGbpPence: sibling?.mrpGbpPence ?? null,
          saleGbpPence: sibling?.saleGbpPence ?? null,
          weightGrams: sibling?.weightGrams ?? null,
          isDefault: false,
          status: "ACTIVE",
          inventory: { create: { onHand: 0 } }
        }
      });
      await syncVariantAttributes(created.id, [
        { name: "Type", slug: "type", value: sheetRow.variant }
      ]);
      if (sibling?.shippingRates?.length) {
        await prisma.variantShippingRate.createMany({
          data: sibling.shippingRates.map((rate) => ({
            variantId: created.id,
            country: rate.country,
            standardPerProduct: rate.standardPerProduct,
            standardAdditional: rate.standardAdditional,
            expeditedPerProduct: rate.expeditedPerProduct,
            expeditedAdditional: rate.expeditedAdditional,
            codPerProduct: rate.codPerProduct,
            codAdditional: rate.codAdditional,
            estimatedDays: rate.estimatedDays
          }))
        });
      }
    }
  }

  if (apply) {
    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: ["type"] }
    });
  }

  console.log("\nSummary");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
