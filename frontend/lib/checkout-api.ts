import { getApiBase } from "./api";
import { getAttributionCheckoutPayload } from "./attribution";
import { buildHeaders } from "./cart-api";

export type CreateOrderBody = {
  email: string;
  phone: string;
  shippingFullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  codDelivery?: boolean;
  giftWrap?: boolean;
  customerNotes?: string | null;
  paymentMethod?: "razorpay" | "cod" | "stripe" | "paypal";
};

export type CreateOrderResponse = {
  orderId: string;
  orderNumber: string;
  amountInPaise: number;
  currency: string;
  paymentMethod: "razorpay" | "cod" | "stripe" | "paypal";
  paymentProvider?: "RAZORPAY" | "COD" | "STRIPE" | "PAYPAL";
  paymentId: string;
  razorpayKeyId?: string;
  rzpOrderId?: string;
  stripeCheckoutUrl?: string;
  paypalApprovalUrl?: string;
  codConfirmed?: boolean;
};

export class CheckoutApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "CheckoutApiError";
  }
}

export async function createOrder(
  body: CreateOrderBody,
  idempotencyKey: string
): Promise<CreateOrderResponse> {
  let attribution: ReturnType<typeof getAttributionCheckoutPayload> = null;
  try {
    attribution = getAttributionCheckoutPayload();
  } catch {
    attribution = null;
  }

  const res = await fetch(`${getApiBase()}/api/checkout/create-order`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(true),
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      ...body,
      country: body.country ?? "IN",
      codDelivery: body.codDelivery ?? false,
      paymentMethod: body.paymentMethod ?? "razorpay",
      ...(attribution ? { attribution } : {})
    })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CreateOrderResponse;
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new CheckoutApiError(json.error || "Could not create order", json.code ?? "CHECKOUT_ERROR", res.status);
  }
  return json.data;
}

export async function resumePendingOrder(orderNumber: string, email: string): Promise<CreateOrderResponse> {
  const q = new URLSearchParams({
    orderNumber,
    email: email.trim().toLowerCase()
  });
  const res = await fetch(`${getApiBase()}/api/checkout/resume?${q.toString()}`, {
    credentials: "include",
    headers: buildHeaders(false)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CreateOrderResponse;
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new CheckoutApiError(json.error || "Could not resume payment", json.code ?? "RESUME_FAILED", res.status);
  }
  return json.data;
}

export async function verifyRazorpayPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ orderNumber: string }> {
  const res = await fetch(`${getApiBase()}/api/payments/razorpay/verify`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify(payload)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { orderNumber: string };
    error?: string;
    code?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new CheckoutApiError(
      json.error || "Payment verification failed",
      json.code ?? "VERIFY_FAILED",
      res.status
    );
  }
  return json.data;
}

export type PublicOrderSummary = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  grandTotalInPaise: number;
  currency: string;
  email: string;
};

export async function fetchPublicOrder(
  orderNumber: string,
  email: string
): Promise<PublicOrderSummary | null> {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  const res = await fetch(
    `${getApiBase()}/api/orders/public/${encodeURIComponent(orderNumber)}?${q.toString()}`,
    { credentials: "include", headers: { Accept: "application/json" } }
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: { order: PublicOrderSummary };
  };
  if (!res.ok || !json.success || !json.data?.order) {
    return null;
  }
  return json.data.order;
}

/** Poll every 3s up to maxMs while order is still pending payment (webhook may be slow). */
export async function pollUntilPaidOrTerminal(
  orderNumber: string,
  email: string,
  maxMs = 30_000
): Promise<"PAID" | "CANCELLED" | "STILL_PENDING"> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const o = await fetchPublicOrder(orderNumber, email);
    if (!o) return "STILL_PENDING";
    if (o.status === "PAID" || o.paymentStatus === "CAPTURED") return "PAID";
    if (o.status === "CANCELLED" || o.paymentStatus === "FAILED") return "CANCELLED";
    await new Promise((r) => setTimeout(r, 3000));
  }
  return "STILL_PENDING";
}
