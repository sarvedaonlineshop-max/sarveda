"use client";

import { useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import {
  adminMarkReturnDisposition,
  adminMarkReturnReceived,
  adminProcessReturnRefund,
  adminUpdateReturnShipment,
  adminShipReplacement
} from "@/lib/order-service-request";
import { caseMerchandiseCeilingPaise } from "@/lib/return-refund-ui";

export type ReturnReplacementAdminContext = {
  orderId: string;
  currency: string;
  paymentProvider: string | null;
  orderItems?: Array<{ id: string; lineTotalInPaise: number; qtyOrdered: number }>;
  request: {
    id: string;
    status: string;
    returnPhysicalStatus?: string;
    resolutionStatus?: string;
    shippingRefundPolicy?: string | null;
    items?: Array<{
      id: string;
      orderItemId?: string;
      nameSnapshot: string;
      qtySelected: number;
      reasonLabel: string;
      requestedResolution?: string | null;
      refundAmountInPaise?: number | null;
    }>;
    returnShipment?: {
      id: string;
      awb?: string | null;
      courier?: string | null;
      trackingUrl?: string | null;
      physicalStatus?: string;
      receivedAt?: string | null;
      disposition?: string | null;
    } | null;
    replacementFulfillments?: Array<{
      id: string;
      qty: number;
      status: string;
      replacementVariantId: string;
    }>;
  };
};

const RESOLUTION_LABELS: Record<string, string> = {
  RETURN_FOR_REFUND: "Return for refund",
  REPLACEMENT: "Replacement",
  PARTIAL_REFUND: "Partial refund",
  KEEP_ITEM_PARTIAL_REFUND: "Keep item — partial refund"
};

export function AdminOrderReturnReplacementPanel({
  ctx,
  onDone
}: {
  ctx: ReturnReplacementAdminContext;
  onDone: () => void;
}) {
  const { orderId, request, currency, paymentProvider, orderItems = [] } = ctx;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [awb, setAwb] = useState(request.returnShipment?.awb ?? "");
  const [courier, setCourier] = useState(request.returnShipment?.courier ?? "");
  const [codNote, setCodNote] = useState("");

  const isCod = paymentProvider === "COD";
  const rs = request.returnShipment;
  const needsReturn = request.returnPhysicalStatus !== "NOT_REQUIRED";
  const canReceive = needsReturn && rs && !rs.receivedAt;
  const canDisposition = Boolean(rs?.receivedAt && (!rs.disposition || rs.disposition === "NEEDS_REVIEW"));
  const physicalReady =
    !needsReturn ||
    Boolean(rs?.receivedAt && rs.disposition && rs.disposition !== "NEEDS_REVIEW");
  const canRefund =
    request.status === "APPROVED" &&
    physicalReady &&
    request.resolutionStatus !== "REFUNDED" &&
    !(request.items ?? []).every((i) => (i.refundAmountInPaise ?? 0) > 0);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage("Saved.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
          Return / replacement workflow
        </p>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
          Physical: {request.returnPhysicalStatus ?? "—"} · Resolution: {request.resolutionStatus ?? "—"}
          {request.shippingRefundPolicy ? ` · Shipping: ${request.shippingRefundPolicy}` : ""}
        </p>
        {needsReturn && request.status === "APPROVED" && !physicalReady ? (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs text-amber-950">
            Gateway refund is locked until warehouse receipt and QC/disposition are recorded.
            Approval alone does not authorize payment.
          </p>
        ) : null}
      </div>

      {request.items?.map((item) => {
        const orderLine = orderItems.find((o) => o.id === item.orderItemId);
        const merchandiseCeiling = caseMerchandiseCeilingPaise(
          orderLine?.lineTotalInPaise ?? 0,
          orderLine?.qtyOrdered ?? item.qtySelected,
          item.qtySelected,
          0
        );
        return (
          <div
            key={item.id}
            className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <p className="font-semibold">{item.nameSnapshot}</p>
            <p className="text-xs text-stone-500">
              Approved qty {item.qtySelected}
              {orderLine?.qtyOrdered != null ? ` of ${orderLine.qtyOrdered}` : ""} · {item.reasonLabel}
              {item.requestedResolution
                ? ` · ${RESOLUTION_LABELS[item.requestedResolution] ?? item.requestedResolution}`
                : ""}
            </p>
            {merchandiseCeiling > 0 ? (
              <p className="mt-1 text-xs font-medium text-stone-700 dark:text-stone-300">
                Merchandise ceiling: {formatMinorFromPaise(merchandiseCeiling, currency)}
                {request.shippingRefundPolicy === "SHIPPING_REFUNDABLE" ? (
                  <span className="font-normal text-stone-500">
                    {" "}
                    (+ shipping allocated separately at refund if policy applies)
                  </span>
                ) : request.shippingRefundPolicy === "SHIPPING_RETAINED" ? (
                  <span className="font-normal text-stone-500"> · shipping retained</span>
                ) : null}
              </p>
            ) : null}
            {item.refundAmountInPaise != null && item.refundAmountInPaise > 0 ? (
              <p className="text-xs text-green-700">
                Refunded {formatMinorFromPaise(item.refundAmountInPaise, currency)}
              </p>
            ) : null}
          </div>
        );
      })}

      {needsReturn && request.status === "APPROVED" ? (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase text-stone-500">Return logistics</p>
          <input
            className="w-full rounded border px-2 py-1.5 text-sm"
            placeholder="Courier"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
          />
          <input
            className="w-full rounded border px-2 py-1.5 text-sm"
            placeholder="Return AWB"
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
          />
          <button
            type="button"
            disabled={busy != null}
            className="rounded bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void run("shipment", () =>
                adminUpdateReturnShipment(orderId, request.id, {
                  courier,
                  awb,
                  physicalStatus: "IN_TRANSIT"
                })
              )
            }
          >
            Save return tracking
          </button>
          {canReceive ? (
            <button
              type="button"
              disabled={busy != null}
              className="ml-2 rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => void run("received", () => adminMarkReturnReceived(orderId, request.id))}
            >
              Mark return received
            </button>
          ) : null}
        </div>
      ) : null}

      {canDisposition ? (
        <div className="flex flex-wrap gap-2">
          {(["RESTOCKABLE", "DAMAGED_NON_RESTOCKABLE", "NEEDS_REVIEW"] as const).map((d) => (
            <button
              key={d}
              type="button"
              disabled={busy != null}
              className="rounded border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800"
              onClick={() =>
                void run(`disp-${d}`, () => adminMarkReturnDisposition(orderId, request.id, d))
              }
            >
              {d.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      ) : null}

      {canRefund ? (
        <div className="space-y-2">
          {isCod ? (
            <textarea
              className="w-full rounded border px-2 py-1.5 text-sm"
              rows={2}
              placeholder="COD refund — bank/UPI details for manual transfer"
              value={codNote}
              onChange={(e) => setCodNote(e.target.value)}
            />
          ) : null}
          <button
            type="button"
            disabled={busy != null}
            className="rounded bg-brand-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void run("refund", async () => {
                await adminProcessReturnRefund(orderId, request.id, isCod ? codNote : undefined);
              })
            }
          >
            Execute authoritative refund
          </button>
        </div>
      ) : null}

      {request.replacementFulfillments?.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <span>
            Replacement ×{f.qty} — {f.status}
          </span>
          {f.status === "REPLACEMENT_PENDING" ? (
            <button
              type="button"
              disabled={busy != null}
              className="rounded bg-stone-800 px-2 py-1 text-xs font-semibold text-white"
              onClick={() =>
                void run(`ship-${f.id}`, () =>
                  adminShipReplacement(f.id, {
                    awb: awb || `REP-${Date.now()}`,
                    courier: courier || "Manual"
                  })
                )
              }
            >
              Mark shipped
            </button>
          ) : null}
        </div>
      ))}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
