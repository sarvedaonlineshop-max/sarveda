import { NextRequest, NextResponse } from "next/server";

import { countryToZone, zoneToCurrency, type Zone } from "@/lib/currency";
import { detectCountryFromHeaders } from "@/lib/geo-zone";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const country =
    request.geo?.country?.trim().toUpperCase() ??
    detectCountryFromHeaders(request.headers);

  if (!country) {
    const zone: Zone = "IN";
    return NextResponse.json({
      success: true,
      data: {
        zone,
        country: null,
        currency: zoneToCurrency(zone),
        source: "default" as const
      }
    });
  }

  const zone = countryToZone(country);
  return NextResponse.json({
    success: true,
    data: {
      zone,
      country,
      currency: zoneToCurrency(zone),
      source: "geo" as const
    }
  });
}
