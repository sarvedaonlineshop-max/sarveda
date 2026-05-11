import type { NextFunction, Request, Response } from "express";

import { createCheckoutOrder, resumePendingCheckout } from "./checkout.service";
import type { CreateOrderBody } from "./schemas";

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createCheckoutOrder(req, req.body as CreateOrderBody);
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
