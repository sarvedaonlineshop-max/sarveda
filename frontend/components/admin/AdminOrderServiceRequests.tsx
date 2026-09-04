"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import {
  adminServiceRequestPhotoDownloadUrl,
  adminServiceRequestPhotoViewUrl,
  approveServiceRequest,
  processServiceRequestRefund,
  rejectServiceRequest
} from "@/lib/order-service-request";
import { AdminOrderAdjustmentPanel } from "@/components/admin/AdminOrderAdjustmentPanel";
import { AdminOrderReturnReplacementPanel } from "@/components/admin/AdminOrderReturnReplacementPanel";
import { caseMerchandiseCeilingPaise } from "@/lib/return-refund-ui";

export type AdminServiceRequestItemRow = {
  id: string;
  orderItemId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  qtySelected: number;
  reasonLabel: string;
  requestedResolution?: string | null;
  message?: string | null;
  otherMessage?: string | null;
  refundAmountInPaise?: number | null;
  refundedAt?: string | null;
  photos?: Array<{ id: string; s3Url: string; fileName?: string | null }>;
};

export type AdminServiceRequestRow = {
  id: string;
  type: string;
  status: string;
  reasonLabel: string;
  otherMessage?: string | null;
  message?: string | null;
  customerEmail: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  adminNote?: string | null;
  codRefundNote?: string | null;
  refundTotalInPaise?: number | null;
  refundProcessedAt?: string | null;
  returnPhysicalStatus?: string | null;
  resolutionStatus?: string | null;
  shippingRefundPolicy?: string | null;
  returnShipment?: {
    id: string;
    awb?: string | null;
    courier?: string | null;
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
  photos?: Array<{ id: string; s3Url: string; fileName?: string | null }>;
  items?: AdminServiceRequestItemRow[];
};

export type AdminServiceRequestOrderContext = {
  currency: string;
  grandTotalInPaise: number;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentRefundedInPaise?: number;
  orderItems: Array<{ id: string; lineTotalInPaise: number; qtyOrdered: number }>;
};

function PhotoThumb({
  orderId,
  photo
}: {
  orderId: string;
  photo: { id: string; fileName?: string | null };
}) {
  const viewUrl = adminServiceRequestPhotoViewUrl(orderId, photo.id);
  const downloadUrl = adminServiceRequestPhotoDownloadUrl(orderId, photo.id);
  return (
    <li className="space-y-1">
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-20 w-20 overflow-hidden rounded-md border border-stone-200"
      >
        <Image src={viewUrl} alt={photo.fileName || "Request photo"} fill className="object-cover" unoptimized />
      </a>
      <a
        href={downloadUrl}
        className="block text-center text-[10px] font-semibold text-amber-800 underline dark:text-amber-300"
      >
        Download
      </a>
    </li>
  );
}

function providerLabel(provider: string | null): string {
  if (provider === "RAZORPAY") return "Razorpay";
  if (provider === "STRIPE") return "Stripe";
  if (provider === "PAYPAL") return "PayPal";
  if (provider === "COD") return "Cash on delivery (COD)";
  return provider ?? "Payment gateway";
}

function ServiceRequestRefundPanel({
  orderId,
  request,
  orderCtx,
  onDone
}: {
  orderId: string;
  request: AdminServiceRequestRow;
  orderCtx: AdminServiceRequestOrderContext;
  onDone: () => void;
}) {
  const lineByOrderItemId = useMemo(
    () => new Map(orderCtx.orderItems.map((i) => [i.id, i])),
    [orderCtx.orderItems]
  );

  const items = request.items ?? [];
  const isCod = orderCtx.paymentProvider === "COD";
  const canRefundOnline =
    !isCod &&
    ["CAPTURED", "PARTIALLY_REFUNDED"].includes(orderCtx.paymentStatus) &&
    !!orderCtx.paymentProvider;

  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, true]))
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) {
      const orderLine = lineByOrderItemId.get(item.orderItemId);
      const remaining = caseMerchandiseCeilingPaise(
        orderLine?.lineTotalInPaise ?? 0,
        orderLine?.qtyOrdered ?? item.qtySelected,
        item.qtySelected,
        item.refundAmountInPaise ?? 0
      );
      init[item.id] = remaining > 0 ? String(remaining / 100) : "";
    }
    return init;
  });
  const [codNote, setCodNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const orderRemaining =
    orderCtx.grandTotalInPaise - (orderCtx.paymentRefundedInPaise ?? 0);

  function remainingForItem(item: AdminServiceRequestItemRow): number {
    const orderLine = lineByOrderItemId.get(item.orderItemId);
    return caseMerchandiseCeilingPaise(
      orderLine?.lineTotalInPaise ?? 0,
      orderLine?.qtyOrdered ?? item.qtySelected,
      item.qtySelected,
      item.refundAmountInPaise ?? 0
    );
  }

  function setFullItem(item: AdminServiceRequestItemRow) {
    const remaining = remainingForItem(item);
    setSelected((s) => ({ ...s, [item.id]: true }));
    setAmounts((a) => ({ ...a, [item.id]: String(remaining / 100) }));
  }

  function setFullOrderRemaining() {
    const nextSelected: Record<string, boolean> = {};
    const nextAmounts: Record<string, string> = {};
    for (const item of items) {
      const remaining = remainingForItem(item);
      nextSelected[item.id] = remaining > 0;
      nextAmounts[item.id] = remaining > 0 ? String(remaining / 100) : "";
    }
    setSelected(nextSelected);
    setAmounts(nextAmounts);
  }

  const totalSelectedPaise = items.reduce((sum, item) => {
    if (!selected[item.id]) return sum;
    const rupees = Number.parseFloat(amounts[item.id] ?? "0");
    if (!Number.isFinite(rupees) || rupees <= 0) return sum;
    return sum + Math.round(rupees * 100);
  }, 0);

  const allItemsFullyRefunded = items.every((item) => remainingForItem(item) <= 0);

  async function handleRefund() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const payloadItems = items
        .filter((item) => selected[item.id])
        .map((item) => {
          const rupees = Number.parseFloat(amounts[item.id] ?? "0");
          return {
            requestItemId: item.id,
            amountInPaise: Math.round(rupees * 100)
          };
        })
        .filter((row) => row.amountInPaise > 0);

      if (!payloadItems.length) {
        throw new Error("Select at least one item with a refund amount");
      }

      const result = await processServiceRequestRefund(orderId, request.id, {
        items: payloadItems,
        codRefundNote: isCod ? codNote.trim() : undefined
      });

      setMsg({ text: result.message, ok: true });
      onDone();
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Refund failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (request.status !== "APPROVED") return null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Process refund</p>
          <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Approve only sanctions the request — refund money separately below.
          </p>
        </div>
        {request.refundTotalInPaise ? (
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Refunded so far: {formatMinorFromPaise(request.refundTotalInPaise, orderCtx.currency)}
          </p>
        ) : null}
      </div>

      {isCod ? (
        <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Manual refund required (COD).</strong> No automatic payout. Collect the customer&apos;s UPI ID or
          bank details, pay them offline, and save those details below. Accounting stays fail-closed without gateway
          evidence.
        </div>
      ) : canRefundOnline ? (
        <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
          <strong>{providerLabel(orderCtx.paymentProvider)}</strong> refunds return to the customer&apos;s{" "}
          <strong>original payment method</strong> (same card, UPI, or wallet used at checkout). Custom amounts are
          supported — typically visible in 5–7 business days.
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
          Payment status is {orderCtx.paymentStatus.replaceAll("_", " ").toLowerCase()} — online refund may not be
          available until payment is captured.
        </div>
      )}

      {request.codRefundNote ? (
        <div className="mt-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-950">
          <p className="font-semibold text-stone-700 dark:text-stone-300">Saved COD refund details</p>
          <p className="mt-1 whitespace-pre-wrap text-stone-600 dark:text-stone-400">{request.codRefundNote}</p>
        </div>
      ) : null}

      {!allItemsFullyRefunded ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={setFullOrderRemaining}
              className="rounded-full border border-emerald-700/30 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100/50 dark:bg-stone-900 dark:text-emerald-200"
            >
              Full order remaining ({formatMinorFromPaise(orderRemaining, orderCtx.currency)})
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead>
                <tr className="border-b border-emerald-200/80 text-stone-500 dark:border-emerald-900">
                  <th className="px-2 py-1.5 font-semibold">Include</th>
                  <th className="px-2 py-1.5 font-semibold">Item</th>
                  <th className="px-2 py-1.5 font-semibold">Case merchandise</th>
                  <th className="px-2 py-1.5 font-semibold">Already refunded</th>
                  <th className="px-2 py-1.5 font-semibold">Refund amount</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const orderLine = lineByOrderItemId.get(item.orderItemId);
                  const lineCeiling = caseMerchandiseCeilingPaise(
                    orderLine?.lineTotalInPaise ?? 0,
                    orderLine?.qtyOrdered ?? item.qtySelected,
                    item.qtySelected,
                    0
                  );
                  const remaining = remainingForItem(item);
                  const done = remaining <= 0;
                  return (
                    <tr key={item.id} className="border-b border-emerald-100/80 dark:border-emerald-950">
                      <td className="px-2 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={!!selected[item.id] && !done}
                          disabled={done}
                          onChange={(e) => setSelected((s) => ({ ...s, [item.id]: e.target.checked }))}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <p className="font-medium text-stone-900 dark:text-stone-100">{item.nameSnapshot}</p>
                        <p className="text-[10px] text-stone-500">
                          {item.reasonLabel} · approved qty {item.qtySelected}
                          {orderLine?.qtyOrdered != null ? ` of ${orderLine.qtyOrdered}` : ""}
                        </p>
                      </td>
                      <td className="px-2 py-2 align-top">
                        {formatMinorFromPaise(lineCeiling, orderCtx.currency)}
                        <span className="block text-[10px] font-normal text-stone-500">case merchandise</span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        {item.refundAmountInPaise
                          ? formatMinorFromPaise(item.refundAmountInPaise, orderCtx.currency)
                          : "—"}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {done ? (
                          <span className="text-emerald-700 dark:text-emerald-400">Fully refunded</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            max={remaining / 100}
                            value={amounts[item.id] ?? ""}
                            onChange={(e) => setAmounts((a) => ({ ...a, [item.id]: e.target.value }))}
                            className="w-24 rounded border border-stone-300 px-2 py-1 dark:border-stone-600 dark:bg-stone-950"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {!done ? (
                          <button
                            type="button"
                            onClick={() => setFullItem(item)}
                            className="text-[11px] font-semibold text-emerald-800 underline dark:text-emerald-300"
                          >
                            Full item
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs font-semibold text-stone-700 dark:text-stone-300">
            Total this refund: {formatMinorFromPaise(totalSelectedPaise, orderCtx.currency)}
          </p>

          {isCod ? (
            <div className="mt-3">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                Customer payout details (UPI / bank) — required for COD
              </label>
              <textarea
                rows={3}
                value={codNote}
                onChange={(e) => setCodNote(e.target.value)}
                placeholder="e.g. UPI: name@bank, Phone: +91…, Account: …"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-950"
              />
            </div>
          ) : null}

          {msg ? (
            <p
              className={`mt-2 text-xs ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}
            >
              {msg.text}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy || (!isCod && !canRefundOnline) || totalSelectedPaise <= 0}
            onClick={() => void handleRefund()}
            className="mt-3 rounded-full bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? "Processing…" : isCod ? "Record COD refund" : "Refund to original payment method"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          All items in this request have been fully refunded.
        </p>
      )}
    </div>
  );
}

export function AdminOrderServiceRequests({
  orderId,
  requests,
  orderCtx,
  onUpdated
}: {
  orderId: string;
  requests: AdminServiceRequestRow[];
  orderCtx: AdminServiceRequestOrderContext;
  onUpdated: () => void;
}) {
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!requests.length) return null;

  async function handleReview(requestId: string, approve: boolean) {
    setBusyId(requestId);
    setError(null);
    try {
      if (approve) {
        await approveServiceRequest(orderId, requestId, note);
      } else {
        await rejectServiceRequest(orderId, requestId, note);
      }
      setNote("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
        Cancel / refund requests
      </h2>
      <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/80">
        <strong>Approve</strong> sanctions the customer&apos;s request only — it does <strong>not</strong> move money.
        Use <strong>Process refund</strong> after approval to pay back per item.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      <ul className="mt-3 space-y-4">
        {requests.map((req) => {
          const pending = req.status === "PENDING_APPROVAL" || req.status === "NEEDS_DISCUSSION";
          const isAdjust = req.type === "ADJUST_BEFORE_DELIVERY";
          const kind = isAdjust
            ? "Order change"
            : req.type === "CANCEL_BEFORE_DELIVERY"
              ? "Cancellation"
              : "Return / refund";
          return (
            <li
              key={req.id}
              className="rounded-lg border border-amber-200/80 bg-white p-4 dark:border-amber-900 dark:bg-stone-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-stone-900 dark:text-stone-100">
                    {kind} — {req.reasonLabel}
                  </p>
                  <p className="text-xs text-stone-500">
                    {req.customerEmail} · {new Date(req.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    req.status === "PENDING_APPROVAL"
                      ? "bg-amber-100 text-amber-900"
                      : req.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-stone-200 text-stone-700"
                  }`}
                >
                  {req.status.replaceAll("_", " ")}
                </span>
              </div>
              {req.message ? (
                <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
                  <strong>Overall message:</strong> {req.message}
                </p>
              ) : null}

              {req.items?.length ? (
                <ul className="mt-3 space-y-3">
                  {req.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950"
                    >
                      <p className="font-medium text-stone-900 dark:text-stone-100">
                        {item.nameSnapshot}{" "}
                        <span className="text-xs font-normal text-stone-500">
                          × {item.qtySelected} · {item.skuSnapshot}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                        <strong>Customer reason:</strong> {item.reasonLabel}
                      </p>
                      {item.message ? (
                        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{item.message}</p>
                      ) : null}
                      {item.photos?.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {item.photos.map((photo) => (
                            <PhotoThumb key={photo.id} orderId={orderId} photo={photo} />
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {!req.items?.length && req.photos?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-stone-500">Photos</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {req.photos.map((photo) => (
                      <PhotoThumb key={photo.id} orderId={orderId} photo={photo} />
                    ))}
                  </ul>
                </div>
              ) : null}

              {req.reviewedAt ? (
                <p className="mt-2 text-xs text-stone-500">
                  Reviewed {new Date(req.reviewedAt).toLocaleString("en-IN")}
                  {req.reviewedByEmail ? ` by ${req.reviewedByEmail}` : ""}
                  {req.adminNote ? ` — ${req.adminNote}` : ""}
                </p>
              ) : null}
              {isAdjust ? (
                <AdminOrderAdjustmentPanel
                  orderId={orderId}
                  requestId={req.id}
                  currency={orderCtx.currency}
                  status={req.status}
                  reasonLabel={req.reasonLabel}
                  onUpdated={onUpdated}
                />
              ) : null}

              {!isAdjust && pending ? (
                <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                    Note to customer (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void handleReview(req.id, true)}
                      className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      Approve (sanction only)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void handleReview(req.id, false)}
                      className="rounded-full border border-stone-400 px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:text-stone-200"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}

              {req.type === "REFUND_AFTER_DELIVERY" ? (
                <AdminOrderReturnReplacementPanel
                  ctx={{
                    orderId,
                    currency: orderCtx.currency,
                    paymentProvider: orderCtx.paymentProvider,
                    orderItems: orderCtx.orderItems,
                    request: {
                      id: req.id,
                      status: req.status,
                      returnPhysicalStatus: req.returnPhysicalStatus ?? undefined,
                      resolutionStatus: req.resolutionStatus ?? undefined,
                      shippingRefundPolicy: req.shippingRefundPolicy,
                      items: req.items,
                      returnShipment: req.returnShipment,
                      replacementFulfillments: req.replacementFulfillments
                    }
                  }}
                  onDone={onUpdated}
                />
              ) : null}

              {!isAdjust && req.type !== "REFUND_AFTER_DELIVERY" ? (
                <ServiceRequestRefundPanel
                  orderId={orderId}
                  request={req}
                  orderCtx={orderCtx}
                  onDone={onUpdated}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
