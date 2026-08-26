/** GST rates (% inclusive) keyed by WooCommerce tax class slug. */
import {
  normalizeGstState,
  resolveSellerGstIdentity
} from "./gst-state";

export const GST_RATES: Record<string, number> = {
  standard: 18,
  gst18: 18,
  gst12: 12,
  "gst-5": 5,
  "gst-zero-rate": 0
};

export type GstRateLookup = {
  ratePercent: number;
  taxClassRaw: string | null;
  known: boolean;
  defaulted: boolean;
};

export function gstRatePercent(taxClass: string | null | undefined): number {
  return lookupGstRate(taxClass).ratePercent;
}

/** Explicit lookup — unknown taxClass still defaults to 18 for ORDER_PAID_V1 compatibility. */
export function lookupGstRate(taxClass: string | null | undefined): GstRateLookup {
  if (!taxClass?.trim()) {
    return {
      ratePercent: GST_RATES.standard,
      taxClassRaw: taxClass ?? null,
      known: false,
      defaulted: true
    };
  }
  const key = taxClass.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(GST_RATES, key)) {
    return {
      ratePercent: GST_RATES[key]!,
      taxClassRaw: taxClass,
      known: true,
      defaulted: false
    };
  }
  return {
    ratePercent: GST_RATES.standard,
    taxClassRaw: taxClass,
    known: false,
    defaulted: true
  };
}

/** Extract GST from tax-inclusive line total (minor units). */
export function gstFromInclusiveLine(
  lineTotalMinor: number,
  ratePercent: number
): {
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

/**
 * Uses canonical GST state codes so KA ≡ Karnataka.
 * Unresolved place/seller → true (inter); posting path fails closed via resolvePlaceOfSupply.
 */
export function isInterState(buyerState: string, buyerCountry: string): boolean {
  const country = buyerCountry.trim().toUpperCase();
  if (country !== "IN") return true;
  const seller = resolveSellerGstIdentity();
  const place = normalizeGstState(buyerState);
  if (!seller.ok || !place.ok) return true;
  return seller.sellerStateCode !== place.state.code;
}
