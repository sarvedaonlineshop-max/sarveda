"use client";

import { useEffect, useState } from "react";

import { readZoneFromCookie, type Zone } from "@/lib/currency";

/** Client pricing zone from `sarveda_zone` cookie (set by geo middleware on first visit). */
export function usePricingZone(): Zone {
  const [zone, setZone] = useState<Zone>("IN");

  useEffect(() => {
    setZone(readZoneFromCookie());
  }, []);

  return zone;
}
