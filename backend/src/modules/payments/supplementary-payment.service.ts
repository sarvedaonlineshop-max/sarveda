import type { PaymentProvider } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { gstFromInclusiveLine, lookupGstRate } from "../../utils/gst";
import { postOrderSupplementaryPaid } from "../accounting/order-supplementary-paid-posting.service";
import type { SupplementaryPaidSpec } from "../accounting/order-supplementary-paid-journal.builder";
import { getCancellationEligibility } from "../orders/cancellation-eligibility";
import {
  applyAdjustmentMutation,
  loadAdjustmentExecutionPreview
} from "../orders/order-adjustment.service";
import type { AdjustmentPayload } from "../orders/order-adjustment.types";
import { pickCapturedPaymentForRefund } from "./payment-selection";
import { createOrder as createRazorpayOrder, getRazorpayKeyId, verifyPayment } from "./razorpay";
import { getPayPalAccessToken, getPayPalApiBase } from "./paypal";

export type SupplementaryPaymentSession = {
  supplementaryPaymentId: string;
  amountInPaise: number;
  provider: PaymentProvider;
  /** Razorpay */
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  /** Stripe */
  stripeCheckoutUrl?: string;
  /** PayPal */
  paypalApprovalUrl?: string;
  paypalOrderId?: string;
};

function siteUrl(): string {
  const u = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",")[0]?.trim();
  return (u ?? "http://localhost:3000").replace(/\/$/, "");
}

