import { ProductStatus, ProductType, VariantStatus } from "@prisma/client";

import { PrismaClient } from "@prisma/client";

export async function ensureCheckoutVariant(
  prisma: PrismaClient,
  opts: {
    slugPrefix: "course" | "event";
    contentSlug: string;
    title: string;
    priceInPaise: number;
    priceUsdCents: number | null;
    imageUrl: string | null;
    dryRun: boolean;
  }
): Promise<string | null> {
  const { slugPrefix, contentSlug, title, priceInPaise, priceUsdCents, imageUrl, dryRun } = opts;
  if (priceInPaise <= 0) return null;

  const productSlug = `${slugPrefix}-checkout-${contentSlug}`;
  const sku = `${slugPrefix.toUpperCase()}-${contentSlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 36)}`;

  if (dryRun) {
    console.log(`  [dry-run] checkout product ${productSlug}`);
    return null;
  }

  const product = await prisma.product.upsert({
    where: { slug: productSlug },
    create: {
      slug: productSlug,
      name: title,
      shortDescription: `${slugPrefix} enrollment: ${title}`,
      productType: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      catalogHidden: true,
      taxClass: "gst-zero-rate"
    },
    update: {
      name: title,
      catalogHidden: true,
      status: ProductStatus.ACTIVE
    }
  });

  if (imageUrl) {
    const existing = await prisma.productImage.findFirst({
      where: { productId: product.id, isPrimary: true }
    });
    if (!existing) {
      await prisma.productImage.create({
        data: { productId: product.id, url: imageUrl, isPrimary: true, position: 0 }
      });
    }
  }

  const variant = await prisma.productVariant.upsert({
    where: { sku },
    create: {
      productId: product.id,
      sku,
      mrpInPaise: priceInPaise,
      saleInPaise: priceInPaise,
      saleUsdCents: priceUsdCents ?? undefined,
      mrpUsdCents: priceUsdCents ?? undefined,
      isDefault: true,
      status: VariantStatus.ACTIVE,
      weightGrams: 0
    },
    update: {
      mrpInPaise: priceInPaise,
      saleInPaise: priceInPaise,
      saleUsdCents: priceUsdCents ?? undefined,
      mrpUsdCents: priceUsdCents ?? undefined,
      status: VariantStatus.ACTIVE
    }
  });

  await prisma.inventory.upsert({
    where: { variantId: variant.id },
    create: { variantId: variant.id, onHand: 999, reserved: 0 },
    update: { onHand: 999 }
  });

  return variant.id;
}
