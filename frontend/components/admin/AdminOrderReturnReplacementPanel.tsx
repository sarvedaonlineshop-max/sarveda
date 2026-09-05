"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { AdminReplacementFulfillmentPanel } from "@/components/admin/AdminReplacementFulfillmentPanel";
import { formatMinorFromPaise } from "@/lib/money";
import {
  adminClearReturnRefundOverride,
  adminFetchReturnRefundPreview,
  adminMarkReturnReceived,
  adminProcessReturnRefund,
  adminScheduleDelhiveryReturnPickup,
  adminSetReturnRefundOverride,
  adminUpdateReturnShipment,
  type ReturnRefundPreview
} from "@/lib/order-service-request";
import {
  adminPerformReturnQc,
  adminReleaseRepairedItemToSellable,
  type ReturnQcDisposition,
  type ReturnQcLine
} from "@/lib/return-qc";

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
      shippedAt?: string | null;
      deliveredAt?: string | null;
      outboundShipmentId?: string | null;
    }>;
    qcLines?: Array<{
      id: string;
      orderItemId?: string | null;
      quantity: number;
      disposition: string;
      releasedToSellableAt?: string | null;
    }>;
  };
};

type QcDraft = Record<string, { SELLABLE: number; REPACK: number; WRITE_OFF: number }>;
type PendingAction = "manual-pickup" | "delhivery-pickup" | "received" | "qc" | null;

const emptyQc = () => ({ SELLABLE: 0, REPACK: 0, WRITE_OFF: 0 });

function humanShippingPolicy(value?: string | null): string {
  switch (value) {
    case "MIXED": return "Mixed";
    case "SHIPPING_REFUNDABLE": return "Refundable";
    case "SHIPPING_RETAINED": return "Retained";
    case "MANUAL_REVIEW": return "Manual review";
    default: return value?.replace(/_/g, " ") ?? "—";
  }
}

function StepIcon({ type }: { type: "pickup" | "received" | "qc" | "refund" }) {
  const path = type === "pickup"
    ? "M3 7h11v9H3zM14 10h3l3 3v3h-6zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
    : type === "received"
      ? "M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10"
      : type === "qc"
        ? "m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
        : "M7 5h10M7 9h10M7 13h6m-6-8c4 0 6 2 6 4s-2 4-6 4m0 0 8 8";
  return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} /></svg>;
}

