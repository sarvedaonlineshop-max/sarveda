import type { NextFunction, Request, Response } from "express";

import { logger } from "../../config/logger";
import {
  addCartItem,
  clearCartForRequest,
  getCartPayload,
  mergeGuestCartIntoUser,
  removeCartItem,
  resolveCartContext,
  updateCartItemQuantity
} from "./cart.service";
import type { CartAddBody, CartUpdateBody } from "./schemas";

function pricingCountry(req: Request): string | undefined {
  const q = req.query.country;
  return typeof q === "string" && q.trim() ? q.trim() : undefined;
}

function checkoutEmail(req: Request): string | undefined {
  const q = req.query.email;
  return typeof q === "string" && q.includes("@") ? q.trim().toLowerCase() : undefined;
}

export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, newSessionId, userId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(500).json({ success: false, error: "Cart error", code: "CART_ERROR" });
      return;
    }
    const body = req.body as CartAddBody;
    await addCartItem(cartId, {
      variantId: body.variantId,
      digitalOfferId: body.digitalOfferId,
      quantity: body.quantity
    });
    const payload = await getCartPayload(cartId, pricingCountry(req), {
      userId,
      email: checkoutEmail(req)
    });
    res.status(200).json({
      success: true,
      data: {
        ...payload,
        sessionId: newSessionId
      }
    });
  } catch (err) {
    logger.error("cart_add_failed", { err });
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, newSessionId, userId } = await resolveCartContext(req, "read");
    const payload = await getCartPayload(cartId, pricingCountry(req), {
      userId,
      email: checkoutEmail(req)
    });
    res.json({
      success: true,
      data: {
        ...payload,
        sessionId: newSessionId
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, userId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(400).json({
        success: false,
        error: "Missing cart session. Add an item first or refresh.",
        code: "NO_CART"
      });
      return;
    }
    const body = req.body as CartUpdateBody;
    await updateCartItemQuantity(cartId, {
      variantId: body.variantId,
      digitalOfferId: body.digitalOfferId,
      quantity: body.quantity
    });
    const payload = await getCartPayload(cartId, pricingCountry(req), { userId });
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}

export async function clear(req: Request, res: Response, next: NextFunction) {
  try {
    await clearCartForRequest(req);
    res.json({
      success: true,
      data: { items: [], subtotalInPaise: 0, itemCount: 0, currency: "INR" }
    });
  } catch (err) {
    next(err);
  }
}

/** Merge guest `X-Sarveda-Cart-Session` into logged-in cart once (call after login). */
export async function mergeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.authUser?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Login required", code: "UNAUTHORIZED" });
      return;
    }
    const headerSession = req.headers["x-sarveda-cart-session"];
    const guestSessionId =
      typeof headerSession === "string" && headerSession.trim().length > 0
        ? headerSession.trim()
        : null;

    const { cartId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(500).json({ success: false, error: "Cart error", code: "CART_ERROR" });
      return;
    }

    if (guestSessionId) {
      await mergeGuestCartIntoUser(cartId, guestSessionId);
    }

    const payload = await getCartPayload(cartId, pricingCountry(req), {
      userId,
      email: checkoutEmail(req)
    });
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, userId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(400).json({
        success: false,
        error: "Missing cart session.",
        code: "NO_CART"
      });
      return;
    }
    const { variantId } = req.params;
    if (!variantId) {
      res.status(400).json({ success: false, error: "variantId required", code: "BAD_REQUEST" });
      return;
    }
    await removeCartItem(cartId, { variantId });
    const payload = await getCartPayload(cartId, pricingCountry(req), { userId });
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}

export async function removeDigital(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, userId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(400).json({
        success: false,
        error: "Missing cart session.",
        code: "NO_CART"
      });
      return;
    }
    const { digitalOfferId } = req.params;
    if (!digitalOfferId) {
      res.status(400).json({
        success: false,
        error: "digitalOfferId required",
        code: "BAD_REQUEST"
      });
      return;
    }
    await removeCartItem(cartId, { digitalOfferId });
    const payload = await getCartPayload(cartId, pricingCountry(req), { userId });
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}
