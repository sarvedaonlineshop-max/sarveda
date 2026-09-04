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

const RESOLUTION_LABELS: Record<string, string> = {
  RETURN_FOR_REFUND: "Return for refund",
  REPLACEMENT: "Replacement",
  PARTIAL_REFUND: "Partial refund",
  KEEP_ITEM_PARTIAL_REFUND: "Keep item — partial refund",
  MISSING_PART: "Missing part"
};

function humanPhysicalStatus(value?: string | null): string {
  switch (value) {
    case "AWAITING_RETURN": return "Awaiting customer return";
    case "IN_TRANSIT": return "Return in transit";
    case "RECEIVED": return "Return received";
    case "INSPECTED": return "Inspection completed";
    case "NOT_REQUIRED": return "Physical return not required";
    default: return value?.replace(/_/g, " ") ?? "—";
  }
}

function humanResolutionStatus(value?: string | null): string {
  switch (value) {
    case "REFUND_PENDING": return "Refund pending";
    case "REFUND_PROCESSING": return "Refund processing";
    case "REFUNDED": return "Refund processed";
    case "REPLACEMENT_PENDING": return "Replacement pending";
    case "NONE": return "None";
    default: return value?.replace(/_/g, " ") ?? "—";
  }
}

function humanShippingPolicy(value?: string | null): string {
  switch (value) {
    case "MIXED": return "Mixed shipping policy";
    case "SHIPPING_REFUNDABLE": return "Shipping refundable — seller/logistics fault";
    case "SHIPPING_RETAINED": return "Shipping retained — customer preference";
    case "MANUAL_REVIEW": return "Shipping — manual review";
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

function statusTone(decision?: string | null) {
  if (decision === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (decision === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (decision === "MORE_INFO_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stone-200 bg-stone-100 text-stone-700";
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
  const needsReturn = request.returnPhysicalStatus !== "NOT_REQUIRED";
  const received = Boolean(rs?.receivedAt);
  const inspected = request.returnPhysicalStatus === "INSPECTED" || Boolean(rs?.disposition && rs.disposition !== "NEEDS_REVIEW");
  const canReceive = needsReturn && rs && !rs.receivedAt;
  const canDisposition = Boolean(rs?.receivedAt && (!rs.disposition || rs.disposition === "NEEDS_REVIEW"));
  const alreadyRefunded = request.resolutionStatus === "REFUNDED" || (request.refundTotalInPaise != null && request.refundTotalInPaise > 0);

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
  const canShowRefundAction = (request.status === "APPROVED" || request.status === "PARTIALLY_APPROVED") && !alreadyRefunded && preview?.executable === true && confirmAmount > 0;
  const visibleItems = request.items ?? [];

  return (
    <div className="space-y-6">
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
          ...(preview && preview.otherAdjustmentPaise > 0 ? [`Other adjustment: ${formatMinorFromPaise(preview.otherAdjustmentPaise, currency)}`] : []),
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Physical return</p>
          <p className="mt-2 text-base font-bold text-stone-950">{humanPhysicalStatus(request.returnPhysicalStatus)}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Resolution</p>
          <p className="mt-2 text-base font-bold text-stone-950">{humanResolutionStatus(request.resolutionStatus)}</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">Shipping</p>
          <p className="mt-2 text-base font-bold text-stone-950">{humanShippingPolicy(preview?.shippingPolicy === "MIXED" ? "MIXED" : preview?.shippingPolicy ?? request.shippingRefundPolicy)}</p>
        </div>
      </div>

      {needsReturn && request.status === "APPROVED" && !inspected && !alreadyRefunded ? (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg">🔒</span>
          <div>
            <p className="font-bold">Refund is safely locked</p>
            <p className="mt-1 leading-6">Warehouse receipt and QC/disposition must be recorded before the gateway refund becomes available.</p>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-xl">📦</span>
          <div>
            <h3 className="text-lg font-bold text-stone-950">Approved return lines</h3>
            <p className="text-sm text-stone-500">Only approved lines move through pickup, QC and refund.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {visibleItems.map((item) => {
            const decision = item.reviewDecision ?? "PENDING";
            const ordered = ctx.orderItems?.find((o) => o.id === item.orderItemId)?.qtyOrdered;
            return (
              <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50/60 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-base font-bold text-stone-950">{item.nameSnapshot}</p>
                  <p className="mt-1 text-sm text-stone-500">Qty {item.qtySelected}{ordered != null ? ` of ${ordered}` : ""} · {item.reasonLabel}</p>
                  {item.requestedResolution ? <p className="mt-1 text-sm font-medium text-stone-700">{RESOLUTION_LABELS[item.requestedResolution] ?? item.requestedResolution}</p> : null}
                </div>
                <span className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-sm font-bold ${statusTone(decision)}`}>{decision.replace(/_/g, " ")}</span>
              </div>
            );
          })}
        </div>
      </section>

      {needsReturn && request.status === "APPROVED" && !received ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl">🚚</span>
            <div>
              <h3 className="text-lg font-bold text-stone-950">Return pickup & tracking</h3>
              <p className="text-sm text-stone-500">Save courier details, then mark receipt when the parcel reaches the warehouse.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input className="h-11 rounded-xl border border-stone-300 px-3 text-sm" placeholder="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} />
            <input className="h-11 rounded-xl border border-stone-300 px-3 text-sm" placeholder="Return AWB" value={awb} onChange={(e) => setAwb(e.target.value)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busy != null} className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" onClick={() => void run("shipment", () => adminUpdateReturnShipment(orderId, request.id, { courier, awb, physicalStatus: "IN_TRANSIT" }))}>Save return tracking</button>
            {canReceive ? <button type="button" disabled={busy != null} className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" onClick={() => void run("received", () => adminMarkReturnReceived(orderId, request.id))}>Mark return received</button> : null}
          </div>
        </section>
      ) : null}

      {needsReturn && received ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl">✅</span>
            <div>
              <h3 className="text-lg font-bold text-stone-950">Warehouse receipt</h3>
              <p className="text-sm text-stone-500">Return received and ready for QC / disposition.</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-400">Status</dt><dd className="mt-1 text-sm font-bold text-stone-900">{humanPhysicalStatus(request.returnPhysicalStatus)}</dd></div>
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-400">Courier</dt><dd className="mt-1 text-sm font-bold text-stone-900">{rs?.courier || "—"}</dd></div>
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-400">AWB</dt><dd className="mt-1 text-sm font-bold text-stone-900">{rs?.awb || "—"}</dd></div>
            <div className="rounded-xl bg-stone-50 p-3"><dt className="text-xs font-semibold uppercase text-stone-400">Disposition</dt><dd className="mt-1 text-sm font-bold text-stone-900">{humanDisposition(rs?.disposition)}</dd></div>
          </dl>
        </section>
      ) : null}

      {canDisposition ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-stone-950">Inspection / disposition</h3>
          <p className="mt-1 text-sm text-stone-500">Choose what should happen to the returned stock after inspection.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {([ ["RESTOCKABLE", "✓", "Restockable", "Return to sellable inventory"], ["DAMAGED_NON_RESTOCKABLE", "✕", "Damaged", "Do not restock"], ["NEEDS_REVIEW", "?", "Needs review", "Hold for further inspection"] ] as const).map(([code, icon, label, help]) => (
              <button key={code} type="button" disabled={busy != null} className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-brand-forest/40 hover:bg-brand-forest/5 disabled:opacity-50" onClick={() => void run(`disp-${code}`, () => adminMarkReturnDisposition(orderId, request.id, code))}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 font-bold">{icon}</span>
                <span className="mt-3 block text-sm font-bold text-stone-950">{label}</span>
                <span className="mt-1 block text-xs text-stone-500">{help}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {["APPROVED", "PARTIALLY_APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(request.status) ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
            <div>
              <h3 className="text-lg font-bold text-emerald-950">Refund summary</h3>
              <p className="mt-1 text-sm text-emerald-800/70">Authoritative calculation from approved quantities and shipping policy.</p>
            </div>
            <button type="button" disabled={previewLoading || busy != null} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50" onClick={() => void loadPreview()}>{previewLoading ? "Refreshing…" : "Refresh preview"}</button>
          </div>

          {previewLoading && !preview ? <p className="p-5 text-sm text-stone-500">Loading authoritative refund calculation…</p> : preview ? (
            <div className="space-y-5 p-5">
              <div className="grid gap-3">
                {preview.lines.map((line) => (
                  <div key={line.requestItemId} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-base font-bold text-stone-950">{line.nameSnapshot}</p>
                        <p className="mt-1 text-sm text-stone-500">Qty {line.qtySelected} of {line.qtyOrdered} · {line.reasonLabel ?? "—"}</p>
                        <p className="mt-1 text-sm text-stone-500">{line.shippingPolicyLabel ?? humanShippingPolicy(line.shippingPolicy)}</p>
                      </div>
                      <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase text-stone-400">Merchandise</p><p className="mt-1 text-sm font-bold">{formatMinorFromPaise(line.merchandiseRefundPaise, preview.currency)}</p></div>
                        <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase text-stone-400">Shipping</p><p className="mt-1 text-sm font-bold">{formatMinorFromPaise(line.shippingRefundPaise, preview.currency)}</p></div>
                        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-[11px] uppercase text-emerald-600">Line total</p><p className="mt-1 text-sm font-bold text-emerald-900">{formatMinorFromPaise(line.potentialLineTotalPaise ?? line.lineTotalRefundPaise, preview.currency)}</p></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 border-t border-stone-100 pt-5 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs uppercase text-stone-400">Merchandise</p><p className="mt-1 text-xl font-bold">{formatMinorFromPaise(preview.merchandiseRefundPaise, preview.currency)}</p></div>
                <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs uppercase text-stone-400">Shipping</p><p className="mt-1 text-xl font-bold">{formatMinorFromPaise(preview.shippingRefundPaise, preview.currency)}</p></div>
                <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs uppercase text-emerald-700">{preview.executable ? "Refund now" : "Expected refund"}</p><p className="mt-1 text-2xl font-extrabold text-emerald-900">{formatMinorFromPaise(preview.executable ? preview.totalRefundNowPaise : preview.requestedRefundPaise ?? preview.calculatedRefundPaise ?? 0, preview.currency)}</p></div>
              </div>

              {!preview.executable ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{preview.blockMessage ?? "Refund not executable yet"}</div> : null}

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

              {alreadyRefunded ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p className="font-bold">Refund processed</p>
                  <p className="mt-1">Amount: {formatMinorFromPaise(request.refundTotalInPaise ?? preview.totalRefundNowPaise ?? 0, currency)}</p>
                  {request.refundProviderReference ? <p className="mt-1 font-mono text-xs">Reference: {request.refundProviderReference}</p> : null}
                  {request.refundProcessedAt ? <p className="mt-1 text-xs">Initiated: {new Date(request.refundProcessedAt).toLocaleString("en-IN")}</p> : null}
                </div>
              ) : null}

              {canShowRefundAction ? (
                <div className="space-y-3 border-t border-stone-100 pt-4">
                  {isCod ? <textarea className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" rows={2} placeholder="COD refund — bank/UPI details for manual transfer" value={codNote} onChange={(e) => setCodNote(e.target.value)} /> : null}
                  <button type="button" disabled={busy != null} className="rounded-xl bg-brand-forest px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50" onClick={() => setConfirmOpen(true)}>Refund {formatMinorFromPaise(confirmAmount, currency)} to original payment method</button>
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
