"use client";

import { formatMinorFromPaise } from "@/lib/money";
import type { AdminPickupLocationRow } from "@/lib/admin-api";

export type DeliveryPartnerCode =
  | "DELHIVERY"
  | "INDIA_POST"
  | "FEDEX"
  | "ARAMEX"
  | "OTHER";

export const DELIVERY_PARTNER_OPTIONS: Array<{ value: DeliveryPartnerCode; label: string }> = [
  { value: "DELHIVERY", label: "Delhivery" },
  { value: "INDIA_POST", label: "India Post" },
  { value: "FEDEX", label: "FedEx" },
  { value: "ARAMEX", label: "Aramex" },
  { value: "OTHER", label: "Others" }
];

export type LineFulfillmentPref = {
  sourceId: string;
  partner: DeliveryPartnerCode | "";
  customPartnerName: string;
};

export type ShipmentLineItem = {
  id?: string;
  nameSnapshot: string;
  skuSnapshot: string;
  qtyOrdered: number;
  qtyShippable?: number;
  returnedQty?: number;
  warehouseFulfillmentQty?: number;
  dropShipFulfillmentQty?: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  pickupLocation?: { id: string; label: string } | null;
};

export function partnerDisplayLabel(pref: LineFulfillmentPref | undefined): string {
  if (!pref?.partner) return "";
  if (pref.partner === "OTHER") return pref.customPartnerName.trim() || "Others";
  return DELIVERY_PARTNER_OPTIONS.find((o) => o.value === pref.partner)?.label ?? pref.partner;
}

export function coveredOrderItemIdsFromShipments(
  shipments: Array<{ awb?: string | null; carrierMeta?: unknown; courier?: string }> | undefined
): Set<string> {
  const covered = new Set<string>();
  if (!shipments?.length) return covered;
  const forwards = shipments.filter((s) => {
    const meta = s.carrierMeta as { direction?: string } | null | undefined;
    if (meta?.direction === "REVERSE") return false;
    return Boolean(s.awb?.trim());
  });
  if (!forwards.length) return covered;

  let hasLegacyFullOrder = false;
  for (const s of forwards) {
    const meta = s.carrierMeta as { orderItemIds?: string[] } | null | undefined;
    if (Array.isArray(meta?.orderItemIds) && meta!.orderItemIds!.length > 0) {
      for (const id of meta!.orderItemIds!) covered.add(id);
    } else {
      hasLegacyFullOrder = true;
    }
  }
  if (hasLegacyFullOrder && covered.size === 0) {
    // Legacy full-order label: treat all lines as already covered by the caller.
    covered.add("__LEGACY_FULL_ORDER__");
  }
  return covered;
}

type Props = {
  items: ShipmentLineItem[];
  currency: string;
  pickupOptions: AdminPickupLocationRow[];
  prefs: Record<string, LineFulfillmentPref>;
  selectedIds: Set<string>;
  coveredIds: Set<string>;
  legacyFullyCovered: boolean;
  panelSourceId: string;
  panelPartner: DeliveryPartnerCode | "";
  panelCustomName: string;
  onToggle: (id: string) => void;
  onToggleAllOpen: () => void;
  onPanelSource: (id: string) => void;
  onPanelPartner: (code: DeliveryPartnerCode | "") => void;
  onPanelCustomName: (name: string) => void;
  onApplyPanel: () => void;
};

