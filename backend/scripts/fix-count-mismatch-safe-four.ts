import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

type SheetRow = { variant: string; sku: string };

type ProductPlan = {
  slug: string;
  name: string;
  action: "update_skus_and_draft_db_extras" | "update_skus_and_add_sheet_extras";
  desiredAxisOrder?: string[];
  sheetRows: SheetRow[];
};

const PLANS: ProductPlan[] = [
  {
    slug: "bird-flute",
    name: "Bird Flute",
    action: "update_skus_and_draft_db_extras",
    desiredAxisOrder: ["colour", "type"],
    sheetRows: [
      { variant: "Brown / Single", sku: "MI-BF-BN-S" },
      { variant: "Brown / Pair", sku: "MI-BF-BN-P" }
    ]
  },
  {
    slug: "hanging-bowls-zen-drops",
    name: "Hanging Bowls/Zen Drops",
    action: "update_skus_and_draft_db_extras",
    sheetRows: [{ variant: "Set of 3", sku: "MI-SB-HB-3" }]
  },
  {
    slug: "singing-bowls-with-sacred-mantra-printed",
    name: "Singing Bowls with Sacred Mantra Printed",
    action: "update_skus_and_add_sheet_extras",
    desiredAxisOrder: ["color", "size"],
    sheetRows: [
      { variant: "Blue / 3.5 Inches", sku: "MI-SB-SM-B-3.5" },
      { variant: "Blue / 4 Inches", sku: "MI-SB-SM-B-4" },
      { variant: "Blue / 5.5 Inches", sku: "MI-SB-SM-B-5.5" },
      { variant: "Black / 3.5 Inches", sku: "MI-SB-SM-BK-3.5" },
      { variant: "Black / 4 Inches", sku: "MI-SB-SM-BK-4" },
      { variant: "Black / 5.5 Inches", sku: "MI-SB-SM-BK-5.5" },
      { variant: "Black / 7 Inches", sku: "MI-SB-SM-BK-7" },
      { variant: "Green / 3.5 Inches", sku: "MI-SB-SM-G-3.5" },
      { variant: "Green / 4 inches", sku: "MI-SB-SM-G-4" },
      { variant: "Green / 5.5 Inches", sku: "MI-SB-SM-G-5.5" },
      { variant: "Red / 3.5 inches", sku: "MI-SB-SM-R-3.5" },
      { variant: "Red / 4 Inches", sku: "MI-SB-SM-R-4" },
      { variant: "Red / 5.5 Inches", sku: "MI-SB-SM-R-5.5" },
      { variant: "Gold / 3.5 Inches", sku: "MI-SB-SM-GO-3.5" },
      { variant: "Gold / 4 Inches", sku: "MI-SB-SM-GO-4" },
      { variant: "Gold / 5.5 Inches", sku: "MI-SB-SM-GO-5.5" },
      { variant: "Gold / 7 Inches", sku: "MI-SB-SM-GO-7" }
    ]
  },
  {
    slug: "vibroacoustic-therapy-bowls-universal-belly-and-head",
    name: "Vibroacoustic Therapy Bowls - Universal, Belly and Head",
    action: "update_skus_and_draft_db_extras",
    sheetRows: [{ variant: "Set of 3", sku: "MI-SB-UBH-SET3" }]
  }
];

