import type { NextFunction, Request, Response } from "express";

import { listCheckoutCouponOffers } from "../coupons/coupon.service";
import { getCartPayload, resolveCartContext } from "./cart.service";
import { applyCouponToCart, removeCouponFromCart } from "./couponCart";
import type { CartCouponBody } from "./schemas";

function pricingCountry(req: Request): string | undefined {
  const q = req.query.country;
  return typeof q === "string" && q.trim() ? q.trim() : undefined;
}

function checkoutEmail(req: Request): string | undefined {
  const q = req.query.email;
  return typeof q === "string" && q.includes("@") ? q.trim().toLowerCase() : undefined;
}

export async function listOffers(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, userId } = await resolveCartContext(req, "read");
    const payload = await getCartPayload(cartId, pricingCountry(req), {
      userId,
      email: checkoutEmail(req)
    });
    const offers = await listCheckoutCouponOffers({
      subtotalInPaise: payload.subtotalInPaise,
      userId,
      email: checkoutEmail(req)
    });
    res.json({ success: true, data: { offers, appliedCode: payload.coupon?.code ?? null } });
  } catch (err) {
    next(err);
  }
}

export async function applyCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, userId, newSessionId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(400).json({
        success: false,
        error: "Missing cart session. Add an item first.",
        code: "NO_CART"
      });
      return;
    }
    const body = req.body as CartCouponBody;

    await applyCouponToCart(cartId, body.code, {
      userId,
      email: body.email,
      country: pricingCountry(req)
    });

    const payload = await getCartPayload(cartId, pricingCountry(req), {
      userId,
      email: body.email
    });
    res.json({
      success: true,
      data: { ...payload, sessionId: newSessionId }
    });
  } catch (err) {
    next(err);
  }
}

export async function removeCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, newSessionId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(400).json({
        success: false,
        error: "Missing cart session.",
        code: "NO_CART"
      });
      return;
    }
    await removeCouponFromCart(cartId);
    const payload = await getCartPayload(cartId, pricingCountry(req));
    res.json({
      success: true,
      data: { ...payload, sessionId: newSessionId }
    });
  } catch (err) {
    next(err);
  }
}
