import type { ProductVariant } from "@prisma/client";
import type { Request } from "express";

import { getRedisConnection } from "../../config/redisConnection";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { schedulePaymentTimeout } from "../../jobs/paymentTimeoutJob";
import { generateOrderNumber } from "../../utils/orderNumber";
import { createPayPalOrder } from "../payments/paypal";
import { createOrder, getRazorpayKeyId } from "../payments/razorpay";
import { createStripeCheckoutSession } from "../payments/stripe.checkout";
import { confirmStockTx, reserveStockTx } from "../orders/orders.service";
import { notifyOrderEmail } from "../notifications/email";
import { invoiceNumberForOrder } from "../../utils/invoice";
import { getCartPayload, resolveCartContext } from "../cart/cart.service";
import {
  computeVariantShippingTotal,
  currencyForZone,
  zoneFromCountry
} from "../shipping/shippingRates.service";
import { isZoneAPincode } from "../shipping/router";
import * as delhivery from "../shipping/delhivery";
import * as shiprocket from "../shipping/shiprocket";
import { shippingEnv } from "../../config/env";
import type { ZoneKey } from "../shipping/types";
import type { CreateOrderBody } from "./schemas";

function triStateEnv(envVal: string | undefined, defaultWhenUnset: boolean): boolean {
  const v = (envVal ?? "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  return defaultWhenUnset;
}

function unitMinor(variant: ProductVariant, zone: ZoneKey): number {
  switch (zone) {
    case "IN":
      return variant.saleInPaise;
    case "GB":
      return variant.saleGbpPence ?? variant.saleInPaise;
    case "US":
    case "OTHER":
      return variant.saleUsdCents ?? variant.saleInPaise;
    default:
      return variant.saleInPaise;
  }
}

/** India + zone-A pin + cart > 5 kg → Delhivery-heavy lane; block checkout if NSZ. */
async function assertDelhiveryHeavyIndiaServiceable(
  country: string | undefined,
  postalCode: string,
  lines: Array<{ quantity: number; variant: ProductVariant }>
): Promise<void> {
  const cc = (country ?? "IN").toUpperCase();
  if (cc !== "IN") return;
  if (!shippingEnv.DELHIVERY_API_KEY.trim()) return;
  const pin = postalCode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6 || !isZoneAPincode(pin)) return;
  let grams = 0;
  for (const row of lines) {
    grams += (row.variant.weightGrams ?? 500) * row.quantity;
  }
  grams = Math.max(grams, 1);
  if (grams <= 5000) return;
  const r = await delhivery.checkPincodeServiceability(pin);
  if (!r.success) {
    if (r.code === "DELHIVERY_NOT_CONFIGURED") return;
    const e = new Error(r.error) as Error & {
      statusCode?: number;
      code?: string;
      userMessage?: string;
    };
    e.statusCode = 502;
    e.code = r.code ?? "DELHIVERY_SERVICEABILITY";
    e.userMessage =
      "We could not verify delivery to this pincode. Please try again shortly or contact support if it continues.";
    throw e;
  }
  if (!r.data.serviceable) {
    const e = new Error(
      "This address is not serviceable for heavy shipments on our network. Try another pincode or reduce cart weight."
    ) as Error & { statusCode?: number; code?: string };
    e.statusCode = 400;
    e.code = "PINCODE_NOT_SERVICEABLE_HEAVY";
    throw e;
  }
}

