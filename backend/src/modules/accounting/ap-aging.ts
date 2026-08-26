/**
 * Native AP aging buckets — based on native outstanding only.
 * Uses dueDate when present; falls back to billDate per documented policy.
 */
export type ApAgingBucket = "CURRENT" | "1_30" | "31_60" | "61_90" | "OVER_90" | "PAID";

export function computeApAgingBucket(input: {
  outstandingNativeApInPaise: number;
  dueDate: Date | null;
  billDate: Date;
  asOf?: Date;
}): ApAgingBucket | null {
  if (input.outstandingNativeApInPaise <= 0) {
    return input.outstandingNativeApInPaise === 0 ? "PAID" : null;
  }

  const asOf = input.asOf ?? new Date();
  const anchor = input.dueDate ?? input.billDate;
  const daysPastDue = Math.floor(
    (asOf.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue <= 30) return "1_30";
  if (daysPastDue <= 60) return "31_60";
  if (daysPastDue <= 90) return "61_90";
  return "OVER_90";
}

export function isOverdueAp(input: {
  outstandingNativeApInPaise: number;
  dueDate: Date | null;
  billDate: Date;
  asOf?: Date;
}): boolean {
  if (input.outstandingNativeApInPaise <= 0) return false;
  const asOf = input.asOf ?? new Date();
  const anchor = input.dueDate ?? input.billDate;
  return asOf.getTime() > anchor.getTime();
}

export const AP_AGING_BUCKET_LABELS: Record<ApAgingBucket, string> = {
  CURRENT: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  OVER_90: ">90 days",
  PAID: "Paid (native)"
};
