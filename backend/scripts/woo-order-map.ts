import {
  FulfillmentStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus
} from "@prisma/client";

import { parseDecimal, toGbpPence, toPaise, toUsdCents } from "../src/utils/money";

export function mapWooOrderStatus(wpStatus: string): {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
} {
  const s = wpStatus.replace(/^wc-/, "").toLowerCase();

  switch (s) {
    case "completed":
      return {
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.CAPTURED,
        fulfillmentStatus: FulfillmentStatus.FULFILLED
      };
    case "processing":
      return {
        status: OrderStatus.PROCESSING,
        paymentStatus: PaymentStatus.CAPTURED,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED
      };
    case "on-hold":
      return {
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.AUTHORIZED,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED
      };
    case "pending":
      return {
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED
      };
    case "cancelled":
    case "failed":
      return {
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.FAILED,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED
      };
    case "refunded":
      return {
        status: OrderStatus.REFUNDED,
        paymentStatus: PaymentStatus.REFUNDED,
        fulfillmentStatus: FulfillmentStatus.RETURNED
      };
    default:
      return {
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED
      };
  }
}

export function mapPaymentProvider(method: string): PaymentProvider {
  const m = method.toLowerCase();
  if (m.includes("razorpay") || m === "wc-razorpay") return PaymentProvider.RAZORPAY;
  if (m.includes("stripe")) return PaymentProvider.STRIPE;
  if (m.includes("paypal")) return PaymentProvider.PAYPAL;
  if (m.includes("cod") || m.includes("cash")) return PaymentProvider.COD;
  return PaymentProvider.RAZORPAY;
}

export function moneyToMinor(total: string, currency: string): number {
  const d = parseDecimal(total) ?? 0;
  const c = currency.toUpperCase();
  if (c === "INR") return toPaise(d);
  if (c === "GBP") return toGbpPence(d);
  return toUsdCents(d);
}

export function orderNumberFromWoo(wpPostId: number): string {
  return `WOO-${wpPostId}`;
}
