import { classifyCutover } from "./accounting-cutover";
import {
  AUTHORITATIVE_REFUND_STATUSES
} from "./order-refunded-full.constants";
import type {
  FullRefundEligibilityResult,
  OrderRefundContext,
  RefundRowSnapshot
} from "./order-refunded-full.types";

function isAuthoritativeStatus(status: string): boolean {
  return (AUTHORITATIVE_REFUND_STATUSES as readonly string[]).includes(status);
}

/** Monetary refunds: positive amount (any status). */
export function monetaryRefunds(refunds: RefundRowSnapshot[]): RefundRowSnapshot[] {
  return refunds
    .filter((r) => r.amountInPaise > 0)
    .slice()
    .sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime();
      return t !== 0 ? t : a.id.localeCompare(b.id);
    });
}

/** Authoritative for auto-post: positive amount + processed status. */
export function authoritativeRefunds(refunds: RefundRowSnapshot[]): RefundRowSnapshot[] {
  return monetaryRefunds(refunds).filter((r) => isAuthoritativeStatus(r.status));
}

/**
 * Phase 2C V1: only a single unambiguous full monetary refund is auto-postable.
 * Cumulative partials that equal grand total MUST NOT auto-post.
 */
export function evaluateFullRefundEligibility(
  ctx: Pick<
    OrderRefundContext,
    | "provider"
    | "grandTotalInPaise"
    | "refunds"
    | "refundedInPaise"
    | "paymentStatusDetail"
    | "originalSale"
    | "orderPlacedAt"
  >
): FullRefundEligibilityResult {
  const monetary = monetaryRefunds(ctx.refunds);
  const authoritative = authoritativeRefunds(ctx.refunds);
  const monetaryTotal = monetary.reduce((s, r) => s + r.amountInPaise, 0);

  const base = {
    authoritativeRefundCount: authoritative.length,
    monetaryRefundCount: monetary.length,
    monetaryRefundTotalPaise: monetaryTotal
  };

  if (ctx.provider === "COD") {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "COD_NOT_AUTO_POSTABLE",
      reason:
        "COD refunds are not auto-posted — no reliable monetary refund evidence / collection event"
    };
  }

  if (!["RAZORPAY", "STRIPE", "PAYPAL"].includes(ctx.provider)) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "PROVIDER_NOT_SUPPORTED",
      reason: `Provider ${ctx.provider} is not supported for full-refund auto-posting`
    };
  }

  if (monetary.length === 0) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "NO_AUTHORITATIVE_REFUND",
      reason: "No monetary Refund row — Order.status alone is not sufficient"
    };
  }

  if (monetary.some((r) => r.amountInPaise > ctx.grandTotalInPaise)) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "REFUND_AMOUNT_EXCEEDS_TOTAL",
      reason: "A Refund amount exceeds order grand total",
      candidateRefundId: monetary.find((r) => r.amountInPaise > ctx.grandTotalInPaise)?.id
    };
  }

  if (monetary.length > 1) {
    if (monetaryTotal === ctx.grandTotalInPaise) {
      return {
        ...base,
        eligible: false,
        autoPostable: false,
        code: "CUMULATIVE_FULL_BUT_UNALLOCATED",
        reason:
          "Multiple partial refunds sum to grand total — period-accurate full-refund posting deferred"
      };
    }
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "MULTIPLE_REFUNDS_UNALLOCATED",
      reason: "Multiple monetary Refund rows — partial GST allocation not available in Phase 2C V1"
    };
  }

  // Exactly one monetary refund row
  const only = monetary[0]!;

  if (only.amountInPaise < ctx.grandTotalInPaise) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "UNPOSTED_PARTIAL",
      reason: "Single refund amount is less than grand total — partial GST posting deferred",
      candidateRefundId: only.id
    };
  }

  // amount == grandTotal (exactly one row)
  if (!isAuthoritativeStatus(only.status)) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "REFUND_NOT_PROCESSED",
      reason: `Refund status "${only.status}" is not accounting-authoritative (require processed)`,
      candidateRefundId: only.id
    };
  }

  if (!only.providerRefundId?.trim()) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "MISSING_PROVIDER_REFUND_ID",
      reason: `Online provider ${ctx.provider} full refund requires providerRefundId`,
      candidateRefundId: only.id
    };
  }

  // Supporting consistency checks — fail closed on contradiction
  if (ctx.refundedInPaise > 0 && ctx.refundedInPaise !== only.amountInPaise) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "INCONSISTENT_PAYMENT_STATUS",
      reason: `Payment.refundedInPaise (${ctx.refundedInPaise}) does not match single full Refund (${only.amountInPaise})`,
      candidateRefundId: only.id
    };
  }

  if (
    ctx.paymentStatusDetail === "CAPTURED" ||
    ctx.paymentStatusDetail === "AUTHORIZED" ||
    ctx.paymentStatusDetail === "PENDING"
  ) {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "INCONSISTENT_PAYMENT_STATUS",
      reason: `Payment.status ${ctx.paymentStatusDetail} contradicts a processed full Refund row`,
      candidateRefundId: only.id
    };
  }

  if (
    ctx.paymentStatusDetail !== "REFUNDED" &&
    ctx.paymentStatusDetail !== "PARTIALLY_REFUNDED"
  ) {
    // Unexpected status with a full refund row
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "INCONSISTENT_PAYMENT_STATUS",
      reason: `Unexpected Payment.status ${ctx.paymentStatusDetail} for full refund`,
      candidateRefundId: only.id
    };
  }

  if (!ctx.originalSale) {
    if (classifyCutover(ctx.orderPlacedAt) === "PRE_CUTOVER") {
      return {
        ...base,
        eligible: false,
        autoPostable: false,
        code: "PRE_CUTOVER_ACCOUNTING_HISTORY_REQUIRED",
        reason:
          "Refund cannot invent a sale reversal — original order is pre-cutover with no native " +
          "ORDER_PAID journal. Ops refund may proceed; accounting needs manual review.",
        candidateRefundId: only.id
      };
    }
    return {
      ...base,
      eligible: true,
      autoPostable: false,
      code: "SALE_JOURNAL_REQUIRED",
      reason: "Native ORDER_PAID POSTED journal required before refund posting",
      candidateRefundId: only.id
    };
  }

  if (ctx.originalSale.calcVersion !== "ORDER_PAID_V1") {
    return {
      ...base,
      eligible: false,
      autoPostable: false,
      code: "DATA_GAP",
      reason: `Original sale calc version ${ctx.originalSale.calcVersion} is not ORDER_PAID_V1`,
      candidateRefundId: only.id
    };
  }

  return {
    ...base,
    eligible: true,
    autoPostable: true,
    code: "AUTO_POSTABLE_FULL",
    reason: "Single processed full Refund equals grand total with POSTED ORDER_PAID journal",
    candidateRefundId: only.id
  };
}
