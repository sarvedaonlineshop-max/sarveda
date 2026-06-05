import { ProductStatus, ProductType, VariantStatus, type PrismaClient } from "@prisma/client";

/** Hidden catalog product + variant for course Razorpay checkout (5% GST class). */
export async function ensureCourseCheckoutVariant(
  prisma: PrismaClient,
  opts: {
    courseSlug: string;
    title: string;
    priceInPaise: number;
    priceUsdCents: number | null;
    imageUrl: string | null;
  }
): Promise<{ variantId: string; sku: string }> {
  const { courseSlug, title, priceInPaise, priceUsdCents, imageUrl } = opts;
  if (priceInPaise <= 0) {
    throw new Error("Course price must be greater than zero for checkout");
  }

  const productSlug = `course-checkout-${courseSlug}`;
  const sku = `COURSE-${courseSlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 36)}`;

  const product = await prisma.product.upsert({
    where: { slug: productSlug },
    create: {
      slug: productSlug,
      name: title,
      shortDescription: `Course enrollment: ${title}`,
      productType: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      catalogHidden: true,
      taxClass: "gst-5"
    },
    update: {
      name: title,
      shortDescription: `Course enrollment: ${title}`,
      catalogHidden: true,
      status: ProductStatus.ACTIVE,
      taxClass: "gst-5"
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

  return { variantId: variant.id, sku };
}
