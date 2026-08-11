import fs from "fs";
import path from "path";

import { prisma } from "../src/config/db";

const PRODUCT_SLUG = "box-tanpura";
const PRODUCT_NAME = "Box Tanpura";
const SHEET_SKU = "MI-BT";

function labelFromVariant(variant: {
  attributeValues: Array<{ attributeValue: { value: string } }>;
}) {
  return variant.attributeValues.map((row) => row.attributeValue.value).join(" / ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const backupDir = path.resolve(process.cwd(), "../data/compare/live-box-tanpura-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    mode: apply ? "apply" : "dry-run",
    keptVariantId: "" as string,
    skuUpdates: 0,
    clearedLabels: 0,
    drafted: 0,
    created: 0,
    warnings: [] as string[]
  };

  const product = await prisma.product.findFirst({
    where: { slug: PRODUCT_SLUG, deletedAt: null, status: "ACTIVE" },
    include: {
      variants: {
        include: {
          attributeValues: {
            include: {
              attributeValue: true
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
  if (active.length === 0) {
    summary.warnings.push("No active variants found");
  }

  // Keep one existing active variant as the single sheet variant if possible.
  const keep =
    active.find((variant) => variant.sku.toLowerCase() === SHEET_SKU.toLowerCase()) ??
    active[0] ??
    null;

  if (keep) {
    summary.keptVariantId = keep.id;
    if (keep.sku.toLowerCase() !== SHEET_SKU.toLowerCase()) {
      const clash = await prisma.productVariant.findFirst({
        where: { sku: SHEET_SKU, NOT: { id: keep.id } }
      });
      if (clash) {
        summary.warnings.push(`SKU clash for ${SHEET_SKU} on ${clash.id}`);
      } else {
        summary.skuUpdates += 1;
        console.log(`[SKU] ${labelFromVariant(keep) || "(blank)"} :: ${keep.sku} -> ${SHEET_SKU}`);
        if (apply) {
          await prisma.productVariant.update({
            where: { id: keep.id },
            data: { sku: SHEET_SKU, status: "ACTIVE", isDefault: true }
          });
        }
      }
    } else if (apply) {
      await prisma.productVariant.update({
        where: { id: keep.id },
        data: { status: "ACTIVE", isDefault: true }
      });
    }

    if (keep.attributeValues.length > 0) {
      summary.clearedLabels += 1;
      console.log(`[LABEL] clear :: ${labelFromVariant(keep)} -> ""`);
      if (apply) {
        await prisma.variantAttributeValue.deleteMany({ where: { variantId: keep.id } });
      }
    }
  } else {
    const clash = await prisma.productVariant.findUnique({ where: { sku: SHEET_SKU } });
    if (clash) {
      summary.warnings.push(`Create blocked, SKU exists: ${SHEET_SKU}`);
    } else {
      summary.created += 1;
      console.log(`[CREATE] (blank) :: ${SHEET_SKU}`);
      if (apply) {
        const created = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: SHEET_SKU,
            mrpInPaise: 0,
            saleInPaise: 0,
            isDefault: true,
            status: "ACTIVE",
            inventory: { create: { onHand: 0 } }
          }
        });
        summary.keptVariantId = created.id;
      }
    }
  }

  for (const variant of active) {
    if (keep && variant.id === keep.id) continue;
    summary.drafted += 1;
    console.log(`[DRAFT] ${labelFromVariant(variant)} :: ${variant.sku}`);
    if (apply) {
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { status: "INACTIVE", isDefault: false }
      });
    }
  }

  if (apply) {
    await prisma.product.update({
      where: { id: product.id },
      data: { variantAxisOrder: [] }
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
