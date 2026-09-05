"use client";

import { useState } from "react";

import {
  adminMarkReplacementDelivered,
  adminShipReplacement
} from "@/lib/replacement-workflow";

type Fulfillment = {
  id: string;
  qty: number;
  status: string;
  replacementVariantId: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

export function AdminReplacementFulfillmentPanel({
  fulfillment,
  readyAfterQc,
  returnAwb,
  onDone
}: {
  fulfillment: Fulfillment;
  readyAfterQc: boolean;
  returnAwb?: string | null;
  onDone: () => void;
}) {
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = fulfillment.status === "REPLACEMENT_PENDING";
  const shipped = fulfillment.status === "REPLACEMENT_SHIPPED";
  const delivered = fulfillment.status === "REPLACEMENT_DELIVERED";

  async function createForwardShipment() {
    const cleanCourier = courier.trim();
    const cleanAwb = awb.trim();
    if (!cleanCourier || !cleanAwb) {
      setError("Enter the forward courier and a new replacement AWB.");
      return;
    }
    if (returnAwb?.trim() && cleanAwb === returnAwb.trim()) {
      setError("Use a new forward AWB. The return-pickup AWB cannot be reused.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminShipReplacement(fulfillment.id, {
        courier: cleanCourier,
        awb: cleanAwb,
        trackingUrl: trackingUrl.trim() || undefined
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create replacement shipment");
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered() {
    setBusy(true);
    setError(null);
    try {
      await adminMarkReplacementDelivered(fulfillment.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark replacement delivered");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Replacement fulfillment</p>
          <h3 className="mt-1 text-lg font-extrabold text-indigo-950">Send new item ×{fulfillment.qty}</h3>
          <p className="mt-1 text-sm text-indigo-800/75">
            The returned item is handled separately by warehouse QC. This shipment consumes a fresh replacement unit.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 shadow-sm">
          {fulfillment.status.replace(/_/g, " ")}
        </span>
      </div>

      {pending ? (
        readyAfterQc ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-semibold text-stone-700">
              Forward courier
              <input
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
                placeholder="e.g. Delhivery"
                className="mt-1 h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-stone-700">
              New forward AWB
              <input
                value={awb}
                onChange={(e) => setAwb(e.target.value)}
                placeholder="Replacement shipment AWB"
                className="mt-1 h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 font-normal"
              />
            </label>
            <label className="text-sm font-semibold text-stone-700">
              Tracking URL <span className="font-normal text-stone-400">(optional)</span>
              <input
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 font-normal"
              />
            </label>
            <div className="md:col-span-3">
              <button
                type="button"
                disabled={busy || !courier.trim() || !awb.trim()}
                onClick={() => void createForwardShipment()}
                className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {busy ? "Creating shipment…" : "Create replacement forward shipment"}
              </button>
              {returnAwb ? <p className="mt-2 text-xs text-stone-500">Return AWB {returnAwb} is locked and cannot be reused.</p> : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Waiting for warehouse receipt and completed QC. Replacement shipment stays locked until then.
          </div>
        )
      ) : shipped ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div>
            <p className="font-bold text-blue-950">Replacement is in transit</p>
            <p className="text-sm text-blue-800">Mark it delivered only after delivery is confirmed.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void markDelivered()}
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Mark replacement delivered"}
          </button>
        </div>
      ) : delivered ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
          Replacement delivered. This replacement fulfillment is complete.
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
          Replacement status: {fulfillment.status.replace(/_/g, " ")}.
        </div>
      )}

      {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}
    </section>
  );
}
