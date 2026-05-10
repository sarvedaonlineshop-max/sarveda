import type { NextFunction, Request, Response } from "express";

import { completePaidOrder, verifyPaymentSignature } from "./razorpay.verify";
import type { RazorpayVerifyBody } from "./payments.routes";

export async function verifyRazorpay(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as RazorpayVerifyBody;
    const ok = verifyPaymentSignature(
      body.razorpay_order_id,
      body.razorpay_payment_id,
      body.razorpay_signature
    );
    if (!ok) {
      res.status(400).json({
        success: false,
        error: "Invalid payment signature",
        code: "INVALID_SIGNATURE"
      });
      return;
    }

    const { orderNumber } = await completePaidOrder(
      body.razorpay_order_id,
      body.razorpay_payment_id
    );

    res.json({
      success: true,
      data: { orderNumber }
    });
  } catch (err) {
    next(err);
  }
}
