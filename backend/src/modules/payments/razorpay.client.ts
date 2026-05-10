import Razorpay from "razorpay";

import { logger } from "../../config/logger";

function getClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED"
    });
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function createRazorpayOrder(params: {
  amountInPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const rzp = getClient();
  const order = await rzp.orders.create({
    amount: params.amountInPaise,
    currency: "INR",
    receipt: params.receipt.slice(0, 40),
    notes: params.notes
  });
  logger.info("razorpay_order_created", { id: order.id });
  return { id: order.id, amount: order.amount as number, currency: order.currency as string };
}

export function getRazorpayKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    throw Object.assign(new Error("Razorpay is not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED"
    });
  }
  return keyId;
}
