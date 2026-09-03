/**
 * Archive INACTIVE (+ digital checkout stubs) to Excel, then hard-delete from DB.
 * Target: 794 ACTIVE shop variants, 153 visible products, zero INACTIVE, zero hidden products.
 *
 *   npx tsx scripts/archive-and-purge-inactive-variants.ts --dry-run
 *   npx tsx scripts/archive-and-purge-inactive-variants.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { mkdirSync } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/audit/variant-restoration");
const OUT_XLSX = path.join(OUT_DIR, "archived-inactive-and-digital-variants-2026-09-03.xlsx");

async function deleteVariantTree(variantIds: string[]) {
  if (!variantIds.length) return;
  await prisma.marketplaceOrderItem.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.marketplaceListing.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.stockNotification.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.variantShippingRate.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.productImage.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.merchantCtxOffer.updateMany({
    where: { sarvedaVariantId: { in: variantIds } },
    data: { sarvedaVariantId: null }
  });
  await prisma.digitalCheckoutOffer.updateMany({
    where: { checkoutVariantId: { in: variantIds } },
    data: { checkoutVariantId: null }
  });
  await prisma.course.updateMany({
    where: { checkoutVariantId: { in: variantIds } },
    data: { checkoutVariantId: null }
  });
  await prisma.event.updateMany({
    where: { checkoutVariantId: { in: variantIds } },
    data: { checkoutVariantId: null }
  });

  const orderCount = await prisma.orderItem.count({ where: { variantId: { in: variantIds } } });
  if (orderCount > 0) {
    throw new Error(`Refusing purge: ${orderCount} orderItem rows still reference these variants`);
  }

  await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
}

async function summarize() {
  return {
    products: await prisma.product.count(),
    productsVisible: await prisma.product.count({
      where: { catalogHidden: false, deletedAt: null, productType: { not: "DIGITAL" } }
    }),
    variants: await prisma.productVariant.count(),
    active: await prisma.productVariant.count({ where: { status: "ACTIVE" } }),
    inactive: await prisma.productVariant.count({ where: { status: "INACTIVE" } }),
    activeVisible: await prisma.productVariant.count({
      where: {
        status: "ACTIVE",
        productRel: {
          status: "ACTIVE",
          catalogHidden: false,
          deletedAt: null,
          productType: { not: "DIGITAL" },
          slug: { not: "__digital-checkout__" }
        }
      }
    }),
    inventory: await prisma.inventory.count(),
    hiddenProducts: await prisma.product.findMany({
      where: { catalogHidden: true },
      select: { slug: true, _count: { select: { variants: true } } }
    })
  };
}

async function main() {
  console.log(apply ? "MODE=apply" : "MODE=dry-run");
  mkdirSync(OUT_DIR, { recursive: true });

  const inactive = await prisma.productVariant.findMany({
    where: { status: "INACTIVE" },
    include: {
      inventory: true,
      productRel: { select: { slug: true, name: true, catalogHidden: true, status: true } },
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } }
      }
    },
    orderBy: [{ productRel: { slug: "asc" } }, { sku: "asc" }]
  });

  const digitalProduct = await prisma.product.findUnique({
    where: { slug: "__digital-checkout__" },
    include: {
      variants: {
        include: {
          inventory: true,
          productRel: { select: { slug: true, name: true, catalogHidden: true, status: true } },
          attributeValues: {
            include: { attributeValue: { include: { attribute: true } } }
          }
        }
      }
    }
  });
  const digital = digitalProduct?.variants ?? [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "sarveda-catalog-hygiene";
  const sheetInactive = wb.addWorksheet("Inactive_Archived");
  const sheetDigital = wb.addWorksheet("Digital_Checkout_Stubs");
  const headers = [
    "variantId",
    "sku",
    "status",
    "productSlug",
    "productName",
    "catalogHidden",
    "onHand",
    "reserved",
    "saleInPaise",
    "mrpInPaise",
    "dropShipEnabled",
    "attributes",
    "archivedAt",
    "archiveReason"
  ];
  sheetInactive.addRow(headers);
  sheetDigital.addRow(headers);

  const archivedAt = new Date().toISOString();
  const toRow = (v: (typeof inactive)[0], reason: string) => [
    v.id,
    v.sku,
    v.status,
    v.productRel.slug,
    v.productRel.name,
    v.productRel.catalogHidden,
    v.inventory?.onHand ?? "",
    v.inventory?.reserved ?? "",
    v.saleInPaise,
    v.mrpInPaise,
    v.dropShipEnabled,
    v.attributeValues
      .map((a) => `${a.attributeValue.attribute.name}:${a.attributeValue.value}`)
      .join(" | "),
    archivedAt,
    reason
  ];

  for (const v of inactive) {
    sheetInactive.addRow(toRow(v, "INACTIVE_PURGED_FROM_CATALOG"));
  }
  for (const v of digital) {
    sheetDigital.addRow(toRow(v as (typeof inactive)[0], "DIGITAL_CHECKOUT_STUB_REMOVED_FROM_CATALOG"));
  }

  await wb.xlsx.writeFile(OUT_XLSX);
  console.log("WROTE", OUT_XLSX);
  console.log("INACTIVE_ROWS", inactive.length, "DIGITAL_ROWS", digital.length);

  const before = await summarize();
  console.log("BEFORE", JSON.stringify(before, null, 2));

  if (!apply) {
    console.log("Dry-run complete — no DB deletes");
    return;
  }

  await deleteVariantTree(inactive.map((v) => v.id));
  console.log("DELETED_INACTIVE", inactive.length);

  if (digitalProduct) {
    const digitalIds = digital.map((v) => v.id);
    await deleteVariantTree(digitalIds);
    await prisma.course.updateMany({
      where: { checkoutVariantId: { not: null } },
      data: { checkoutVariantId: null }
    });
    await prisma.event.updateMany({
      where: { checkoutVariantId: { not: null } },
      data: { checkoutVariantId: null }
    });
    await prisma.digitalCheckoutOffer.updateMany({
      where: { checkoutVariantId: { not: null } },
      data: { checkoutVariantId: null }
    });
    await prisma.productImage.deleteMany({ where: { productId: digitalProduct.id } });
    await prisma.accordionItem.deleteMany({ where: { productId: digitalProduct.id } });
    await prisma.productCategory.deleteMany({ where: { productId: digitalProduct.id } });
    await prisma.product.delete({ where: { id: digitalProduct.id } });
    console.log("DELETED_DIGITAL_SHELL", digitalIds.length);
  }

  const after = await summarize();
  console.log("AFTER", JSON.stringify(after, null, 2));

  if (after.inactive !== 0 || after.hiddenProducts.length !== 0) {
    console.error("PURGE_INCOMPLETE");
    process.exitCode = 2;
  }
  if (after.activeVisible !== 794) {
    console.error("UNEXPECTED_ACTIVE_VISIBLE", after.activeVisible);
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
