import { randomUUID } from "crypto";

import type { Request } from "express";

import { prisma } from "../../config/db";
import { unitMinorForZone } from "../../utils/variantPricing";
import { isDigitalLine } from "../../utils/digitalCart";
import { resolveCartCouponDiscount } from "../coupons/coupon.service";
import { currencyForZone, zoneFromCountry } from "../shipping/shippingRates.service";

const CART_HEADER = "x-sarveda-cart-session";

/** Reset abandoned-cart email flag when shopper changes the cart. */
async function markCartMutated(cartId: string): Promise<void> {
  await prisma.cart.update({
    where: { id: cartId },
    data: { abandonedEmailSentAt: null }
  });
}

export type CartContext = {
  cartId: string;
  sessionId: string | null;
  /** New session id to return to client (first request only) */
  newSessionId?: string;
};

function normalizeSessionHeader(req: Request): string | undefined {
  const h = req.headers[CART_HEADER] ?? req.headers[CART_HEADER.toLowerCase() as keyof typeof req.headers];
  if (typeof h === "string" && h.length > 0 && h.length < 200) {
    return h.trim();
  }
  return undefined;
}

export type ResolveMode = "read" | "write";

/** One-time merge of guest session cart into the logged-in user's cart (login / explicit merge only). */
export async function mergeGuestCartIntoUser(
  userCartId: string,
  guestSessionId: string
): Promise<void> {
  const guestCart = await prisma.cart.findUnique({
    where: { sessionId: guestSessionId },
    include: { items: true }
  });
  if (!guestCart || guestCart.id === userCartId || guestCart.items.length === 0) {
    return;
  }

  for (const item of guestCart.items) {
    const existing = await prisma.cartItem.findUnique({
      where: {
        cartId_variantId: { cartId: userCartId, variantId: item.variantId }
      },
      select: { quantity: true }
    });
    const mergedQty = (existing?.quantity ?? 0) + item.quantity;
    await prisma.cartItem.upsert({
      where: {
        cartId_variantId: { cartId: userCartId, variantId: item.variantId }
      },
      create: {
        cartId: userCartId,
        variantId: item.variantId,
        quantity: item.quantity
      },
      update: {
        quantity: mergedQty
      }
    });
  }

  await prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } });
  await prisma.cart.update({
    where: { id: guestCart.id },
    data: { couponCode: null }
  });
  await prisma.cart.delete({ where: { id: guestCart.id } });
  await markCartMutated(userCartId);
}

export async function resolveCartContext(
  req: Request,
  mode: ResolveMode = "write"
): Promise<{
  cartId: string | null;
  sessionId: string | null;
  newSessionId?: string;
  userId: string | null;
}> {
  const userId = req.authUser?.id ?? null;
  const headerSession = normalizeSessionHeader(req);

  if (userId) {
    let cart = await prisma.cart.findUnique({
      where: { userId },
      select: { id: true, sessionId: true }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        select: { id: true, sessionId: true }
      });
    }

    // Guest session header is ignored here — merge only via POST /api/cart/merge-session on login.

    return { cartId: cart.id, sessionId: cart.sessionId, userId };
  }

  if (mode === "read" && !headerSession) {
    return { cartId: null, sessionId: null, userId: null };
  }

  if (!headerSession && mode === "write") {
    const sessionId = randomUUID();
    const cart = await prisma.cart.create({
      data: { sessionId },
      select: { id: true }
    });
    return { cartId: cart.id, sessionId, newSessionId: sessionId, userId: null };
  }

  const sessionId = headerSession!;
  let cart = await prisma.cart.findUnique({
    where: { sessionId },
    select: { id: true }
  });

  if (!cart) {
    if (mode === "read") {
      return { cartId: null, sessionId, userId: null };
    }
    cart = await prisma.cart.create({
      data: { sessionId },
      select: { id: true }
    });
  }

  return { cartId: cart.id, sessionId, userId: null };
}

