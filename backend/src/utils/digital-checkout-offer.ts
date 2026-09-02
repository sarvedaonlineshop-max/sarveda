/**
 * Digital checkout offers — course/event payment stubs (not storefront catalog).
 * Variants live under a single hidden shell product for Order/Cart FK compatibility.
 */
import {
  ProductStatus,
  ProductType,
  VariantStatus,
  type DigitalCheckoutKind,
  type PrismaClient
} from "@prisma/client";

export const DIGITAL_CHECKOUT_SHELL_SLUG = "__digital-checkout__";
export const DIGITAL_CHECKOUT_SHELL_NAME = "Digital checkout (internal)";

export type EnsureDigitalCheckoutOfferInput = {
  kind: DigitalCheckoutKind;
  entitySlug: string;
  courseId?: string;
  eventId?: string;
  title: string;
  priceInPaise: number;
  priceUsdCents: number | null;
  imageUrl: string | null;
  skuPrefix: "COURSE" | "EVENT";
};

function buildSku(prefix: "COURSE" | "EVENT", entitySlug: string): string {
  return `${prefix}-${entitySlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 36)}`;
}

export async function ensureDigitalCheckoutShell(prisma: PrismaClient) {
  return prisma.product.upsert({
    where: { slug: DIGITAL_CHECKOUT_SHELL_SLUG },
    create: {
      slug: DIGITAL_CHECKOUT_SHELL_SLUG,
      name: DIGITAL_CHECKOUT_SHELL_NAME,
      productType: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      catalogHidden: true,
      taxClass: "gst-5"
    },
    update: {
      catalogHidden: true,
      status: ProductStatus.ACTIVE,
      name: DIGITAL_CHECKOUT_SHELL_NAME
    }
  });
}

export async function ensureDigitalCheckoutOffer(
  prisma: PrismaClient,
  input: EnsureDigitalCheckoutOfferInput
): Promise<{ offerId: string; variantId: string; sku: string }> {
  if (input.priceInPaise <= 0) {
    throw new Error("Digital checkout price must be greater than zero");
  }

  const shell = await ensureDigitalCheckoutShell(prisma);
  const sku = buildSku(input.skuPrefix, input.entitySlug);

  const existingOffer = input.courseId
    ? await prisma.digitalCheckoutOffer.findUnique({ where: { courseId: input.courseId } })
    : input.eventId
      ? await prisma.digitalCheckoutOffer.findUnique({ where: { eventId: input.eventId } })
      : null;

  if (existingOffer) {
    await prisma.productVariant.update({
      where: { id: existingOffer.checkoutVariantId },
      data: {
        productId: shell.id,
        mrpInPaise: input.priceInPaise,
        saleInPaise: input.priceInPaise,
        saleUsdCents: input.priceUsdCents ?? undefined,
        mrpUsdCents: input.priceUsdCents ?? undefined,
        status: VariantStatus.ACTIVE,
        weightGrams: 0
      }
    });
    await prisma.digitalCheckoutOffer.update({
      where: { id: existingOffer.id },
      data: {
        title: input.title,
        mrpInPaise: input.priceInPaise,
        saleInPaise: input.priceInPaise,
        mrpUsdCents: input.priceUsdCents ?? undefined,
        saleUsdCents: input.priceUsdCents ?? undefined,
        imageUrl: input.imageUrl
      }
    });
    await prisma.inventory.deleteMany({ where: { variantId: existingOffer.checkoutVariantId } });
    return {
      offerId: existingOffer.id,
      variantId: existingOffer.checkoutVariantId,
      sku: existingOffer.sku
    };
  }

  const variant = await prisma.productVariant.upsert({
    where: { sku },
    create: {
      productId: shell.id,
      sku,
      mrpInPaise: input.priceInPaise,
      saleInPaise: input.priceInPaise,
      mrpUsdCents: input.priceUsdCents ?? undefined,
      saleUsdCents: input.priceUsdCents ?? undefined,
      isDefault: false,
      status: VariantStatus.ACTIVE,
      weightGrams: 0
    },
    update: {
      productId: shell.id,
      mrpInPaise: input.priceInPaise,
      saleInPaise: input.priceInPaise,
      saleUsdCents: input.priceUsdCents ?? undefined,
      mrpUsdCents: input.priceUsdCents ?? undefined,
      status: VariantStatus.ACTIVE
    }
  });

  await prisma.inventory.deleteMany({ where: { variantId: variant.id } });

  const offer = await prisma.digitalCheckoutOffer.create({
    data: {
      kind: input.kind,
      courseId: input.courseId ?? null,
      eventId: input.eventId ?? null,
      sku,
      title: input.title,
      mrpInPaise: input.priceInPaise,
      saleInPaise: input.priceInPaise,
      mrpUsdCents: input.priceUsdCents ?? undefined,
      saleUsdCents: input.priceUsdCents ?? undefined,
      taxClass: "gst-5",
      imageUrl: input.imageUrl,
      checkoutVariantId: variant.id
    }
  });

  return { offerId: offer.id, variantId: variant.id, sku };
}

/** @deprecated Use ensureDigitalCheckoutOffer */
export async function ensureCourseCheckoutVariant(
  prisma: PrismaClient,
  opts: {
    courseSlug: string;
    title: string;
    priceInPaise: number;
    priceUsdCents: number | null;
    imageUrl: string | null;
    courseId?: string;
  }
): Promise<{ variantId: string; sku: string }> {
  const course = opts.courseId
    ? await prisma.course.findUnique({ where: { id: opts.courseId }, select: { id: true } })
    : await prisma.course.findUnique({ where: { slug: opts.courseSlug }, select: { id: true } });

  const { variantId, sku } = await ensureDigitalCheckoutOffer(prisma, {
    kind: "COURSE",
    entitySlug: opts.courseSlug,
    courseId: course?.id,
    title: opts.title,
    priceInPaise: opts.priceInPaise,
    priceUsdCents: opts.priceUsdCents,
    imageUrl: opts.imageUrl,
    skuPrefix: "COURSE"
  });

  if (course?.id) {
    await prisma.course.update({
      where: { id: course.id },
      data: { checkoutVariantId: variantId }
    });
  }

  return { variantId, sku };
}
