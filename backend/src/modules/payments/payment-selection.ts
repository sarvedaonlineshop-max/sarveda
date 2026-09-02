import type { PaymentProvider, PaymentStatus } from "@prisma/client";

export type PaymentPickRow = {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  createdAt: Date;
};

const REFUNDABLE_STATUSES: PaymentStatus[] = ["CAPTURED", "PARTIALLY_REFUNDED"];

const NON_REFUNDABLE_STATUSES: PaymentStatus[] = [
  "PENDING",
  "FAILED",
  "AUTHORIZED",
  "REFUNDED"
];

/**
 * Gateway payments eligible for refund (excludes COD).
 */
export function listCapturedPaymentsForRefund<T extends PaymentPickRow>(payments: T[]): T[] {
  return payments.filter(
    (p) => p.provider !== "COD" && REFUNDABLE_STATUSES.includes(p.status)
  );
}

export type PickCapturedPaymentResult<T extends PaymentPickRow> =
  | { ok: true; payment: T }
  | { ok: false; code: "NO_PAYMENT"; message: string }
  | {
      ok: false;
      code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED";
      message: string;
      payments: T[];
    };

/**
 * Select the single authoritative captured payment for gateway refund.
 * Never guesses when multiple distinct CAPTURED rows exist.
 */
export function pickCapturedPaymentForRefund<T extends PaymentPickRow>(
  payments: T[]
): PickCapturedPaymentResult<T> {
  const refundable = listCapturedPaymentsForRefund(payments);

  if (refundable.length === 0) {
    return {
      ok: false,
      code: "NO_PAYMENT",
      message: "No captured payment to refund"
    };
  }

  const partiallyRefunded = refundable.filter((p) => p.status === "PARTIALLY_REFUNDED");
  if (partiallyRefunded.length === 1) {
    return { ok: true, payment: partiallyRefunded[0]! };
  }

  const capturedOnly = refundable.filter((p) => p.status === "CAPTURED");
  if (capturedOnly.length === 1 && partiallyRefunded.length === 0) {
    return { ok: true, payment: capturedOnly[0]! };
  }

  if (capturedOnly.length > 1) {
    return {
      ok: false,
      code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED",
      message:
        "Multiple captured payments found — manual reconciliation required before refund",
      payments: capturedOnly
    };
  }

  if (partiallyRefunded.length > 1) {
    return {
      ok: false,
      code: "MULTIPLE_CAPTURED_PAYMENTS_REVIEW_REQUIRED",
      message:
        "Multiple partially-refunded payments found — manual reconciliation required",
      payments: partiallyRefunded
    };
  }

  return {
    ok: false,
    code: "NO_PAYMENT",
    message: "No captured payment to refund"
  };
}

/** @deprecated Use pickCapturedPaymentForRefund for refund paths. */
export function pickPrimaryPayment<T extends PaymentPickRow>(payments: T[]): T | null {
  if (payments.length === 0) return null;
  const cod = payments.find((p) => p.provider === "COD");
  if (cod) return cod;
  const captured = payments
    .filter((p) => p.status === "CAPTURED" || p.status === "PARTIALLY_REFUNDED")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (captured[0]) return captured[0];
  return payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

export function isNonRefundableAttemptStatus(status: PaymentStatus): boolean {
  return NON_REFUNDABLE_STATUSES.includes(status);
}
