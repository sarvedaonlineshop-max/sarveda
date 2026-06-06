import { prisma } from "../../config/db";
import { getCartPayload } from "./cart.service";
import { resolveCartCouponDiscount } from "../coupons/coupon.service";

export async function applyCouponToCart(
  cartId: string,
  rawCode: string,
  opts: { userId: string | null; email?: string; country?: string }
): Promise<void> {
  const payload = await getCartPayload(cartId, opts.country, {
    userId: opts.userId,
    email: opts.email
  });
  if (!payload.items.length) {
    const e = new Error("Add items to your cart before applying a coupon.") as Error & {
      statusCode: number;
      code: string;
      userMessage: string;
    };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    e.userMessage = e.message;
    throw e;
  }

  await resolveCartCouponDiscount(payload.subtotalInPaise, rawCode, {
    userId: opts.userId,
    email: opts.email
  });

  await prisma.cart.update({
    where: { id: cartId },
    data: { couponCode: rawCode.trim().toUpperCase(), abandonedEmailSentAt: null }
  });
}

export async function removeCouponFromCart(cartId: string): Promise<void> {
  await prisma.cart.update({
    where: { id: cartId },
    data: { couponCode: null, abandonedEmailSentAt: null }
  });
}
