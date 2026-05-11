import type { NextFunction, Request, Response } from "express";

import { verifyPayment } from "./razorpay";
import { completePaidOrder } from "./razorpay.verify";
import type { RazorpayVerifyBody } from "./payments.routes";

type PayErr = Error & { statusCode?: number; code?: string; userMessage?: string };

export async function verifyRazorpay(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as RazorpayVerifyBody;
    try {
      verifyPayment(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature);
    } catch (e) {
      const err = e as PayErr;
      res.status(err.statusCode ?? 400).json({
        success: false,
        error: err.userMessage ?? err.message,
        code: err.code ?? "VERIFY_FAILED"
      });
      return;
    }

    const { orderNumber } = await completePaidOrder(body.razorpay_order_id, body.razorpay_payment_id);

    res.json({
      success: true,
      data: { orderNumber }
    });
  } catch (err) {
    next(err);
  }
}
