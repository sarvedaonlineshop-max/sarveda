import type { ProductVariant } from "@prisma/client";
import type { Request } from "express";

import { getRedisConnection } from "../../config/redisConnection";
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { schedulePaymentTimeout } from "../../jobs/paymentTimeoutJob";
import { generateOrderNumber, isOrderNumberUniqueViolation } from "../../utils/orderNumber";
import { reportingNetSalesInrPaiseFromOrder } from "../../utils/money";
import { createPayPalOrder } from "../payments/paypal";
import { createOrder, getRazorpayKeyId } from "../payments/razorpay";
import {
  createStripeCheckoutSession,
  type StripeCheckoutAddress
} from "../payments/stripe.checkout";
import { confirmStockTx, reserveStockTx, cancelUnpaidOrderWithRelease } from "../orders/orders.service";
import { afterOrderPaid } from "../orders/afterPaid";
import {
  assertFulfillmentAllowed,
  variantFulfillmentInputFromVariant
} from "../inventory/variant-fulfillment-availability";
import { invoiceNumberForOrder } from "../../utils/invoice";
import { getCartPayload, resolveCartContext } from "../cart/cart.service";
import {
  assertAccountCouponAvailable,
  couponError,
  couponUserMessage,
  resolveCartCouponDiscount
} from "../coupons/coupon.service";
import {
  computeVariantShippingTotal,
  currencyForZone,
  zoneFromCountry
} from "../shipping/shippingRates.service";
import { isZoneAPincode } from "../shipping/router";
import * as delhivery from "../shipping/delhivery";
import * as shiprocket from "../shipping/shiprocket";
import { shippingEnv } from "../../config/env";
import { unitMinorForZone } from "../../utils/variantPricing";
import { isDigitalCartLine, isDigitalOnlyCart } from "../../utils/digitalCart";
import { priceForDigitalOffer } from "../../utils/digital-checkout-offer";
import { createOrderAttributionInTx } from "../attribution/persist";
import type { CreateOrderBody } from "./schemas";

