/** Pricing zone — matches backend `ZoneKey`. */
export type Zone = "IN" | "US" | "GB" | "OTHER";

export const ZONE_COOKIE = "sarveda_zone";

/** How long we remember auto-detected or chosen pricing zone (days). */
export const ZONE_COOKIE_MAX_AGE_DAYS = 30;

const VALID_ZONES: Zone[] = ["IN", "US", "GB", "OTHER"];

export function isValidZone(value: string | undefined | null): value is Zone {
  return VALID_ZONES.includes(value as Zone);
}

export function zoneToCurrency(zone: Zone): "INR" | "USD" | "GBP" {
  if (zone === "GB") return "GBP";
  if (zone === "IN") return "INR";
  return "USD";
}

export function readZoneFromCookie(): Zone {
  if (typeof document === "undefined") return "IN";
  const match = document.cookie.match(new RegExp(`(?:^|; )${ZONE_COOKIE}=([^;]*)`));
  const raw = match?.[1];
  if (isValidZone(raw)) return raw;
  return "IN";
}

/** Persist shopper pricing zone (e.g. manual country picker in header). */
export function writeZoneCookie(zone: Zone): void {
  if (typeof document === "undefined") return;
  const maxAge = ZONE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${ZONE_COOKIE}=${zone}; path=/; max-age=${maxAge}; samesite=lax${secure ? "; secure" : ""}`;
}

/** ISO alpha-2 for review country flag — pricing zones map 1:1 except OTHER. */
export function zoneToReviewerCountry(zone: Zone): string | undefined {
  if (zone === "IN" || zone === "US" || zone === "GB") return zone;
  return undefined;
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
