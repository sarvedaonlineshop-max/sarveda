"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchOrderRtoWorkflow,
  fetchOrderRefundPreview,
  markShipmentRtoReceived,
  setShipmentRtoDisposition,
  executeShipmentRtoRefund,
  type OrderRefundPreviewBreakdown,
  type RtoWorkflowState
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

type Props = {
  orderId: string;
  currency: string;
  onUpdated?: () => void;
};

function dispositionLabel(value: string | null | undefined): string {
  switch (value) {
    case "RESTOCKABLE":
      return "Restockable";
    case "DAMAGED_NON_RESTOCKABLE":
      return "Damaged / non-restockable";
    case "NEEDS_REVIEW":
      return "Needs review";
    default:
      return "Not set";
  }
}

function refundStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "NOT_APPLICABLE":
      return "Not applicable (COD)";
    case "PENDING":
      return "Pending";
    case "ACCOUNTING_REVIEW_REQUIRED":
      return "Accounting review required";
    case "READY_FOR_REFUND":
      return "Ready for refund";
    case "PROCESSING":
      return "Processing";
    case "REFUNDED":
      return "Refunded";
    case "FAILED":
      return "Failed";
    default:
      return "—";
  }
}

export function AdminOrderRtoWorkflow({ orderId, currency, onUpdated }: Props) {
  const [state, setState] = useState<RtoWorkflowState | null>(null);
  const [breakdown, setBreakdown] = useState<OrderRefundPreviewBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrderRtoWorkflow(orderId);
      setState(data);
      if (data.anyReceived) {
        const preview = await fetchOrderRefundPreview(orderId, "RTO_SHIPPING_RETAINED");
        setBreakdown(preview.breakdown);
      } else {
        setBreakdown(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load RTO workflow");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm text-stone-500">Loading RTO workflow…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-sm text-amber-900 dark:text-amber-200">{error}</p>
      </div>
    );
  }

  if (!state?.hasCarrierRto) return null;

  const shipment = state.shipments[0];
  if (!shipment) return null;

  const fmt = (paise: number) => formatMinorFromPaise(paise, currency);
  const sellableRestocked = state.restockEvents.some((e) => e.inventoryIncremented);

  async function handleMarkReceived() {
    if (busy) return;
    setBusy("received");
    setMsg(null);
    try {
      const res = await markShipmentRtoReceived(shipment.id);
      setMsg(res.alreadyReceived ? "Already marked as received." : "RTO parcel marked as received.");
      onUpdated?.();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisposition(
    disposition: "RESTOCKABLE" | "DAMAGED_NON_RESTOCKABLE" | "NEEDS_REVIEW"
  ) {
    if (busy) return;
    setBusy(disposition);
    setMsg(null);
    try {
      const res = await setShipmentRtoDisposition(shipment.id, disposition);
      setMsg(
        res.alreadySet
          ? `Disposition already set: ${dispositionLabel(disposition)}`
          : `Disposition recorded: ${dispositionLabel(disposition)}`
      );
      onUpdated?.();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900 dark:bg-stone-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
        RTO workflow
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
        Carrier reported return — physical receipt and disposition are separate from refund execution.
      </p>

      <ol className="mt-4 space-y-4 text-sm">
        <li className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
          <p className="font-semibold text-stone-800 dark:text-stone-100">1. Carrier RTO detected</p>
          <p className="mt-0.5 text-stone-500">
            AWB {shipment.awb ?? "—"} · {shipment.courier}
            {shipment.rtoAt ? ` · ${new Date(shipment.rtoAt).toLocaleString("en-IN")}` : ""}
          </p>
        </li>

        <li className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
          <p className="font-semibold text-stone-800 dark:text-stone-100">2. Physical receipt</p>
          {shipment.rtoReceivedAt ? (
            <p className="mt-0.5 text-emerald-700 dark:text-emerald-300">
              Received {new Date(shipment.rtoReceivedAt).toLocaleString("en-IN")}
            </p>
          ) : (
            <button
              type="button"
              disabled={!state.canMarkReceived || busy !== null}
              onClick={() => void handleMarkReceived()}
              className="mt-2 rounded-full border border-violet-700 bg-violet-50 px-4 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-200"
            >
              {busy === "received" ? "Saving…" : "Mark RTO received"}
            </button>
          )}
        </li>

        <li className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
          <p className="font-semibold text-stone-800 dark:text-stone-100">3. Item condition</p>
          <p className="mt-0.5 text-stone-500">Current: {dispositionLabel(shipment.rtoDisposition)}</p>
          {state.canSetDisposition ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["RESTOCKABLE", "Restockable"],
                  ["DAMAGED_NON_RESTOCKABLE", "Damaged"],
                  ["NEEDS_REVIEW", "Needs review"]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleDisposition(value)}
                  className="rounded-full border border-stone-400 bg-white px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-200"
                >
                  {busy === value ? "Saving…" : label}
                </button>
              ))}
            </div>
          ) : null}
        </li>

        <li className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
          <p className="font-semibold text-stone-800 dark:text-stone-100">4. Inventory</p>
          <p className="mt-0.5 text-stone-500">
            {sellableRestocked
              ? "Sellable stock restored (exactly-once ledger)"
              : shipment.rtoDisposition === "DAMAGED_NON_RESTOCKABLE"
                ? "Not restocked — non-restockable"
                : shipment.rtoDisposition === "NEEDS_REVIEW"
                  ? "No stock movement — under review"
                  : shipment.rtoDisposition === "RESTOCKABLE"
                    ? "Restockable — pending or completed"
                    : "Awaiting disposition"}
          </p>
        </li>

        {breakdown ? (
          <li className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/20">
            <p className="font-semibold text-stone-800 dark:text-stone-100">5. Refund preview (Phase 1B)</p>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Customer paid</dt>
                <dd>{fmt(breakdown.customerPaidAmountPaise)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Products paid</dt>
                <dd>{fmt(breakdown.merchandiseNetPaise)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Shipping paid</dt>
                <dd>{fmt(breakdown.shippingNetPaise)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">Already refunded</dt>
                <dd>{fmt(breakdown.alreadyRefundedAmountPaise)}</dd>
              </div>
              {breakdown.retainedShippingPaise > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-stone-500">Shipping retained</dt>
                  <dd className="text-amber-800">−{fmt(breakdown.retainedShippingPaise)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 sm:col-span-2">
                <dt className="font-semibold text-stone-700">Proposed refund</dt>
                <dd className="font-bold text-emerald-800">{fmt(breakdown.proposedRefundAmountPaise)}</dd>
              </div>
            </dl>
          </li>
        ) : null}

        <li className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
          <p className="font-semibold text-stone-800 dark:text-stone-100">6. Refund status</p>
          <p className="mt-0.5">{refundStatusLabel(shipment.rtoRefundWorkflowStatus)}</p>
          {state.refundExecutionEnabled &&
          shipment.rtoReceivedAt &&
          shipment.rtoDisposition &&
          shipment.rtoDisposition !== "NEEDS_REVIEW" ? (
            <button
              type="button"
              disabled={busy !== null || shipment.rtoRefundWorkflowStatus === "REFUNDED"}
              onClick={async () => {
                if (busy) return;
                setBusy("refund");
                setMsg(null);
                try {
                  const res = await executeShipmentRtoRefund(shipment.id);
                  setMsg(`Refund initiated: ${fmt(res.amountInPaise)}`);
                  onUpdated?.();
                  await load();
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : "Refund failed");
                } finally {
                  setBusy(null);
                }
              }}
              className="mt-2 rounded-full border border-emerald-700 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              {busy === "refund" ? "Processing…" : "Execute RTO refund"}
            </button>
          ) : null}
        </li>
      </ol>

      {msg ? <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">{msg}</p> : null}
    </div>
  );
}
