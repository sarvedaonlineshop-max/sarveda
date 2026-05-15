import type { NextFunction, Request, Response } from "express";

import { createCheckoutOrder, resumePendingCheckout } from "./checkout.service";
import type { CreateOrderBody } from "./schemas";
import { shippingEnv } from "../../config/env";

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateOrderBody;
    if (shippingEnv.INDIA_CHECKOUT_ONLY && (body.country ?? "IN").toUpperCase() !== "IN") {
      res.status(400).json({
        success: false,
        error: "This deployment accepts India shipping addresses only. Set country to IN.",
        code: "INDIA_CHECKOUT_ONLY"
      });
      return;
    }
    const data = await createCheckoutOrder(req, body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resumeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const orderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber.trim() : "";
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    if (!orderNumber || !email) {
      res.status(400).json({
        success: false,
        error: "orderNumber and email are required",
        code: "BAD_REQUEST"
      });
      return;
    }
    const data = await resumePendingCheckout(orderNumber, email);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
