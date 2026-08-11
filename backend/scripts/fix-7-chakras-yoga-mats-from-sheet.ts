import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";

const PRODUCT_SLUG = "7-chakras-yoga-mats";
const PRODUCT_NAME = "7 Chakras Yoga Mats";

// Source of truth copied directly from the Excel sheet rows for this product.
const SHEET_ROWS = [
  { variant: "Moderate / Green", sku: "YO-M-CT-7C-M-G" },
  { variant: "Moderate / Orange", sku: "YO-M-CT-7C-M-O" },
  { variant: "Moderate / Blue", sku: "YO-M-CT-7C-M-B" },
  { variant: "Moderate / Pink", sku: "YO-M-CT-7C-M-P" },
  { variant: "Teal/ Superior", sku: "YO-M-CT-7C-S-T" },
  { variant: "Orange / Superior", sku: "YO-M-CT-7C-S-O" },
  { variant: "Yellow / Superior", sku: "YO-M-CT-7C-S-Y" },
  { variant: "Pink / Superior", sku: "YO-M-CT-7C-S-P" }
];

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function splitLabel(label: string) {
  return label
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-seven-chakras-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    matchedSheetRows: 0,
    skuUpdates: 0,
    associationReorders: 0,
    draftedExtraVariants: 0,
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
          }
        }
      }
    }
  });

  if (!product) {
    throw new Error(`Product not found: ${PRODUCT_SLUG}`);
  }
  if (product.name !== PRODUCT_NAME) {
    throw new Error(`Product name mismatch: ${product.name}`);
  }

  fs.writeFileSync(
    path.join(backupDir, `${stamp}-${PRODUCT_SLUG}.json`),
    JSON.stringify(
      {
        product: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          variantAxisOrder: product.variantAxisOrder
        },
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          status: variant.status,
          label: variant.attributeValues.map((row) => row.attributeValue.value).join(" / "),
          attrs: variant.attributeValues.map((row) => ({
            slug: row.attributeValue.attribute.slug,
            value: row.attributeValue.value,
            attributeValueId: row.attributeValue.id
          }))
        }))
      },
      null,
      2
    )
  );

  const ops: any[] = [];
  const matchedVariantIds = new Set<string>();

  for (const row of SHEET_ROWS) {
    const variant =
      product.variants.find((item) => norm(item.sku) === norm(row.sku)) ??
      product.variants.find((item) => {
        const currentTokens = item.attributeValues.map((entry) => norm(entry.attributeValue.value));
        const desiredTokens = splitLabel(row.variant).map(norm);
        return (
          currentTokens.length === desiredTokens.length &&
          desiredTokens.every((token) => currentTokens.includes(token))
        );
      });

    if (!variant) {
      summary.warnings.push(`No live variant match found for sheet row ${row.variant} / ${row.sku}`);
      continue;
    }
    matchedVariantIds.add(variant.id);
    summary.matchedSheetRows += 1;

    if (norm(variant.sku) !== norm(row.sku)) {
      summary.skuUpdates += 1;
      console.log(`[SKU] ${variant.sku} -> ${row.sku}`);
      if (apply) {
        ops.push(
          prisma.productVariant.update({
            where: { id: variant.id },
            data: { sku: row.sku, status: "ACTIVE" }
          })
        );
      }
    } else if (variant.status !== "ACTIVE") {
      console.log(`[ACTIVATE] ${variant.sku}`);
      if (apply) {
        ops.push(
          prisma.productVariant.update({
            where: { id: variant.id },
            data: { status: "ACTIVE" }
          })
        );
      }
    }

    const desiredTokens = splitLabel(row.variant).map(norm);
    const desiredIds = desiredTokens.map((token) => {
      const hit = variant.attributeValues.find((entry) => norm(entry.attributeValue.value) === token);
      if (!hit) {
        throw new Error(`Cannot map token ${token} for ${row.variant}`);
      }
      return hit.attributeValue.id;
    });
    const currentIds = variant.attributeValues.map((entry) => entry.attributeValue.id);
    if (desiredIds.join(",") !== currentIds.join(",")) {
      summary.associationReorders += 1;
      console.log(
        `[REORDER] ${row.sku} :: ${variant.attributeValues
          .map((entry) => entry.attributeValue.value)
          .join(" / ")} -> ${row.variant}`
      );
      if (apply) {
        ops.push(
          prisma.variantAttributeValue.deleteMany({
            where: { variantId: variant.id }
          })
        );
        ops.push(
          prisma.variantAttributeValue.createMany({
            data: desiredIds.map((attributeValueId) => ({
              variantId: variant.id,
              attributeValueId
            }))
          })
        );
      }
    }
  }

  for (const variant of product.variants) {
    if (!matchedVariantIds.has(variant.id) && variant.status !== "INACTIVE") {
      summary.draftedExtraVariants += 1;
      console.log(`[DRAFT] ${variant.sku}`);
      if (apply) {
        ops.push(
          prisma.productVariant.update({
            where: { id: variant.id },
            data: { status: "INACTIVE" }
          })
        );
      }
    }
  }

  if (apply && ops.length > 0) {
    await prisma.$transaction(ops);
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