function QtyControl({ value, max, onChange }: { value: number; max: number; onChange: (next: number) => void }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <button type="button" className="h-8 w-8 text-stone-600 hover:bg-stone-100 disabled:opacity-30" disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
      <span className="min-w-8 text-center text-sm font-extrabold text-stone-900">{value}</span>
      <button type="button" className="h-8 w-8 text-stone-600 hover:bg-stone-100 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function AdminOrderReturnReplacementPanel({ ctx, onDone, showOverride = false }: { ctx: ReturnReplacementAdminContext; onDone: () => void; showOverride?: boolean }) {
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
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [qcDraft, setQcDraft] = useState<QcDraft>({});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const isCod = paymentProvider === "COD";
  const rs = request.returnShipment;
  const approvedCase = request.status === "APPROVED" || request.status === "PARTIALLY_APPROVED";
  const needsReturn = request.returnPhysicalStatus !== "NOT_REQUIRED";
  const pickupStarted = Boolean(rs?.awb || rs?.courier || request.returnPhysicalStatus === "IN_TRANSIT");
  const received = Boolean(rs?.receivedAt) || request.returnPhysicalStatus === "RECEIVED" || request.returnPhysicalStatus === "INSPECTED";
  const inspected = request.returnPhysicalStatus === "INSPECTED" || (request.qcLines?.length ?? 0) > 0;
  const canReceive = needsReturn && approvedCase && pickupStarted && !received;
  const canDisposition = needsReturn && approvedCase && received && !inspected;
  const alreadyRefunded = request.resolutionStatus === "REFUNDED" || (request.refundTotalInPaise ?? 0) > 0;
  const approvedLines = (request.items ?? []).filter((item) => item.reviewDecision === "APPROVED" && item.orderItemId);
  const approvedReplacementLines = approvedLines.filter((item) => item.requestedResolution === "REPLACEMENT");
  const approvedRefundLines = approvedLines.filter((item) => ["RETURN_FOR_REFUND", "PARTIAL_REFUND", "KEEP_ITEM_PARTIAL_REFUND"].includes(item.requestedResolution ?? ""));
  const hasReplacementLines = approvedReplacementLines.length > 0;
  const hasRefundLines = approvedRefundLines.length > 0;
  const mixedResolution = hasReplacementLines && hasRefundLines;
  const replacementOnly = hasReplacementLines && !hasRefundLines;
  const replacementReadyAfterQc = approvedCase && (!needsReturn || (received && inspected));
  const repairQcLines = (request.qcLines ?? []).filter((line) => line.disposition === "REPACK");
  const unreleasedRepairLines = repairQcLines.filter((line) => !line.releasedToSellableAt);

  useEffect(() => {
    const initial: QcDraft = {};
    for (const line of approvedLines) if (line.orderItemId) initial[line.orderItemId] = emptyQc();
    setQcDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.returnPhysicalStatus]);

  async function loadPreview() {
    if (alreadyRefunded || !hasRefundLines) { setPreview(null); return; }
    if (!["APPROVED", "PARTIALLY_APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(request.status)) { setPreview(null); return; }
    setPreviewLoading(true);
    try { setPreview(await adminFetchReturnRefundPreview(orderId, request.id)); }
    catch (err) { setPreview(null); setError(err instanceof Error ? err.message : "Could not load refund preview"); }
    finally { setPreviewLoading(false); }
  }

  useEffect(() => { void loadPreview(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId, request.id, request.status, request.returnPhysicalStatus, request.resolutionStatus, request.refundTotalInPaise, rs?.receivedAt]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action); setError(null); setMessage(null);
    try { await fn(); setMessage("Saved successfully."); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(null); }
  }

  const qcReview = useMemo(() => approvedLines.map((line) => {
    const d = line.orderItemId ? (qcDraft[line.orderItemId] ?? emptyQc()) : emptyQc();
    const assigned = d.SELLABLE + d.REPACK + d.WRITE_OFF;
    return { line, d, assigned, complete: assigned === line.qtySelected };
  }), [approvedLines, qcDraft]);
  const qcComplete = qcReview.length > 0 && qcReview.every((x) => x.complete);

  function setQcQty(orderItemId: string, disposition: keyof QcDraft[string], next: number, lineQty: number) {
    setQcDraft((current) => {
      const row = current[orderItemId] ?? emptyQc();
      const others = Object.entries(row).filter(([k]) => k !== disposition).reduce((sum, [, v]) => sum + v, 0);
      return { ...current, [orderItemId]: { ...row, [disposition]: Math.max(0, Math.min(next, lineQty - others)) } };
    });
  }

  const qcPayload: ReturnQcLine[] = qcReview.flatMap(({ line, d }) => {
    if (!line.orderItemId) return [];
    return (Object.entries(d) as Array<[ReturnQcDisposition, number]>)
      .filter(([, quantity]) => quantity > 0)
      .map(([disposition, quantity]) => ({ orderItemId: line.orderItemId as string, quantity, disposition, note: disposition === "REPACK" ? "Repair / refurbish before resale" : undefined }));
  });

  const confirmAmount = preview?.totalRefundNowPaise ?? 0;
  const canShowRefundAction = approvedCase && !alreadyRefunded && preview?.executable === true && confirmAmount > 0;

  async function executePendingAction() {
    const action = pendingAction;
    if (!action) return;
    if (action === "manual-pickup") await run("shipment", () => adminUpdateReturnShipment(orderId, request.id, { courier: courier.trim(), awb: awb.trim(), physicalStatus: "IN_TRANSIT" }));
    if (action === "delhivery-pickup") await run("delhivery-pickup", async () => { const data = await adminScheduleDelhiveryReturnPickup(orderId, request.id); setCourier(data.courier); setAwb(data.awb); });
    if (action === "received") await run("received", () => adminMarkReturnReceived(orderId, request.id));
    if (action === "qc") await run("qc", () => adminPerformReturnQc(orderId, request.id, qcPayload));
    setPendingAction(null);
  }

  const pendingDetails = pendingAction === "qc"
    ? [`Return case: ${request.caseNumber ?? "—"}`, ...qcReview.map(({ line, d }) => `${line.nameSnapshot} ×${line.qtySelected}: ${d.SELLABLE} restockable, ${d.REPACK} repair/refurbish, ${d.WRITE_OFF} damaged`)]
    : pendingAction === "received"
      ? [`Return case: ${request.caseNumber ?? "—"}`, `Return AWB: ${(rs?.awb ?? awb) || "—"}`]
      : [`Return case: ${request.caseNumber ?? "—"}`, pendingAction === "delhivery-pickup" ? "Create a new Delhivery reverse pickup" : `Courier: ${courier || "—"} · AWB: ${awb || "—"}`];

  return (
    <div className="space-y-5">
      <AdminConfirmModal open={pendingAction !== null} title={pendingAction === "qc" ? "Review & submit QC" : pendingAction === "received" ? "Confirm warehouse receipt" : "Confirm return pickup"} danger={pendingAction === "qc" && qcPayload.some((x) => x.disposition === "WRITE_OFF")} busy={busy != null} confirmLabel={pendingAction === "qc" ? "Submit QC decisions" : pendingAction === "received" ? "Confirm received" : "Confirm pickup"} cancelLabel="Cancel" message={pendingAction === "qc" ? "Review every item disposition carefully. This submission changes inventory state and unlocks the applicable refund/replacement resolution." : pendingAction === "received" ? "Confirm that the approved return parcel has physically reached the warehouse." : "Confirm the reverse-pickup details before continuing."} details={pendingDetails} onClose={() => { if (!busy) setPendingAction(null); }} onConfirm={() => void executePendingAction()} />

      <AdminConfirmModal open={confirmOpen} title="Confirm refund" danger busy={busy === "refund"} confirmLabel={`Confirm ${formatMinorFromPaise(confirmAmount, currency)} refund`} cancelLabel="Cancel" message={`You are about to refund ${formatMinorFromPaise(confirmAmount, currency)} to the customer's original ${preview?.paymentProvider ?? "payment"} method. This action initiates a real payment gateway refund.`} details={[`Order: ${preview?.orderNumber ?? "—"}`, `Return case: ${preview?.caseNumber ?? request.caseNumber ?? "—"}`, `Merchandise: ${formatMinorFromPaise(preview?.merchandiseRefundPaise ?? 0, currency)}`, `Shipping: ${formatMinorFromPaise(preview?.shippingRefundPaise ?? 0, currency)}`, `Total refund: ${formatMinorFromPaise(confirmAmount, currency)}`]} onClose={() => { if (busy !== "refund") setConfirmOpen(false); }} onConfirm={() => void (async () => { setBusy("refund"); setError(null); try { const fresh = await adminFetchReturnRefundPreview(orderId, request.id); if (!fresh.executable || fresh.totalRefundNowPaise <= 0) throw new Error(fresh.blockMessage || "Refund is no longer executable"); await adminProcessReturnRefund(orderId, request.id, isCod ? codNote : undefined); setConfirmOpen(false); onDone(); } catch (err) { setError(err instanceof Error ? err.message : "Refund failed"); } finally { setBusy(null); } })()} />

      <div className="grid gap-3 lg:grid-cols-4">
        <section className={`rounded-2xl border p-4 ${!pickupStarted && approvedCase ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-100" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-blue-700"><StepIcon type="pickup" /><h3 className="text-base font-extrabold">1. Schedule pickup</h3></div>
          <p className="mt-3 min-h-[44px] text-sm leading-6 text-stone-600">Add courier and return AWB, or create a Delhivery reverse pickup.</p>
          <div className="mt-3 space-y-2">
            <input className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm" placeholder="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} disabled={!approvedCase || received} />
            <input className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm" placeholder="Return AWB" value={awb} onChange={(e) => setAwb(e.target.value)} disabled={!approvedCase || received} />
            <button type="button" disabled={busy != null || !approvedCase || received || !courier.trim() || !awb.trim()} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-stone-300" onClick={() => setPendingAction("manual-pickup")}>{pickupStarted ? "Update pickup tracking" : "Save pickup tracking"}</button>
            <div className="text-center text-[11px] font-semibold uppercase text-stone-400">or</div>
            <button type="button" disabled={busy != null || !approvedCase || received || pickupStarted} className="w-full rounded-xl border border-blue-600 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 disabled:border-stone-300 disabled:text-stone-400" onClick={() => setPendingAction("delhivery-pickup")}>Schedule Delhivery pickup</button>
            {rs?.trackingUrl ? <a href={rs.trackingUrl} target="_blank" rel="noreferrer" className="block text-center text-xs font-semibold text-blue-700 underline">Track return ({rs.awb ?? "AWB"})</a> : null}
          </div>
        </section>

        <section className={`rounded-2xl border p-4 ${canReceive ? "border-emerald-300 bg-emerald-50/50" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-stone-700"><StepIcon type="received" /><h3 className="text-base font-extrabold">2. Mark as received</h3></div>
          <p className="mt-3 min-h-[92px] text-sm leading-6 text-stone-600">Confirm the approved return parcel has reached the warehouse.</p>
          <button type="button" disabled={busy != null || !canReceive} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:bg-stone-300" onClick={() => setPendingAction("received")}>{received ? "Received" : "Mark received"}</button>
        </section>

        <section className={`rounded-2xl border p-4 ${canDisposition ? "border-violet-300 bg-violet-50/50" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-stone-700"><StepIcon type="qc" /><h3 className="text-base font-extrabold">3. Inspect & QC</h3></div>
          <p className="mt-3 min-h-[92px] text-sm leading-6 text-stone-600">Record a disposition for every received unit. Item-wise QC appears below.</p>
          <button type="button" disabled className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white ${canDisposition ? "bg-violet-500" : "bg-stone-300"}`}>{inspected ? "QC completed" : canDisposition ? "Complete item QC below" : "Waiting for receipt"}</button>
        </section>

        <section className={`rounded-2xl border p-4 ${replacementReadyAfterQc || canShowRefundAction ? "border-indigo-300 bg-indigo-50/50" : "border-stone-200 bg-white"}`}>
          <div className="flex items-center gap-3 text-stone-700"><StepIcon type="refund" /><h3 className="text-base font-extrabold">4. {mixedResolution ? "Complete resolutions" : replacementOnly ? "Send replacement" : "Process refund"}</h3></div>
          <p className="mt-3 min-h-[92px] text-sm leading-6 text-stone-600">{mixedResolution ? "Refund and replacement lines are completed independently after QC." : replacementOnly ? "Create the forward replacement shipment after QC." : "Refund the approved amount after QC."}</p>
          <button type="button" disabled className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white ${replacementReadyAfterQc ? "bg-indigo-500" : "bg-stone-300"}`}>{replacementReadyAfterQc ? "Resolution ready below" : "Waiting for receipt & QC"}</button>
        </section>
      </div>

      {canDisposition ? (
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 bg-violet-50/70 px-5 py-4">
            <h3 className="text-lg font-extrabold text-violet-950">Item-wise QC</h3>
            <p className="mt-1 text-sm text-violet-800/75">Inspect each returned line. For multiple units, split the quantity across dispositions. Every received unit must be assigned before submission.</p>
          </div>
          <div className="space-y-4 p-5">
            {qcReview.map(({ line, d, assigned, complete }, index) => (
              <article key={line.id} className={`rounded-2xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50/20" : "border-stone-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-violet-600">Item {index + 1}</p><h4 className="mt-1 font-extrabold text-stone-950">{line.nameSnapshot}</h4><p className="mt-1 text-sm text-stone-500">Returned qty {line.qtySelected} · {line.reasonLabel}</p></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{assigned}/{line.qtySelected} assigned</span>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {([
                    ["SELLABLE", "Restockable", "Return directly to sellable stock", "emerald"],
                    ["REPACK", "Repair / refurbish", "Hold outside sellable stock until repaired and re-QC'd", "indigo"],
                    ["WRITE_OFF", "Damaged — do not restock", "Keep out of sellable stock / write-off", "red"]
                  ] as const).map(([key, label, help, tone]) => {
                    const value = d[key];
                    const max = line.qtySelected - (assigned - value);
                    const cls = tone === "emerald" ? "border-emerald-200 bg-emerald-50/50" : tone === "indigo" ? "border-indigo-200 bg-indigo-50/50" : "border-red-200 bg-red-50/40";
                    return <div key={key} className={`rounded-xl border p-3 ${cls}`}><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-extrabold text-stone-900">{label}</p><p className="mt-1 text-xs leading-5 text-stone-600">{help}</p></div><QtyControl value={value} max={max} onChange={(next) => line.orderItemId && setQcQty(line.orderItemId, key, next, line.qtySelected)} /></div></div>;
                  })}
                </div>
              </article>
            ))}
            <div className="flex flex-col gap-3 rounded-2xl bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-extrabold text-stone-900">Review & submit QC</p><p className="text-sm text-stone-500">{qcComplete ? "All returned units have a disposition." : "Assign every returned unit before submitting."}</p></div>
              <button type="button" disabled={!qcComplete || busy != null} className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:bg-stone-300" onClick={() => setPendingAction("qc")}>Review QC decisions</button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-950"><span className="font-bold">ⓘ</span><p>Only approved items ({approvedLines.length} {approvedLines.length === 1 ? "line" : "lines"}) move through this workflow. Rejected items are not picked up, refunded or replaced.</p></div>

      {unreleasedRepairLines.length ? <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm"><h3 className="text-lg font-extrabold text-indigo-950">Repair / refurbish hold</h3><p className="mt-1 text-sm text-indigo-800/75">These units are not sellable. Release only after repair/refurbishment and fresh QC.</p><div className="mt-4 space-y-2">{unreleasedRepairLines.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3"><span className="text-sm font-semibold">Qty {line.quantity} awaiting repair/re-QC</span><button type="button" disabled={busy != null} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:bg-stone-300" onClick={() => void run(`release-${line.id}`, () => adminReleaseRepairedItemToSellable(orderId, request.id, line.id))}>Release repaired item to sellable stock</button></div>)}</div></section> : null}

      {hasRefundLines && ["APPROVED", "PARTIALLY_APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(request.status) ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-5 py-4"><div><h3 className="text-lg font-bold text-emerald-950">{alreadyRefunded ? "Completed refund" : mixedResolution ? "Refund resolution" : "Refund summary"}</h3><p className="mt-1 text-sm text-emerald-800/70">Only approved refund lines are included; replacement lines are handled separately.</p></div>{!alreadyRefunded ? <button type="button" disabled={previewLoading || busy != null} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800" onClick={() => void loadPreview()}>{previewLoading ? "Refreshing…" : "Refresh preview"}</button> : null}</div>
          {alreadyRefunded ? <div className="p-5"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Total refunded</p><p className="mt-1 text-3xl font-extrabold text-emerald-950">{formatMinorFromPaise(request.refundTotalInPaise ?? 0, currency)}</p>{request.refundProcessedAt ? <p className="mt-2 text-sm text-emerald-800">Processed {new Date(request.refundProcessedAt).toLocaleString("en-IN")}</p> : null}</div></div> : preview ? <div className="space-y-5 p-5"><div className="grid gap-3">{preview.lines.map((line) => { const rejected = line.reviewDecision === "REJECTED" || line.includedInRefundNow === false; const lineTotal = rejected ? 0 : line.potentialLineTotalPaise ?? line.lineTotalRefundPaise; return <div key={line.requestItemId} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-bold">{line.nameSnapshot}</p><p className="mt-1 text-sm text-stone-500">Qty {line.qtySelected} of {line.qtyOrdered} · {line.reasonLabel ?? "—"}</p><p className="mt-1 text-sm text-stone-500">{line.shippingPolicyLabel ?? humanShippingPolicy(line.shippingPolicy)}</p></div><div className="grid min-w-[280px] grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase text-stone-400">Merchandise</p><p className="font-bold">{formatMinorFromPaise(line.merchandiseRefundPaise, preview.currency)}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase text-stone-400">Shipping</p><p className="font-bold">{formatMinorFromPaise(line.shippingRefundPaise, preview.currency)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-[11px] uppercase text-emerald-600">Line total</p><p className="font-bold text-emerald-900">{formatMinorFromPaise(lineTotal, preview.currency)}</p></div></div></div></div>; })}</div><div className="grid gap-3 border-t pt-5 sm:grid-cols-3"><div className="rounded-xl bg-stone-50 p-4"><p className="text-xs uppercase text-stone-400">Merchandise refund</p><p className="text-xl font-bold">{formatMinorFromPaise(preview.merchandiseRefundPaise, preview.currency)}</p></div><div className="rounded-xl bg-stone-50 p-4"><p className="text-xs uppercase text-stone-400">Shipping refund</p><p className="text-xl font-bold">{formatMinorFromPaise(preview.shippingRefundPaise, preview.currency)}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs uppercase text-emerald-700">{preview.executable ? "Refund now" : "Expected refund"}</p><p className="text-2xl font-extrabold text-emerald-900">{formatMinorFromPaise(preview.executable ? preview.totalRefundNowPaise : preview.requestedRefundPaise ?? preview.calculatedRefundPaise ?? 0, preview.currency)}</p></div></div>{!preview.executable ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{preview.blockMessage ?? "Return must be received and inspected before refund."}</div> : null}{canShowRefundAction ? <div>{isCod ? <textarea className="mb-3 w-full rounded-xl border p-3 text-xs" rows={2} placeholder="COD refund bank/UPI note" value={codNote} onChange={(e) => setCodNote(e.target.value)} /> : null}<button type="button" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white" onClick={() => setConfirmOpen(true)}>Refund {formatMinorFromPaise(confirmAmount, currency)}</button></div> : null}{showOverride && !alreadyRefunded ? <div className="border-t pt-4">{!overrideOpen ? <button type="button" className="text-sm font-bold text-violet-800 underline" onClick={() => { setOverrideOpen(true); setOverrideAmount(((preview.calculatedRefundPaise ?? preview.totalRefundNowPaise) / 100).toFixed(2)); }}>Adjust refund amount</button> : <div className="rounded-xl bg-violet-50 p-4"><div className="grid gap-3 md:grid-cols-2"><input className="rounded-lg border p-2" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} placeholder="Amount"/><input className="rounded-lg border p-2" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason"/></div><div className="mt-3 flex gap-2"><button type="button" className="rounded-lg bg-violet-800 px-3 py-2 text-sm font-bold text-white" onClick={() => void run("override", async () => { const rupees = Number(overrideAmount); if (!Number.isFinite(rupees) || rupees < 0) throw new Error("Enter a valid amount"); setPreview(await adminSetReturnRefundOverride(orderId, request.id, { overrideRefundPaise: Math.round(rupees * 100), reason: overrideReason.trim() })); setOverrideOpen(false); })}>Save</button>{preview.overrideActive ? <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void run("clear-override", async () => { setPreview(await adminClearReturnRefundOverride(orderId, request.id)); setOverrideOpen(false); })}>Clear</button> : null}<button type="button" className="px-3 py-2 text-sm" onClick={() => setOverrideOpen(false)}>Cancel</button></div></div>}</div> : null}</div> : <p className="p-5 text-sm text-stone-500">{previewLoading ? "Loading authoritative refund calculation…" : "Refund preview unavailable."}</p>}
        </section>
      ) : null}

      {hasReplacementLines ? request.replacementFulfillments?.map((f) => <AdminReplacementFulfillmentPanel key={f.id} fulfillment={f} readyAfterQc={replacementReadyAfterQc} returnAwb={rs?.awb} onDone={onDone} />) : null}
      {mixedResolution ? <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-950"><b>Mixed resolution:</b> refund and replacement lines are tracked independently. The case closes only after both required outcomes are complete.</div> : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p> : null}
      {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{message}</p> : null}
    </div>
  );
}
