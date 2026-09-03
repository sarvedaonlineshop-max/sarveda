import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { isDigitalSku } from "../../utils/digitalCart";

/** After payment: create Enrollment / Booking records for course & event lines. */
export async function fulfillDigitalPurchases(orderId: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: { items: true }
  });
  if (!order?.items.length) return;

  let userId = order.customerId;
  if (!userId) {
    const user = await prisma.user.findFirst({
      where: { email: order.email.trim().toLowerCase(), deletedAt: null },
      select: { id: true }
    });
    userId = user?.id ?? null;
  }

  if (!userId) {
    logger.info("digital_fulfillment_no_user", { orderId, email: order.email });
    return;
  }

  for (const item of order.items) {
    const sku = item.skuSnapshot;
    if (!item.digitalOfferId && !isDigitalSku(sku)) continue;

    const offer = item.digitalOfferId
      ? await prisma.digitalCheckoutOffer.findUnique({
          where: { id: item.digitalOfferId },
          select: { courseId: true, eventId: true, kind: true, sku: true }
        })
      : await prisma.digitalCheckoutOffer.findFirst({
          where: {
            OR: [
              ...(item.variantId ? [{ checkoutVariantId: item.variantId }] : []),
              { sku }
            ]
          },
          select: { courseId: true, eventId: true, kind: true, sku: true }
        });

    let courseId = offer?.courseId ?? null;
    if (!courseId && (sku.startsWith("COURSE-") || offer?.kind === "COURSE")) {
      courseId =
        (
          await prisma.course.findFirst({
            where: item.variantId
              ? { checkoutVariantId: item.variantId }
              : { checkoutOffer: { sku } },
            select: { id: true }
          })
        )?.id ?? null;
    }

    if (courseId) {
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId, orderId, status: "ACTIVE" },
        update: { orderId, status: "ACTIVE" }
      });
      continue;
    }

    let eventId = offer?.eventId ?? null;
    if (!eventId && (sku.startsWith("EVENT-") || offer?.kind === "EVENT")) {
      eventId =
        (
          await prisma.event.findFirst({
            where: item.variantId
              ? { checkoutVariantId: item.variantId }
              : { checkoutOffer: { sku } },
            select: { id: true }
          })
        )?.id ?? null;
    }

    if (eventId) {
      const existing = await prisma.booking.findFirst({
        where: { userId, eventId }
      });
      if (!existing) {
        await prisma.booking.create({
          data: { userId, eventId, orderId, status: "ACTIVE" }
        });
      } else if (existing.status !== "ACTIVE" || existing.orderId !== orderId) {
        await prisma.booking.update({
          where: { id: existing.id },
          data: { orderId, status: "ACTIVE" }
        });
      }
    }
  }

  const digitalOnly = order.items.every(
    (i) => Boolean(i.digitalOfferId) || isDigitalSku(i.skuSnapshot)
  );
  if (digitalOnly && order.fulfillmentStatus === "UNFULFILLED") {
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: "FULFILLED" }
    });
  }
}