function norm(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function splitLabel(label: string) {
  return label
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function canon(label: string) {
  return splitLabel(label)
    .map(norm)
    .sort()
    .join(" / ");
}

function labelFromVariant(variant: {
  attributeValues: Array<{ attributeValue: { value: string; attribute: { slug: string } } }>;
}) {
  return variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-count-mismatch-safe-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    productsChecked: 0,
    skuUpdates: 0,
    reorders: 0,
    drafted: 0,
    created: 0,
    warnings: [] as string[]
  };

  for (const plan of PLANS) {
    const product = await prisma.product.findFirst({
      where: { slug: plan.slug, deletedAt: null, status: "ACTIVE" },
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
            inventory: true,
            shippingRates: true
          }
        }
      }
    });

    if (!product) {
      summary.warnings.push(`Missing product ${plan.slug}`);
      continue;
    }
    if (product.name !== plan.name) {
      summary.warnings.push(`Name mismatch ${plan.slug}: ${product.name}`);
      continue;
    }

    summary.productsChecked += 1;
    fs.writeFileSync(
      path.join(backupDir, `${stamp}-${plan.slug}.json`),
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
            label: labelFromVariant(variant),
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

    const activeVariants = product.variants.filter((variant) => variant.status === "ACTIVE");
    const remaining = [...activeVariants];
    const matchedIds = new Set<string>();
    const unmatchedSheet: SheetRow[] = [];

    for (const sheetRow of plan.sheetRows) {
      let idx = remaining.findIndex(
        (variant) => norm(labelFromVariant(variant)) === norm(sheetRow.variant)
      );
      if (idx < 0) {
        idx = remaining.findIndex(
          (variant) => canon(labelFromVariant(variant)) === canon(sheetRow.variant)
        );
      }
      if (idx < 0) {
        unmatchedSheet.push(sheetRow);
        continue;
      }
      const variant = remaining.splice(idx, 1)[0]!;
      matchedIds.add(variant.id);

      if (norm(variant.sku) !== norm(sheetRow.sku)) {
        summary.skuUpdates += 1;
        console.log(`[SKU] ${plan.slug} :: ${sheetRow.variant} :: ${variant.sku} -> ${sheetRow.sku}`);
        if (apply) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { sku: sheetRow.sku }
          });
        }
      }

      // Reorder attribute associations to sheet label order when multi-axis.
      const tokens = splitLabel(sheetRow.variant).map(norm);
      if (tokens.length > 1) {
        const desiredIds = tokens.map((token) => {
          const hit = variant.attributeValues.find(
            (row) => norm(row.attributeValue.value) === token
          );
          if (!hit) {
            throw new Error(`Token ${token} missing on ${plan.slug} ${sheetRow.variant}`);
          }
          return hit.attributeValue.id;
        });
        const currentIds = variant.attributeValues.map((row) => row.attributeValue.id);
        if (desiredIds.join(",") !== currentIds.join(",")) {
          summary.reorders += 1;
          console.log(
            `[REORDER] ${plan.slug} :: ${labelFromVariant(variant)} -> ${sheetRow.variant}`
          );
          if (apply) {
            await prisma.variantAttributeValue.deleteMany({ where: { variantId: variant.id } });
            await prisma.variantAttributeValue.createMany({
              data: desiredIds.map((attributeValueId) => ({
                variantId: variant.id,
                attributeValueId
              }))
            });
          }
        }
      }
    }

    // Draft unmatched active DB variants when sheet has fewer.
    if (plan.action === "update_skus_and_draft_db_extras") {
      for (const variant of remaining) {
        summary.drafted += 1;
        console.log(`[DRAFT] ${plan.slug} :: ${labelFromVariant(variant)} :: ${variant.sku}`);
        if (apply) {
          await prisma.productVariant.update({
            where: { id: variant.id },
            data: { status: "INACTIVE" }
          });
        }
      }
      if (unmatchedSheet.length > 0) {
        summary.warnings.push(
          `${plan.slug}: unexpected unmatched sheet rows: ${unmatchedSheet
            .map((row) => row.sku)
            .join(", ")}`
        );
      }
    }

    // Add unmatched sheet variants when sheet has more.
    if (plan.action === "update_skus_and_add_sheet_extras") {
      if (remaining.length > 0) {
        summary.warnings.push(
          `${plan.slug}: unexpected unmatched DB rows remain: ${remaining
            .map((variant) => variant.sku)
            .join(", ")}`
        );
      }

      for (const sheetRow of unmatchedSheet) {
        const clash = await prisma.productVariant.findUnique({ where: { sku: sheetRow.sku } });
        if (clash) {
          summary.warnings.push(`SKU already exists globally: ${sheetRow.sku}`);
          continue;
        }

        const tokens = splitLabel(sheetRow.variant);
        if (tokens.length !== 2) {
          summary.warnings.push(`Cannot infer attrs for ${sheetRow.variant}`);
          continue;
        }
        const [colorValue, sizeValue] = tokens;

        // Clone pricing from same-color sibling if available, else first matched.
        const sibling =
          activeVariants.find((variant) =>
            variant.attributeValues.some(
              (row) =>
                row.attributeValue.attribute.slug === "color" &&
                norm(row.attributeValue.value) === norm(colorValue)
            )
          ) ?? activeVariants[0];

        summary.created += 1;
        console.log(
          `[CREATE] ${plan.slug} :: ${sheetRow.variant} :: ${sheetRow.sku} (pricing from ${sibling?.sku ?? "none"})`
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
            { name: "Color", slug: "color", value: colorValue },
            { name: "Size", slug: "size", value: sizeValue }
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
    }

    if (plan.desiredAxisOrder && apply) {
      await prisma.product.update({
        where: { id: product.id },
        data: { variantAxisOrder: plan.desiredAxisOrder }
      });
      console.log(`[AXIS] ${plan.slug} :: ${JSON.stringify(plan.desiredAxisOrder)}`);
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
