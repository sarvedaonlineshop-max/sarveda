/** INR rupees → paise (integer). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** USD dollars → cents. */
export function toUsdCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** GBP pounds → pence. */
export function toGbpPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function parseDecimal(raw: string | undefined | null): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** FX to INR (major units) for Woo admin reporting — tune via env on EC2. */
const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: parseFloat(process.env.REPORTING_USD_INR ?? "83"),
  GBP: parseFloat(process.env.REPORTING_GBP_INR ?? "105"),
  EUR: parseFloat(process.env.REPORTING_EUR_INR ?? "90"),
  AED: parseFloat(process.env.REPORTING_AED_INR ?? "22.6")
};

/**
 * Convert order grand total (stored in minor units of order currency) to INR paise for dashboard totals.
 * Matches Woo Analytics treating international orders in base currency INR.
 */
export function reportingInrPaiseFromOrder(currency: string, amountMinor: number): number {
  const c = (currency || "INR").toUpperCase();
  if (c === "INR") return amountMinor;
  const fx = FX_TO_INR[c] ?? FX_TO_INR.USD;
  const major = amountMinor / 100;
  return Math.round(major * fx * 100);
}

/** Woo "Net sales" = order total minus tax and shipping (coupons already in order total). */
export function reportingNetSalesInrPaiseFromOrder(
  currency: string,
  grandTotalMinor: number,
  shippingMinor = 0,
  taxMinor = 0
): number {
  const netMinor = Math.max(0, grandTotalMinor - shippingMinor - taxMinor);
  return reportingInrPaiseFromOrder(currency, netMinor);
}
