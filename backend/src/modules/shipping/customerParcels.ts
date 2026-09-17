/**
 * Customer-facing parcel list for one order.
 *
 * An order can ship as several labels (and a Delhivery multi-piece booking carries child
 * waybills inside `carrierMeta`), so every customer surface — account, order lookup, WhatsApp —
 * must show all of them rather than the newest shipment alone. Return labels stay hidden: the
 * shopper tracks what is coming to them, not what is going back.
 */

export type CustomerParcel = {
  label: string;
  courier: string;
  awb: string;
  trackingUrl: string;
  status: string;
};

type ShipmentRow = {
  courier: string;
  awb: string | null;
  trackingUrl: string | null;
  status: string;
  carrierMeta?: unknown;
};

type ParcelMeta = {
  direction?: string;
  mpsWaybills?: unknown;
};

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda.com";
  return raw.replace(/\/$/, "");
}

export function parcelTrackUrl(awb: string): string {
  return `${siteBaseUrl()}/track/${encodeURIComponent(awb)}`;
}

function isReturnShipment(s: ShipmentRow, meta: ParcelMeta | null): boolean {
  return meta?.direction === "REVERSE" || s.courier.toLowerCase().includes("return");
}

export function customerParcels(shipments: ShipmentRow[] | null | undefined): CustomerParcel[] {
  if (!shipments?.length) return [];

  const rows: CustomerParcel[] = [];
  const seen = new Set<string>();

  // Callers query newest-first; walk oldest-first so "Parcel 1" keeps pointing at the
  // same box as later labels are added.
  for (const s of [...shipments].reverse()) {
    const awb = s.awb?.trim();
    if (!awb || awb.toUpperCase().startsWith("STUB-")) continue;

    const meta =
      s.carrierMeta && typeof s.carrierMeta === "object" && !Array.isArray(s.carrierMeta)
        ? (s.carrierMeta as ParcelMeta)
        : null;
    if (isReturnShipment(s, meta)) continue;

    const mps = Array.isArray(meta?.mpsWaybills)
      ? meta!.mpsWaybills.map((w) => String(w).trim()).filter(Boolean)
      : [];
    const waybills = mps.length > 1 ? mps : [awb];

    for (const wb of waybills) {
      if (seen.has(wb)) continue;
      seen.add(wb);
      rows.push({
        label: "",
        courier: s.courier,
        // Child boxes of a multi-piece booking have no own tracking page at the carrier.
        trackingUrl: (wb === awb && s.trackingUrl?.trim()) || parcelTrackUrl(wb),
        awb: wb,
        status: s.status
      });
    }
  }

  return rows.map((row, i) => ({
    ...row,
    label: rows.length > 1 ? `Parcel ${i + 1} of ${rows.length}` : "Parcel"
  }));
}
