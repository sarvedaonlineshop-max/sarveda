import type { NextFunction, Request, Response } from "express";

import { createCheckoutOrder } from "./checkout.service";
import type { CreateOrderBody } from "./schemas";

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createCheckoutOrder(req, req.body as CreateOrderBody);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
