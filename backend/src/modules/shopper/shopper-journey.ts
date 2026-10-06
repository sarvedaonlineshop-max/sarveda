import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { unpaidCheckoutAttemptWhere } from "../orders/abandoned-checkout";

function actorKey(userId?: string | null, sessionId?: string | null): string | null {
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return null;
}

function emailKey(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

/** Cart still has items and this attempt has not reached checkout or payment. */
export async function syncCartPresence(cartId: string): Promise<void> {
  try {
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      select: {
        userId: true,
        sessionId: true,
        items: { select: { id: true }, take: 1 }
      }
    });
    if (!cart) return;
    const key = actorKey(cart.userId, cart.sessionId);
    if (!key) return;

    if (cart.items.length === 0) {
      await prisma.shopperJourney.deleteMany({
        where: { actorKey: key, checkoutAt: null, purchasedAt: null }
      });
      return;
    }

    const open = await prisma.shopperJourney.findFirst({
      where: { actorKey: key, purchasedAt: null },
      select: { id: true }
    });
    if (open) return;

    await prisma.shopperJourney.create({
      data: { actorKey: key, cartAt: new Date() }
    });
  } catch (err) {
    logger.error("shopper_journey_cart_failed", {
      cartId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Guest cart merged into the signed-in cart. Keep one open attempt. */
export async function rekeyGuestJourney(userId: string, guestSessionId: string): Promise<void> {
  try {
    const from = `session:${guestSessionId}`;
    const to = `user:${userId}`;
    const guest = await prisma.shopperJourney.findFirst({
      where: { actorKey: from, purchasedAt: null },
      orderBy: { cartAt: "desc" }
    });
    if (!guest) return;

    const userOpen = await prisma.shopperJourney.findFirst({
      where: { actorKey: to, purchasedAt: null },
      orderBy: { cartAt: "desc" }
    });
    if (!userOpen) {
      await prisma.shopperJourney.update({ where: { id: guest.id }, data: { actorKey: to } });
      return;
    }

    if (guest.checkoutAt && !userOpen.checkoutAt && !userOpen.orderId) {
      await prisma.shopperJourney.update({
        where: { id: userOpen.id },
        data: { checkoutAt: guest.checkoutAt, orderId: guest.orderId }
      });
    }
    await prisma.shopperJourney.delete({ where: { id: guest.id } });
  } catch (err) {
    logger.error("shopper_journey_merge_failed", {
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Order created. This attempt leaves "added to cart". */
export async function noteCheckoutReached(input: {
  userId?: string | null;
  sessionId?: string | null;
  email: string;
  orderId: string;
}): Promise<void> {
  try {
    const key = actorKey(input.userId, input.sessionId) ?? emailKey(input.email);
    const at = new Date();
    const open = await prisma.shopperJourney.findFirst({
      where: { actorKey: key, purchasedAt: null },
      orderBy: { cartAt: "desc" }
    });

    if (open) {
      await prisma.shopperJourney.update({
        where: { id: open.id },
        data: { checkoutAt: at, orderId: input.orderId }
      });
      return;
    }

    await prisma.shopperJourney.create({
      data: { actorKey: key, cartAt: at, checkoutAt: at, orderId: input.orderId }
    });
  } catch (err) {
    logger.error("shopper_journey_checkout_failed", {
      orderId: input.orderId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Paid or COD placed. The attempt no longer counts as cart or checkout. */
export async function noteJourneyPurchased(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, email: true, placedAt: true, createdAt: true }
    });
    if (!order) return;
    const at = order.placedAt ?? order.createdAt;

    const byOrder = await prisma.shopperJourney.updateMany({
      where: { orderId, purchasedAt: null },
      data: { purchasedAt: at }
    });
    if (byOrder.count > 0) return;

    const key = order.customerId ? `user:${order.customerId}` : emailKey(order.email);
    const open = await prisma.shopperJourney.findFirst({
      where: { actorKey: key, purchasedAt: null },
      orderBy: { cartAt: "desc" }
    });
    if (!open || (open.orderId && open.orderId !== orderId)) return;

    await prisma.shopperJourney.update({
      where: { id: open.id },
      data: {
        purchasedAt: at,
        orderId,
        checkoutAt: open.checkoutAt ?? at
      }
    });
  } catch (err) {
    logger.error("shopper_journey_purchase_failed", {
      orderId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

export async function backfillShopperJourneys(): Promise<{
  checkout: number;
  purchasedClosed: number;
  carts: number;
}> {
  const result = { checkout: 0, purchasedClosed: 0, carts: 0 };

  const unpaid = await prisma.order.findMany({
    where: {
      deletedAt: null,
      wooCommerceId: null,
      ...unpaidCheckoutAttemptWhere
    },
    select: { id: true, customerId: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });

  for (const order of unpaid) {
    const exists = await prisma.shopperJourney.findUnique({
      where: { orderId: order.id },
      select: { id: true }
    });
    if (exists) continue;
    const key = order.customerId ? `user:${order.customerId}` : emailKey(order.email);
    const open = await prisma.shopperJourney.findFirst({
      where: { actorKey: key, purchasedAt: null, orderId: null },
      orderBy: { cartAt: "desc" }
    });
    if (open && !open.checkoutAt) {
      await prisma.shopperJourney.update({
        where: { id: open.id },
        data: { checkoutAt: order.createdAt, orderId: order.id }
      });
    } else if (!open) {
      await prisma.shopperJourney.create({
        data: {
          actorKey: key,
          cartAt: order.createdAt,
          checkoutAt: order.createdAt,
          orderId: order.id
        }
      });
    } else {
      await prisma.shopperJourney.create({
        data: {
          actorKey: key,
          cartAt: order.createdAt,
          checkoutAt: order.createdAt,
          orderId: order.id
        }
      });
    }
    result.checkout += 1;
  }

  const paid = await prisma.order.findMany({
    where: {
      deletedAt: null,
      wooCommerceId: null,
      OR: [
        { status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "REFUNDED"] } },
        { paymentStatus: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } }
      ]
    },
    select: { id: true, customerId: true, email: true, placedAt: true, createdAt: true }
  });

  for (const order of paid) {
    const at = order.placedAt ?? order.createdAt;
    const byOrder = await prisma.shopperJourney.updateMany({
      where: { orderId: order.id, purchasedAt: null },
      data: { purchasedAt: at }
    });
    if (byOrder.count > 0) {
      result.purchasedClosed += byOrder.count;
      continue;
    }
    const key = order.customerId ? `user:${order.customerId}` : emailKey(order.email);
    const open = await prisma.shopperJourney.findFirst({
      where: { actorKey: key, purchasedAt: null, orderId: null, cartAt: { lte: at } },
      orderBy: { cartAt: "desc" }
    });
    if (!open) continue;
    await prisma.shopperJourney.update({
      where: { id: open.id },
      data: { purchasedAt: at, orderId: order.id, checkoutAt: open.checkoutAt ?? at }
    });
    result.purchasedClosed += 1;
  }

  const carts = await prisma.cart.findMany({
    where: { items: { some: {} } },
    select: { userId: true, sessionId: true, createdAt: true, updatedAt: true }
  });

  for (const cart of carts) {
    const key = actorKey(cart.userId, cart.sessionId);
    if (!key) continue;
    const open = await prisma.shopperJourney.findFirst({
      where: { actorKey: key, purchasedAt: null },
      select: { id: true }
    });
    if (open) continue;

    if (cart.userId) {
      const laterPurchase = await prisma.order.findFirst({
        where: {
          customerId: cart.userId,
          deletedAt: null,
          wooCommerceId: null,
          OR: [
            { placedAt: { gte: cart.updatedAt } },
            { AND: [{ placedAt: null }, { createdAt: { gte: cart.updatedAt } }] }
          ],
          status: { in: ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] }
        },
        select: { id: true }
      });
      if (laterPurchase) continue;
    }

    await prisma.shopperJourney.create({
      data: { actorKey: key, cartAt: cart.updatedAt }
    });
    result.carts += 1;
  }

  return result;
}
