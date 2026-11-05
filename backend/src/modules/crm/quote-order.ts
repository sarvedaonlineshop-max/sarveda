import { LEAD_PAYMENT_METHODS, leadPaymentStatus, type LeadPaymentMethod } from "./lead-payment";

export type QuoteOrderMode = "PAID" | "COD" | "HOLD";

export function quoteOrderDecision(input: {
  method: string | null;
  received: number;
  total: number;
  dueAt: Date | null;
}): { ok: true; mode: QuoteOrderMode } | { ok: false; message: string } {
  const method: LeadPaymentMethod = (LEAD_PAYMENT_METHODS as readonly string[]).includes(input.method ?? "")
    ? (input.method as LeadPaymentMethod)
    : "PREPAID";
  const status = leadPaymentStatus({
    total: input.total,
    received: input.received,
    dueAt: input.dueAt
  });
  const paid = status === "PAID";
  if (method === "PREPAID" && !paid) {
    return { ok: false, message: "A prepaid quotation can become an order only after it is paid." };
  }
  if (method === "PARTIAL" && input.received <= 0) {
    return { ok: false, message: "Record a confirmed payment before creating this order." };
  }
  if (!paid && method === "COD") return { ok: true, mode: "COD" };
  if (paid) return { ok: true, mode: "PAID" };
  return { ok: true, mode: "HOLD" };
}
