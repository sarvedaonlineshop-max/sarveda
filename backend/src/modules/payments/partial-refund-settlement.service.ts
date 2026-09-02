import type { RefundSourceType, RefundSettlementStage } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { notifyOrderEmail } from "../notifications/email";
import {
  buildPartialRefundSpecForLineDelta,
  buildPartialRefundSpecForFixedAmount,
  buildPartialRefundSpecFromBreakdown
} from "../accounting/partial-refund-spec.service";
import { postOrderRefundedPartial } from "../accounting/order-refunded-partial-posting.service";
import type { PartialRefundSpec } from "../accounting/order-refunded-partial.types";
import { calculateOrderRefund } from "../orders/order-refund-calculator.service";
import type { RefundCalculatorPolicy } from "../orders/order-refund-calculator.types";
import { loadOrderRefundPreview } from "../orders/order-refund-preview.service";
import {
  failReservedRefund,
  finalizeGatewayRefund,
  reserveGatewayRefund
} from "./refund-sync.service";
import {
  refundPayPal,
  refundRazorpay,
  refundStripe
} from "./refund.service";
import { pickCapturedPaymentForRefund } from "./payment-selection";
// Zoho Books retired — keep ZOHO_SYNCED enum readable for historical rows only.

export type ExecutePartialRefundInput = {
  orderId: string;
  sourceType: RefundSourceType;
  sourceId: string;
  reason: string;
  /** When set, must match server-recalculated policy amount exactly. */
  policy?: RefundCalculatorPolicy;
  /** For ORDER_ADJUSTMENT — merchandise delta in paise (positive). */
  adjustmentMerchandiseRefundPaise?: number;
  /** For ADMIN_MANUAL — server-validated amount in paise. */
  manualRefundPaise?: number;
  orderItemId?: string;
};

export type PartialRefundSettlementResult = {
  refundId: string;
  providerRefundId: string;
  amountInPaise: number;
  fullyRefunded: boolean;
  settlementStage: RefundSettlementStage;
  accountingPosted: boolean;
  zohoSynced: boolean;
};

async function updateSettlementStage(
  refundId: string,
  stage: RefundSettlementStage,
  error?: string
): Promise<void> {
  await prisma.refund.update({
    where: { id: refundId },
    data: {
      settlementStage: stage,
      settlementError: error ?? null,
      ...(stage === "ACCOUNTING_POSTED" || stage === "COMPLETE"
        ? { accountingPostedAt: new Date() }
        : {})
    }
  });
}

async function gatewayRefundForProvider(
  provider: string,
  providerPaymentId: string,
  amountInPaise: number,
  reason: string,
  currency: string
): Promise<string> {
  if (provider === "RAZORPAY") {
    return refundRazorpay(providerPaymentId, amountInPaise, reason);
  }
  if (provider === "STRIPE") {
    return refundStripe(providerPaymentId, amountInPaise, reason);
  }
  if (provider === "PAYPAL") {
    return refundPayPal(providerPaymentId, amountInPaise, currency, reason);
  }
  throw Object.assign(new Error(`Refund not supported for provider ${provider}`), {
    statusCode: 400,
    code: "UNSUPPORTED_PROVIDER"
  });
}