async function createSupplementaryPayPalOrder(input: {
  supplementaryPaymentId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  amountMinor: number;
  currency: string;
}): Promise<{ approvalUrl: string; paypalOrderId: string }> {
  const token = await getPayPalAccessToken();
  const currency = input.currency.toUpperCase();
  const value = (input.amountMinor / 100).toFixed(2);
  const res = await fetch(`${getPayPalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.orderId,
          custom_id: input.supplementaryPaymentId,
          description: `Sarveda adjustment ${input.orderNumber}`,
          amount: { currency_code: currency, value }
        }
      ],
      application_context: {
        brand_name: "Sarveda",
        user_action: "PAY_NOW",
        return_url: `${siteUrl()}/profile/orders/${encodeURIComponent(input.orderNumber)}/adjust?supplementary=success`,
        cancel_url: `${siteUrl()}/profile/orders/${encodeURIComponent(input.orderNumber)}/adjust?supplementary=cancel`
      }
    })
  });
  const raw = (await res.json()) as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
    message?: string;
  };
  if (!res.ok || !raw.id) {
    throw new Error(raw.message ?? "Could not create PayPal order");
  }
  const approve = raw.links?.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal approval URL missing");
  return { approvalUrl: approve, paypalOrderId: raw.id };
}

async function createSupplementaryStripeSession(input: {
  supplementaryPaymentId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  amountMinor: number;
  currency: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}): Promise<{ url: string; sessionId: string }> {
  const Stripe = (await import("stripe")).default;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  const currency = input.currency.toLowerCase();
  const email = input.email.trim().toLowerCase();
  const addr = input.shippingAddress;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    success_url: `${siteUrl()}/profile/orders/${encodeURIComponent(input.orderNumber)}/adjust?supplementary=success`,
    cancel_url: `${siteUrl()}/profile/orders/${encodeURIComponent(input.orderNumber)}/adjust?supplementary=cancel`,
    client_reference_id: input.orderId,
    metadata: {
      sarveda_supplementary_payment_id: input.supplementaryPaymentId,
      adjustment_supplementary: "1",
      order_id: input.orderId,
      order_number: input.orderNumber
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: input.amountMinor,
          product_data: {
            name: `Additional payment — order ${input.orderNumber}`
          }
        }
      }
    ]
  });

  if (!session.url || !session.id) {
    throw new Error("Could not start Stripe checkout");
  }
  return { url: session.url, sessionId: session.id };
}

async function loadAdjustmentForSupplementaryPayment(requestId: string, orderId: string) {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: requestId, orderId, type: "ADJUST_BEFORE_DELIVERY" },
    include: {
      order: {
        include: {
          items: true,
          addresses: true,
          shipments: { select: { status: true } },
          payments: { orderBy: { createdAt: "desc" } }
        }
      }
    }
  });

  if (!request) {
    throw Object.assign(new Error("Adjustment request not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const preview = await loadAdjustmentExecutionPreview(request.id);
  if (!preview || preview.classification !== "ADDITIONAL_PAYMENT_REQUIRED" || preview.deltaPaise <= 0) {
    throw Object.assign(new Error("This adjustment does not require additional payment"), {
      statusCode: 409,
      code: "NOT_ADDITIONAL_PAYMENT"
    });
  }

  if (request.executionStatus === "EXECUTED") {
    throw Object.assign(new Error("Adjustment already executed"), { statusCode: 409, code: "ALREADY_EXECUTED" });
  }

  const eligibility = getCancellationEligibility({
    status: request.order.status,
    paymentStatus: request.order.paymentStatus,
    payments: request.order.payments,
    shipments: request.order.shipments
  });

  if (!eligibility.adminCanApproveCancel) {
    throw Object.assign(new Error("Order dispatched — supplementary payment blocked"), {
      statusCode: 409,
      code: "BLOCKED_AFTER_DISPATCH"
    });
  }

  const pick = pickCapturedPaymentForRefund(request.order.payments);
  if (!pick.ok) {
    throw Object.assign(new Error(pick.message), {
      statusCode: pick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED" ? 409 : 400,
      code: pick.code
    });
  }

  if (pick.payment.provider === "COD") {
    throw Object.assign(
      new Error("COD orders require manual collection for additional payment"),
      { statusCode: 409, code: "ADDITIONAL_PAYMENT_MANUAL_REVIEW" }
    );
  }

  return { request, preview, provider: pick.payment.provider, order: request.order };
}

function buildSupplementaryPaidSpec(opts: {
  orderId: string;
  orderNumber: string;
  currency: string;
  provider: PaymentProvider;
  supplementaryPaymentId: string;
  sourceId: string;
  amountInPaise: number;
  orderItemId?: string;
  taxClass?: string | null;
}): SupplementaryPaidSpec {
  const isGstApplicable = opts.currency === "INR";
  let merchandiseTaxablePaise = opts.amountInPaise;
  let merchandiseGstPaise = 0;

  if (isGstApplicable) {
    const rate = lookupGstRate(opts.taxClass).ratePercent;
    const extracted = gstFromInclusiveLine(opts.amountInPaise, rate);
    merchandiseTaxablePaise = extracted.taxableMinor;
    merchandiseGstPaise = extracted.taxMinor;
    const drift = opts.amountInPaise - (merchandiseTaxablePaise + merchandiseGstPaise);
    if (Math.abs(drift) > 2) {
      merchandiseTaxablePaise += drift;
    }
  }

  return {
    orderId: opts.orderId,
    orderNumber: opts.orderNumber,
    currency: opts.currency,
    provider: opts.provider,
    supplementaryPaymentId: opts.supplementaryPaymentId,
    sourceId: opts.sourceId,
    totalAmountPaise: opts.amountInPaise,
    merchandiseTaxablePaise,
    merchandiseGstPaise,
    interState: false,
    isGstApplicable,
    accountingDate: new Date()
  };
}

/** Create or resume gateway session for adjustment additional payment. Idempotent on requestId. */
export async function createSupplementaryPaymentSession(opts: {
  orderId: string;
  requestId: string;
}): Promise<SupplementaryPaymentSession> {
  const { request, preview, provider, order } = await loadAdjustmentForSupplementaryPayment(
    opts.requestId,
    opts.orderId
  );

  const amountInPaise = preview.deltaPaise;
  const payload = request.adjustmentPayload as AdjustmentPayload | null;
  const orderItemId = payload?.before.line?.orderItemId;
  const item = order.items.find((i) => i.id === orderItemId);

  let row = await prisma.orderSupplementaryPayment.findUnique({
    where: { sourceId: opts.requestId }
  });

  if (row?.status === "CAPTURED") {
    throw Object.assign(new Error("Additional payment already captured"), {
      statusCode: 409,
      code: "ALREADY_CAPTURED"
    });
  }

  if (!row) {
    row = await prisma.orderSupplementaryPayment.create({
      data: {
        orderId: opts.orderId,
        purpose: "ORDER_ADJUSTMENT",
        sourceId: opts.requestId,
        amountInPaise,
        provider,
        status: "PENDING"
      }
    });
  } else if (row.amountInPaise !== amountInPaise) {
    throw Object.assign(new Error("Payment amount changed — reload preview"), {
      statusCode: 409,
      code: "AMOUNT_MISMATCH"
    });
  }

  await prisma.orderServiceRequest.update({
    where: { id: opts.requestId },
    data: { executionStatus: "PAYMENT_PENDING" }
  });

  if (provider === "RAZORPAY") {
    const idempotencyKey = `supplementary:${row.id}`;
    const rzp = await createRazorpayOrder({
      amountInMinorUnits: amountInPaise,
      currency: order.currency,
      receipt: `SUP-${order.orderNumber}`.slice(0, 40),
      notes: {
        sarveda_order_id: order.id,
        supplementary_payment_id: row.id,
        adjustment_request_id: opts.requestId
      },
      idempotencyKey
    });
    await prisma.orderSupplementaryPayment.update({
      where: { id: row.id },
      data: { providerOrderId: rzp.id }
    });
    return {
      supplementaryPaymentId: row.id,
      amountInPaise,
      provider,
      razorpayOrderId: rzp.id,
      razorpayKeyId: getRazorpayKeyId()
    };
  }

  if (provider === "STRIPE") {
    const shipping = order.addresses.find((a) => a.type === "SHIPPING");
    if (!shipping) {
      throw Object.assign(new Error("Shipping address required for Stripe"), { statusCode: 400, code: "NO_ADDRESS" });
    }
    const session = await createSupplementaryStripeSession({
      supplementaryPaymentId: row.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      amountMinor: amountInPaise,
      currency: order.currency,
      shippingAddress: {
        fullName: shipping.fullName,
        phone: shipping.phone,
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city,
        state: shipping.state,
        postalCode: shipping.postalCode,
        country: shipping.country
      }
    });
    await prisma.orderSupplementaryPayment.update({
      where: { id: row.id },
      data: {
        providerOrderId: session.sessionId,
        rawPayload: { stripeSessionId: session.sessionId }
      }
    });
    return {
      supplementaryPaymentId: row.id,
      amountInPaise,
      provider,
      stripeCheckoutUrl: session.url
    };
  }

  if (provider === "PAYPAL") {
    const pp = await createSupplementaryPayPalOrder({
      supplementaryPaymentId: row.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      email: order.email,
      amountMinor: amountInPaise,
      currency: order.currency
    });
    await prisma.orderSupplementaryPayment.update({
      where: { id: row.id },
      data: {
        providerOrderId: pp.paypalOrderId,
        rawPayload: { paypalOrderId: pp.paypalOrderId }
      }
    });
    return {
      supplementaryPaymentId: row.id,
      amountInPaise,
      provider,
      paypalApprovalUrl: pp.approvalUrl,
      paypalOrderId: pp.paypalOrderId
    };
  }

  throw Object.assign(new Error(`Supplementary payment not supported for ${provider}`), {
    statusCode: 400,
    code: "UNSUPPORTED_PROVIDER"
  });
}

async function executeAdjustmentAfterSupplementaryCapture(opts: {
  requestId: string;
  orderId: string;
  supplementaryPaymentId: string;
  adminEmail?: string;
  adminUserId?: string;
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId },
    include: { order: { include: { items: true } } }
  });
  if (!request || request.executionStatus === "EXECUTED") return;

  const payload = request.adjustmentPayload as AdjustmentPayload | null;
  if (!payload) throw new Error("Missing adjustment payload");

  const preview = await loadAdjustmentExecutionPreview(request.id);
  if (!preview) throw new Error("Preview unavailable");

  const sourceId = request.executionSourceId ?? request.id;

  await applyAdjustmentMutation({
    requestId: request.id,
    orderId: opts.orderId,
    payload,
    sourceId,
    adminEmail: opts.adminEmail ?? "customer@supplementary-payment",
    adminUserId: opts.adminUserId,
    preview,
    executionStatus: "EXECUTED"
  });

  logger.info("adjustment_executed_after_supplementary_payment", {
    orderId: opts.orderId,
    requestId: opts.requestId,
    supplementaryPaymentId: opts.supplementaryPaymentId
  });
}

/** Idempotent Razorpay supplementary capture + adjustment execution. */
export async function verifyRazorpaySupplementaryPayment(opts: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<{ orderNumber: string; executed: boolean }> {
  verifyPayment(opts.razorpayOrderId, opts.razorpayPaymentId, opts.signature);

  const row = await prisma.orderSupplementaryPayment.findFirst({
    where: { providerOrderId: opts.razorpayOrderId, provider: "RAZORPAY" },
    include: { order: { include: { items: true } } }
  });

  if (!row) {
    throw Object.assign(new Error("Supplementary payment not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  if (row.status === "CAPTURED" && row.providerPaymentId === opts.razorpayPaymentId) {
    return { orderNumber: row.order.orderNumber, executed: row.order.id !== undefined };
  }

  const existingCapture = await prisma.orderSupplementaryPayment.findFirst({
    where: { providerPaymentId: opts.razorpayPaymentId, status: "CAPTURED" }
  });
  if (existingCapture) {
    return { orderNumber: row.order.orderNumber, executed: true };
  }

  await prisma.orderSupplementaryPayment.update({
    where: { id: row.id },
    data: {
      status: "CAPTURED",
      providerPaymentId: opts.razorpayPaymentId,
      capturedAt: new Date()
    }
  });

  await prisma.orderServiceRequest.update({
    where: { id: row.sourceId },
    data: { executionStatus: "PAYMENT_CAPTURED" }
  });

  const payload = (await prisma.orderServiceRequest.findUnique({
    where: { id: row.sourceId }
  }))?.adjustmentPayload as AdjustmentPayload | null;
  const orderItemId = payload?.before.line?.orderItemId;
  const item = row.order.items.find((i) => i.id === orderItemId);

  try {
    await postOrderSupplementaryPaid(
      buildSupplementaryPaidSpec({
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        currency: row.order.currency,
        provider: "RAZORPAY",
        supplementaryPaymentId: row.id,
        sourceId: row.sourceId,
        amountInPaise: row.amountInPaise,
        orderItemId,
        taxClass: null
      })
    );
  } catch (err) {
    logger.error("supplementary_accounting_failed", {
      supplementaryPaymentId: row.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  await executeAdjustmentAfterSupplementaryCapture({
    requestId: row.sourceId,
    orderId: row.orderId,
    supplementaryPaymentId: row.id
  });

  notifyOrderEmail(row.orderId, "order_confirmed");

  return { orderNumber: row.order.orderNumber, executed: true };
}

/** Mark Stripe supplementary payment captured (called from webhook or admin reconcile). */
export async function captureStripeSupplementaryPayment(opts: {
  stripeSessionId: string;
  stripePaymentIntentId: string;
}): Promise<void> {
  const row = await prisma.orderSupplementaryPayment.findFirst({
    where: { providerOrderId: opts.stripeSessionId, provider: "STRIPE" },
    include: { order: { include: { items: true } } }
  });
  if (!row) return;
  if (row.status === "CAPTURED") return;

  await prisma.orderSupplementaryPayment.update({
    where: { id: row.id },
    data: {
      status: "CAPTURED",
      providerPaymentId: opts.stripePaymentIntentId,
      capturedAt: new Date()
    }
  });

  await postOrderSupplementaryPaid(
    buildSupplementaryPaidSpec({
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      currency: row.order.currency,
      provider: "STRIPE",
      supplementaryPaymentId: row.id,
      sourceId: row.sourceId,
      amountInPaise: row.amountInPaise
    })
  ).catch((err) => {
    logger.error("supplementary_stripe_accounting_failed", { id: row.id, err });
  });

  await executeAdjustmentAfterSupplementaryCapture({
    requestId: row.sourceId,
    orderId: row.orderId,
    supplementaryPaymentId: row.id
  });
}

/** Admin: initiate supplementary payment session for an adjustment request. */
export async function adminInitiateSupplementaryPayment(opts: {
  orderId: string;
  requestId: string;
}): Promise<SupplementaryPaymentSession> {
  return createSupplementaryPaymentSession(opts);
}
