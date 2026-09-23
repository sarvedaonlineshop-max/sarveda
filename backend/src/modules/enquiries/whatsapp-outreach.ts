/** First name for outreach template {{1}}. Falls back to "there" when the stored name is missing or just the number. */
export function outreachCustomerFirstName(
  customerName: string | null | undefined,
  waPhone?: string | null
): string {
  const trimmed = customerName?.trim();
  if (!trimmed) return "there";
  if (waPhone && trimmed === waPhone) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}
