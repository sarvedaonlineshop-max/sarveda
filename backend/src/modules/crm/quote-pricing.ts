export type QuoteCurrency = "INR" | "USD" | "AED";

export const QUOTE_APPROVER_EMAILS = [
  "deepak@sarveda.com",
  "arjun@sarveda.com",
  "partha@sarveda.com"
] as const;

/**
 * Price list follows the delivery country on the quotation.
 * The customer's phone country is not an input here.
 * India → INR. UAE → AED. Every other destination → USD.
 */
export function currencyForDeliveryCountry(country?: string | null): QuoteCurrency {
  const code = (country ?? "").trim().toUpperCase();
  if (code === "IN" || code === "IND" || code === "INDIA") return "INR";
  if (code === "AE" || code === "ARE" || code === "UAE") return "AED";
  return "USD";
}

export function canApproveQuote(email?: string | null): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  return (QUOTE_APPROVER_EMAILS as readonly string[]).includes(normalized);
}

/** Same people see every quotation. Everyone else sees only the chats they own. */
export function canSeeAllQuotes(email?: string | null): boolean {
  return canApproveQuote(email);
}

export function priceMinorForCurrency(
  variant: {
    saleInPaise: number;
    mrpInPaise: number;
    saleUsdCents?: number | null;
    mrpUsdCents?: number | null;
    saleAedFils?: number | null;
    mrpAedFils?: number | null;
  },
  currency: QuoteCurrency
): number {
  if (currency === "INR") return variant.saleInPaise || variant.mrpInPaise || 0;
  if (currency === "AED") return variant.saleAedFils || variant.mrpAedFils || 0;
  return variant.saleUsdCents || variant.mrpUsdCents || 0;
}
