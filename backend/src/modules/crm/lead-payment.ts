export const LEAD_PAYMENT_METHODS = ["PREPAID", "PARTIAL", "COD", "CREDIT"] as const;
export type LeadPaymentMethod = (typeof LEAD_PAYMENT_METHODS)[number];

export const LEAD_PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
export type LeadPaymentStatus = (typeof LEAD_PAYMENT_STATUSES)[number];

export type LeadReceiptInput = {
  amountInPaise: number;
  channel: string;
  status: string;
};

const RECEIVED_CHANNELS = new Set(["GATEWAY", "BANK_UPI", "COD_SETTLEMENT"]);

export function receivedMinor(receipts: LeadReceiptInput[]): number {
  return receipts.reduce((sum, receipt) => {
    if (receipt.status !== "VERIFIED") return sum;
    if (!RECEIVED_CHANNELS.has(receipt.channel)) return sum;
    return sum + receipt.amountInPaise;
  }, 0);
}

export function leadPaymentStatus(input: {
  total: number;
  received: number;
  dueAt: Date | null;
  now?: Date;
}): LeadPaymentStatus {
  if (input.total > 0 && input.received >= input.total) return "PAID";
  const now = input.now ?? new Date();
  if (input.dueAt && input.dueAt.getTime() < now.getTime() && input.received < input.total) {
    return "OVERDUE";
  }
  if (input.received > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

export function dueAtFromDate(date: string | null | undefined): Date | null {
  if (!date) return null;
  return new Date(`${date}T23:59:59+05:30`);
}