function triStateEnv(envVal: string | undefined, defaultWhenUnset: boolean): boolean {
  const v = (envVal ?? "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(v)) return true;
  if (["0", "false", "no"].includes(v)) return false;
  return defaultWhenUnset;
}

function composeOrderNotes(
  body: CreateOrderBody,
  shiprocketPinCheckFallback?: boolean
): string | undefined {
  const parts: string[] = [];
  if (body.giftWrap) parts.push("[GIFT_WRAP] Customer requested gift wrapping.");
  if (body.customerNotes?.trim()) parts.push(`Customer note: ${body.customerNotes.trim()}`);
  if (shiprocketPinCheckFallback) {
    parts.push(
      "Shiprocket PIN check skipped (API fallback) — verify delivery manually before dispatch."
    );
  }
  return parts.length ? parts.join("\n") : undefined;
}

function stripeAddressFromCheckoutBody(body: CreateOrderBody): StripeCheckoutAddress {
  return {
    email: body.email.trim().toLowerCase(),
    fullName: body.shippingFullName.trim(),
    phone: body.phone.trim(),
    line1: body.line1.trim(),
    line2: body.line2?.trim() || null,
    city: body.city.trim(),
    state: body.state.trim(),
    postalCode: body.postalCode.trim(),
    country: (body.country ?? "IN").toUpperCase()
  };
}

function stripeAddressFromOrder(
  email: string,
  addresses: Array<{
    type: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>
): StripeCheckoutAddress {
  const ship = addresses.find((a) => a.type === "SHIPPING") ?? addresses[0];
  if (!ship) {
    const e = new Error("Shipping address not found for this order") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "ADDRESS_NOT_FOUND";
    throw e;
  }
  return {
    email,
    fullName: ship.fullName,
    phone: ship.phone,
    line1: ship.line1,
    line2: ship.line2,
    city: ship.city,
    state: ship.state,
    postalCode: ship.postalCode,
    country: ship.country
  };
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
): Promise<boolean> {
  if ((country ?? "IN").toUpperCase() !== "IN") return false;

  const pin = postalCode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return false;

  const useDelhivery =
    (process.env.DEFAULT_DOMESTIC_COURIER ?? "delhivery").trim().toLowerCase() !== "shiprocket" &&
    Boolean(shippingEnv.DELHIVERY_API_KEY.trim());

  if (useDelhivery) {
    const r = await delhivery.checkPincodeServiceability(pin);
    if (!r.success) {
      if (r.code === "DELHIVERY_NOT_CONFIGURED") {
        return assertIndiaShiprocketCheckoutServiceable(country, postalCode, lines, codDelivery);
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
    return false;
  }

  return assertIndiaShiprocketCheckoutServiceable(country, postalCode, lines, codDelivery);
}

/** Block unpaid checkout if Shiprocket has no courier for warehouse→PIN (when enabled in env). */
async function assertIndiaShiprocketCheckoutServiceable(
  country: string | undefined,
  postalCode: string,
  lines: Array<{ quantity: number; variant: ProductVariant }>,
  codDelivery: boolean | undefined
): Promise<boolean> {
  if (!shippingEnv.INDIA_REQUIRE_SHIPROCKET_SERVICEABILITY) return false;
  if ((country ?? "IN").toUpperCase() !== "IN") return false;

  const pin = postalCode.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return false;

  let grams = 0;
  for (const row of lines) {
    grams += (row.variant.weightGrams ?? 500) * row.quantity;
  }
  grams = Math.max(grams, 1);
  const weightKg = Math.max(0.05, grams / 1000);

  const serviceabilityResult = await shiprocket.checkIndiaCourierServiceabilityWithFallback({
    deliveryPincode: pin,
    weightKg,
    cod: Boolean(codDelivery)
  });

  if (serviceabilityResult.source === "fallback") {
    logger.warn("checkout_shiprocket_fallback_used", { pin: postalCode });
    return true;
  }

  if (!serviceabilityResult.serviceable) {
    const e = new Error(
      "Delivery is not available from our warehouse to this PIN for your cart size and options. Try another PIN or contact support."
    ) as Error & { statusCode?: number; code?: string; userMessage?: string };
    e.statusCode = 400;
    e.code = "PIN_NOT_SERVICEABLE_SHIPROCKET";
    e.userMessage = e.message;
    throw e;
  }

  return false;
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

function idempotencyCacheKey(idemKey: string, body: CreateOrderBody): string {
  const country = (body.country ?? "IN").toUpperCase();
  const method = body.paymentMethod ?? (country === "IN" ? "razorpay" : "stripe");
  return `checkout:idem:${idemKey}:${country}:${method}`;
}

async function getIdempotentCheckout(
  idemKey: string,
  body: CreateOrderBody
): Promise<CreateCheckoutResult | null> {
  const redis = getRedisConnection();
  if (!redis) return null;
  const v = await redis.get(idempotencyCacheKey(idemKey, body));
  if (!v) return null;
  try {
    return JSON.parse(v) as CreateCheckoutResult;
  } catch {
    return null;
  }
}

async function setIdempotentCheckout(
  idemKey: string,
  body: CreateOrderBody,
  payload: CreateCheckoutResult
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;
  await redis.set(idempotencyCacheKey(idemKey, body), JSON.stringify(payload), "EX", IDEM_TTL_SEC);
}

export async function createCheckoutOrder(req: Request, body: CreateOrderBody): Promise<CreateCheckoutResult> {
  const idemHeader =
    typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].trim() : "";

  if (idemHeader) {
    const cached = await getIdempotentCheckout(idemHeader, body);
    if (cached) {
      logger.info("checkout_idempotent_hit", {
        idempotencyKey: idemHeader,
        orderId: cached.orderId,
        paymentMethod: cached.paymentMethod
      });
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

  const cartCouponRow = await prisma.cart.findUnique({
    where: { id: cartId },
    select: { couponCode: true }
  });

  const cartData = await getCartPayload(cartId, body.country ?? "IN", {
    userId: userId ?? null
  });

  if (cartData.couponRejected) {
    throw couponError(
      `${cartData.couponRejected.code}: ${cartData.couponRejected.message}`,
      "COUPON_REJECTED"
    );
  }

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
      },
      digitalOffer: true
    }
  });

  if (lines.length === 0) {
    const e = new Error("Cart is empty") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "EMPTY_CART";
    throw e;
  }

  for (const row of lines) {
    if (isDigitalCartLine(row)) continue;
    if (!row.variant) {
      const e = new Error("Cart has an invalid product line") as Error & {
        statusCode: number;
        code: string;
      };
      e.statusCode = 400;
      e.code = "INVALID_CART_LINE";
      throw e;
    }
    assertFulfillmentAllowed(variantFulfillmentInputFromVariant(row.variant), row.quantity);
  }

  let subtotalMinor = 0;
  for (const row of lines) {
    if (row.digitalOffer) {
      subtotalMinor += priceForDigitalOffer(row.digitalOffer, zone) * row.quantity;
      continue;
    }
    if (!row.variant) continue;
    const u = unitMinorForZone(row.variant, zone);
    subtotalMinor += u * row.quantity;
  }

  const productLines = lines.filter(
    (row): row is typeof row & { variant: NonNullable<(typeof row)["variant"]>; variantId: string } =>
      Boolean(row.variantId && row.variant)
  );
  const shippingLines = productLines.map((row) => ({
    variantId: row.variantId,
    quantity: row.quantity
  }));
  const digitalOnly = isDigitalOnlyCart(lines);
  const shippingInPaise = digitalOnly
    ? 0
    : await computeVariantShippingTotal(prisma, shippingLines, body.country ?? "IN", {
        cod: Boolean(body.codDelivery) && zone === "IN"
      });

  let discountInPaise = 0;
  let appliedCoupon: Awaited<ReturnType<typeof resolveCartCouponDiscount>>["coupon"] = null;
  const pendingCouponCode = cartCouponRow?.couponCode ?? cartData.coupon?.code ?? null;

  if (pendingCouponCode) {
    if (!userId) {
      throw couponError(
        "Sign in to your Sarveda account to use coupon codes.",
        "COUPON_LOGIN_REQUIRED"
      );
    }
    try {
      await assertAccountCouponAvailable(pendingCouponCode, userId);
      const resolved = await resolveCartCouponDiscount(subtotalMinor, pendingCouponCode, {
        userId
      });
      discountInPaise = resolved.discountInPaise;
      appliedCoupon = resolved.coupon;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        throw err;
      }
      throw couponError(
        `${pendingCouponCode}: ${couponUserMessage(err, "This coupon cannot be used on this order.")}`,
        "COUPON_REJECTED"
      );
    }
  }
  const taxInPaise = 0;
  const grandTotalInPaise = subtotalMinor - discountInPaise + shippingInPaise + taxInPaise;
  const orderCurrency = currencyForZone(zone);

  if (grandTotalInPaise < 1) {
    const e = new Error("Invalid order total") as Error & { statusCode: number; code: string };
    e.statusCode = 400;
    e.code = "INVALID_TOTAL";
    throw e;
  }

  const paymentMethod = body.paymentMethod ?? (zone === "IN" ? "razorpay" : "stripe");
  if (digitalOnly && (paymentMethod === "cod" || body.codDelivery)) {
    const e = new Error("Cash on delivery is not available for courses and events") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "COD_NOT_FOR_DIGITAL";
    throw e;
  }

  let shiprocketPinCheckFallback = false;
  if (!digitalOnly) {
    await assertDelhiveryHeavyIndiaServiceable(body.country, body.postalCode, productLines);
    shiprocketPinCheckFallback = await assertIndiaCheckoutServiceable(
      body.country,
      body.postalCode,
      productLines,
      body.codDelivery
    );
  }

  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
  const existingPendingOrder = await prisma.order.findFirst({
    where: userId
      ? {
          customerId: userId,
          status: "PENDING_PAYMENT",
          deletedAt: null,
          createdAt: { gte: twentyMinAgo }
        }
      : {
          customerId: null,
          email: body.email.trim().toLowerCase(),
          status: "PENDING_PAYMENT",
          deletedAt: null,
          createdAt: { gte: twentyMinAgo }
        },
    orderBy: { createdAt: "desc" }
  });

  if (existingPendingOrder) {
    await cancelUnpaidOrderWithRelease(
      existingPendingOrder.id,
      "Superseded by new checkout attempt"
    );
    logger.info("checkout_cancelled_stale_pending", { oldOrderId: existingPendingOrder.id });
  }

  let result:
    | { order: { id: string; orderNumber: string }; payment: { id: string }; cod: true }
    | { order: { id: string; orderNumber: string }; payment: { id: string }; stripe: true }
    | { order: { id: string; orderNumber: string }; payment: { id: string }; paypal: true }
    | {
        order: { id: string; orderNumber: string };
        payment: { id: string };
        rzpOrderId: string;
        cod: false;
      };

  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = await generateOrderNumber();
    const receipt = orderNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);

    try {
      result = await prisma.$transaction(async (tx) => {
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
        shippingZone: zone,
        couponCode: appliedCoupon?.code ?? null,
        reportingTotalInInrPaise: reportingNetSalesInrPaiseFromOrder(
          orderCurrency,
          grandTotalInPaise,
          shippingInPaise,
          taxInPaise
        ),
        ...((): { notes?: string } => {
          const notes = composeOrderNotes(body, shiprocketPinCheckFallback);
          return notes ? { notes } : {};
        })()
      }
    });

    const uaHeader = req.headers["user-agent"];
    const userAgent = typeof uaHeader === "string" ? uaHeader : Array.isArray(uaHeader) ? uaHeader[0] : null;
    await createOrderAttributionInTx(tx, order.id, body.attribution, userAgent);

    for (const row of lines) {
      if (row.digitalOfferId && row.digitalOffer) {
        const offer = row.digitalOffer;
        const unit = priceForDigitalOffer(offer, zone);
        const lineTotal = unit * row.quantity;
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            variantId: null,
            digitalOfferId: offer.id,
            skuSnapshot: offer.sku,
            nameSnapshot: offer.title,
            qtyOrdered: row.quantity,
            warehouseFulfillmentQty: 0,
            dropShipFulfillmentQty: 0,
            unitPriceInPaise: unit,
            discountInPaise: 0,
            taxInPaise: 0,
            lineTotalInPaise: lineTotal
          }
        });
        continue;
      }

      const v = row.variant!;
      const p = v.productRel;
      const unit = unitMinorForZone(v, zone);
      const lineTotal = unit * row.quantity;
      const nameSnap = labelFromVariant(v.attributeValues)
        ? `${p.name} (${labelFromVariant(v.attributeValues)})`
        : p.name;

      const allocation = assertFulfillmentAllowed(
        variantFulfillmentInputFromVariant(v),
        row.quantity
      );

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: v.id,
          skuSnapshot: v.sku,
          nameSnapshot: nameSnap,
          qtyOrdered: row.quantity,
          warehouseFulfillmentQty: allocation.warehouseFulfillmentQty,
          dropShipFulfillmentQty: allocation.dropShipFulfillmentQty,
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

    // BUG 8: hard block COD outside India even if soft zone checks fail
    if (paymentMethod === "cod" && zone !== "IN") {
      const e = new Error("Cash on Delivery is only available for Indian addresses.") as Error & {
        statusCode: number;
        code: string;
      };
      e.statusCode = 400;
      e.code = "COD_NOT_ALLOWED";
      throw e;
    }

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
      // Safety B: monitor COD orders in server logs
      console.info("[COD_ORDER_CREATED]", {
        orderId: order.id,
        zone,
        total: grandTotalInPaise
      });

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
      break;
    } catch (err: unknown) {
      if (!isOrderNumberUniqueViolation(err) || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }

  if (!result!) {
    throw new Error("Failed to create checkout order after 3 attempts");
  }

  if ("cod" in result && result.cod) {
    await afterOrderPaid(result.order.id);
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
      await setIdempotentCheckout(idemHeader, body, codPayload);
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
      currency: orderCurrency,
      shippingAddress: stripeAddressFromCheckoutBody(body)
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
    if (idemHeader) await setIdempotentCheckout(idemHeader, body, stripePayload);
    return stripePayload;
  }

  if ("paypal" in result && result.paypal) {
    const pp = await createPayPalOrder({
      paymentId: result.payment.id,
      orderId: result.order.id,
      orderNumber: result.order.orderNumber,
      email: body.email.trim().toLowerCase(),
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
    if (idemHeader) await setIdempotentCheckout(idemHeader, body, paypalPayload);
    return paypalPayload;
  }

  if (!("rzpOrderId" in result)) {
    throw new Error("Unexpected checkout payment result");
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
    await setIdempotentCheckout(idemHeader, body, payload);
  }

  return payload;
}

/** Resume unpaid checkout for the same order (Razorpay / Stripe / PayPal). */
export async function resumePendingCheckout(
  orderNumber: string,
  email: string,
  snapshot?: { currency?: string; amountInPaise?: number }
): Promise<CreateCheckoutResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: { orderNumber, deletedAt: null },
    include: {
      addresses: true,
      payments: {
        where: { status: "PENDING" },
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

  // Optional commercial snapshot guard (frontend fingerprint hardening).
  if (snapshot?.currency) {
    const want = snapshot.currency.trim().toUpperCase();
    const have = (order.currency || "INR").toUpperCase();
    if (want && have !== want) {
      const e = new Error("Checkout currency changed — start a new payment") as Error & {
        statusCode: number;
        code: string;
      };
      e.statusCode = 409;
      e.code = "ORDER_SNAPSHOT_MISMATCH";
      throw e;
    }
  }
  if (snapshot?.amountInPaise != null && Number.isFinite(snapshot.amountInPaise)) {
    if (Math.round(snapshot.amountInPaise) !== order.grandTotalInPaise) {
      const e = new Error("Checkout total changed — start a new payment") as Error & {
        statusCode: number;
        code: string;
      };
      e.statusCode = 409;
      e.code = "ORDER_SNAPSHOT_MISMATCH";
      throw e;
    }
  }

  const payment = order.payments[0];
  if (!payment) {
    const e = new Error("Payment session not found for this order") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "PAYMENT_NOT_FOUND";
    throw e;
  }

  const base = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountInPaise: order.grandTotalInPaise,
    currency: order.currency,
    paymentId: payment.id
  };

  if (payment.provider === "STRIPE") {
    const session = await createStripeCheckoutSession({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: normalizedEmail,
      amountMinor: order.grandTotalInPaise,
      currency: order.currency,
      shippingAddress: stripeAddressFromOrder(normalizedEmail, order.addresses)
    });
    return {
      ...base,
      paymentMethod: "stripe",
      paymentProvider: "STRIPE",
      stripeCheckoutUrl: session.url
    };
  }

  if (payment.provider === "PAYPAL") {
    const pp = await createPayPalOrder({
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: normalizedEmail,
      amountMinor: order.grandTotalInPaise,
      currency: order.currency
    });
    return {
      ...base,
      paymentMethod: "paypal",
      paymentProvider: "PAYPAL",
      paypalApprovalUrl: pp.approvalUrl
    };
  }

  if (payment.provider !== "RAZORPAY" || !payment.providerOrderId) {
    const e = new Error("Payment session not found for this order") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "PAYMENT_NOT_FOUND";
    throw e;
  }

  return {
    ...base,
    paymentMethod: "razorpay",
    paymentProvider: "RAZORPAY",
    razorpayKeyId: getRazorpayKeyId(),
    rzpOrderId: payment.providerOrderId
  };
}
