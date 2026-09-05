"use client";

import { useEffect, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { formatMinorFromPaise } from "@/lib/money";
import {
  adminClearReturnRefundOverride,
  adminFetchReturnRefundPreview,
  adminMarkReturnDisposition,
  adminMarkReturnReceived,
  adminProcessReturnRefund,
  adminSetReturnRefundOverride,
  adminUpdateReturnShipment,
  adminShipReplacement,
  type ReturnRefundPreview
} from "@/lib/order-service-request";

export type ReturnReplacementAdminContext = {
  orderId: string;
  currency: string;
  paymentProvider: string | null;
  orderItems?: Array<{ id: string; lineTotalInPaise: number; qtyOrdered: number }>;
  request: {
    id: string;
    caseNumber?: string | null;
    status: string;
    returnPhysicalStatus?: string;
    resolutionStatus?: string;
    shippingRefundPolicy?: string | null;
    refundTotalInPaise?: number | null;
    refundProcessedAt?: string | null;
    refundProviderReference?: string | null;
    items?: Array<{
      id: string;
      orderItemId?: string;
      nameSnapshot: string;
      qtySelected: number;
      reasonLabel: string;
      reviewDecision?: string | null;
      requestedResolution?: string | null;
      refundAmountInPaise?: number | null;
      refundedAt?: string | null;
      refundProviderId?: string | null;
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

function humanShippingPolicy(value?: string | null): string {
  switch (value) {
    case "MIXED": return "Mixed";
    case "SHIPPING_REFUNDABLE": return "Refundable";
    case "SHIPPING_RETAINED": return "Retained";
    case "MANUAL_REVIEW": return "Manual review";
    default: return value?.replace(/_/g, " ") ?? "—";
  }
}

function humanDisposition(value?: string | null): string {
  switch (value) {
    case "RESTOCKABLE": return "Restockable";
    case "DAMAGED_NON_RESTOCKABLE": return "Damaged — do not restock";
    case "NEEDS_REVIEW": return "Needs further review";
    default: return value?.replace(/_/g, " ") ?? "—";
  }
}

function StepIcon({ type }: { type: "pickup" | "received" | "qc" | "refund" }) {
  const path =
    type === "pickup"
      ? "M3 7h11v9H3zM14 10h3l3 3v3h-6zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
      : type === "received"
        ? "M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10"
        : type === "qc"
          ? "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
          : "M7 5h10M7 9h10M7 13h6m-6-8c4 0 6 2 6 4s-2 4-6 4m0 0 8 8";
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
    </svg>
  );
}

export function AdminOrderReturnReplacementPanel({
  ctx,
  onDone,
  showOverride = false
}: {
  ctx: ReturnReplacementAdminContext;
  onDone: () => void;
  showOverride?: boolean;
}) {
  const { orderId, request, currency, paymentProvider } = ctx;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [awb, setAwb] = useState(request.returnShipment?.awb ?? "");
  const [courier, setCourier] = useState(request.returnShipment?.courier ?? "");
  const [codNote, setCodNote] = useState("");
  const [preview, setPreview] = useState<ReturnRefundPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const isCod = paymentProvider === "COD";
  const rs = request.returnShipment;
  const approvedCase = request.status === "APPROVED" || request.status === "PARTIALLY_APPROVED";
  const needsReturn = request.returnPhysicalStatus !== "NOT_REQUIRED";
  const pickupStarted = Boolean(rs?.awb || rs?.courier || request.returnPhysicalStatus === "IN_TRANSIT");
  const received = Boolean(rs?.receivedAt) || request.returnPhysicalStatus === "RECEIVED" || request.returnPhysicalStatus === "INSPECTED";
  const inspected = request.returnPhysicalStatus === "INSPECTED" || Boolean(rs?.disposition && rs.disposition !== "NEEDS_REVIEW");
  const canReceive = needsReturn && approvedCase && pickupStarted && !received;
  const canDisposition = needsReturn && approvedCase && received && !inspected;
  const alreadyRefunded = request.resolutionStatus === "REFUNDED" || (request.refundTotalInPaise != null && request.refundTotalInPaise > 0);
  const approvedLines = (request.items ?? []).filter((item) => item.reviewDecision === "APPROVED");

  async function loadPreview() {
    if (!["APPROVED", "PARTIALLY_APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(request.status)) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await adminFetchReturnRefundPreview(orderId, request.id));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Could not load refund preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, request.id, request.status, request.returnPhysicalStatus, request.resolutionStatus, rs?.receivedAt, rs?.disposition]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage("Saved successfully.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const confirmAmount = preview?.totalRefundNowPaise ?? 0;
  const canShowRefundAction = approvedCase && !alreadyRefunded && preview?.executable === true && confirmAmount > 0;

  return (
    <div className="space-y-5">
      <AdminConfirmModal
        open={confirmOpen}
        title="Confirm refund"
        danger
        busy={busy === "refund"}
        confirmLabel={`Confirm ${formatMinorFromPaise(confirmAmount, currency)} refund`}
        cancelLabel="Cancel"
        message={`You are about to refund ${formatMinorFromPaise(confirmAmount, currency)} to the customer's original ${preview?.paymentProvider ?? "payment"} method.\n\nThis action will initiate a real payment gateway refund.`}
        details={[
          `Order: ${preview?.orderNumber ?? "—"}`,
          `Return case: ${preview?.caseNumber ?? request.caseNumber ?? "—"}`,
          `Approved quantity: ${preview?.approvedQtySelected ?? "—"} of ${preview?.orderedQtyOnLines ?? "—"}`,
          `Merchandise: ${formatMinorFromPaise(preview?.merchandiseRefundPaise ?? 0, currency)}`,
          `Shipping: ${formatMinorFromPaise(preview?.shippingRefundPaise ?? 0, currency)}`,
          `Total refund: ${formatMinorFromPaise(confirmAmount, currency)}`
        ]}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void run("refund", async () => {
          setConfirmOpen(false);
          const fresh = await adminFetchReturnRefundPreview(orderId, request.id);
          if (!fresh.executable || fresh.totalRefundNowPaise <= 0) throw new Error(fresh.blockMessage || "Refund is no longer executable");
          await adminProcessReturnRefund(orderId, request.id, isCod ? codNote : undefined);
        })}
      />

      <div className="grid gap-3 lg:grid-cols-4">
        <section className={`rounded-2xl border p-4 ${!pickupStarted && approvedCase ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-100" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-blue-700"><StepIcon type="pickup" /><h3 className="text-base font-extrabold">1. Schedule pickup</h3></div>
          <p className="mt-3 min-h-[44px] text-sm leading-6 text-stone-600">Add courier and return AWB for the approved items.</p>
          <div className="mt-3 space-y-2">
            <input className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm" placeholder="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} disabled={!approvedCase || received} />
            <input className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm" placeholder="Return AWB" value={awb} onChange={(e) => setAwb(e.target.value)} disabled={!approvedCase || received} />
            <button type="button" disabled={busy != null || !approvedCase || received || !courier.trim() || !awb.trim()} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-300" onClick={() => void run("shipment", () => adminUpdateReturnShipment(orderId, request.id, { courier: courier.trim(), awb: awb.trim(), physicalStatus: "IN_TRANSIT" }))}>{pickupStarted ? "Update pickup tracking" : "Save pickup tracking"}</button>
          </div>
        </section>

        <section className={`rounded-2xl border p-4 ${canReceive ? "border-emerald-300 bg-emerald-50/50" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-stone-700"><StepIcon type="received" /><h3 className="text-base font-extrabold">2. Mark as received</h3></div>
          <p className="mt-3 min-h-[92px] text-sm leading-6 text-stone-600">Confirm the approved return parcel has reached the warehouse.</p>
          <button type="button" disabled={busy != null || !canReceive} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-300" onClick={() => void run("received", () => adminMarkReturnReceived(orderId, request.id))}>{received ? "Received" : "Mark received"}</button>
        </section>

        <section className={`rounded-2xl border p-4 ${canDisposition ? "border-violet-300 bg-violet-50/50" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-stone-700"><StepIcon type="qc" /><h3 className="text-base font-extrabold">3. Inspect & QC</h3></div>
          <p className="mt-3 min-h-[70px] text-sm leading-6 text-stone-600">Record condition and decide whether returned stock is sellable.</p>
          {canDisposition ? (
            <div className="space-y-2">
              <button type="button" disabled={busy != null} className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800" onClick={() => void run("disp-RESTOCKABLE", () => adminMarkReturnDisposition(orderId, request.id, "RESTOCKABLE"))}>Restockable</button>
              <button type="button" disabled={busy != null} className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700" onClick={() => void run("disp-DAMAGED_NON_RESTOCKABLE", () => adminMarkReturnDisposition(orderId, request.id, "DAMAGED_NON_RESTOCKABLE"))}>Damaged — do not restock</button>
              <button type="button" disabled={busy != null} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800" onClick={() => void run("disp-NEEDS_REVIEW", () => adminMarkReturnDisposition(orderId, request.id, "NEEDS_REVIEW"))}>Needs further review</button>
            </div>
          ) : (
            <button type="button" disabled className="w-full rounded-xl bg-stone-300 px-4 py-2.5 text-sm font-bold text-white">{inspected ? humanDisposition(rs?.disposition) : "Complete inspection"}</button>
          )}
        </section>

        <section className={`rounded-2xl border p-4 ${canShowRefundAction ? "border-emerald-300 bg-emerald-50/50" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-stone-700"><StepIcon type="refund" /><h3 className="text-base font-extrabold">4. Process refund</h3></div>
          <p className="mt-3 min-h-[92px] text-sm leading-6 text-stone-600">Refund the approved amount after warehouse receipt and QC.</p>
          {isCod && canShowRefundAction ? <textarea className="mb-2 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs" rows={2} placeholder="COD refund bank/UPI note" value={codNote} onChange={(e) => setCodNote(e.target.value)} /> : null}
          <button type="button" disabled={busy != null || !canShowRefundAction} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-300" onClick={() => setConfirmOpen(true)}>{alreadyRefunded ? "Refund processed" : canShowRefundAction ? `Refund ${formatMinorFromPaise(confirmAmount, currency)}` : "Execute refund"}</button>
        </section>
      </div>

      <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-950">
        <span className="font-bold">ⓘ</span>
        <p>Only approved items ({approvedLines.length} {approvedLines.length === 1 ? "line" : "lines"}) move through this workflow. Rejected items remain visible in Return items above but are not picked up or refunded.</p>
      </div>

      {["APPROVED", "PARTIALLY_APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(request.status) ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
            <div>
              <h3 className="text-lg font-bold text-emerald-950">Refund summary</h3>
              <p className="mt-1 text-sm text-emerald-800/70">Based on approved quantities and shipping policy.</p>
            </div>
            <button type="button" disabled={previewLoading || busy != null} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50" onClick={() => void loadPreview()}>{previewLoading ? "Refreshing…" : "Refresh preview"}</button>
          </div>

          {previewLoading && !preview ? <p className="p-5 text-sm text-stone-500">Loading authoritative refund calculation…</p> : preview ? (
            <div className="space-y-5 p-5">
              <div className="grid gap-3">
                {preview.lines.map((line) => {
                  const rejected = line.reviewDecision === "REJECTED" || line.includedInRefundNow === false;
                  const lineTotal = rejected ? 0 : line.potentialLineTotalPaise ?? line.lineTotalRefundPaise;
                  return (
                    <div key={line.requestItemId} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-base font-bold text-stone-950">{line.nameSnapshot}</p>
                          <p className="mt-1 text-sm text-stone-500">Qty {line.qtySelected} of {line.qtyOrdered} · {line.reasonLabel ?? "—"}</p>
                          <p className="mt-1 text-sm text-stone-500">{line.shippingPolicyLabel ?? humanShippingPolicy(line.shippingPolicy)}</p>
                        </div>
                        <div className="grid min-w-[280px] grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase text-stone-400">Merchandise</p><p className="mt-1 text-sm font-bold">{formatMinorFromPaise(line.merchandiseRefundPaise, preview.currency)}</p></div>
                          <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase text-stone-400">Shipping</p><p className="mt-1 text-sm font-bold">{formatMinorFromPaise(line.shippingRefundPaise, preview.currency)}</p></div>
                          <div className={`rounded-xl p-3 ${rejected ? "bg-stone-100" : "bg-emerald-50"}`}><p className={`text-[11px] uppercase ${rejected ? "text-stone-500" : "text-emerald-600"}`}>Line total</p><p className={`mt-1 text-sm font-bold ${rejected ? "text-stone-700" : "text-emerald-900"}`}>{formatMinorFromPaise(lineTotal, preview.currency)}</p></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 border-t border-stone-100 pt-5 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs uppercase text-stone-400">Merchandise refund</p><p className="mt-1 text-xl font-bold">{formatMinorFromPaise(preview.merchandiseRefundPaise, preview.currency)}</p></div>
                <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs uppercase text-stone-400">Shipping refund</p><p className="mt-1 text-xl font-bold">{formatMinorFromPaise(preview.shippingRefundPaise, preview.currency)}</p></div>
                <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs uppercase text-emerald-700">{preview.executable ? "Refund now" : "Expected refund"}</p><p className="mt-1 text-2xl font-extrabold text-emerald-900">{formatMinorFromPaise(preview.executable ? preview.totalRefundNowPaise : preview.requestedRefundPaise ?? preview.calculatedRefundPaise ?? 0, preview.currency)}</p></div>
              </div>

              {!preview.executable ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{preview.blockMessage ?? "Return must be physically received and inspected before refund."}</div> : null}

              {showOverride && !alreadyRefunded ? (
                <div className="border-t border-stone-100 pt-4">
                  {!overrideOpen ? (
                    <button type="button" className="text-sm font-bold text-violet-800 underline" onClick={() => { setOverrideOpen(true); setOverrideAmount(((preview.calculatedRefundPaise ?? preview.totalRefundNowPaise) / 100).toFixed(2)); setOverrideReason(""); }}>Adjust refund amount</button>
                  ) : (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                      <h4 className="text-sm font-bold text-violet-950">Manual refund adjustment</h4>
                      <p className="mt-1 text-sm text-violet-800">System calculated: {formatMinorFromPaise(preview.calculatedRefundPaise ?? preview.totalRefundNowPaise, preview.currency)}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="text-sm font-medium">Adjusted amount ({preview.currency})<input className="mt-1 h-10 w-full rounded-xl border border-violet-200 bg-white px-3" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} /></label>
                        <label className="text-sm font-medium">Reason<input className="mt-1 h-10 w-full rounded-xl border border-violet-200 bg-white px-3" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why is the amount different?" /></label>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy != null || !overrideReason.trim()} className="rounded-xl bg-violet-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => void run("override", async () => { const rupees = Number(overrideAmount); if (!Number.isFinite(rupees) || rupees < 0) throw new Error("Enter a valid non-negative amount"); setPreview(await adminSetReturnRefundOverride(orderId, request.id, { overrideRefundPaise: Math.round(rupees * 100), reason: overrideReason.trim() })); setOverrideOpen(false); })}>Save override</button>
                        {preview.overrideActive ? <button type="button" disabled={busy != null} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold" onClick={() => void run("clear-override", async () => { setPreview(await adminClearReturnRefundOverride(orderId, request.id)); setOverrideOpen(false); })}>Clear override</button> : null}
                        <button type="button" className="px-3 py-2 text-sm font-semibold text-stone-600" onClick={() => setOverrideOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : <p className="p-5 text-sm text-stone-500">Refund preview unavailable.</p>}
        </section>
      ) : null}

      {request.replacementFulfillments?.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <span className="text-sm font-semibold text-stone-800">Replacement ×{f.qty} — {f.status.replace(/_/g, " ")}</span>
          {f.status === "REPLACEMENT_PENDING" ? <button type="button" disabled={busy != null} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white" onClick={() => void run(`ship-${f.id}`, () => adminShipReplacement(f.id, { awb: awb || `REP-${Date.now()}`, courier: courier || "Manual" }))}>Mark shipped</button> : null}
        </div>
      ))}

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</p> : null}
    </div>
  );
}
