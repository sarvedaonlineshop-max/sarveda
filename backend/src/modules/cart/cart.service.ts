import { randomUUID } from "crypto";

import type { Request } from "express";

import { prisma } from "../../config/db";

const CART_HEADER = "x-sarveda-cart-session";

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

    if (headerSession) {
      const guestCart = await prisma.cart.findUnique({
        where: { sessionId: headerSession },
        include: { items: true }
      });
      if (guestCart && guestCart.id !== cart.id && guestCart.items.length > 0) {
        for (const item of guestCart.items) {
          await prisma.cartItem.upsert({
            where: {
              cartId_variantId: { cartId: cart.id, variantId: item.variantId }
            },
            create: {
              cartId: cart.id,
              variantId: item.variantId,
              quantity: item.quantity
            },
            update: {
              quantity: { increment: item.quantity }
            }
          });
        }
        await prisma.cart.delete({ where: { id: guestCart.id } }).catch(() => undefined);
      }
    }

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
    attributeValue: { value: string; attribute: { name: string } };
  }>
): string | null {
  if (!rows.length) return null;
  return rows.map((r) => `${r.attributeValue.attribute.name}: ${r.attributeValue.value}`).join(" · ");
}

export async function getCartPayload(cartId: string | null) {
  if (!cartId) {
    return { items: [], subtotalInPaise: 0, itemCount: 0 };
  }

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
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
    return { items: [], subtotalInPaise: 0, itemCount: 0 };
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

  for (const row of cart.items) {
    const v = row.variant;
    const p = v.productRel;
    const img = p.images[0]?.url ?? null;
    const price = v.saleInPaise;
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
      variantLabel: variantLabel(v.attributeValues),
      primaryImageUrl: img,
      maxQuantity: maxQty
    });
  }

  return { items, subtotalInPaise, itemCount };
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
}

export async function removeCartItem(cartId: string, variantId: string): Promise<void> {
  await prisma.cartItem.deleteMany({
    where: { cartId, variantId }
  });
}

/** Empty the shopper cart after a successful payment (guest session or logged-in cart). */
export async function clearCartForRequest(req: Request): Promise<void> {
  const { cartId } = await resolveCartContext(req, "read");
  if (!cartId) return;
  await prisma.cartItem.deleteMany({ where: { cartId } });
}
