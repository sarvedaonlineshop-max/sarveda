/** GST rates (% inclusive) keyed by WooCommerce tax class slug. */
export const GST_RATES: Record<string, number> = {
  standard: 18,
  gst18: 18,
  gst12: 12,
  "gst-5": 5,
  "gst-zero-rate": 0
};

export function gstRatePercent(taxClass: string | null | undefined): number {
  if (!taxClass) return GST_RATES.standard;
  const key = taxClass.trim().toLowerCase();
  return GST_RATES[key] ?? GST_RATES.standard;
}

/** Extract GST from tax-inclusive line total (minor units). */
export function gstFromInclusiveLine(lineTotalMinor: number, ratePercent: number): {
  taxableMinor: number;
  taxMinor: number;
} {
  if (ratePercent <= 0) {
    return { taxableMinor: lineTotalMinor, taxMinor: 0 };
  }
  const taxMinor = Math.round((lineTotalMinor * ratePercent) / (100 + ratePercent));
  return { taxableMinor: lineTotalMinor - taxMinor, taxMinor };
}

/** Back-calculate GST from GST-inclusive price (minor units). Mirrors frontend/lib/gst.ts */
export function extractGst(
  inclusivePriceInPaise: number,
  gstRatePercent: number
): { baseInPaise: number; gstInPaise: number } {
  if (gstRatePercent <= 0) {
    return {
      baseInPaise: inclusivePriceInPaise,
      gstInPaise: 0
    };
  }
  const rate = gstRatePercent / 100;
  const baseInPaise = Math.round(inclusivePriceInPaise / (1 + rate));
  const gstInPaise = inclusivePriceInPaise - baseInPaise;
  return { baseInPaise, gstInPaise };
}

/** Same default as frontend confirmed page (DEFAULT_DISPLAY_GST_RATE). */
export const DEFAULT_DISPLAY_GST_RATE = 18;

export function sellerStateCode(): string {
  return (process.env.SELLER_STATE ?? "Karnataka").trim();
}

export function isInterState(buyerState: string, buyerCountry: string): boolean {
  const country = buyerCountry.trim().toUpperCase();
  if (country !== "IN") return true;
  return buyerState.trim().toLowerCase() !== sellerStateCode().toLowerCase();
}
