/** Pricing zone — matches backend `ZoneKey`. */
export type Zone = "IN" | "US" | "GB" | "OTHER";

export const ZONE_COOKIE = "sarveda_zone";

export function zoneToCurrency(zone: Zone): "INR" | "USD" | "GBP" {
  if (zone === "GB") return "GBP";
  if (zone === "IN") return "INR";
  return "USD";
}

export function readZoneFromCookie(): Zone {
  if (typeof document === "undefined") return "IN";
  const match = document.cookie.match(new RegExp(`(?:^|; )${ZONE_COOKIE}=([^;]*)`));
  const raw = match?.[1];
  if (raw === "US" || raw === "GB" || raw === "IN" || raw === "OTHER") return raw;
  return "IN";
}

export function countryToZone(country: string): Zone {
  const c = country.toUpperCase();
  if (c === "IN") return "IN";
  if (c === "US") return "US";
  if (c === "GB" || c === "UK") return "GB";
  return "OTHER";
}

export type VariantPriceFields = {
  saleInPaise: number;
  mrpInPaise: number;
  saleUsdCents?: number | null;
  mrpUsdCents?: number | null;
  saleGbpPence?: number | null;
  mrpGbpPence?: number | null;
};

export function unitSaleMinor(variant: VariantPriceFields, zone: Zone): number {
  switch (zone) {
    case "IN":
      return variant.saleInPaise;
    case "GB":
      return variant.saleGbpPence ?? variant.saleInPaise;
    case "US":
    case "OTHER":
      return variant.saleUsdCents ?? variant.saleInPaise;
    default:
      return variant.saleInPaise;
  }
}

export function unitMrpMinor(variant: VariantPriceFields, zone: Zone): number {
  switch (zone) {
    case "IN":
      return variant.mrpInPaise;
    case "GB":
      return variant.mrpGbpPence ?? variant.mrpInPaise;
    case "US":
    case "OTHER":
      return variant.mrpUsdCents ?? variant.mrpInPaise;
    default:
      return variant.mrpInPaise;
  }
}
