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

export async function paymentOptions(_req: Request, res: Response) {
  const country =
    typeof _req.query.country === "string" ? _req.query.country.trim().toUpperCase() : "IN";
  const isIndia = country === "IN";
  res.json({
    success: true,
    data: {
      country,
      zone: isIndia ? "IN" : country === "GB" ? "GB" : country === "US" ? "US" : "OTHER",
      methods: isIndia
        ? [
            { id: "razorpay", label: "Pay online (UPI / Card / Netbanking)", enabled: Boolean(process.env.RAZORPAY_KEY_ID) },
            {
              id: "cod",
              label: "Cash on delivery",
              enabled: ["1", "true", "yes"].includes(
                (process.env.ENABLE_COD_CHECKOUT ?? "1").toLowerCase()
              )
            }
          ]
        : [
            { id: "stripe", label: "Card (Stripe)", enabled: Boolean(process.env.STRIPE_SECRET_KEY) },
            { id: "paypal", label: "PayPal", enabled: Boolean(process.env.PAYPAL_CLIENT_ID) }
          ],
      defaultDomesticCourier: (process.env.DEFAULT_DOMESTIC_COURIER ?? "delhivery").toLowerCase()
    }
  });
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
    const currency =
      typeof req.query.currency === "string" ? req.query.currency.trim().toUpperCase() : undefined;
    const amountRaw =
      typeof req.query.amountInPaise === "string" ? req.query.amountInPaise.trim() : "";
    const amountInPaise =
      amountRaw && Number.isFinite(Number(amountRaw)) ? Math.round(Number(amountRaw)) : undefined;

    const paymentMethodRaw =
      typeof req.query.paymentMethod === "string" ? req.query.paymentMethod.trim().toLowerCase() : "";
    const paymentMethod =
      paymentMethodRaw === "razorpay" || paymentMethodRaw === "stripe" || paymentMethodRaw === "paypal"
        ? paymentMethodRaw
        : undefined;

    const data = await resumePendingCheckout(orderNumber, email, {
      ...(currency ? { currency } : {}),
      ...(amountInPaise != null ? { amountInPaise } : {}),
      ...(paymentMethod ? { paymentMethod } : {})
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
