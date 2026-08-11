import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";
import { syncVariantAttributes } from "../src/modules/products/variant-attributes";

const PRODUCT_SLUG = "etched-handmade-singing-bowls";
const PRODUCT_NAME = "Etched Handmade Singing Bowls";
const SHEET_ROWS_PATH = path.resolve(
  process.cwd(),
  "../data/compare/etched-handmade-sheet-rows.json"
);

function norm(value: string | null | undefined) {
  let s = (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  s = s.replace(/(\d+(?:\.\d+)?)\s*in\b/g, "$1 in");
  s = s.replace(/\s*\/\s*/g, " / ");
  return s;
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
  attributeValues: Array<{ attributeValue: { value: string } }>;
}) {
  return variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");
}

function readSheetRows(): Array<{ variant: string; sku: string }> {
  return JSON.parse(fs.readFileSync(SHEET_ROWS_PATH, "utf8")) as Array<{
    variant: string;
    sku: string;
  }>;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sheetRows = readSheetRows();
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-etched-handmade-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    sheetRows: sheetRows.length,
    matched: 0,
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
  if (!product) throw new Error(`Product missing: ${PRODUCT_SLUG}`);
  if (product.name !== PRODUCT_NAME) throw new Error(`Name mismatch: ${product.name}`);

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
  const matchedIds = new Set<string>();
  const unmatchedSheet: Array<{ variant: string; sku: string }> = [];

  for (const sheetRow of sheetRows) {
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
    summary.matched += 1;

    if (norm(variant.sku) !== norm(sheetRow.sku)) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: sheetRow.sku, NOT: { id: variant.id } }
      });
      if (clash) {
        summary.warnings.push(
          `SKU clash for ${sheetRow.sku} already on variant ${clash.id}`
        );
        continue;
      }
      summary.skuUpdates += 1;
      console.log(
        `[SKU] ${labelFromVariant(variant)} :: ${variant.sku} -> ${sheetRow.sku}`
      );
      if (apply) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: { sku: sheetRow.sku }
        });
      }
    }

    // Align attribute association order to sheet label order.
    const tokens = splitLabel(sheetRow.variant).map(norm);
    if (tokens.length > 1) {
      const desiredIds = tokens.map((token) => {
        const hit = variant.attributeValues.find(
          (row) => norm(row.attributeValue.value) === token
        );
        if (!hit) {
          throw new Error(`Missing attr token ${token} for ${sheetRow.variant}`);
        }
        return hit.attributeValue.id;
      });
      const currentIds = variant.attributeValues.map((row) => row.attributeValue.id);
      if (desiredIds.join(",") !== currentIds.join(",") && apply) {
        await prisma.variantAttributeValue.deleteMany({ where: { variantId: variant.id } });
        await prisma.variantAttributeValue.createMany({
          data: desiredIds.map((attributeValueId) => ({
            variantId: variant.id,
            attributeValueId
          }))
        });
        console.log(`[REORDER] ${labelFromVariant(variant)} -> ${sheetRow.variant}`);
      }
    }
  }

  for (const sheetRow of unmatchedSheet) {
    const tokens = splitLabel(sheetRow.variant);
    if (tokens.length !== 2) {
      summary.warnings.push(`Cannot parse attrs for ${sheetRow.variant}`);
      continue;
    }
    const [typeValue, sizeRaw] = tokens;
    const sizeValue = sizeRaw.replace(/(\d+(?:\.\d+)?)\s*in\b/i, "$1 in").replace(/\s+/g, " ").trim();

    const clash = await prisma.productVariant.findUnique({ where: { sku: sheetRow.sku } });
    if (clash) {
      summary.warnings.push(`Create blocked, SKU exists: ${sheetRow.sku}`);
      continue;
    }

    const sibling =
      active.find((variant) => {
        const label = labelFromVariant(variant);
        return (
          norm(label).startsWith(norm(typeValue) + " /") &&
          (norm(label).endsWith("12 in") || norm(label).endsWith("11 in"))
        );
      }) ?? active[0];

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
        { name: "Type", slug: "type", value: typeValue },
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

  if (apply) {
    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: ["type", "size"] }
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