function variantLabel(
  rows: Array<{
    attributeValue?: { value: string; attribute?: { name: string } | null } | null;
  }>
): string | null {
  if (!rows.length) return null;
  const parts = rows
    .map((row) => {
      const value = row.attributeValue?.value;
      const name = row.attributeValue?.attribute?.name;
      if (!value) return null;
      return name ? `${name}: ${value}` : value;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export async function getCartPayload(
  cartId: string | null,
  shippingCountry?: string,
  opts?: { userId?: string | null; email?: string | null }
) {
  const zone = zoneFromCountry(shippingCountry ?? "IN");
  const currency = currencyForZone(zone);

  if (!cartId) {
    return {
      items: [],
      subtotalInPaise: 0,
      itemCount: 0,
      currency,
      discountInPaise: 0,
      totalInPaise: 0,
      coupon: null as null | {
        code: string;
        type: string;
        value: number;
        discountInPaise: number;
      },
      isDigitalOnly: false
    };
  }

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          variant: {
            include: {
              productRel: {
                include: {
                  images: { where: { isPrimary: true }, take: 1 }
                }
              },
              attributeValues: {
                include: {
                  attributeValue: { include: { attribute: true } }
                }
              },
              inventory: true
            }
          }
        }
      }
    }
  });

  if (!cart) {
    return {
      items: [],
      subtotalInPaise: 0,
      itemCount: 0,
      currency,
      discountInPaise: 0,
      totalInPaise: 0,
      coupon: null,
      isDigitalOnly: false
    };
  }

  type ItemOut = {
    id: string;
    variantId: string;
    productSlug: string;
    productName: string;
    quantity: number;
    unitPriceInPaise: number;
    variantLabel: string | null;
    primaryImageUrl: string | null;
    maxQuantity: number | null;
  };

  const items: ItemOut[] = [];
  let subtotalInPaise = 0;
  let itemCount = 0;
  let isDigitalOnly = cart.items.length > 0;

  for (const row of cart.items) {
    const v = row.variant;
    const p = v?.productRel;
    if (!v || !p) {
      isDigitalOnly = false;
      continue;
    }
    if (!isDigitalLine(v)) {
      isDigitalOnly = false;
    }
    const img = p.images[0]?.url ?? null;
    const price = unitMinorForZone(v, zone);
    const line = price * row.quantity;
    subtotalInPaise += line;
    itemCount += row.quantity;

    const inv = v.inventory;
    const maxQty = inv ? Math.max(0, inv.onHand - inv.reserved) : null;

    items.push({
      id: row.id,
      variantId: v.id,
      productSlug: p.slug,
      productName: p.name,
      quantity: row.quantity,
      unitPriceInPaise: price,
      variantLabel: variantLabel(v.attributeValues) ?? "Standard",
      primaryImageUrl: img,
      maxQuantity: maxQty
    });
  }

  let discountInPaise = 0;
  let coupon: {
    code: string;
    type: string;
    value: number;
    discountInPaise: number;
  } | null = null;

  if (cart.couponCode) {
    try {
      const resolved = await resolveCartCouponDiscount(subtotalInPaise, cart.couponCode, {
        userId: opts?.userId ?? null,
        email: opts?.email ?? null
      });
      discountInPaise = resolved.discountInPaise;
      coupon = resolved.coupon;
    } catch {
      await prisma.cart.update({
        where: { id: cartId },
        data: { couponCode: null }
      });
    }
  }

  const totalInPaise = Math.max(0, subtotalInPaise - discountInPaise);

  return { items, subtotalInPaise, itemCount, currency, discountInPaise, totalInPaise, coupon, isDigitalOnly };
}

export async function addCartItem(
  cartId: string,
  variantId: string,
  quantity: number
): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      status: "ACTIVE",
      productRel: { deletedAt: null, status: "ACTIVE" }
    },
    include: { inventory: true }
  });

  if (!variant) {
    const e = new Error("Variant not found or unavailable") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "INVALID_VARIANT";
    throw e;
  }

  const inv = variant.inventory;
  const available = inv ? inv.onHand - inv.reserved : 1_000_000;
  if (available < 1) {
    const e = new Error("Out of stock") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "OUT_OF_STOCK";
    throw e;
  }

  const existing = await prisma.cartItem.findUnique({
    where: {
      cartId_variantId: { cartId, variantId }
    }
  });

  const nextQty = (existing?.quantity ?? 0) + quantity;
  if (nextQty > available) {
    const e = new Error(`Only ${available} available`) as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "INSUFFICIENT_STOCK";
    throw e;
  }

  await prisma.cartItem.upsert({
    where: {
      cartId_variantId: { cartId, variantId }
    },
    create: { cartId, variantId, quantity: nextQty },
    update: { quantity: nextQty }
  });
  await markCartMutated(cartId);
}

export async function updateCartItemQuantity(
  cartId: string,
  variantId: string,
  quantity: number
): Promise<void> {
  if (quantity < 1) {
    await prisma.cartItem.deleteMany({
      where: { cartId, variantId }
    });
    await markCartMutated(cartId);
    return;
  }

  const row = await prisma.cartItem.findUnique({
    where: {
      cartId_variantId: { cartId, variantId }
    },
    include: {
      variant: { include: { inventory: true } }
    }
  });

  if (!row) {
    const e = new Error("Cart line not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const inv = row.variant.inventory;
  const available = inv ? inv.onHand - inv.reserved : 1_000_000;
  if (quantity > available) {
    const e = new Error(`Only ${available} available`) as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "INSUFFICIENT_STOCK";
    throw e;
  }

  await prisma.cartItem.update({
    where: {
      cartId_variantId: { cartId, variantId }
    },
    data: { quantity }
  });
  await markCartMutated(cartId);
}

export async function removeCartItem(cartId: string, variantId: string): Promise<void> {
  await prisma.cartItem.deleteMany({
    where: { cartId, variantId }
  });
  await markCartMutated(cartId);
}

/** Empty the shopper cart after a successful payment (guest session or logged-in cart). */
export async function clearCartForRequest(req: Request): Promise<void> {
  const { cartId } = await resolveCartContext(req, "read");
  if (!cartId) return;
  await prisma.cartItem.deleteMany({ where: { cartId } });
  await prisma.cart.update({
    where: { id: cartId },
    data: { couponCode: null, abandonedEmailSentAt: null }
  });
}

/** Clear persisted cart for the customer who placed this order (logged-in shoppers). */
export async function clearCartForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true }
  });
  if (!order?.customerId) return;
  const cart = await prisma.cart.findUnique({ where: { userId: order.customerId } });
  if (!cart) return;
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { couponCode: null, abandonedEmailSentAt: null }
  });
}
