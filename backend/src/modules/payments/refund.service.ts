import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import { handlePaidOrderStatusChange } from "../orders/orders.service";
import { orderHasActiveRtoShipment } from "../orders/rto-workflow.service";
import { isAccountingRefundPostingEnabled } from "../accounting/accounting-flag";
import { postOrderRefundedFullByIdentifier } from "../accounting/order-refunded-full-posting.service";

import { getPayPalAccessToken, getPayPalApiBase } from "./paypal";
import { executeAuthoritativePartialRefund } from "./partial-refund-settlement.service";
import { pickCapturedPaymentForRefund } from "./payment-selection";
import {
  failReservedRefund,
  finalizeGatewayRefund,
  getRefundableRemainingInPaise,
  reserveGatewayRefund
} from "./refund-sync.service";

export type RefundResult = {
  success: boolean;
  refundId?: string;
  message: string;
};

function providerLabel(provider: string): string {
  if (provider === "RAZORPAY") return "Razorpay";
  if (provider === "STRIPE") return "Stripe";
  if (provider === "PAYPAL") return "PayPal";
  return provider;
}

function formatAmountLabel(currency: string, amountInPaise: number): string {
  return currency === "INR"
    ? `₹${(amountInPaise / 100).toLocaleString("en-IN")}`
    : `${currency} ${(amountInPaise / 100).toFixed(2)}`;
}