async function resolvePartialRefundSpec(
  input: ExecutePartialRefundInput,
  refundId: string,
  providerRefundId: string | null
): Promise<PartialRefundSpec> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: true,
      addresses: true,
      payments: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const pick = pickCapturedPaymentForRefund(order.payments);
  if (!pick.ok) {
    throw Object.assign(new Error(pick.message), {
      statusCode: pick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED" ? 409 : 400,
      code: pick.code
    });
  }
  const payment = pick.payment;
  const isGstApplicable = order.currency === "INR";
  const shippingState = order.addresses.find((a) => a.type === "SHIPPING")?.state ?? "";
  const interState = false; // refined by posting service from ORDER_PAID diagnostics

  if (
    (input.sourceType === "ORDER_ADJUSTMENT" || input.sourceType === "SERVICE_REQUEST") &&
    input.adjustmentMerchandiseRefundPaise
  ) {
    const item = order.items.find((i) => i.id === input.orderItemId);
    if (!item) {
      throw Object.assign(new Error("Order item not found for adjustment refund"), {
        statusCode: 400,
        code: "BAD_ITEM"
      });
    }
    return buildPartialRefundSpecForLineDelta({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      provider: payment.provider,
      refundId,
      providerRefundId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      interState,
      isGstApplicable,
      accountingDate: new Date(),
      refundMerchandisePaise: input.adjustmentMerchandiseRefundPaise,
      orderItem: {
        id: item.id,
        lineTotalInPaise: item.lineTotalInPaise,
        unitPriceInPaise: item.unitPriceInPaise,
        qtyOrdered: item.qtyOrdered,
        taxClass: null
      },
      orderDiscountInPaise: order.discountInPaise,
      allItems: order.items.map((i) => ({
        lineTotalInPaise: i.lineTotalInPaise,
        unitPriceInPaise: i.unitPriceInPaise,
        qtyOrdered: i.qtyOrdered
      }))
    });
  }

  if (input.manualRefundPaise && input.sourceType === "ADMIN_MANUAL") {
    const preview = await loadOrderRefundPreview(input.orderId, {
      policy: "DISPATCHED_SHIPPING_RETAINED"
    });
    if (!preview.ok || !preview.breakdown) {
      throw Object.assign(
        new Error(!preview.ok ? preview.message : "Refund breakdown unavailable"),
        { statusCode: 422, code: !preview.ok ? preview.code : "REFUND_BREAKDOWN_UNAVAILABLE" }
      );
    }
    return buildPartialRefundSpecForFixedAmount({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      provider: payment.provider,
      refundId,
      providerRefundId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      interState,
      isGstApplicable,
      accountingDate: new Date(),
      amountInPaise: input.manualRefundPaise,
      breakdown: preview.breakdown
    });
  }

  if (!input.policy) {
    throw Object.assign(new Error("Refund policy is required"), {
      statusCode: 400,
      code: "POLICY_REQUIRED"
    });
  }

  const preview = await loadOrderRefundPreview(input.orderId, { policy: input.policy });
  if (!preview.ok || !preview.breakdown) {
    throw Object.assign(
      new Error(!preview.ok ? preview.message : "Refund breakdown unavailable"),
      { statusCode: 422, code: !preview.ok ? preview.code : "REFUND_BREAKDOWN_UNAVAILABLE" }
    );
  }

  const breakdown = preview.breakdown;
  if (breakdown.proposedRefundAmountPaise <= 0) {
    throw Object.assign(new Error("No refundable amount for this policy"), {
      statusCode: 400,
      code: "ZERO_REFUND"
    });
  }

  return buildPartialRefundSpecFromBreakdown({
    orderId: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    provider: payment.provider,
    refundId,
    providerRefundId,
    breakdown,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    interState,
    isGstApplicable,
    accountingDate: new Date()
  });
}

/**
 * Authoritative partial refund settlement — gateway, accounting, Zoho with stage tracking.
 * Does NOT restock inventory.
 */
