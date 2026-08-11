import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";

type ExactProduct = {
  product_slug: string;
  product_name: string;
  sku_changes: Array<{
    variant: string;
    db_sku: string;
    sheet_sku: string;
  }>;
};

type FuzzyProduct = {
  product_slug: string;
  product_name: string;
  changes: Array<{
    db_variant: string;
    sheet_variant: string;
    db_sku: string;
    sheet_sku: string;
    action: string[];
  }>;
};

type Batch = {
  exact_products: ExactProduct[];
  fuzzy_products: FuzzyProduct[];
  counts: Record<string, number>;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function splitVariantLabel(label: string): string[] {
  return label
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function labelFromVariant(variant: {
  attributeValues: Array<{
    attributeValue: { value: string; attribute: { slug: string; name: string } };
  }>;
}): string {
  return variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");
}

function tokensToAxisOrder(
  variant: {
    attributeValues: Array<{
      attributeValue: { value: string; attribute: { slug: string; name: string } };
    }>;
  },
  sheetLabel: string
): string[] {
  const wanted = splitVariantLabel(sheetLabel).map(norm);
  const out: string[] = [];
  for (const token of wanted) {
    const match = variant.attributeValues.find(
      (row) => norm(row.attributeValue.value) === token
    );
    if (match) out.push(match.attributeValue.attribute.slug);
  }
  return Array.from(new Set(out));
}

function canonicalLabel(label: string): string {
  return norm(splitVariantLabel(label).sort().join(" / "));
}

function findVariantByCurrentState(
  variants: Array<{
    id: string;
    sku: string;
    attributeValues: Array<{
      attributeValue: { value: string; attribute: { slug: string; name: string } };
    }>;
  }>,
  options: {
    dbSku?: string;
    label?: string;
    allowSingleton?: boolean;
    usedIds?: Set<string>;
  }
) {
  const available = variants.filter((variant) => !options.usedIds?.has(variant.id));

  if (options.label) {
    const exactLabel = available.find(
      (variant) => norm(labelFromVariant(variant)) === norm(options.label)
    );
    if (exactLabel) return exactLabel;

    const canon = canonicalLabel(options.label);
    const canonMatch = available.find(
      (variant) => canonicalLabel(labelFromVariant(variant)) === canon
    );
    if (canonMatch) return canonMatch;
  }

  if (options.dbSku) {
    const skuMatch = available.find((variant) => norm(variant.sku) === norm(options.dbSku));
    if (skuMatch) return skuMatch;
  }

  if (options.allowSingleton && available.length === 1) {
    return available[0];
  }

  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const batchPath =
    process.argv.find((arg) => arg.startsWith("--batch="))?.slice("--batch=".length) ??
    path.resolve(process.cwd(), "../data/compare/sheet-truth-safe-update-batch.json");

  const raw = fs.readFileSync(batchPath, "utf8");
  const batch = JSON.parse(raw) as Batch;

  const backupDir = path.resolve(process.cwd(), "../data/compare/live-batch-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    productsChecked: 0,
    skuUpdates: 0,
    axisOrderUpdates: 0,
    skippedNoop: 0,
    warnings: [] as string[]
  };

  // Safety: ensure desired SKUs are not already used by another variant.
  const desiredSkus = [
    ...batch.exact_products.flatMap((p) => p.sku_changes.map((c) => c.sheet_sku)),
    ...batch.fuzzy_products.flatMap((p) => p.changes.map((c) => c.sheet_sku))
  ];
  const existingSkus = await prisma.productVariant.findMany({
    where: {
      OR: desiredSkus.map((sku) => ({ sku: { equals: sku, mode: "insensitive" } }))
    },
    select: { id: true, sku: true, productId: true }
  });

  const exactMap = new Map<string, ExactProduct>(
    batch.exact_products.map((item) => [item.product_slug, item])
  );
  const fuzzyMap = new Map<string, FuzzyProduct>(
    batch.fuzzy_products.map((item) => [item.product_slug, item])
  );

  const productSlugs = [
    ...batch.exact_products.map((p) => p.product_slug),
    ...batch.fuzzy_products.map((p) => p.product_slug)
  ];

  for (const slug of productSlugs) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, status: "ACTIVE" },
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
      summary.warnings.push(`Product not found/active: ${slug}`);
      continue;
    }

    summary.productsChecked += 1;

    const backup = {
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        variantAxisOrder: product.variantAxisOrder
      },
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        label: labelFromVariant(variant),
        attrs: variant.attributeValues.map((row) => ({
          slug: row.attributeValue.attribute.slug,
          name: row.attributeValue.attribute.name,
          value: row.attributeValue.value
        }))
      }))
    };
    fs.writeFileSync(
      path.join(backupDir, `${stamp}-${slug}.json`),
      JSON.stringify(backup, null, 2)
    );

    const updates: any[] = [];

    const bySku = new Map(
      product.variants.map((variant) => [norm(variant.sku), variant] as const)
    );

    const exact = exactMap.get(slug);
    if (exact) {
      for (const change of exact.sku_changes) {
        const variant =
          findVariantByCurrentState(product.variants, {
            dbSku: change.db_sku,
            label: change.variant,
            allowSingleton: !change.variant
          }) ?? bySku.get(norm(change.db_sku));
        if (!variant) {
          summary.warnings.push(`Exact batch: unable to map variant for ${slug} :: ${change.variant || change.db_sku}`);
          continue;
        }
        if (norm(variant.sku) === norm(change.sheet_sku)) {
          summary.skippedNoop += 1;
          continue;
        }
        const conflict = existingSkus.find(
          (row) =>
            norm(row.sku) === norm(change.sheet_sku) &&
            row.id !== variant.id
        );
        if (conflict) {
          summary.warnings.push(
            `SKU conflict for ${slug} :: ${change.sheet_sku} already used by variant ${conflict.id}`
          );
          continue;
        }
        summary.skuUpdates += 1;
        console.log(`[SKU] ${slug} :: ${change.variant || "(default)"} :: ${variant.sku} -> ${change.sheet_sku}`);
        if (apply) {
          updates.push(
            prisma.productVariant.update({
              where: { id: variant.id },
              data: { sku: change.sheet_sku }
            })
          );
        }
      }
    }

    const fuzzy = fuzzyMap.get(slug);
    if (fuzzy) {
      let derivedAxisOrder: string[] = [];
      const usedIds = new Set<string>();
      for (const change of fuzzy.changes) {
        const variant = findVariantByCurrentState(product.variants, {
          dbSku: change.db_sku,
          label: change.db_variant,
          allowSingleton: false,
          usedIds
        });
        if (!variant) {
          summary.warnings.push(`Fuzzy batch: unable to map variant for ${slug} :: ${change.db_variant}`);
          continue;
        }
        usedIds.add(variant.id);

        if (derivedAxisOrder.length === 0) {
          derivedAxisOrder = tokensToAxisOrder(variant, change.sheet_variant);
        }

        if (norm(variant.sku) !== norm(change.sheet_sku)) {
          const conflict = existingSkus.find(
            (row) =>
              norm(row.sku) === norm(change.sheet_sku) &&
              row.id !== variant.id
          );
          if (conflict) {
            summary.warnings.push(
              `SKU conflict for ${slug} :: ${change.sheet_sku} already used by variant ${conflict.id}`
            );
          } else {
            summary.skuUpdates += 1;
            console.log(`[SKU] ${slug} :: ${change.db_variant} -> ${change.sheet_variant} :: ${variant.sku} -> ${change.sheet_sku}`);
            if (apply) {
              updates.push(
                prisma.productVariant.update({
                  where: { id: variant.id },
                  data: { sku: change.sheet_sku }
                })
              );
            }
          }
        } else {
          summary.skippedNoop += 1;
        }
      }

      if (derivedAxisOrder.length > 0) {
        const sameAxis =
          derivedAxisOrder.length === product.variantAxisOrder.length &&
          derivedAxisOrder.every((slugValue, index) => slugValue === product.variantAxisOrder[index]);
        if (!sameAxis) {
          summary.axisOrderUpdates += 1;
          console.log(`[AXIS] ${slug} :: ${JSON.stringify(product.variantAxisOrder)} -> ${JSON.stringify(derivedAxisOrder)}`);
          if (apply) {
            updates.push(
              prisma.product.update({
                where: { id: product.id },
                data: { variantAxisOrder: derivedAxisOrder }
              })
            );
          }
        } else {
          summary.skippedNoop += 1;
        }
      }
    }

    if (apply && updates.length > 0) {
      await prisma.$transaction(updates);
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