/** India checkout PIN check — Delhivery when default domestic courier is Delhivery, else Shiprocket. */
async function assertIndiaCheckoutServiceable(
  country: string | undefined,
  postalCode: string,
  lines: Array<{ quantity: number; variant: ProductVariant }>,
  codDelivery: boolean | undefined
): Promise<void> {
  if ((country ?? "IN").toUpperCase() !== "IN") return;

  const pin = postalCode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return;

  const useDelhivery =
    (process.env.DEFAULT_DOMESTIC_COURIER ?? "delhivery").trim().toLowerCase() !== "shiprocket" &&
    Boolean(shippingEnv.DELHIVERY_API_KEY.trim());

  if (useDelhivery) {
    const r = await delhivery.checkPincodeServiceability(pin);
    if (!r.success) {
      if (r.code === "DELHIVERY_NOT_CONFIGURED") {
        await assertIndiaShiprocketCheckoutServiceable(country, postalCode, lines, codDelivery);
        return;
      }
      const e = new Error(r.error) as Error & {
        statusCode?: number;
        code?: string;
        userMessage?: string;
      };
      e.statusCode = 502;
      e.code = r.code ?? "DELHIVERY_SERVICEABILITY";
      e.userMessage =
        "We could not verify delivery to this PIN. Please try again shortly or contact support.";
      throw e;
    }
    if (!r.data.serviceable) {
      const e = new Error(
        "Delivery is not available to this PIN on our courier network. Try another PIN or contact support."
      ) as Error & { statusCode?: number; code?: string; userMessage?: string };
      e.statusCode = 400;
      e.code = "PIN_NOT_SERVICEABLE_DELHIVERY";
      e.userMessage = e.message;
      throw e;
    }
    return;
  }

  await assertIndiaShiprocketCheckoutServiceable(country, postalCode, lines, codDelivery);
}

/** Block unpaid checkout if Shiprocket has no courier for warehouse→PIN (when enabled in env). */
async function assertIndiaShiprocketCheckoutServiceable(
  country: string | undefined,
  postalCode: string,
  lines: Array<{ quantity: number; variant: ProductVariant }>,
  codDelivery: boolean | undefined
): Promise<void> {
  if (!shippingEnv.INDIA_REQUIRE_SHIPROCKET_SERVICEABILITY) return;
  if ((country ?? "IN").toUpperCase() !== "IN") return;

  const pin = postalCode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return;

  let grams = 0;
  for (const row of lines) {
    grams += (row.variant.weightGrams ?? 500) * row.quantity;
  }
  grams = Math.max(grams, 1);
  const weightKg = Math.max(0.05, grams / 1000);

  const sr = await shiprocket.checkIndiaCourierServiceability({
    deliveryPincode: pin,
    weightKg,
    cod: Boolean(codDelivery)
  });
  if (!sr.success) {
    const e = new Error(sr.error) as Error & {
      statusCode?: number;
      code?: string;
      userMessage?: string;
    };
    e.statusCode =
      sr.code === "SHIPROCKET_ORIGIN_PIN" || sr.code === "SHIPROCKET_NOT_CONFIGURED" ? 503 : 502;
    e.code = sr.code;
    e.userMessage =
      sr.code === "SHIPROCKET_ORIGIN_PIN"
        ? "Shipping is not fully configured yet. Please contact Sarveda support."
        : sr.error;
    throw e;
  }
  if (!sr.data.serviceable) {
    const e = new Error(
      "Delivery is not available from our warehouse to this PIN for your cart size and options. Try another PIN or contact support."
    ) as Error & { statusCode?: number; code?: string; userMessage?: string };
    e.statusCode = 400;
    e.code = "PIN_NOT_SERVICEABLE_SHIPROCKET";
    e.userMessage = e.message;
    throw e;
  }
}

const IDEM_TTL_SEC = 30 * 60;

export type CreateCheckoutResult = {
  orderId: string;
  orderNumber: string;
  amountInPaise: number;
  currency: string;
  paymentMethod: "razorpay" | "cod" | "stripe" | "paypal";
  paymentId: string;
  paymentProvider: "RAZORPAY" | "COD" | "STRIPE" | "PAYPAL";
  razorpayKeyId?: string;
  rzpOrderId?: string;
  stripeCheckoutUrl?: string;
  paypalApprovalUrl?: string;
  /** COD orders are confirmed immediately (no Razorpay modal). */
  codConfirmed?: boolean;
};

