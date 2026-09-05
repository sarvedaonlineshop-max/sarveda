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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = fulfillment.status === "REPLACEMENT_PENDING";
  const shipped = fulfillment.status === "REPLACEMENT_SHIPPED";
  const delivered = fulfillment.status === "REPLACEMENT_DELIVERED";

  async function createForwardShipment() {
    setBusy(true);
    setError(null);
    try {
      await adminShipReplacement(fulfillment.id);
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
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Replacement shipment</p>
          <h3 className="mt-1 text-lg font-extrabold text-indigo-950">Send new item ×{fulfillment.qty}</h3>
          <p className="mt-1 text-sm text-indigo-800/75">
            Warehouse QC controls the returned item separately. This creates a new forward Delhivery shipment and consumes a fresh replacement unit.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 shadow-sm">
          {fulfillment.status.replace(/_/g, " ")}
        </span>
      </div>

      {pending ? (
        readyAfterQc ? (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-white p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold text-stone-950">Create new forward shipment</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Sarveda will create a fresh Delhivery AWB for the replacement. The return-pickup AWB is never reused.
                </p>
                {returnAwb ? <p className="mt-1 text-xs text-stone-500">Return pickup AWB: {returnAwb}</p> : null}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createForwardShipment()}
                className="shrink-0 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-indigo-800 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
              >
                {busy ? "Creating Delhivery shipment…" : "Create replacement shipment"}
              </button>
            </div>
            <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
              After creation, the new AWB and tracking are stored against this replacement and the customer is notified by email and WhatsApp when the configured WhatsApp template is available.
            </p>
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
            <p className="text-sm text-blue-800">A separate forward shipment has been created. Confirm delivery only after carrier/customer confirmation.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void markDelivered()}
            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-50"
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