export async function executeAuthoritativePartialRefund(
  input: ExecutePartialRefundInput
): Promise<PartialRefundSettlementResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: { orderBy: { createdAt: "desc" } } }
  });
  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const existing = await prisma.refund.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: { in: ["pending", "processed", "created"] }
    }
  });
  if (existing?.status === "processed" && existing.providerRefundId) {
    return {
      refundId: existing.id,
      providerRefundId: existing.providerRefundId,
      amountInPaise: existing.amountInPaise,
      fullyRefunded: false,
      settlementStage: existing.settlementStage,
      accountingPosted:
        existing.settlementStage === "ACCOUNTING_POSTED" ||
        existing.settlementStage === "COMPLETE" ||
        existing.settlementStage === "ZOHO_SYNCED",
      // Legacy field: Zoho sync retired. Historical ZOHO_SYNCED/COMPLETE still report true.
      zohoSynced: false
    };
  }

  const pick = pickCapturedPaymentForRefund(order.payments);
  if (!pick.ok) {
    throw Object.assign(new Error(pick.message), {
      statusCode: pick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED" ? 409 : 400,
      code: pick.code
    });
  }
  const payment = pick.payment;

  let amountInPaise: number;
  if (input.adjustmentMerchandiseRefundPaise) {
    amountInPaise = input.adjustmentMerchandiseRefundPaise;
  } else if (input.manualRefundPaise) {
    amountInPaise = input.manualRefundPaise;
  } else if (input.policy) {
    const preview = await loadOrderRefundPreview(input.orderId, { policy: input.policy });
    if (!preview.ok || !preview.breakdown) {
      throw Object.assign(new Error(!preview.ok ? preview.message : "Refund unavailable"), {
        statusCode: 422,
        code: !preview.ok ? preview.code : "REFUND_UNAVAILABLE"
      });
    }
    amountInPaise = preview.breakdown.proposedRefundAmountPaise;
  } else {
    throw Object.assign(new Error("Cannot determine refund amount"), { statusCode: 400, code: "AMOUNT_UNKNOWN" });
  }

  if (amountInPaise <= 0) {
    throw Object.assign(new Error("Refund amount must be positive"), { statusCode: 400, code: "INVALID_AMOUNT" });
  }

  const { refundRow } = await reserveGatewayRefund({
    paymentId: payment.id,
    amountInPaise,
    reason: input.reason
  });

  await prisma.refund.update({
    where: { id: refundRow.id },
    data: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      settlementStage: "RESERVED"
    }
  });

  let providerRefundId: string;
  try {
    if (!payment.providerPaymentId) {
      throw new Error("Provider payment id missing");
    }
    providerRefundId = await gatewayRefundForProvider(
      payment.provider,
      payment.providerPaymentId,
      amountInPaise,
      input.reason,
      order.currency
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failReservedRefund(refundRow.id, msg);
    await updateSettlementStage(refundRow.id, "FAILED", msg);
    throw Object.assign(new Error(`Gateway refund failed: ${msg}`), { statusCode: 502, code: "REFUND_FAILED" });
  }

  const { fullyRefunded } = await finalizeGatewayRefund({
    refundId: refundRow.id,
    providerRefundId,
    orderId: input.orderId,
    reason: input.reason
  });

  await updateSettlementStage(refundRow.id, "GATEWAY_SUCCEEDED");

  let accountingPosted = false;

  try {
    const spec = await resolvePartialRefundSpec(input, refundRow.id, providerRefundId);
    await postOrderRefundedPartial(spec);
    accountingPosted = true;
    await updateSettlementStage(refundRow.id, "ACCOUNTING_POSTED");
    await updateSettlementStage(refundRow.id, "COMPLETE");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("partial_refund_accounting_failed", {
      orderId: input.orderId,
      refundId: refundRow.id,
      error: msg
    });
    await updateSettlementStage(refundRow.id, "GATEWAY_SUCCEEDED", `Accounting pending: ${msg}`);
  }

  notifyOrderEmail(input.orderId, "refund_initiated");

  logger.info("partial_refund_settled", {
    orderId: input.orderId,
    refundId: refundRow.id,
    amountInPaise,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    fullyRefunded,
    accountingPosted,
    zohoSynced: false
  });

  const finalRow = await prisma.refund.findUnique({ where: { id: refundRow.id } });

  return {
    refundId: refundRow.id,
    providerRefundId,
    amountInPaise,
    fullyRefunded,
    settlementStage: finalRow!.settlementStage,
    accountingPosted,
    zohoSynced: false
  };
}

/** Retry accounting stage only — never re-hits gateway. Zoho sync retired. */
export async function retryPartialRefundSettlementStages(refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { payment: { include: { order: true } } }
  });
  if (!refund || refund.status !== "processed") {
    throw Object.assign(new Error("Refund not in processed state"), { statusCode: 409, code: "INVALID_STATE" });
  }

  if (
    refund.settlementStage === "COMPLETE" ||
    refund.settlementStage === "ACCOUNTING_POSTED" ||
    refund.settlementStage === "ZOHO_SYNCED"
  ) {
    if (refund.settlementStage !== "COMPLETE") {
      await updateSettlementStage(refund.id, "COMPLETE");
    }
    return;
  }

  if (refund.settlementStage !== "GATEWAY_SUCCEEDED") {
    throw Object.assign(new Error("Refund not retryable in current stage"), {
      statusCode: 409,
      code: "INVALID_STATE"
    });
  }

  const input: ExecutePartialRefundInput = {
    orderId: refund.payment.orderId,
    sourceType: refund.sourceType ?? "ADMIN_MANUAL",
    sourceId: refund.sourceId ?? refund.id,
    reason: refund.reason ?? "Partial refund retry",
    policy: refund.sourceType === "RTO" ? "RTO_SHIPPING_RETAINED" : undefined
  };

  const spec = await resolvePartialRefundSpec(input, refund.id, refund.providerRefundId);
  await postOrderRefundedPartial(spec);
  await updateSettlementStage(refund.id, "ACCOUNTING_POSTED");
  await updateSettlementStage(refund.id, "COMPLETE");
}