function labelFromVariant(
  rows: Array<{ attributeValue: { value: string; attribute: { name: string } } }>
): string {
  if (!rows.length) return "";
  return rows.map((r) => `${r.attributeValue.attribute.name}: ${r.attributeValue.value}`).join(" · ");
}

async function getIdempotentCheckout(idemKey: string): Promise<CreateCheckoutResult | null> {
  const redis = getRedisConnection();
  if (!redis) return null;
  const v = await redis.get(`checkout:idem:${idemKey}`);
  if (!v) return null;
  try {
    return JSON.parse(v) as CreateCheckoutResult;
  } catch {
    return null;
  }
}

async function setIdempotentCheckout(idemKey: string, payload: CreateCheckoutResult): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  await redis.set(`checkout:idem:${idemKey}`, JSON.stringify(payload), "EX", IDEM_TTL_SEC);
}

export async function createCheckoutOrder(req: Request, body: CreateOrderBody): Promise<CreateCheckoutResult> {
  const idemHeader =
    typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";

  if (idemHeader) {
    const cached = await getIdempotentCheckout(idemHeader);
    if (cached) {
      logger.info("checkout_idempotent_hit", { idempotencyKey: idemHeader, orderId: cached.orderId });
      return cached;
    }
  }

  const { cartId, userId } = await resolveCartContext(req, "read");
  if (!cartId) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    throw e;
  }

  const cartData = await getCartPayload(cartId);
  if (!cartData.items.length) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    throw e;
  }

  const zone = zoneFromCountry(body.country ?? "IN");
  if (body.codDelivery && zone !== "IN") {
    const e = new Error("COD delivery surcharge applies to India only") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "COD_NOT_ALLOWED";
    throw e;
  }

  const lines = await prisma.cartItem.findMany({
    where: { cartId },
    include: {
      variant: {
        include: {
          productRel: true,
          inventory: true,
          attributeValues: {
            include: { attributeValue: { include: { attribute: true } } }
          }
        }
      }
    }
  });

  for (const row of lines) {
    const inv = row.variant.inventory;
    const available = inv ? inv.onHand - inv.reserved : 1_000_000;
    if (row.quantity > available) {
      const e = new Error(
        `Insufficient stock for ${row.variant.productRel.name}`
      ) as Error & { statusCode: number; code: string };
      e.statusCode = 400;
      e.code = "INSUFFICIENT_STOCK";
      throw e;
    }
  }

  let subtotalMinor = 0;
  for (const row of lines) {
    const u = unitMinor(row.variant, zone);
    subtotalMinor += u * row.quantity;
  }

  const shippingLines = lines.map((row) => ({
    variantId: row.variantId,
    quantity: row.quantity
  }));
  const shippingInPaise = await computeVariantShippingTotal(prisma, shippingLines, body.country ?? "IN", {
    cod: Boolean(body.codDelivery) && zone === "IN"
  });

  const discountInPaise = 0;
  const taxInPaise = 0;
  const grandTotalInPaise = subtotalMinor - discountInPaise + shippingInPaise + taxInPaise;
  const orderCurrency = currencyForZone(zone);

  if (grandTotalInPaise < 1) {
    const e = new Error("Invalid order total") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "INVALID_TOTAL";
    throw e;
  }

  await assertDelhiveryHeavyIndiaServiceable(body.country, body.postalCode, lines);
  await assertIndiaCheckoutServiceable(body.country, body.postalCode, lines, body.codDelivery);

  const orderNumber = await generateOrderNumber();
  const receipt = orderNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: userId,
        email: body.email.trim().toLowerCase(),
        phone: body.phone.trim(),
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        subtotalInPaise: subtotalMinor,
        discountInPaise,
        shippingInPaise,
        taxInPaise,
        grandTotalInPaise,
        currency: orderCurrency,
        shippingZone: zone
      }
    });

    for (const row of lines) {
      const v = row.variant;
      const p = v.productRel;
      const unit = unitMinor(v, zone);
      const lineTotal = unit * row.quantity;
      const nameSnap = labelFromVariant(v.attributeValues)
        ? `${p.name} (${labelFromVariant(v.attributeValues)})`
        : p.name;

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: v.id,
          skuSnapshot: v.sku,
          nameSnapshot: nameSnap,
          qtyOrdered: row.quantity,
          unitPriceInPaise: unit,
          discountInPaise: 0,
          taxInPaise: 0,
          lineTotalInPaise: lineTotal
        }
      });
    }

    await tx.orderAddress.create({
      data: {
        orderId: order.id,
        type: "SHIPPING",
        fullName: body.shippingFullName.trim(),
        phone: body.phone.trim(),
        line1: body.line1.trim(),
        line2: body.line2?.trim() || null,
        city: body.city.trim(),
        state: body.state.trim(),
        postalCode: body.postalCode.trim(),
        country: (body.country ?? "IN").toUpperCase()
      }
    });

    await tx.orderAddress.create({
      data: {
        orderId: order.id,
        type: "BILLING",
        fullName: body.shippingFullName.trim(),
        phone: body.phone.trim(),
        line1: body.line1.trim(),
        line2: body.line2?.trim() || null,
        city: body.city.trim(),
        state: body.state.trim(),
        postalCode: body.postalCode.trim(),
        country: (body.country ?? "IN").toUpperCase()
      }
    });

    await reserveStockTx(tx, order.id);

    const paymentMethod =
      body.paymentMethod ?? (zone === "IN" ? "razorpay" : "stripe");

    const useCod =
      paymentMethod === "cod" &&
      zone === "IN" &&
      triStateEnv(process.env.ENABLE_COD_CHECKOUT, true);

    const useStripe = paymentMethod === "stripe" && zone !== "IN";
    const usePayPal = paymentMethod === "paypal" && zone !== "IN";

    if (useCod) {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "COD",
          amountInPaise: grandTotalInPaise,
          currency: orderCurrency,
          status: "PENDING",
          rawPayload: { cod: true, placedAt: new Date().toISOString() } as object
        }
      });

      await confirmStockTx(tx, order.id);

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paymentStatus: "PENDING",
          placedAt: new Date()
        }
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "PAID",
          reason: "COD order placed"
        }
      });

      await tx.invoice.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          invoiceNo: invoiceNumberForOrder(orderNumber)
        },
        update: {}
      });

      return { order, payment, cod: true as const };
    }

    if (useStripe) {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "STRIPE",
          amountInPaise: grandTotalInPaise,
          currency: orderCurrency,
          status: "PENDING",
          rawPayload: { method: "stripe_checkout", createdAt: new Date().toISOString() } as object
        }
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: "PENDING_PAYMENT",
          reason: "Order created — awaiting Stripe"
        }
      });
      return { order, payment, stripe: true as const };
    }

    if (usePayPal) {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "PAYPAL",
          amountInPaise: grandTotalInPaise,
          currency: orderCurrency,
          status: "PENDING",
          rawPayload: { method: "paypal", createdAt: new Date().toISOString() } as object
        }
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: "PENDING_PAYMENT",
          reason: "Order created — awaiting PayPal"
        }
      });
      return { order, payment, paypal: true as const };
    }

    const rzpIdempotencyKey = `${order.id}:${Date.now()}`;
    const rzp = await createOrder({
      amountInMinorUnits: grandTotalInPaise,
      currency: orderCurrency,
      receipt,
      notes: {
        order_id: order.id,
        order_number: orderNumber
      },
      idempotencyKey: rzpIdempotencyKey
    });

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "RAZORPAY",
        providerOrderId: rzp.id,
        amountInPaise: grandTotalInPaise,
        currency: orderCurrency,
        status: "PENDING",
        rawPayload: { created: true, idempotencyKey: rzpIdempotencyKey } as object
      }
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: "PENDING_PAYMENT",
        reason: "Order created"
      }
    });

    return { order, payment, rzpOrderId: rzp.id, cod: false as const };
  });

  if ("cod" in result && result.cod) {
    if (userId) {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (cart) {
        await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      }
    }
    notifyOrderEmail(result.order.id, "order_confirmed");
    logger.info("checkout_cod_order_created", {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber
    });
    const codPayload: CreateCheckoutResult = {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      amountInPaise: grandTotalInPaise,
      currency: orderCurrency,
      paymentMethod: "cod",
      paymentProvider: "COD",
      paymentId: result.payment.id,
      codConfirmed: true
    };
    if (idemHeader) {
      await setIdempotentCheckout(idemHeader, codPayload);
    }
    return codPayload;
  }

  if ("stripe" in result && result.stripe) {
    const session = await createStripeCheckoutSession({
      paymentId: result.payment.id,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      email: body.email.trim().toLowerCase(),
      amountMinor: grandTotalInPaise,
      currency: orderCurrency
    });
    await schedulePaymentTimeout(result.order.id);
    const stripePayload: CreateCheckoutResult = {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      amountInPaise: grandTotalInPaise,
      currency: orderCurrency,
      paymentMethod: "stripe",
      paymentProvider: "STRIPE",
      paymentId: result.payment.id,
      stripeCheckoutUrl: session.url
    };
    if (idemHeader) await setIdempotentCheckout(idemHeader, stripePayload);
    return stripePayload;
  }

  if ("paypal" in result && result.paypal) {
    const pp = await createPayPalOrder({
      paymentId: result.payment.id,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      amountMinor: grandTotalInPaise,
      currency: orderCurrency
    });
    await schedulePaymentTimeout(result.order.id);
    const paypalPayload: CreateCheckoutResult = {
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      amountInPaise: grandTotalInPaise,
      currency: orderCurrency,
      paymentMethod: "paypal",
      paymentProvider: "PAYPAL",
      paymentId: result.payment.id,
      paypalApprovalUrl: pp.approvalUrl
    };
    if (idemHeader) await setIdempotentCheckout(idemHeader, paypalPayload);
    return paypalPayload;
  }

  await schedulePaymentTimeout(result.order.id);

  logger.info("checkout_order_created", {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber
  });

  const payload: CreateCheckoutResult = {
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    amountInPaise: grandTotalInPaise,
    currency: orderCurrency,
    paymentMethod: "razorpay",
    paymentProvider: "RAZORPAY",
    razorpayKeyId: getRazorpayKeyId(),
    rzpOrderId: result.rzpOrderId,
    paymentId: result.payment.id
  };

  if (idemHeader) {
    await setIdempotentCheckout(idemHeader, payload);
  }

  return payload;
}

/** Resume Razorpay checkout for an unpaid order (same order, no duplicate cart clear). */
export async function resumePendingCheckout(orderNumber: string, email: string): Promise<CreateCheckoutResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: { orderNumber, deletedAt: null },
    include: {
      payments: {
        where: { provider: "RAZORPAY" },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!order || order.email !== normalizedEmail) {
    const e = new Error("Order not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  if (order.status !== "PENDING_PAYMENT") {
    const e = new Error("This order is no longer awaiting payment") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "ORDER_NOT_PAYABLE";
    throw e;
  }

  const payment = order.payments[0];
  if (!payment?.providerOrderId) {
    const e = new Error("Payment session not found for this order") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "PAYMENT_NOT_FOUND";
    throw e;
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountInPaise: order.grandTotalInPaise,
    currency: order.currency,
    paymentMethod: "razorpay",
    razorpayKeyId: getRazorpayKeyId(),
    rzpOrderId: payment.providerOrderId,
    paymentId: payment.id
  };
}
