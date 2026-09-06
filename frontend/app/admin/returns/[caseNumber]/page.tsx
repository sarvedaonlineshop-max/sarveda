"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AdminOrderReturnReplacementPanel } from "@/components/admin/AdminOrderReturnReplacementPanel";
import { AdminOrderRtoWorkflow } from "@/components/admin/AdminOrderRtoWorkflow";
import { formatMinorFromPaise } from "@/lib/money";
import { adminFetchReturnCaseByNumber, adminReviewReturnCaseLine, approveServiceRequest, rejectServiceRequest } from "@/lib/order-service-request";

function human(value?: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : "—";
}
function decisionPill(decision?: string | null) {
  if (decision === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (decision === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (decision === "MORE_INFO_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stone-200 bg-stone-100 text-stone-700";
}
function stageIndex(request: { status: string; returnPhysicalStatus?: string | null; resolutionStatus?: string | null; refundProcessedAt?: string | null }) {
  if (request.refundProcessedAt || request.resolutionStatus === "REFUNDED" || request.resolutionStatus === "REFUND_PROCESSING") return 5;
  if (request.returnPhysicalStatus === "INSPECTED") return 4;
  if (request.returnPhysicalStatus === "RECEIVED") return 3;
  if (request.returnPhysicalStatus === "IN_TRANSIT" || ["APPROVED", "PARTIALLY_APPROVED"].includes(request.status)) return 2;
  if (["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) return 1;
  return 0;
}
function cancellationStageIndex(
  request: { status: string; resolutionStatus?: string | null; refundProcessedAt?: string | null },
  isCod: boolean,
  isRto: boolean
) {
  if (isRto) {
    if (request.refundProcessedAt || request.resolutionStatus === "REFUNDED") return 5;
    if (request.status === "APPROVED") return 2;
    if (["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) return 1;
    return 0;
  }
  if (request.status === "APPROVED") {
    if (isCod || request.refundProcessedAt || request.resolutionStatus === "REFUNDED") return 5;
    return 4;
  }
  if (["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) return 1;
  return 0;
}
const STEPS = [
  { label: "Request", icon: "✓" }, { label: "Review", icon: "✓" }, { label: "Pick up", icon: "▣" },
  { label: "Received", icon: "□" }, { label: "Decision", icon: "◇" }, { label: "Refund", icon: "₹" }
];

const CARRIER_DISPATCHED_STATUSES = new Set(["PICKED", "INTRANSIT", "OUT_FOR_DELIVERY", "RTO"]);

type ReturnItem = { id: string; nameSnapshot: string; skuSnapshot?: string; qtySelected: number; reasonLabel: string; reasonCode?: string; requestedResolution?: string | null; message?: string | null; orderItemId?: string; reviewDecision?: string; shippingRefundPolicy?: string | null; customerFacingNote?: string | null };
type ImageOrderItem = { id: string; qtyOrdered: number; imageUrl?: string | null; productImageUrl?: string | null; image?: string | null };
type OrderWithShipments = { status?: string; shipments?: Array<{ status?: string | null }> };

function ProductThumb({ item, ordered }: { item: ReturnItem; ordered?: ImageOrderItem }) {
  const src = ordered?.imageUrl || ordered?.productImageUrl || ordered?.image;
  if (src) return <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white"><img src={src} alt={item.nameSnapshot} className="h-full w-full object-contain p-1.5" /></div>;
  return <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 text-stone-400"><svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 5 5 7l-2 4 3 1v7h12v-7l3-1-2-4-3-2c-1 1-2.3 1.5-4 1.5S9 6 8 5Z" /></svg></div>;
}

export default function AdminReturnCaseDetailPage() {
  const params = useParams();
  const caseNumber = decodeURIComponent(String(params.caseNumber ?? ""));
  const [data, setData] = useState<Awaited<ReturnType<typeof adminFetchReturnCaseByNumber>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!caseNumber) return;
    setLoading(true); setError(null);
    try { setData(await adminFetchReturnCaseByNumber(caseNumber)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); setData(null); }
    finally { setLoading(false); }
  }, [caseNumber]);
  useEffect(() => { void load(); }, [load]);
  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action); setError(null);
    try { await fn(); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Action failed"); } finally { setBusy(null); }
  }

  if (loading) return <div className="p-8 text-base text-stone-600">Loading return case…</div>;
  if (!data) return <div className="p-8 text-base text-red-700">{error || "Not found"}</div>;

  const { request, order, paymentProvider, stageLabel, events } = data;
  const pending = ["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "PARTIALLY_APPROVED"].includes(request.status);
  const items = (request.items ?? []) as ReturnItem[];
  const shippingSummary = (request as { shippingPolicySummary?: string }).shippingPolicySummary;
  const statusLabel = (request as { statusLabel?: string }).statusLabel ?? human(request.status);
  const isCancellation = request.type === "CANCEL_BEFORE_DELIVERY";
  const isCod = paymentProvider === "COD";
  const orderWithShipments = order as typeof order & OrderWithShipments;
  const carrierDispatchedCancellation = isCancellation && (orderWithShipments.shipments ?? []).some((s) => CARRIER_DISPATCHED_STATUSES.has(String(s.status ?? "")));
  const currentStep = isCancellation ? cancellationStageIndex(request, isCod, carrierDispatchedCancellation) : stageIndex(request);
  const flowSteps = isCancellation
    ? carrierDispatchedCancellation
      ? [
          { label: "Request", icon: "✓" },
          { label: "Review", icon: "✓" },
          { label: "RTO", icon: "↩" },
          { label: "Received", icon: "□" },
          { label: "Decision", icon: "◇" },
          { label: isCod ? "No refund" : "Refund", icon: isCod ? "—" : "₹" }
        ]
      : [
          { label: "Request", icon: "✓" },
          { label: "Review", icon: "✓" },
          { label: "Cancelled", icon: "×" },
          { label: "Stock restored", icon: "↺" },
          { label: isCod ? "No refund" : "Refund", icon: isCod ? "—" : "₹" }
        ]
    : STEPS;
  const approvedCount = items.filter((i) => i.reviewDecision === "APPROVED").length;
  const rejectedCount = items.filter((i) => i.reviewDecision === "REJECTED").length;
  const pendingCount = items.filter((i) => !i.reviewDecision || ["PENDING", "MORE_INFO_REQUIRED"].includes(i.reviewDecision)).length;

  return <div className="mx-auto max-w-[1380px] space-y-5 p-5 lg:p-7">
    <div className="flex items-center justify-between gap-4 px-1">
      <Link href="/admin/returns" className="text-base font-bold text-stone-700 hover:text-stone-950">← Back to returns</Link>
      <div className="flex items-center gap-3"><span className="text-sm font-semibold text-stone-500">Order {request.orderNumber}</span><Link href={`/admin/orders/${order.id}`} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm hover:bg-stone-50">View order ↗</Link></div>
    </div>

    <section className="overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-[0_14px_42px_rgba(15,23,42,.07)]">
      <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><span className="text-2xl">▣</span></div><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-stone-400">{isCancellation ? "Cancellation case" : "Return case"}</p><div className="mt-1.5 flex flex-wrap items-center gap-2.5"><h1 className="text-3xl font-extrabold tracking-tight text-stone-950">{request.caseNumber}</h1><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-800">{stageLabel}</span><span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-bold text-stone-700">{statusLabel}</span></div><p className="mt-2 text-sm text-stone-500">Created {new Date(request.createdAt).toLocaleString("en-IN")} · {request.customerEmail}</p></div></div>
        <div className="grid min-w-[430px] grid-cols-3 gap-3"><div className="rounded-2xl bg-stone-50 px-4 py-3"><p className="text-xs text-stone-500">Order total</p><p className="mt-1 text-lg font-extrabold">{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</p></div><div className="rounded-2xl bg-stone-50 px-4 py-3"><p className="text-xs text-stone-500">{isCancellation ? "Payment" : "Shipping policy"}</p><p className="mt-1 text-lg font-extrabold">{isCancellation ? (isCod ? "COD" : human(paymentProvider)) : (shippingSummary === "MIXED" ? "Mixed" : human(shippingSummary))}</p></div><div className="rounded-2xl bg-stone-50 px-4 py-3"><p className="text-xs text-stone-500">Customer</p><p className="mt-1 truncate text-sm font-extrabold">{request.customerEmail}</p></div></div>
      </div>
      <div className="overflow-x-auto border-t border-emerald-100 bg-gradient-to-r from-emerald-50/60 via-white to-sky-50/50 px-6 py-5"><div className="flex min-w-[680px] items-start">{flowSteps.map((step,index)=>{const complete=index<currentStep;const active=index===currentStep;return <div key={step.label} className="flex flex-1 items-start last:flex-none"><div className="flex w-28 flex-col items-center text-center"><div className={`flex h-11 w-11 items-center justify-center rounded-full border-2 font-bold ${complete?"border-emerald-700 bg-emerald-700 text-white":active?"border-blue-500 bg-blue-50 text-blue-700":"border-stone-200 bg-stone-100 text-stone-400"}`}>{complete?"✓":step.icon}</div><span className={`mt-2 text-sm font-extrabold ${active?"text-blue-700":complete?"text-emerald-800":"text-stone-600"}`}>{step.label}</span><span className="text-xs text-stone-400">{complete?"Completed":active?"In progress":"Pending"}</span></div>{index<flowSteps.length-1?<div className={`mt-5 h-0.5 flex-1 ${index<currentStep?"bg-emerald-400":"bg-stone-200"}`}/>:null}</div>})}</div></div>
    </section>

    {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">{error}</p> : null}

    <section className="rounded-[26px] border border-stone-200 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,.05)]">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-extrabold">{isCancellation ? "Cancellation items" : "Return items"} ({items.length})</h2><p className="mt-1 text-sm text-stone-500">Request details and decisions at a glance.</p></div>{!isCancellation?<div className="flex gap-2"><span className="rounded-2xl bg-emerald-50 px-5 py-2 text-center text-emerald-800"><b className="block text-xl">{approvedCount}</b><span className="text-xs font-bold">Approved</span></span><span className="rounded-2xl bg-red-50 px-5 py-2 text-center text-red-700"><b className="block text-xl">{rejectedCount}</b><span className="text-xs font-bold">Rejected</span></span><span className="rounded-2xl bg-stone-100 px-5 py-2 text-center text-stone-700"><b className="block text-xl">{pendingCount}</b><span className="text-xs font-bold">Pending</span></span></div>:null}</div>
      <div className="mt-5 space-y-3">{items.map((item)=>{const ordered=order.items.find((o)=>o.id===item.orderItemId);const imageOrdered=ordered as (typeof ordered & ImageOrderItem) | undefined;const decision=item.reviewDecision??"PENDING";const canDecide=pending && request.type==="REFUND_AFTER_DELIVERY" && (decision==="PENDING"||decision==="MORE_INFO_REQUIRED");const lineNote=lineNotes[item.id]??"";return <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,.04)]"><div className={`grid gap-4 ${isCancellation?"md:grid-cols-[1.7fr_.6fr_1fr]":"md:grid-cols-[1.5fr_.55fr_1.15fr_.7fr_1fr]"} md:items-center`}><div className="flex items-center gap-4"><ProductThumb item={item} ordered={imageOrdered}/><div><p className="text-base font-extrabold text-stone-950">{item.nameSnapshot}</p><p className="mt-1 text-xs text-stone-500">SKU: {item.skuSnapshot||"—"}</p><span className="mt-2 inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{item.reasonLabel}</span></div></div><div><p className="text-[11px] font-bold uppercase text-stone-400">Requested</p><p className="mt-1 font-extrabold">{item.qtySelected}{ordered?` / ${ordered.qtyOrdered}`:""}</p></div>{isCancellation?<div><p className="text-[11px] font-bold uppercase text-stone-400">Action</p><p className="mt-1 text-sm font-semibold text-stone-700">Cancel order</p></div>:<><div><p className="text-[11px] font-bold uppercase text-stone-400">Decision</p><span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${decisionPill(decision)}`}>{human(decision)}</span></div><div><p className="text-[11px] font-bold uppercase text-stone-400">Resolution</p><p className="mt-1 text-sm font-semibold text-sky-700">{human(item.requestedResolution)}</p></div><div><p className="text-[11px] font-bold uppercase text-stone-400">Shipping</p><p className="mt-1 text-sm text-stone-600">{item.shippingRefundPolicy==="SHIPPING_REFUNDABLE"?"Refundable":item.shippingRefundPolicy==="SHIPPING_RETAINED"?"Retained":human(item.shippingRefundPolicy)}</p></div></>}</div>{canDecide?<div className="mt-4 grid gap-3 border-t border-stone-100 pt-4 lg:grid-cols-[1fr_auto]"><input value={lineNote} onChange={(e)=>setLineNotes((p)=>({...p,[item.id]:e.target.value}))} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm" placeholder="Customer-facing note (required for reject / more info)"/><div className="flex gap-2"><button disabled={busy!==null} onClick={()=>void run(`approve-${item.id}`,()=>adminReviewReturnCaseLine(order.id,request.id,item.id,{decision:"APPROVED",customerFacingNote:lineNote.trim()||"Approved"}))} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">✓ Approve</button><button disabled={busy!==null||!lineNote.trim()} onClick={()=>void run(`reject-${item.id}`,()=>adminReviewReturnCaseLine(order.id,request.id,item.id,{decision:"REJECTED",customerFacingNote:lineNote.trim()}))} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">✕ Reject</button><button disabled={busy!==null||!lineNote.trim()} onClick={()=>void run(`info-${item.id}`,()=>adminReviewReturnCaseLine(order.id,request.id,item.id,{decision:"MORE_INFO_REQUIRED",moreInfoPrompt:lineNote.trim(),customerFacingNote:lineNote.trim()}))} className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-bold text-amber-800 disabled:opacity-50">? More info</button></div></div>:null}</div>})}</div>
      {request.message?<div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-sm"><b>Customer note:</b> {request.message}</div>:null}
      {isCancellation && pending ? <div className={`mt-5 rounded-2xl border p-5 ${carrierDispatchedCancellation ? "border-violet-200 bg-violet-50/70" : "border-amber-200 bg-amber-50/60"}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className={`text-base font-extrabold ${carrierDispatchedCancellation ? "text-violet-950" : "text-amber-950"}`}>{carrierDispatchedCancellation ? "Post-dispatch RTO cancellation" : "Pre-dispatch cancellation"}</p><p className={`mt-1 text-sm leading-6 ${carrierDispatchedCancellation ? "text-violet-900/80" : "text-amber-900/80"}`}>{carrierDispatchedCancellation ? (isCod ? "COD order is already with the carrier. Approval starts RTO only. No stock restore and no refund until the parcel is received/QC." : "Prepaid order is already with the carrier. Approval starts RTO only. Refund is held until warehouse receipt/QC — no immediate refund.") : isCod ? "COD order: approval cancels the order and restores stock. No customer refund or reverse pickup is required." : "Prepaid order: this is the pre-delivery shortcut. Approval cancels the order, restores stock, and sends the full captured-payment refund to the original payment method immediately — no pickup or QC flow."}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy!==null} onClick={()=>void run("approve-cancellation",()=>approveServiceRequest(order.id,request.id,note.trim()||undefined))} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{carrierDispatchedCancellation ? "✓ Approve RTO request" : isCod ? "✓ Approve cancellation — no refund" : `✓ Approve & refund ${formatMinorFromPaise(order.grandTotalInPaise, order.currency)}`}</button><button disabled={busy!==null||!note.trim()} onClick={()=>void run("reject-cancellation",()=>rejectServiceRequest(order.id,request.id,note.trim()))} className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">✕ Reject request</button></div></div><input value={note} onChange={(e)=>setNote(e.target.value)} className={`mt-4 w-full rounded-xl border bg-white px-4 py-2.5 text-sm ${carrierDispatchedCancellation ? "border-violet-200" : "border-amber-200"}`} placeholder="Admin note (required for rejection; optional for approval)"/></div> : null}
      {isCancellation && request.status === "APPROVED" ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5"><p className="text-base font-extrabold text-emerald-950">{carrierDispatchedCancellation ? "RTO started — refund held" : isCod ? "Cancellation completed — no refund required" : request.refundProcessedAt || request.resolutionStatus === "REFUNDED" ? "Cancellation and refund completed" : "Cancellation approved — refund processing"}</p><p className="mt-1 text-sm leading-6 text-emerald-900/80">{carrierDispatchedCancellation ? "The shipment has been moved to RTO. Mark physical receipt and item condition below before closing COD / refunding prepaid." : isCod ? "Payment method: COD. The order is cancelled and stock is restored. There was no captured online payment, so this case is complete and no refund action is required." : request.refundProcessedAt || request.resolutionStatus === "REFUNDED" ? `The captured payment${request.refundTotalInPaise ? ` of ${formatMinorFromPaise(request.refundTotalInPaise, order.currency)}` : ""} has been refunded to the original payment method. No reverse pickup or QC is required for this pre-dispatch cancellation.` : "The order is cancelled and stock is restored. The gateway refund has been initiated; this cancellation stays at the Refund step until the refund is recorded as completed."}</p></div> : null}
      {pendingCount>0&&pending&&request.type==="REFUND_AFTER_DELIVERY"?<div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4"><p className="text-sm font-bold">Bulk review</p><div className="mt-3 flex flex-col gap-3 lg:flex-row"><input value={note} onChange={(e)=>setNote(e.target.value)} className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm" placeholder="Note required to reject all"/><button disabled={busy!==null} onClick={()=>void run("approve-all",()=>approveServiceRequest(order.id,request.id,note.trim()||undefined))} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white">Approve all pending</button><button disabled={busy!==null||!note.trim()} onClick={()=>void run("reject-all",()=>rejectServiceRequest(order.id,request.id,note.trim()))} className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-700">Reject all pending</button></div></div>:null}
    </section>

    {request.type==="REFUND_AFTER_DELIVERY"?<section className="rounded-[26px] border border-stone-200 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,.05)]"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-700">▣</div><div><h2 className="text-2xl font-extrabold">Return processing</h2><p className="text-sm text-stone-500">Pickup → warehouse receipt → inspection → refund or replacement.</p></div></div><span className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">Shipping policy: {shippingSummary==="MIXED"?"Mixed":human(shippingSummary)}</span></div><AdminOrderReturnReplacementPanel ctx={{orderId:order.id,currency:order.currency,paymentProvider,orderItems:order.items.map((i)=>({id:i.id,lineTotalInPaise:i.lineTotalInPaise,qtyOrdered:i.qtyOrdered})),request:{id:request.id,caseNumber:request.caseNumber,status:request.status,returnPhysicalStatus:request.returnPhysicalStatus??undefined,resolutionStatus:request.resolutionStatus??undefined,shippingRefundPolicy:request.shippingRefundPolicy,refundTotalInPaise:request.refundTotalInPaise,refundProcessedAt:request.refundProcessedAt,items:items as never,returnShipment:request.returnShipment as never,replacementFulfillments:request.replacementFulfillments as never}}} onDone={()=>void load()} showOverride/></section>:null}

    {isCancellation && request.status === "APPROVED" ? <section className="rounded-[26px] border border-violet-200 bg-white p-6 shadow-[0_8px_28px_rgba(15,23,42,.05)]"><div className="mb-5 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-xl text-violet-700">↩</div><div><h2 className="text-2xl font-extrabold">RTO processing</h2><p className="text-sm text-stone-500">Warehouse receipt → condition → COD close or prepaid refund.</p></div></div><AdminOrderRtoWorkflow orderId={order.id} currency={order.currency} paymentProvider={paymentProvider} onUpdated={()=>void load()} /></section>:null}

    <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-[26px] border border-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">◎</div><div><h2 className="text-xl font-extrabold">Internal accountability</h2><p className="text-sm text-stone-500">Internal use only.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-white/80 p-4"><p className="text-xs text-stone-500">Root cause</p><p className="mt-1 font-bold">{human(request.rootCause)}</p></div><div className="rounded-2xl bg-white/80 p-4"><p className="text-xs text-stone-500">Responsible team</p><p className="mt-1 font-bold">{human(request.responsibleTeam)}</p></div></div>{request.rootCauseNote?<div className="mt-3 rounded-2xl bg-white/80 p-4 text-sm text-stone-700">{request.rootCauseNote}</div>:null}</section>
      <section className="rounded-[26px] border border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">◷</div><div><h2 className="text-xl font-extrabold">Case timeline</h2><p className="text-sm text-stone-500">Complete audit trail.</p></div></div><ul className="mt-5">{(events as Array<{id:string;eventType:string;message?:string;createdAt:string}>).map((ev,index)=><li key={ev.id} className="relative flex gap-4 pb-5 last:pb-0"><div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-xs font-bold text-blue-700">{index+1}</div>{index<events.length-1?<div className="absolute left-[15px] top-8 h-[calc(100%-16px)] w-px bg-blue-200"/>:null}<div><p className="font-extrabold text-stone-800">{human(ev.eventType)}</p>{ev.message?<p className="mt-1 text-sm text-stone-600">{ev.message}</p>:null}<p className="mt-1 text-xs text-stone-400">{new Date(ev.createdAt).toLocaleString("en-IN")}</p></div></li>)}</ul></section>
    </div>
  </div>;
}
