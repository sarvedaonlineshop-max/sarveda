import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { isDigitalSku } from "../../utils/digitalCart";

/** After payment: create Enrollment / Booking records for course & event SKUs. */
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
    if (sku.startsWith("COURSE-")) {
      const course = await prisma.course.findFirst({
        where: { checkoutVariantId: item.variantId },
        select: { id: true }
      });
      if (course) {
        await prisma.enrollment.upsert({
          where: { userId_courseId: { userId, courseId: course.id } },
          create: { userId, courseId: course.id },
          update: {}
        });
      }
    } else if (sku.startsWith("EVENT-")) {
      const event = await prisma.event.findFirst({
        where: { checkoutVariantId: item.variantId },
        select: { id: true }
      });
      if (event) {
        const existing = await prisma.booking.findFirst({
          where: { userId, eventId: event.id }
        });
        if (!existing) {
          await prisma.booking.create({ data: { userId, eventId: event.id } });
        }
      }
    }
  }

  const digitalOnly = order.items.every((i) => isDigitalSku(i.skuSnapshot));
  if (digitalOnly && order.fulfillmentStatus === "UNFULFILLED") {
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: "FULFILLED" }
    });
  }
}
