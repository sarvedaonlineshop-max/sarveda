/**
 * Digital checkout offers — course/event payment metadata (not shop catalog).
 * Cart/order lines reference DigitalCheckoutOffer directly (no ProductVariant stub).
 */
import {
  ProductStatus,
  ProductType,
  VariantStatus,
  type DigitalCheckoutKind,
  type DigitalCheckoutOffer,
  type PrismaClient
} from "@prisma/client";

import type { ZoneKey } from "../modules/shipping/types";

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
  /** When true, create/update Cart/Order ProductVariant stub under the hidden shell. */
  materializeVariant?: boolean;
};

function buildSku(prefix: "COURSE" | "EVENT", entitySlug: string): string {
  return `${prefix}-${entitySlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 36)}`;
}

/** Sale price in minor units for the pricing zone (paise / USD cents; GBP falls back to INR). */
export function priceForDigitalOffer(
  offer: Pick<DigitalCheckoutOffer, "saleInPaise" | "saleUsdCents">,
  zone: ZoneKey
): number {
  switch (zone) {
    case "IN":
      return offer.saleInPaise;
    case "GB":
      return offer.saleInPaise;
    case "US":
    case "OTHER":
      return offer.saleUsdCents ?? offer.saleInPaise;
    default:
      return offer.saleInPaise;
  }
}

export function assertDigitalOfferPurchasable(
  offer: Pick<DigitalCheckoutOffer, "id" | "saleInPaise" | "kind">
): void {
  if (offer.saleInPaise <= 0) {
    const e = new Error("This course or event is not available for purchase") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "DIGITAL_NOT_PURCHASABLE";
    throw e;
  }
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
      name: DIGITAL_CHECKOUT_SHELL_NAME,
      productType: ProductType.DIGITAL
    }
  });
}

async function materializeVariantForOffer(
  prisma: PrismaClient,
  opts: {
    offerId: string;
    sku: string;
    priceInPaise: number;
    priceUsdCents: number | null;
    existingVariantId: string | null;
  }
): Promise<string> {
  const shell = await ensureDigitalCheckoutShell(prisma);

  if (opts.existingVariantId) {
    const existing = await prisma.productVariant.findUnique({
      where: { id: opts.existingVariantId },
      select: { id: true }
    });
    if (existing) {
      await prisma.productVariant.update({
        where: { id: existing.id },
        data: {
          productId: shell.id,
          mrpInPaise: opts.priceInPaise,
          saleInPaise: opts.priceInPaise,
          saleUsdCents: opts.priceUsdCents ?? undefined,
          mrpUsdCents: opts.priceUsdCents ?? undefined,
          status: VariantStatus.ACTIVE,
          weightGrams: 0
        }
      });
      await prisma.inventory.deleteMany({ where: { variantId: existing.id } });
      return existing.id;
    }
  }

  const variant = await prisma.productVariant.upsert({
    where: { sku: opts.sku },
    create: {
      productId: shell.id,
      sku: opts.sku,
      mrpInPaise: opts.priceInPaise,
      saleInPaise: opts.priceInPaise,
      mrpUsdCents: opts.priceUsdCents ?? undefined,
      saleUsdCents: opts.priceUsdCents ?? undefined,
      isDefault: false,
      status: VariantStatus.ACTIVE,
      weightGrams: 0
    },
    update: {
      productId: shell.id,
      mrpInPaise: opts.priceInPaise,
      saleInPaise: opts.priceInPaise,
      saleUsdCents: opts.priceUsdCents ?? undefined,
      mrpUsdCents: opts.priceUsdCents ?? undefined,
      status: VariantStatus.ACTIVE,
      weightGrams: 0
    }
  });
  await prisma.inventory.deleteMany({ where: { variantId: variant.id } });
  await prisma.digitalCheckoutOffer.update({
    where: { id: opts.offerId },
    data: { checkoutVariantId: variant.id }
  });
  return variant.id;
}

