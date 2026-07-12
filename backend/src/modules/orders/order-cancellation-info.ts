export type CancellationCustomerReason = {
  itemName: string;
  reasonLabel: string;
  message?: string | null;
};

export type CancellationInfoCategory =
  | "payment_timeout"
  | "customer_checkout"
  | "customer_request"
  | "admin"
  | "unknown";

export type CancellationInfo = {
  title: string;
  description: string;
  category: CancellationInfoCategory;
  occurredAt: string;
  rawReason: string | null;
  customerReasons?: CancellationCustomerReason[];
};

export function formatCustomerReasonsSummary(
  reasons: CancellationCustomerReason[],
  overallMessage?: string | null
): string {
  const lines = reasons.map((r) => {
    const note = r.message?.trim() ? ` — ${r.message.trim()}` : "";
    return `• ${r.itemName}: ${r.reasonLabel}${note}`;
  });
  if (overallMessage?.trim()) {
    lines.push(`• Your note: ${overallMessage.trim()}`);
  }
  return lines.join("\n");
}

export function buildCancellationInfo(
  status: string,
  paymentStatus: string,
  history: Array<{ toStatus: string; reason: string | null; createdAt: Date }> | undefined,
  customerReasons?: CancellationCustomerReason[],
  serviceRequestMessage?: string | null
): CancellationInfo | null {
  if (status !== "CANCELLED") return null;

  const cancelEntry = [...(history ?? [])]
    .filter((h) => h.toStatus === "CANCELLED")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const reason = cancelEntry?.reason?.trim() || null;
  const occurredAt = (cancelEntry?.createdAt ?? new Date()).toISOString();
  const lower = (reason ?? "").toLowerCase();

  if (customerReasons?.length) {
    return {
      title: "Cancelled at your request",
      description: formatCustomerReasonsSummary(customerReasons, serviceRequestMessage),
      category: "customer_request",
      occurredAt,
      rawReason: reason,
      customerReasons
    };
  }

  if (
    lower.includes("15 minutes") ||
    lower.includes("payment not completed") ||
    lower.includes("payment_timeout")
  ) {
    return {
      title: "Payment not completed in time",
      description:
        "This order was automatically cancelled because payment was not completed within 15 minutes. Reserved stock has been released.",
      category: "payment_timeout",
      occurredAt,
      rawReason: reason
    };
  }

  if (lower.includes("superseded by new checkout")) {
    return {
      title: "Replaced by a newer checkout",
      description:
        "This order was cancelled when you started a new checkout. Only your latest order is kept active.",
      category: "customer_checkout",
      occurredAt,
      rawReason: reason
    };
  }

  if (lower.includes("service request approved") || lower.includes("cancellation approved")) {
    return {
      title: "Cancelled at your request",
      description:
        "Your cancellation request was approved by our team. Refunds, if applicable, are processed separately.",
      category: "customer_request",
      occurredAt,
      rawReason: reason
    };
  }

  if (
    lower.startsWith("admin cancelled") ||
    (lower.includes("admin") && !lower.includes("service request"))
  ) {
    return {
      title: "Cancelled by Sarveda team",
      description: reason ?? "This order was cancelled by our support team.",
      category: "admin",
      occurredAt,
      rawReason: reason
    };
  }

  if (paymentStatus === "FAILED" || paymentStatus === "PENDING") {
    return {
      title: "Checkout not completed",
      description:
        reason ??
        "Payment was not completed for this order, so it was cancelled and stock was released.",
      category: "customer_checkout",
      occurredAt,
      rawReason: reason
    };
  }

  return {
    title: "Order cancelled",
    description: reason ?? "This order has been cancelled.",
    category: "unknown",
    occurredAt,
    rawReason: reason
  };
}
