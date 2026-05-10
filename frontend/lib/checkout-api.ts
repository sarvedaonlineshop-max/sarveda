import { getApiBase } from "./api";
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
};

export type CreateOrderResponse = {
  orderId: string;
  orderNumber: string;
  amountInPaise: number;
  currency: string;
  razorpayKeyId: string;
  rzpOrderId: string;
  paymentId: string;
};

export async function createOrder(body: CreateOrderBody): Promise<CreateOrderResponse> {
  const res = await fetch(`${getApiBase()}/api/checkout/create-order`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(true),
    body: JSON.stringify({ ...body, country: body.country ?? "IN" })
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: CreateOrderResponse;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Could not create order");
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
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { orderNumber: string };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Payment verification failed");
  }
  return json.data;
}
