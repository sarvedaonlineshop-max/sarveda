import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { handlePaidOrderStatusChange } from "../orders/orders.service";
import { createZohoRefundDocumentsForOrder } from "../zoho/zoho-financials";

import { getPayPalAccessToken, getPayPalApiBase } from "./paypal";

export type RefundResult = {
  success: boolean;
  refundId?: string;
  message: string;
};

export async function initiateGatewayRefund(
  orderId: string,
  reason?: string
): Promise<RefundResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } }
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const capturedPayment = order.payments.find((p) => p.status === "CAPTURED");
  const codPayment = order.payments.find((p) => p.provider === "COD");

  if (!capturedPayment) {
    if (codPayment && order.status !== "PENDING_PAYMENT") {
      await handlePaidOrderStatusChange(
        orderId,
        "CANCELLED",
        reason ?? "COD order cancelled — arrange cash refund manually"
      );
      notifyOrderEmail(orderId, "order_cancelled");
      return {
        success: true,
        message: "COD order cancelled. Arrange cash refund manually."
      };
    }

    await handlePaidOrderStatusChange(orderId, "CANCELLED", reason ?? "Order cancelled — no captured payment");
    notifyOrderEmail(orderId, "order_cancelled");
    return {
      success: true,
      message: "Order cancelled. No payment to refund."
    };
  }

  const provider = capturedPayment.provider;
  const refundReason = reason?.trim() || "Admin initiated refund";

  try {
    let refundId: string | undefined;

    if (provider === "RAZORPAY") {
      if (!capturedPayment.providerPaymentId) {
        throw new Error("Razorpay payment id missing on order");
      }
      refundId = await refundRazorpay(
        capturedPayment.providerPaymentId,
        order.grandTotalInPaise,
        refundReason
      );
    } else if (provider === "STRIPE") {
      if (!capturedPayment.providerPaymentId) {
        throw new Error("Stripe payment intent id missing on order");
      }
      refundId = await refundStripe(capturedPayment.providerPaymentId, refundReason);
    } else if (provider === "PAYPAL") {
      if (!capturedPayment.providerPaymentId) {
        throw new Error("PayPal capture id missing on order");
      }
      refundId = await refundPayPal(
        capturedPayment.providerPaymentId,
        order.grandTotalInPaise,
        order.currency,
        refundReason
      );
    } else if (provider === "COD") {
      await handlePaidOrderStatusChange(
        orderId,
        "CANCELLED",
        refundReason || "COD order cancelled — arrange cash refund manually"
      );
      notifyOrderEmail(orderId, "order_cancelled");
      return {
        success: true,
        message: "COD order cancelled. Arrange cash refund manually."
      };
    } else {
      throw new Error(`Refund not supported for provider ${provider}`);
    }

    await prisma.refund.create({
      data: {
        paymentId: capturedPayment.id,
        amountInPaise: order.grandTotalInPaise,
        providerRefundId: refundId,
        status: "processed",
        reason: refundReason
      }
    });

    await prisma.payment.update({
      where: { id: capturedPayment.id },
      data: {
        status: "REFUNDED",
        refundedInPaise: order.grandTotalInPaise
      }
    });

    await handlePaidOrderStatusChange(orderId, "REFUNDED", refundReason);
    void createZohoRefundDocumentsForOrder(orderId, refundReason).catch((err) => {
      logger.error("zoho_credit_note_refund_failed", { orderId, err });
    });
    notifyOrderEmail(orderId, "refund_initiated");

    logger.info("admin_refund_initiated", { orderId, provider, refundId });

    return {
      success: true,
      refundId,
      message: `Refund initiated via ${provider}. Takes 5–7 business days to reflect.`
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("admin_refund_failed", { orderId, provider, err });
    throw Object.assign(new Error(`Refund failed: ${msg}`), { statusCode: 502, code: "REFUND_FAILED" });
  }
}

async function refundRazorpay(
  paymentId: string,
  amountInPaise: number,
  notes?: string
): Promise<string> {
  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!
  });
  const refund = (await rzp.payments.refund(paymentId, {
    amount: amountInPaise,
    notes: { reason: notes ?? "Admin initiated refund" }
  })) as { id: string };
  return refund.id;
}

async function refundStripe(paymentIntentId: string, reason?: string): Promise<string> {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20"
  });
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
    metadata: { admin_reason: reason ?? "Admin initiated refund" }
  });
  return refund.id;
}

async function refundPayPal(
  captureId: string,
  amountInPaise: number,
  currency: string,
  reason?: string
): Promise<string> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${getPayPalApiBase()}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: {
        value: (amountInPaise / 100).toFixed(2),
        currency_code: currency.toUpperCase()
      },
      note_to_payer: reason ?? "Refund from Sarveda"
    })
  });
  const data = (await res.json()) as { id?: string; message?: string; details?: Array<{ description?: string }> };
  if (!res.ok) {
    throw new Error(data.message ?? data.details?.[0]?.description ?? "PayPal refund failed");
  }
  if (!data.id) throw new Error("PayPal refund id missing");
  return data.id;
}
