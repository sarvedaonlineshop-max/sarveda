export type ShipmentCarrierMeta = {
  manual?: boolean;
  direction?: string;
  mpsWaybills?: string[];
  carrier?: string;
};

export type AwbLabelRow = {
  awb: string;
  role: "parent" | "child" | "external" | "return";
  boxLabel: string;
  courier: string;
  trackingUrl: string | null;
  status: string;
  shipmentId: string;
  cancelWaybill: string;
  isDelhiveryIntegrated: boolean;
};

function delhiveryTrackUrl(awb: string): string {
  return `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`;
}

export function isDelhiveryIntegratedCourier(courier: string): boolean {
  return courier.trim().toLowerCase().includes("delhivery");
}

export function expandShipmentAwbs(shipment: {
  id: string;
  courier: string;
  awb: string | null;
  trackingUrl: string | null;
  status: string;
  carrierMeta?: ShipmentCarrierMeta | null;
}): AwbLabelRow[] {
  const awb = shipment.awb?.trim();
  if (!awb) return [];

  const meta = shipment.carrierMeta ?? {};
  const isDel = isDelhiveryIntegratedCourier(shipment.courier);
  const isReturn = meta.direction === "REVERSE" || shipment.courier.toLowerCase().includes("return");
  const mps = Array.isArray(meta.mpsWaybills)
    ? meta.mpsWaybills.map((w) => String(w)).filter(Boolean)
    : [];

  if (isDel && mps.length > 1) {
    return mps.map((wb, idx) => ({
      awb: wb,
      role: isReturn ? "return" : idx === 0 ? "parent" : "child",
      boxLabel: idx === 0 ? "Parent AWB (Box 1)" : `Child AWB (Box ${idx + 1})`,
      courier: shipment.courier,
      trackingUrl: delhiveryTrackUrl(wb),
      status: shipment.status,
      shipmentId: shipment.id,
      cancelWaybill: awb,
      isDelhiveryIntegrated: true
    }));
  }

  return [
    {
      awb,
      role: isReturn ? "return" : meta.manual ? "external" : "parent",
      boxLabel: isReturn
        ? "Return AWB"
        : meta.manual
          ? "External reference"
          : "Delhivery AWB",
      courier: shipment.courier,
      trackingUrl: shipment.trackingUrl || (isDel ? delhiveryTrackUrl(awb) : null),
      status: shipment.status,
      shipmentId: shipment.id,
      cancelWaybill: awb,
      isDelhiveryIntegrated: isDel && !meta.manual
    }
  ];
}

export function allOrderAwbRows(
  shipments: Array<{
    id: string;
    courier: string;
    awb: string | null;
    trackingUrl: string | null;
    status: string;
    carrierMeta?: ShipmentCarrierMeta | null;
  }>
): AwbLabelRow[] {
  return shipments.flatMap((s) => expandShipmentAwbs(s));
}
