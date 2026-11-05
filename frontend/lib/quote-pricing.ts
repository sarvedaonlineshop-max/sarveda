export type QuoteCurrency = "INR" | "USD" | "AED";

export const QUOTE_APPROVER_EMAILS = ["deepak@sarveda.com", "arjun@sarveda.com", "partha@sarveda.com"];

/** Delivery country chooses the price list. A phone country code is not an input. */
export function currencyForDeliveryCountry(country?: string | null): QuoteCurrency {
  const code = (country ?? "").trim().toUpperCase();
  if (code === "IN" || code === "IND" || code === "INDIA") return "INR";
  if (code === "AE" || code === "ARE" || code === "UAE") return "AED";
  return "USD";
}

export function canApproveQuote(email?: string | null): boolean {
  return QUOTE_APPROVER_EMAILS.includes((email ?? "").trim().toLowerCase());
}

/** Arjun, Deepak, and Partha see every quotation. Other admins see their own. */
export function canSeeAllQuotes(email?: string | null): boolean {
  return canApproveQuote(email);
}

export function formatQuoteMoney(minor: number, currency?: string | null): string {
  const code = currency === "USD" || currency === "AED" || currency === "INR" ? currency : "INR";
  const locale = code === "INR" ? "en-IN" : code === "AED" ? "en-AE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: code === "INR" ? 0 : 2
  }).format((minor || 0) / 100);
}
