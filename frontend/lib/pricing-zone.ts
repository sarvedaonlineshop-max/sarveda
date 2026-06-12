import { readZoneFromCookie, writeZoneCookie, type Zone } from "@/lib/currency";

export const PRICING_ZONE_CHANGED = "sarveda-zone-changed";

export type GeoZonePayload = {
  zone: Zone;
  country: string | null;
  currency: string;
  source: "geo" | "default";
};

/** Fetch detected zone from edge geo API and persist to `sarveda_zone` cookie. */
export async function syncPricingZoneFromGeo(): Promise<Zone | null> {
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch("/api/geo/zone", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: GeoZonePayload;
    };
    if (!res.ok || !json.success || !json.data?.zone) return null;

    const zone = json.data.zone;
    const previous = readZoneFromCookie();
    writeZoneCookie(zone);

    if (zone !== previous) {
      window.dispatchEvent(new CustomEvent(PRICING_ZONE_CHANGED, { detail: zone }));
    }

    return zone;
  } catch {
    return null;
  }
}
