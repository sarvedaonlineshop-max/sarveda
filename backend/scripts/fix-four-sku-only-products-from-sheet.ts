import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";

const PRODUCTS = [
  {
    slug: "angel-tuning-forks",
    name: "Angel Tuning Forks",
    rows: [
      { variant: "4096 Hz", sku: "MI-TF-AG-4096" },
      { variant: "4160 Hz", sku: "MI-TF-AG-4160" },
      { variant: "4225 Hz", sku: "MI-TF-AG-4225" },
      { variant: "Set", sku: "MI-TF-AG-SET3" }
    ]
  },
  {
    slug: "bendo-shaker",
    name: "Bendo Shaker",
    rows: [
      { variant: "Small", sku: "MI-BE-S" },
      { variant: "Large", sku: "MI-BE-L" }
    ]
  },
  {
    slug: "jala-neti-pot-ceramic-185-ml",
    name: "Jala Neti Pot - Ceramic 185 ml",
    rows: [
      { variant: "Red", sku: "YO-NP-R-185" },
      { variant: "Blue", sku: "YO-NP-B-185" },
      { variant: "Lemon Yellow", sku: "YO-NP-LY-185" },
      { variant: "Mint Green", sku: "YO-NP-MG-185" },
      { variant: "White", sku: "YO-NP-W-185" }
    ]
  },
  {
    slug: "macrame-yoga-mat-straps",
    name: "Macrame Yoga Mat Straps",
    rows: [
      { variant: "Green", sku: "YO-MMS-G" },
      { variant: "Brown", sku: "YO-MMS-BR" },
      { variant: "Dark Grey", sku: "YO-MMS-DG" },
      { variant: "Orange", sku: "YO-MMS-O" },
      { variant: "Navy Blue", sku: "YO-MMS-NB" },
      { variant: "Rose", sku: "YO-MMS-R" },
      { variant: "Rouge Pink", sku: "YO-MMS-RP" },
      { variant: "Sage", sku: "YO-MMS-S" }
    ]
  }
] as const;

function norm(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-four-sku-only-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    productsChecked: 0,
    skuUpdates: 0,
    warnings: [] as string[]
  };

  for (const productRule of PRODUCTS) {
    const product = await prisma.product.findFirst({
      where: { slug: productRule.slug, deletedAt: null, status: "ACTIVE" },
      include: {
        variants: {
          include: {
            attributeValues: {
              include: {
                attributeValue: true
              }
            }
          }
        }
      }
    });
    if (!product) {
      summary.warnings.push(`Missing product ${productRule.slug}`);
      continue;
    }
    if (product.name !== productRule.name) {
      summary.warnings.push(`Name mismatch for ${productRule.slug}: ${product.name}`);
      continue;
    }
    summary.productsChecked += 1;

    fs.writeFileSync(
      path.join(backupDir, `${stamp}-${productRule.slug}.json`),
      JSON.stringify(
        {
          product: { id: product.id, slug: product.slug, name: product.name },
          variants: product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            status: variant.status,
            label: variant.attributeValues.map((row) => row.attributeValue.value).join(" / ")
          }))
        },
        null,
        2
      )
    );

    const ops: any[] = [];
    for (const row of productRule.rows) {
      const variant = product.variants.find(
        (item) =>
          item.status === "ACTIVE" &&
          norm(item.attributeValues.map((entry) => entry.attributeValue.value).join(" / ")) ===
            norm(row.variant)
      );
      if (!variant) {
        summary.warnings.push(`Variant not found for ${productRule.name} :: ${row.variant}`);
        continue;
      }
      if (norm(variant.sku) !== norm(row.sku)) {
        summary.skuUpdates += 1;
        console.log(`[SKU] ${productRule.slug} :: ${row.variant} :: ${variant.sku} -> ${row.sku}`);
        if (apply) {
          ops.push(
            prisma.productVariant.update({
              where: { id: variant.id },
              data: { sku: row.sku }
            })
          );
        }
      }
    }
    if (apply && ops.length > 0) {
      await prisma.$transaction(ops);
    }
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
