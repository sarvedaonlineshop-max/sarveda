"use client";

import { useEffect, useState } from "react";

import { readZoneFromCookie, type Zone } from "@/lib/currency";
import { PRICING_ZONE_CHANGED } from "@/lib/pricing-zone";

/** Client pricing zone from `sarveda_zone` cookie (geo on first visit; refreshed on login). */
export function usePricingZone(): Zone {
  const [zone, setZone] = useState<Zone>("IN");

  useEffect(() => {
    setZone(readZoneFromCookie());

    const onZoneChange = () => setZone(readZoneFromCookie());
    window.addEventListener(PRICING_ZONE_CHANGED, onZoneChange);
    return () => window.removeEventListener(PRICING_ZONE_CHANGED, onZoneChange);
  }, []);

  return zone;
}
