import { prisma } from "../../config/db";
import { pickCapturedPaymentForRefund } from "../payments/payment-selection";

import { getCancellationEligibility, orderHasRtoShipment } from "./cancellation-eligibility";
import { calculateOrderRefund } from "./order-refund-calculator.service";
import type {
  OrderRefundBreakdown,
  RefundCalculatorPolicy
} from "./order-refund-calculator.types";

export type RefundPreviewPolicyParam = RefundCalculatorPolicy | "auto";

const ORDER_REFUND_INCLUDE = {
  items: {
    include: {
      variant: {
        select: {
          productRel: { select: { taxClass: true } }
        }
      }
    }
  },
  payments: { orderBy: { createdAt: "desc" as const } },
  shipments: { select: { status: true } },
  addresses: { where: { type: "SHIPPING" as const }, take: 1 }
} as const;

export function resolveRefundPolicyForOrder(opts: {
  payments: Array<{ provider: string }>;
  cancellationEligibility: ReturnType<typeof getCancellationEligibility>;
  hasRtoShipment: boolean;
  explicit?: RefundPreviewPolicyParam;
}): RefundCalculatorPolicy {
  if (opts.explicit && opts.explicit !== "auto") {
    return opts.explicit;
  }
  const isCod = opts.payments.some((p) => p.provider === "COD");
  if (isCod) return "COD_CANCELLATION";
  if (opts.hasRtoShipment) return "RTO_SHIPPING_RETAINED";
  if (opts.cancellationEligibility.dispatched) return "DISPATCHED_SHIPPING_RETAINED";
  return "FULL_PRE_DISPATCH_CANCELLATION";
}

export async function loadOrderRefundPreview(
  orderId: string,
  opts?: { policy?: RefundPreviewPolicyParam }
): Promise<
  | { ok: true; breakdown: OrderRefundBreakdown; orderNumber: string; currency: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED";
      message: string;
    }
> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: ORDER_REFUND_INCLUDE
  });

  if (!order) {
    return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  }

  const paymentPick = pickCapturedPaymentForRefund(order.payments);
  if (!paymentPick.ok && paymentPick.code === "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED") {
    return {
      ok: false,
      code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED",
      message: paymentPick.message
    };
  }

  const payment =
    paymentPick.ok
      ? paymentPick.payment
      : order.payments.find((p) => p.provider === "COD") ?? null;

  const cancellationEligibility = getCancellationEligibility({
    status: order.status,
    paymentStatus: order.paymentStatus,
    payments: order.payments,
    shipments: order.shipments
  });

  const policy = resolveRefundPolicyForOrder({
    payments: order.payments,
    cancellationEligibility,
    hasRtoShipment: orderHasRtoShipment({
      status: order.status,
      paymentStatus: order.paymentStatus,
      shipments: order.shipments
    }),
    explicit: opts?.policy
  });

  const shipCountry = order.addresses[0]?.country ?? "IN";
  const isGstApplicable = order.currency === "INR" && shipCountry.trim().toUpperCase() === "IN";

  const breakdown = calculateOrderRefund({
    order: {
      subtotalInPaise: order.subtotalInPaise,
      discountInPaise: order.discountInPaise,
      shippingInPaise: order.shippingInPaise,
      taxInPaise: order.taxInPaise,
      grandTotalInPaise: order.grandTotalInPaise,
      currency: order.currency
    },
    items: order.items.map((item) => ({
      id: item.id,
      lineTotalInPaise: item.lineTotalInPaise,
      unitPriceInPaise: item.unitPriceInPaise,
      qtyOrdered: item.qtyOrdered,
      taxClass: item.variant.productRel.taxClass
    })),
    payment: payment
      ? {
          id: payment.id,
          provider: payment.provider,
          status: payment.status,
          amountInPaise: payment.amountInPaise,
          refundedInPaise: payment.refundedInPaise
        }
      : null,
    policy,
    isGstApplicable
  });

  return {
    ok: true,
    breakdown,
    orderNumber: order.orderNumber,
    currency: order.currency
  };
}