export async function ensureDigitalCheckoutOffer(
  prisma: PrismaClient,
  input: EnsureDigitalCheckoutOfferInput
): Promise<{ offerId: string; variantId: string | null; sku: string }> {
  if (input.priceInPaise <= 0) {
    throw new Error("Digital checkout price must be greater than zero");
  }

  const sku = buildSku(input.skuPrefix, input.entitySlug);
  const materialize = input.materializeVariant === true;

  const existingOffer = input.courseId
    ? await prisma.digitalCheckoutOffer.findUnique({ where: { courseId: input.courseId } })
    : input.eventId
      ? await prisma.digitalCheckoutOffer.findUnique({ where: { eventId: input.eventId } })
      : null;

  if (existingOffer) {
    await prisma.digitalCheckoutOffer.update({
      where: { id: existingOffer.id },
      data: {
        title: input.title,
        mrpInPaise: input.priceInPaise,
        saleInPaise: input.priceInPaise,
        mrpUsdCents: input.priceUsdCents ?? undefined,
        saleUsdCents: input.priceUsdCents ?? undefined,
        imageUrl: input.imageUrl,
        sku
      }
    });

    let variantId = existingOffer.checkoutVariantId;
    if (materialize) {
      variantId = await materializeVariantForOffer(prisma, {
        offerId: existingOffer.id,
        sku,
        priceInPaise: input.priceInPaise,
        priceUsdCents: input.priceUsdCents,
        existingVariantId: existingOffer.checkoutVariantId
      });
    }

    return { offerId: existingOffer.id, variantId, sku };
  }

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
      imageUrl: input.imageUrl
    }
  });

  let variantId: string | null = null;
  if (materialize) {
    variantId = await materializeVariantForOffer(prisma, {
      offerId: offer.id,
      sku,
      priceInPaise: input.priceInPaise,
      priceUsdCents: input.priceUsdCents,
      existingVariantId: null
    });
  }

  return { offerId: offer.id, variantId, sku };
}

/** Materialize Cart/Order stub for a paid course/event (does not belong in shop catalog). */
export async function materializeDigitalCheckoutVariant(
  prisma: PrismaClient,
  input: EnsureDigitalCheckoutOfferInput
): Promise<{ offerId: string; variantId: string; sku: string }> {
  const result = await ensureDigitalCheckoutOffer(prisma, {
    ...input,
    materializeVariant: true
  });
  if (!result.variantId) {
    throw new Error("Failed to materialize digital checkout variant");
  }
  return { offerId: result.offerId, variantId: result.variantId, sku: result.sku };
}

/** @deprecated Use ensureDigitalCheckoutOffer / materializeDigitalCheckoutVariant */
export async function ensureCourseCheckoutVariant(
  prisma: PrismaClient,
  opts: {
    courseSlug: string;
    title: string;
    priceInPaise: number;
    priceUsdCents: number | null;
    imageUrl: string | null;
    courseId?: string;
    materializeVariant?: boolean;
  }
): Promise<{ variantId: string | null; sku: string; offerId: string }> {
  const course = opts.courseId
    ? await prisma.course.findUnique({ where: { id: opts.courseId }, select: { id: true } })
    : await prisma.course.findUnique({ where: { slug: opts.courseSlug }, select: { id: true } });

  const { variantId, sku, offerId } = await ensureDigitalCheckoutOffer(prisma, {
    kind: "COURSE",
    entitySlug: opts.courseSlug,
    courseId: course?.id,
    title: opts.title,
    priceInPaise: opts.priceInPaise,
    priceUsdCents: opts.priceUsdCents,
    imageUrl: opts.imageUrl,
    skuPrefix: "COURSE",
    materializeVariant: opts.materializeVariant === true
  });

  if (course?.id) {
    await prisma.course.update({
      where: { id: course.id },
      data: { checkoutVariantId: variantId }
    });
  }

  return { variantId, sku, offerId };
}
