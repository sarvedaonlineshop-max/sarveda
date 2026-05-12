import type { NextFunction, Request, Response } from "express";

import { logger } from "../../config/logger";
import {
  addCartItem,
  getCartPayload,
  removeCartItem,
  resolveCartContext,
  updateCartItemQuantity
} from "./cart.service";
import type { CartAddBody, CartUpdateBody } from "./schemas";

export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId, newSessionId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(500).json({ success: false, error: "Cart error", code: "CART_ERROR" });
      return;
    }
    const body = req.body as CartAddBody;
    await addCartItem(cartId, body.variantId, body.quantity);
    const payload = await getCartPayload(cartId);
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
    const { cartId, newSessionId } = await resolveCartContext(req, "read");
    const payload = await getCartPayload(cartId);
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
    const { cartId } = await resolveCartContext(req, "write");
    if (!cartId) {
      res.status(400).json({
        success: false,
        error: "Missing cart session. Add an item first or refresh.",
        code: "NO_CART"
      });
      return;
    }
    const body = req.body as CartUpdateBody;
    await updateCartItemQuantity(cartId, body.variantId, body.quantity);
    const payload = await getCartPayload(cartId);
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { cartId } = await resolveCartContext(req, "write");
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
    await removeCartItem(cartId, variantId);
    const payload = await getCartPayload(cartId);
    res.json({ success: true, data: payload });
  } catch (err) {
    next(err);
  }
}
