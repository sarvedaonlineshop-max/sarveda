import crypto from "crypto";

import Razorpay from "razorpay";

import { logger } from "../../config/logger";

function getKeySecret(): string {
  const s = process.env.RAZORPAY_KEY_SECRET;
  if (!s) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED",
      userMessage: "Payments are temporarily unavailable. Please try again later."
    });
  }
  return s;
}

function getClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED",
      userMessage: "Payments are temporarily unavailable. Please try again later."
    });
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function getRazorpayKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED",
      userMessage: "Payments are temporarily unavailable. Please try again later."
    });
  }
  return keyId;
}

type RazorpayErrBody = {
  error?: {
    code?: string;
    description?: string;
    field?: string;
    source?: string;
    step?: string;
    reason?: string;
  };
};

function buildUserMessageFromDescription(desc: string, code: string): string {
  const d = desc.toLowerCase();
  if (d.includes("insufficient") && d.includes("fund")) {
    return "Insufficient funds. Please try another payment method.";
  }
  if (d.includes("declined") || d.includes("authentication failed") || d.includes("do not honour")) {
    return "Your card was declined. Please try another card.";
  }
  if (d.includes("timeout") || d.includes("timed out")) {
    return "Connection timeout. Your money is safe, please retry.";
  }
  if (code === "BAD_REQUEST_ERROR") {
    return desc || "We could not process this payment. Please check your details and try again.";
  }
  if (code === "GATEWAY_ERROR") {
    return "The payment gateway is temporarily unavailable. Please try again in a few minutes.";
  }
  if (code === "SERVER_ERROR") {
    return "Something went wrong on our side. Please retry in a moment.";
  }
  return "Payment could not be started. Please try again.";
}

/** Map Razorpay Orders API errors to user-facing copy (per production standards). */
export function mapRazorpayCreateError(err: unknown): Error & {
  statusCode: number;
  code: string;
  userMessage: string;
} {
  const raw = err as RazorpayErrBody & { statusCode?: number };
  const apiCode = raw.error?.code ?? "UNKNOWN";
  const desc = raw.error?.description ?? "";

  let userMessage = buildUserMessageFromDescription(desc, apiCode);
  if (apiCode === "GATEWAY_ERROR") {
    userMessage = "The payment gateway is temporarily unavailable. Please try again in a few minutes.";
  } else if (apiCode === "SERVER_ERROR") {
    userMessage = "Something went wrong on our side. Please retry in a moment.";
  } else if (apiCode === "BAD_REQUEST_ERROR" && userMessage === "Payment could not be started. Please try again.") {
    userMessage = buildUserMessageFromDescription(desc, apiCode);
  }

  const out = new Error(userMessage) as Error & {
    statusCode: number;
    code: string;
    userMessage: string;
  };
  out.statusCode = typeof raw.statusCode === "number" && raw.statusCode >= 400 ? raw.statusCode : 502;
  out.code = apiCode;
  out.userMessage = userMessage;
  return out;
}

/**
 * Create Razorpay order with idempotency key in notes (orderId + timestamp from checkout).
 */
export async function createOrder(params: {
  /** Minor units: paise (INR), cents (USD), pence (GBP). */
  amountInMinorUnits: number;
  /** ISO 4217; defaults to INR. */
  currency?: string;
  receipt: string;
  notes: Record<string, string>;
  idempotencyKey: string;
}): Promise<{ id: string; amount: number; currency: string }> {
  const rzp = getClient();
  const currency = params.currency ?? "INR";
  const body = {
    amount: params.amountInMinorUnits,
    currency,
    receipt: params.receipt.slice(0, 40),
    notes: {
      ...params.notes,
      idempotency_key: params.idempotencyKey
    }
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const order = await rzp.orders.create(body);
      logger.info("razorpay_order_created", { id: order.id, idempotencyKey: params.idempotencyKey, attempt });
      return { id: order.id, amount: order.amount as number, currency: order.currency as string };
    } catch (err) {
      lastErr = err;
      const apiCode = (err as RazorpayErrBody).error?.code ?? "";
      if (apiCode !== "SERVER_ERROR" && apiCode !== "GATEWAY_ERROR") {
        break;
      }
      const delayMs = Math.pow(2, attempt) * 250;
      logger.warn("razorpay_order_create_retry", { attempt, delayMs, apiCode });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw mapRazorpayCreateError(lastErr);
}

/**
 * Standard checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
 * Throws with userMessage if invalid.
 */
export function verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, signature: string): void {
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto.createHmac("sha256", getKeySecret()).update(body).digest("hex");
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    ok = false;
  }
  if (!ok) {
    const e = new Error("Invalid payment signature") as Error & {
      statusCode: number;
      code: string;
      userMessage: string;
    };
    e.statusCode = 400;
    e.code = "INVALID_SIGNATURE";
    e.userMessage = "We could not verify this payment. If money was debited, check your orders in a few minutes or contact support.";
    throw e;
  }
}

type RazorpayOrderPaymentsResponse = { items?: Array<Record<string, unknown>> };

/** List payments for a Razorpay order (callback-based SDK wrapped as Promise). */
export async function fetchRazorpayOrderPayments(razorpayOrderId: string): Promise<Array<Record<string, unknown>>> {
  const rzp = getClient();
  return new Promise((resolve, reject) => {
    type OrdersApi = { fetchPayments: (orderId: string, cb: (err: unknown, result?: unknown) => void) => void };
    const ordersApi = rzp.orders as unknown as OrdersApi;
    ordersApi.fetchPayments(razorpayOrderId, (err: unknown, result?: unknown) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const col = result as RazorpayOrderPaymentsResponse;
      resolve(Array.isArray(col?.items) ? col.items : []);
    });
  });
}