export async function initiatePartialGatewayRefund(
  orderId: string,
  amountInPaise: number,
  reason?: string
): Promise<RefundResult> {
  if (amountInPaise <= 0) {
    throw Object.assign(new Error("Refund amount must be positive"), {
      statusCode: 400,
      code: "INVALID_AMOUNT"
    });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } }
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const pick = pickCapturedPaymentForRefund(order.payments);
  if (!pick.ok) {
    if (pick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED") {
      throw Object.assign(new Error(pick.message), {
        statusCode: 409,
        code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED"
      });
    }
    throw Object.assign(new Error(pick.message), {
      statusCode: 400,
      code: "NO_PAYMENT"
    });
  }

  const { remaining } = await getRefundableRemainingInPaise(pick.payment.id);
  if (amountInPaise > remaining) {
    throw Object.assign(new Error(`Refund amount exceeds remaining refundable ${remaining}`), {
      statusCode: 409,
      code: "AMOUNT_TOO_HIGH"
    });
  }

  const refundReason = reason?.trim() || "Admin initiated refund";
  const sourceId = `admin-manual:${orderId}:${Date.now()}`;

  try {
    const result = await executeAuthoritativePartialRefund({
      orderId,
      sourceType: "ADMIN_MANUAL",
      sourceId,
      reason: refundReason,
      manualRefundPaise: amountInPaise
    });

    return {
      success: true,
      refundId: result.providerRefundId,
      message: `${providerLabel(pick.payment.provider)} refund of ${formatAmountLabel(order.currency, amountInPaise)} initiated to the customer's original payment method. Typically reflects in 5–7 business days.`
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    const statusCode = (err as { statusCode?: number }).statusCode;
    logger.error("admin_partial_refund_failed", {
      orderId,
      provider: pick.payment.provider,
      amountInPaise,
      err
    });
    if (code === "AMOUNT_TOO_HIGH" || code === "ALREADY_REFUNDED" || code === "DUPLICATE_REFUND") {
      throw Object.assign(new Error(msg), { statusCode: statusCode ?? 409, code });
    }
    throw Object.assign(new Error(`Refund failed: ${msg}`), { statusCode: 502, code: "REFUND_FAILED" });
  }
}

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

  // Hard stop: never re-enter refund/cancel side effects on an already-refunded order.
  if (order.status === "REFUNDED" || order.paymentStatus === "REFUNDED") {
    throw Object.assign(new Error("Payment is already fully refunded"), {
      statusCode: 409,
      code: "ALREADY_REFUNDED"
    });
  }

  const alreadyFullyRefundedPayment = order.payments.find(
    (p) =>
      p.provider !== "COD" &&
      (p.status === "REFUNDED" ||
        (p.amountInPaise > 0 && p.refundedInPaise >= p.amountInPaise && p.refundedInPaise > 0))
  );
  if (alreadyFullyRefundedPayment) {
    throw Object.assign(new Error("Payment is already fully refunded"), {
      statusCode: 409,
      code: "ALREADY_REFUNDED"
    });
  }

  if (await orderHasActiveRtoShipment(orderId)) {
    throw Object.assign(
      new Error(
        "This order has an active RTO shipment. Use the RTO workflow — full refund is blocked to preserve shipping-retained policy."
      ),
      { statusCode: 409, code: "RTO_WORKFLOW_REQUIRED" }
    );
  }

  const pick = pickCapturedPaymentForRefund(order.payments);
  const codPayment = order.payments.find((p) => p.provider === "COD");

  if (!pick.ok) {
    if (pick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED") {
      throw Object.assign(new Error(pick.message), {
        statusCode: 409,
        code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED"
      });
    }

    // No executable CAPTURED/PARTIALLY_REFUNDED payment — never flip REFUNDED→CANCELLED.
    if (order.payments.some((p) => p.provider !== "COD" && p.status === "REFUNDED")) {
      throw Object.assign(new Error("Payment is already fully refunded"), {
        statusCode: 409,
        code: "ALREADY_REFUNDED"
      });
    }

    if (codPayment && order.status !== "PENDING_PAYMENT") {
      await handlePaidOrderStatusChange(
        orderId,
        "CANCELLED",
        reason ?? "COD order cancelled — arrange cash refund manually"
      );
      notifyOrderEmail(orderId, "order_cancelled");
      return {
        success: true,
        message: "Manual refund required. COD order cancelled — arrange cash/UPI refund outside the gateway."
      };
    }

    await handlePaidOrderStatusChange(orderId, "CANCELLED", reason ?? "Order cancelled — no captured payment");
    notifyOrderEmail(orderId, "order_cancelled");
    return {
      success: true,
      message: "Order cancelled. No payment to refund."
    };
  }

  const capturedPayment = pick.payment;
  const provider = capturedPayment.provider;
  const refundReason = reason?.trim() || "Admin initiated refund";

  if (provider === "COD") {
    await handlePaidOrderStatusChange(
      orderId,
      "CANCELLED",
      refundReason || "COD order cancelled — arrange cash refund manually"
    );
    notifyOrderEmail(orderId, "order_cancelled");
    return {
      success: true,
      message: "Manual refund required. COD has no automatic payout — record cash/UPI transfer separately."
    };
  }

  const { remaining } = await getRefundableRemainingInPaise(capturedPayment.id);
  if (remaining <= 0) {
    throw Object.assign(new Error("Payment is already fully refunded"), {
      statusCode: 409,
      code: "ALREADY_REFUNDED"
    });
  }

  let reservedRefundId: string | undefined;

  try {
    const { refundRow } = await reserveGatewayRefund({
      paymentId: capturedPayment.id,
      amountInPaise: remaining,
      reason: refundReason
    });
    reservedRefundId = refundRow.id;

    let providerRefundId: string;

    if (provider === "RAZORPAY") {
      if (!capturedPayment.providerPaymentId) {
        throw new Error("Razorpay payment id missing on order");
      }
      providerRefundId = await refundRazorpay(
        capturedPayment.providerPaymentId,
        remaining,
        refundReason
      );
    } else if (provider === "STRIPE") {
      if (!capturedPayment.providerPaymentId) {
        throw new Error("Stripe payment intent id missing on order");
      }
      providerRefundId = await refundStripe(capturedPayment.providerPaymentId, remaining, refundReason);
    } else if (provider === "PAYPAL") {
      if (!capturedPayment.providerPaymentId) {
        throw new Error("PayPal capture id missing on order");
      }
      providerRefundId = await refundPayPal(
        capturedPayment.providerPaymentId,
        remaining,
        order.currency,
        refundReason
      );
    } else {
      throw new Error(`Refund not supported for provider ${provider}`);
    }

    const { fullyRefunded } = await finalizeGatewayRefund({
      refundId: refundRow.id,
      providerRefundId,
      orderId,
      reason: refundReason
    });

    if (fullyRefunded) {
      if (isAccountingRefundPostingEnabled()) {
        try {
          await postOrderRefundedFullByIdentifier({ orderId, refundId: refundRow.id });
        } catch (err) {
          logger.error("native_order_refunded_full_posting_failed", { orderId, err });
        }
      }
    }

    notifyOrderEmail(orderId, "refund_initiated", {
      refundAmountInPaise: remaining,
      refundId: refundRow.id
    });
    logger.info("admin_refund_initiated", { orderId, provider, refundId: providerRefundId, amountInPaise: remaining });

    return {
      success: true,
      refundId: providerRefundId,
      message: `Refund initiated via ${providerLabel(provider)}. Takes 5–7 business days to reflect.`
    };
  } catch (err) {
    if (reservedRefundId) {
      const msg = err instanceof Error ? err.message : String(err);
      await failReservedRefund(reservedRefundId, msg);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    const statusCode = (err as { statusCode?: number }).statusCode;
    logger.error("admin_refund_failed", { orderId, provider, err });
    if (code === "AMOUNT_TOO_HIGH" || code === "ALREADY_REFUNDED" || code === "DUPLICATE_REFUND") {
      throw Object.assign(new Error(msg), { statusCode: statusCode ?? 409, code });
    }
    throw Object.assign(new Error(`Refund failed: ${msg}`), { statusCode: 502, code: "REFUND_FAILED" });
  }
}

export async function refundRazorpay(
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

export async function refundStripe(
  paymentIntentId: string,
  amountInPaise: number,
  reason?: string
): Promise<string> {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20"
  });
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountInPaise,
    reason: "requested_by_customer",
    metadata: { admin_reason: reason ?? "Admin initiated refund" }
  });
  return refund.id;
}

export async function refundPayPal(
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
