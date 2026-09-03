/**
 * Catalog hygiene:
 * - DELETE duplicate hidden products: elemental-chimes, incense-stick-stand
 * - UNHIDE + ACTIVATE test-product (4 variants) + ensure inventory rows
 * - Does NOT delete __digital-checkout__ stubs (required by Cart/Order FK until digital checkout is decoupled)
 *
 * Usage (Lightsail):
 *   npx tsx scripts/catalog-hygiene-hidden-cleanup.ts --dry-run
 *   npx tsx scripts/catalog-hygiene-hidden-cleanup.ts --apply
 */
import { PrismaClient, VariantStatus } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

const DELETE_SLUGS = ["elemental-chimes", "incense-stick-stand"] as const;
const TEST_SLUG = "test-product";

async function deleteProductTree(productId: string, slug: string) {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true, sku: true }
  });
  const variantIds = variants.map((v) => v.id);
  console.log(`Deleting product ${slug} variants=${variants.map((v) => v.sku).join(",")}`);

  if (!variantIds.length) {
    await prisma.product.delete({ where: { id: productId } });
    return;
  }

  // Clear dependent rows that block variant/product delete
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

  // OrderItems: keep historical lines — block delete if any exist
  const orderCount = await prisma.orderItem.count({ where: { variantId: { in: variantIds } } });
  if (orderCount > 0) {
    throw new Error(`Refusing delete ${slug}: ${orderCount} orderItem rows reference its variants`);
  }

  await prisma.productVariant.deleteMany({ where: { productId } });
  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.accordionItem.deleteMany({ where: { productId } });
  await prisma.productCategory.deleteMany({ where: { productId } });
  await prisma.review.deleteMany({ where: { productId } });
  await prisma.wishlist.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
}

async function activateTestProduct() {
  const product = await prisma.product.findUnique({
    where: { slug: TEST_SLUG },
    include: { variants: { include: { inventory: true } } }
  });
  if (!product) throw new Error("test-product not found");

  console.log(
    `Activating ${TEST_SLUG}: catalogHidden ${product.catalogHidden}→false, variants ${product.variants.length}`
  );

  await prisma.product.update({
    where: { id: product.id },
    data: {
      catalogHidden: false,
      status: "ACTIVE"
    }
  });

  for (const v of product.variants) {
    await prisma.productVariant.update({
      where: { id: v.id },
      data: { status: VariantStatus.ACTIVE }
    });
    if (!v.inventory) {
      await prisma.inventory.create({
        data: {
          variantId: v.id,
          onHand: 0,
          reserved: 0,
          lowStockThreshold: 5
        }
      });
      console.log(`  created inventory for ${v.sku}`);
    } else {
      console.log(`  inventory exists for ${v.sku} onHand=${v.inventory.onHand}`);
    }
  }
}

async function summarize() {
  const products = await prisma.product.count();
  const productsVisible = await prisma.product.count({
    where: { catalogHidden: false, deletedAt: null }
  });
  const variants = await prisma.productVariant.count();
  const active = await prisma.productVariant.count({ where: { status: "ACTIVE" } });
  const inactive = await prisma.productVariant.count({ where: { status: "INACTIVE" } });
  const hidden = await prisma.product.findMany({
    where: { catalogHidden: true },
    select: { slug: true, _count: { select: { variants: true } } }
  });
  const inventory = await prisma.inventory.count();
  const activeVisible = await prisma.productVariant.count({
    where: {
      status: "ACTIVE",
      productRel: { status: "ACTIVE", catalogHidden: false, deletedAt: null }
    }
  });
  return {
    PRODUCTS_TOTAL: products,
    PRODUCTS_VISIBLE: productsVisible,
    VARIANTS_TOTAL: variants,
    VARIANTS_ACTIVE: active,
    VARIANTS_INACTIVE: inactive,
    ACTIVE_ON_VISIBLE_PRODUCTS: activeVisible,
    INVENTORY_ROWS: inventory,
    still_hidden: hidden
  };
}

async function main() {
  console.log(apply ? "MODE=apply" : "MODE=dry-run");

  const before = await summarize();
  console.log("BEFORE", JSON.stringify(before, null, 2));

  const digital = await prisma.product.findUnique({
    where: { slug: "__digital-checkout__" },
    select: { id: true, _count: { select: { variants: true } } }
  });
  console.log(
    "DIGITAL_SHELL_KEPT",
    digital
      ? {
          reason:
            "Cart/OrderItem/DigitalCheckoutOffer still require ProductVariant FKs. Separate DigitalCheckoutOffer table holds pricing metadata but checkout still uses stub variants under __digital-checkout__.",
          variants: digital._count.variants
        }
      : null
  );

  if (!apply) {
    console.log("Dry-run only. Would: delete", DELETE_SLUGS.join(","), "+ activate", TEST_SLUG);
    return;
  }

  for (const slug of DELETE_SLUGS) {
    const p = await prisma.product.findUnique({ where: { slug } });
    if (!p) {
      console.log(`skip missing ${slug}`);
      continue;
    }
    await deleteProductTree(p.id, slug);
  }

  await activateTestProduct();

  const after = await summarize();
  console.log("AFTER", JSON.stringify(after, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
