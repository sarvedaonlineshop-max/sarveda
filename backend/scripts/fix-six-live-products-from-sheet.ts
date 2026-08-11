import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";

type VariantRule = {
  label?: string;
  sku?: string;
};

type ProductRule = {
  slug: string;
  name: string;
  desiredAxisOrder?: string[];
  variantRules?: VariantRule[];
  note?: string;
};

const RULES: ProductRule[] = [
  {
    slug: "gong-stand",
    name: "Gong Stand",
    desiredAxisOrder: ["color", "size"]
  },
  {
    slug: "handcrafted-set-of-7-bowls-for-sound-therapy",
    name: "Handcrafted Set of 7 Bowls for Sound Therapy",
    desiredAxisOrder: ["size", "type"]
  },
  {
    slug: "tuning-fork-activators",
    name: "Tuning Fork Activators",
    variantRules: [
      { label: "Activator", sku: "MI-TF-A" },
      { label: "Mallet", sku: "MI-TF-M" },
      { label: "Activator & Mallet", sku: "MI-TF-AM" }
    ]
  },
  {
    slug: "tuning-forks-gem-feet",
    name: "Tuning Forks Gem Feet",
    variantRules: [
      { label: "Maroon", sku: "MI-TF-GF-M" },
      { label: "Yellow", sku: "MI-TF-GF-Y" },
      { label: "Violet", sku: "MI-TF-GF-V" },
      { label: "Blue", sku: "MI-TF-GF-B" },
      { label: "Green", sku: "MI-TF-GF-G" },
      { label: "Dark Blue", sku: "MI-TF-GF-DB" },
      { label: "Red", sku: "MI-TF-GF-R" },
      { label: "Full Set", sku: "MI-TF-GF-SET7" }
    ]
  },
  {
    slug: "wooden-stand-for-tuning-forks",
    name: "Wooden Stand for Tuning Forks",
    variantRules: [
      { label: "Three", sku: "MI-TF-WS-3" },
      { label: "Five", sku: "MI-TF-WS-5" },
      { label: "Seven", sku: "MI-TF-WS-7" },
      { label: "Nine", sku: "MI-TF-WS-9" }
    ]
  },
  {
    slug: "7-chakras-yoga-mats",
    name: "7 Chakras Yoga Mats",
    desiredAxisOrder: ["grip", "color"],
    note: "Extra variants already drafted as INACTIVE on live DB"
  }
];

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function labelFromVariant(
  variant: {
    attributeValues: Array<{
      attributeValue: { value: string; attribute: { slug: string } };
    }>;
  },
  axisOrder?: string[]
) {
  const rows = [...variant.attributeValues];
  if (axisOrder?.length) {
    const orderIndex = new Map(axisOrder.map((slug, idx) => [slug, idx]));
    rows.sort((a, b) => {
      const ai = orderIndex.get(a.attributeValue.attribute.slug) ?? 999;
      const bi = orderIndex.get(b.attributeValue.attribute.slug) ?? 999;
      return ai - bi;
    });
  }
  return rows.map((row) => row.attributeValue.value).join(" / ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlySlugs = new Set(
    (
      process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length) ?? ""
    )
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-six-product-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    productsChecked: 0,
    skuUpdates: 0,
    axisOrderUpdates: 0,
    associationReorders: 0,
    skippedNoop: 0,
    warnings: [] as string[]
  };

  for (const rule of RULES) {
    if (onlySlugs.size > 0 && !onlySlugs.has(rule.slug)) {
      continue;
    }
    const product = await prisma.product.findFirst({
      where: { slug: rule.slug, deletedAt: null, status: "ACTIVE" },
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
      summary.warnings.push(`Product missing: ${rule.slug}`);
      continue;
    }
    summary.productsChecked += 1;

    fs.writeFileSync(
      path.join(backupDir, `${stamp}-${rule.slug}.json`),
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
            attrs: variant.attributeValues.map((row) => ({
              slug: row.attributeValue.attribute.slug,
              value: row.attributeValue.value,
              attributeValueId: row.attributeValue.id
            }))
          })),
          note: rule.note ?? null
        },
        null,
        2
      )
    );

    const ops: any[] = [];

    if (rule.desiredAxisOrder) {
      const sameAxis =
        product.variantAxisOrder.length === rule.desiredAxisOrder.length &&
        rule.desiredAxisOrder.every((slug, idx) => product.variantAxisOrder[idx] === slug);
      if (!sameAxis) {
        summary.axisOrderUpdates += 1;
        console.log(`[AXIS] ${rule.slug} :: ${JSON.stringify(product.variantAxisOrder)} -> ${JSON.stringify(rule.desiredAxisOrder)}`);
        if (apply) {
          ops.push(
            prisma.product.update({
              where: { id: product.id },
              data: { variantAxisOrder: rule.desiredAxisOrder }
            })
          );
        }
      } else {
        summary.skippedNoop += 1;
      }

      for (const variant of product.variants) {
        const desiredIds = [...variant.attributeValues]
          .sort((a, b) => {
            const ai = rule.desiredAxisOrder!.indexOf(a.attributeValue.attribute.slug);
            const bi = rule.desiredAxisOrder!.indexOf(b.attributeValue.attribute.slug);
            return ai - bi;
          })
          .map((row) => row.attributeValue.id);
        const currentIds = variant.attributeValues.map((row) => row.attributeValue.id);
        const needsReorder = desiredIds.join(",") !== currentIds.join(",");
        if (needsReorder) {
          summary.associationReorders += 1;
          console.log(
            `[REORDER] ${rule.slug} :: ${variant.sku} :: ${labelFromVariant(
              variant
            )} -> ${labelFromVariant(variant, rule.desiredAxisOrder)}`
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
        } else {
          summary.skippedNoop += 1;
        }
      }
    }

    if (rule.variantRules) {
      for (const variantRule of rule.variantRules) {
        const variant = product.variants.find(
          (item) => norm(labelFromVariant(item)) === norm(variantRule.label)
        );
        if (!variant) {
          summary.warnings.push(
            `Variant not found for ${rule.slug}: ${variantRule.label ?? "(blank)"}`
          );
          continue;
        }
        if (variantRule.sku && norm(variant.sku) !== norm(variantRule.sku)) {
          summary.skuUpdates += 1;
          console.log(`[SKU] ${rule.slug} :: ${variantRule.label} :: ${variant.sku} -> ${variantRule.sku}`);
          if (apply) {
            ops.push(
              prisma.productVariant.update({
                where: { id: variant.id },
                data: { sku: variantRule.sku }
              })
            );
          }
        } else {
          summary.skippedNoop += 1;
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