export function ShipmentLineFulfillmentTable({
  items,
  currency,
  pickupOptions,
  prefs,
  selectedIds,
  coveredIds,
  legacyFullyCovered,
  panelSourceId,
  panelPartner,
  panelCustomName,
  onToggle,
  onToggleAllOpen,
  onPanelSource,
  onPanelPartner,
  onPanelCustomName,
  onApplyPanel
}: Props) {
  const openItems = items.filter((it) => {
    const id = it.id;
    if (!id) return false;
    const qty = typeof it.qtyShippable === "number" ? it.qtyShippable : it.qtyOrdered;
    if (qty <= 0) return false;
    if (legacyFullyCovered) return false;
    return !coveredIds.has(id);
  });
  const allOpenSelected =
    openItems.length > 0 && openItems.every((it) => it.id && selectedIds.has(it.id));

  return (
    <div className="mt-5 space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b text-[11px] font-bold uppercase tracking-wide text-stone-400">
            <tr>
              <th className="py-2 pr-2 w-10">
                <input
                  type="checkbox"
                  checked={allOpenSelected}
                  onChange={onToggleAllOpen}
                  disabled={openItems.length === 0}
                  aria-label="Select all open items"
                />
              </th>
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">Qty</th>
              <th className="py-2 pr-2">Source</th>
              <th className="py-2 pr-2 text-right">Total</th>
              <th className="py-2 pl-2">Delivery Partner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((it) => {
              const id = it.id;
              if (!id) return null;
              const qty =
                typeof it.qtyShippable === "number" ? it.qtyShippable : it.qtyOrdered;
              if (qty <= 0) return null;
              const covered = legacyFullyCovered || coveredIds.has(id);
              const pref = prefs[id];
              const sourceLabel =
                pickupOptions.find((p) => p.id === pref?.sourceId)?.label ||
                it.pickupLocation?.label ||
                "";
              const partnerLabel = partnerDisplayLabel(pref);
              const linePaise =
                it.qtyOrdered > 0
                  ? Math.round((it.lineTotalInPaise * qty) / it.qtyOrdered)
                  : it.lineTotalInPaise;
              return (
                <tr key={id} className={covered ? "opacity-60" : undefined}>
                  <td className="py-2.5 pr-2 align-top">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(id)}
                      disabled={covered}
                      onChange={() => onToggle(id)}
                      aria-label={`Select ${it.nameSnapshot}`}
                    />
                  </td>
                  <td className="py-2.5 pr-2 align-top">
                    <div className="font-extrabold text-stone-950">{it.nameSnapshot}</div>
                    <div className="mt-0.5 font-mono text-xs text-stone-500">{it.skuSnapshot}</div>
                    {(it.dropShipFulfillmentQty ?? 0) > 0 ? (
                      <div className="mt-0.5 text-xs font-semibold text-violet-800">
                        Drop-ship
                        {(it.warehouseFulfillmentQty ?? 0) > 0
                          ? ` · ${it.dropShipFulfillmentQty} of ${it.qtyOrdered}`
                          : ""}
                      </div>
                    ) : null}
                    {typeof it.returnedQty === "number" && it.returnedQty > 0 ? (
                      <div className="mt-0.5 text-xs text-amber-800">
                        Ordered {it.qtyOrdered}, restocked {it.returnedQty}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2 align-top font-extrabold">{qty}</td>
                  <td className="py-2.5 pr-2 align-top text-stone-600">
                    {sourceLabel || (covered ? "—" : <span className="text-stone-400">—</span>)}
                  </td>
                  <td className="py-2.5 pr-2 align-top text-right font-extrabold">
                    {formatMinorFromPaise(linePaise, currency)}
                  </td>
                  <td className="py-2.5 pl-2 align-top text-stone-700">
                    {partnerLabel ||
                      (covered ? (
                        <span className="text-xs font-semibold text-emerald-800">Shipped</span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedIds.size > 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-extrabold text-emerald-950">
            Assign {selectedIds.size} selected item{selectedIds.size === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-emerald-900/80">
            Choose source warehouse and delivery partner, then apply. Delhivery keeps the full label
            form; other partners use manual AWB entry.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-stone-600">
              Source location
              <select
                value={panelSourceId}
                onChange={(e) => onPanelSource(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-900"
              >
                <option value="">Select source…</option>
                {pickupOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.city ? ` · ${p.city}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-stone-600">
              Delivery partner
              <select
                value={panelPartner}
                onChange={(e) => onPanelPartner(e.target.value as DeliveryPartnerCode | "")}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-900"
              >
                <option value="">Select partner…</option>
                {DELIVERY_PARTNER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {panelPartner === "OTHER" ? (
            <label className="mt-3 block text-xs font-semibold text-stone-600">
              Custom partner name
              <input
                value={panelCustomName}
                onChange={(e) => onPanelCustomName(e.target.value)}
                placeholder="e.g. Local courier"
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-900"
              />
            </label>
          ) : null}
          <button
            type="button"
            onClick={onApplyPanel}
            className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
          >
            Apply to selected
          </button>
        </div>
      ) : null}
    </div>
  );
}
