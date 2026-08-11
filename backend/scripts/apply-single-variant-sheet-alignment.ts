import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";

type ProductItem = {
  product_name: string;
  product_slug: string;
  variant_count: number;
  mismatch_type: "sku_only" | "variant_only" | "sku_and_variant";
  sheet_rows: Array<{ variant: string; sku: string }>;
  live_rows: Array<{ sku: string; variant: string; status: string }>;
};

type Batch = {
  source_of_truth: string;
  live_snapshot_file: string;
  sheet_file: string;
  product_count: number;
  products: ProductItem[];
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const batchPath =
    process.argv.find((arg) => arg.startsWith("--batch="))?.slice("--batch=".length) ??
    path.resolve(
      process.cwd(),
      "../data/compare/live-lightsail-common-name-same-count-mismatch-18.json"
    );

  const batch = JSON.parse(fs.readFileSync(batchPath, "utf8")) as Batch;
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-single-variant-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    productsChecked: 0,
    skuUpdates: 0,
    clearedVariantLabels: 0,
    skippedNoop: 0,
    warnings: [] as string[]
  };

  for (const item of batch.products) {
    if (item.variant_count !== 1 || item.sheet_rows.length !== 1) {
      summary.warnings.push(`Skipped ${item.product_slug}: batch not single-variant`);
      continue;
    }

    const product = await prisma.product.findFirst({
      where: { slug: item.product_slug, deletedAt: null, status: "ACTIVE" },
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
      summary.warnings.push(`Product not found: ${item.product_slug}`);
      continue;
    }
    if (product.variants.length !== 1) {
      summary.warnings.push(
        `Skipped ${item.product_slug}: live DB has ${product.variants.length} variants, expected 1`
      );
      continue;
    }

    summary.productsChecked += 1;
    const variant = product.variants[0]!;
    const sheet = item.sheet_rows[0]!;
    const liveLabel = variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");

    const backup = {
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name
      },
      variant: {
        id: variant.id,
        sku: variant.sku,
        liveLabel,
        attrs: variant.attributeValues.map((row) => ({
          attributeSlug: row.attributeValue.attribute.slug,
          attributeName: row.attributeValue.attribute.name,
          attributeValueId: row.attributeValue.id,
          value: row.attributeValue.value
        }))
      },
      sheet
    };
    fs.writeFileSync(
      path.join(backupDir, `${stamp}-${item.product_slug}.json`),
      JSON.stringify(backup, null, 2)
    );

    const ops: any[] = [];

    if (norm(variant.sku) !== norm(sheet.sku)) {
      summary.skuUpdates += 1;
      console.log(`[SKU] ${item.product_slug} :: ${variant.sku} -> ${sheet.sku}`);
      if (apply) {
        ops.push(
          prisma.productVariant.update({
            where: { id: variant.id },
            data: { sku: sheet.sku }
          })
        );
      }
    } else {
      summary.skippedNoop += 1;
    }

    if (!sheet.variant && liveLabel) {
      summary.clearedVariantLabels += 1;
      console.log(`[LABEL] ${item.product_slug} :: ${JSON.stringify(liveLabel)} -> \"\"`);
      if (apply) {
        ops.push(
          prisma.variantAttributeValue.deleteMany({
            where: { variantId: variant.id }
          })
        );
      }
    } else if (sheet.variant && norm(sheet.variant) !== norm(liveLabel)) {
      summary.warnings.push(
        `Skipped label change for ${item.product_slug}: cannot safely rewrite non-blank label ${JSON.stringify(
          liveLabel
        )} -> ${JSON.stringify(sheet.variant)}`
      );
    } else {
      summary.skippedNoop += 1;
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
