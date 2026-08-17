import type { Prisma } from "@prisma/client";

/**
 * Unpaid checkout that is not a real shop order for the customer:
 * still waiting for payment, or timed out / gateway-failed without a capture.
 * COD is excluded — those are placed orders.
 */
export const unpaidCheckoutAttemptWhere: Prisma.OrderWhereInput = {
  AND: [
    { NOT: { payments: { some: { provider: "COD" } } } },
    {
      OR: [
        { status: "PENDING_PAYMENT" },
        {
          status: "CANCELLED",
          paymentStatus: { notIn: ["CAPTURED", "PARTIALLY_REFUNDED"] }
        }
      ]
    }
  ]
};

/** Timed-out or failed checkout (DB still CANCELLED). Not a customer cancel of a paid order. */
export const unpaidAttemptCancelledWhere: Prisma.OrderWhereInput = {
  status: "CANCELLED",
  paymentStatus: { notIn: ["CAPTURED", "PARTIALLY_REFUNDED"] },
  NOT: { payments: { some: { provider: "COD" } } }
};

/** Paid or COD order that was actually cancelled. */
export const genuineCancelledWhere: Prisma.OrderWhereInput = {
  status: "CANCELLED",
  OR: [
    { paymentStatus: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } },
    { payments: { some: { provider: "COD" } } }
  ]
};
