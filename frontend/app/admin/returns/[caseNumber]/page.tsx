"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AdminOrderReturnReplacementPanel } from "@/components/admin/AdminOrderReturnReplacementPanel";
import { formatMinorFromPaise } from "@/lib/money";
import {
  adminFetchReturnCaseByNumber,
  adminReviewReturnCaseLine,
  approveServiceRequest,
  rejectServiceRequest
} from "@/lib/order-service-request";

function human(value?: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : "—";
}

function decisionPill(decision?: string | null) {
  switch (decision) {
    case "APPROVED": return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "REJECTED": return "bg-red-50 text-red-700 border-red-200";
    case "MORE_INFO_REQUIRED": return "bg-amber-50 text-amber-800 border-amber-200";
    default: return "bg-stone-100 text-stone-700 border-stone-200";
  }
}

function stageIndex(request: { status: string; returnPhysicalStatus?: string | null; resolutionStatus?: string | null; refundProcessedAt?: string | null }) {
  if (request.refundProcessedAt || request.resolutionStatus === "REFUNDED") return 5;
  if (request.resolutionStatus === "REFUND_PROCESSING") return 5;
  if (request.returnPhysicalStatus === "INSPECTED") return 4;
  if (request.returnPhysicalStatus === "RECEIVED") return 3;
  if (request.returnPhysicalStatus === "IN_TRANSIT") return 2;
  if (["APPROVED", "PARTIALLY_APPROVED"].includes(request.status)) return 2;
  if (["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) return 1;
  return 0;
}

const STEPS = [
  { label: "Request", icon: "↩" },
  { label: "Review", icon: "⌕" },
  { label: "Pick up", icon: "▣" },
  { label: "Received", icon: "✓" },
  { label: "Decision", icon: "◇" },
  { label: "Refund", icon: "₹" }
];

function ProductMark({ decision }: { decision?: string | null }) {
  const tone = decision === "APPROVED" ? "bg-emerald-50 text-emerald-700" : decision === "REJECTED" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";
  return <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`} aria-hidden="true"><svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 5 5 7l-2 4 3 1v7h12v-7l3-1-2-4-3-2c-1 1-2.3 1.5-4 1.5S9 6 8 5Z" /></svg></div>;
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
    setLoading(true);
    setError(null);
    try { setData(await adminFetchReturnCaseByNumber(caseNumber)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); setData(null); }
    finally { setLoading(false); }
  }, [caseNumber]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action); setError(null);
    try { await fn(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="p-8 text-base text-stone-600">Loading return case…</div>;
  if (!data) return <div className="p-8 text-base text-red-700">{error || "Not found"}</div>;

  const { request, order, paymentProvider, stageLabel, events } = data;
  const pending = ["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "PARTIALLY_APPROVED"].includes(request.status);
  const items = (request.items ?? []) as Array<{ id: string; nameSnapshot: string; skuSnapshot?: string; qtySelected: number; reasonLabel: string; reasonCode?: string; requestedResolution?: string | null; message?: string | null; orderItemId?: string; reviewDecision?: string; shippingRefundPolicy?: string | null; customerFacingNote?: string | null }>;
  const shippingSummary = (request as { shippingPolicySummary?: string }).shippingPolicySummary;
  const statusLabel = (request as { statusLabel?: string }).statusLabel ?? human(request.status);
  const currentStep = stageIndex(request);
  const approvedCount = items.filter((i) => i.reviewDecision === "APPROVED").length;
  const rejectedCount = items.filter((i) => i.reviewDecision === "REJECTED").length;
  const pendingCount = items.filter((i) => !i.reviewDecision || ["PENDING", "MORE_INFO_REQUIRED"].includes(i.reviewDecision)).length;

  return (
    <div className="mx-auto max-w-[1320px] space-y-7 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/returns" className="inline-flex items-center gap-2 text-base font-bold text-stone-600 hover:text-stone-950">← Back to returns</Link>
        <Link href={`/admin/orders/${order.id}`} className="inline-flex items-center gap-2 text-base font-bold text-stone-700 hover:text-stone-950">Order {request.orderNumber} →</Link>
      </div>

      <section className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 border-b border-stone-100 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 3h10v3h2v15H5V6h2V3Zm2 0v3h6V3M8 11h8M8 15h5" /></svg></div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-stone-400">Return case</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-stone-950 lg:text-4xl">{request.caseNumber}</h1>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">{stageLabel}</span>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-bold text-stone-700">{statusLabel}</span>
              </div>
              <p className="mt-3 text-base text-stone-500">Created {new Date(request.createdAt).toLocaleString("en-IN")} · {request.customerEmail}</p>
            </div>
          </div>
          <div className="grid min-w-[340px] grid-cols-2 gap-4">
            <div className="rounded-2xl border border-stone-100 bg-stone-50 px-5 py-4"><p className="text-sm font-medium text-stone-500">Order total</p><p className="mt-1 text-xl font-extrabold text-stone-950">{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</p></div>
            <div className="rounded-2xl border border-stone-100 bg-stone-50 px-5 py-4"><p className="text-sm font-medium text-stone-500">Shipping policy</p><p className="mt-1 text-xl font-extrabold text-stone-950">{shippingSummary === "MIXED" ? "Mixed" : human(shippingSummary)}</p></div>
          </div>
        </div>

        <div className="overflow-x-auto px-6 py-7 lg:px-8">
          <div className="flex min-w-[760px] items-start">
            {STEPS.map((step, index) => {
              const complete = index < currentStep; const active = index === currentStep;
              return <div key={step.label} className="flex flex-1 items-start last:flex-none"><div className="flex w-28 flex-col items-center text-center"><div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-base font-bold shadow-sm ${complete ? "border-emerald-700 bg-emerald-700 text-white" : active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-stone-200 bg-stone-100 text-stone-400"}`}>{complete ? "✓" : step.icon}</div><span className={`mt-2 text-sm font-extrabold ${active ? "text-blue-700" : complete ? "text-emerald-800" : "text-stone-500"}`}>{step.label}</span><span className="mt-1 text-xs text-stone-400">{complete ? "Completed" : active ? "In progress" : "Pending"}</span></div>{index < STEPS.length - 1 ? <div className={`mt-6 h-0.5 flex-1 rounded ${index < currentStep ? "bg-emerald-400" : "bg-stone-200"}`} /> : null}</div>;
            })}
          </div>
        </div>
      </section>

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-base text-red-800">{error}</p> : null}

      <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div><h2 className="text-2xl font-extrabold text-stone-950">Order items in this return</h2><p className="mt-1 text-base text-stone-500">Request quantity, reason, decision and resolution at a glance.</p></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-[92px] rounded-2xl bg-emerald-50 px-4 py-3 text-center text-emerald-800"><span className="block text-2xl font-extrabold">{approvedCount}</span><span className="text-sm font-bold">Approved</span></div>
            <div className="min-w-[92px] rounded-2xl bg-red-50 px-4 py-3 text-center text-red-700"><span className="block text-2xl font-extrabold">{rejectedCount}</span><span className="text-sm font-bold">Rejected</span></div>
            <div className="min-w-[92px] rounded-2xl bg-stone-100 px-4 py-3 text-center text-stone-700"><span className="block text-2xl font-extrabold">{pendingCount}</span><span className="text-sm font-bold">Pending</span></div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {items.map((item) => {
            const ordered = order.items.find((o) => o.id === item.orderItemId); const decision = item.reviewDecision ?? "PENDING";
            return <div key={item.id} className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.05)] md:grid-cols-[1.5fr_.65fr_1.15fr_.8fr_1fr] md:items-center"><div className="flex items-center gap-4"><ProductMark decision={decision} /><div><p className="text-lg font-extrabold text-stone-950">{item.nameSnapshot}</p><p className="mt-1 text-sm text-stone-500">SKU {item.skuSnapshot || "—"}</p></div></div><div><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Requested</p><p className="mt-1 text-base font-extrabold text-stone-900">{item.qtySelected}{ordered ? ` / ${ordered.qtyOrdered}` : ""}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Reason</p><p className="mt-1 text-base text-stone-700">{item.reasonLabel}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Status</p><span className={`mt-1 inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${decisionPill(decision)}`}>{human(decision)}</span></div><div><p className="text-xs font-bold uppercase tracking-wider text-stone-400">Resolution</p><span className="mt-1 inline-flex rounded-full bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700">{human(item.requestedResolution)}</span><p className="mt-2 text-sm text-stone-500">{item.shippingRefundPolicy === "SHIPPING_REFUNDABLE" ? "Shipping refundable" : item.shippingRefundPolicy === "SHIPPING_RETAINED" ? "Shipping retained" : human(item.shippingRefundPolicy)}</p></div></div>;
          })}
        </div>
        {request.message ? <div className="mt-5 rounded-2xl bg-stone-50 px-5 py-4 text-base text-stone-700"><strong>Customer note:</strong> {request.message}</div> : null}
      </section>

      {pending && request.type === "REFUND_AFTER_DELIVERY" ? <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm lg:p-7"><h2 className="text-2xl font-extrabold text-stone-950">Per-line review</h2><p className="mt-1 text-base text-stone-500">Only items still awaiting a decision are actionable here.</p><div className="mt-5 space-y-4">{items.map((item) => { const decision = item.reviewDecision ?? "PENDING"; const lineNote = lineNotes[item.id] ?? ""; const canDecide = decision === "PENDING" || decision === "MORE_INFO_REQUIRED"; if (!canDecide) return null; return <div key={item.id} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><ProductMark decision={decision} /><div><p className="text-lg font-extrabold text-stone-950">{item.nameSnapshot} × {item.qtySelected}</p><p className="mt-1 text-sm text-stone-500">{item.reasonLabel}</p></div></div><span className={`rounded-full border px-3 py-1.5 text-sm font-bold ${decisionPill(decision)}`}>{human(decision)}</span></div><textarea rows={2} value={lineNote} onChange={(e) => setLineNotes((prev) => ({ ...prev, [item.id]: e.target.value }))} className="mt-4 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base" placeholder="Customer-facing note (required for reject or more info)" /><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy !== null} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" onClick={() => void run(`approve-${item.id}`, () => adminReviewReturnCaseLine(order.id, request.id, item.id, { decision: "APPROVED", customerFacingNote: lineNote.trim() || "Approved" }))}>✓ Approve</button><button type="button" disabled={busy !== null || !lineNote.trim()} className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50" onClick={() => void run(`reject-${item.id}`, () => adminReviewReturnCaseLine(order.id, request.id, item.id, { decision: "REJECTED", customerFacingNote: lineNote.trim() }))}>✕ Reject</button><button type="button" disabled={busy !== null || !lineNote.trim()} className="rounded-xl border border-amber-300 bg-white px-5 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-50" onClick={() => void run(`info-${item.id}`, () => adminReviewReturnCaseLine(order.id, request.id, item.id, { decision: "MORE_INFO_REQUIRED", moreInfoPrompt: lineNote.trim(), customerFacingNote: lineNote.trim() }))}>? More info</button></div></div>; })}</div>{pendingCount > 0 ? <div className="mt-5 rounded-2xl border border-stone-100 bg-stone-50 p-5"><p className="mb-2 text-sm font-bold uppercase tracking-wider text-stone-500">Bulk action</p><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base" placeholder="Customer-facing note (required to reject all)" /><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy !== null} onClick={() => void run("approve-all", () => approveServiceRequest(order.id, request.id, note.trim() || undefined))} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Approve all pending</button><button type="button" disabled={busy !== null || !note.trim()} onClick={() => void run("reject-all", () => rejectServiceRequest(order.id, request.id, note.trim()))} className="rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">Reject all pending</button></div></div> : null}</section> : null}

      {request.type === "REFUND_AFTER_DELIVERY" ? <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm lg:p-7"><div className="mb-5 flex items-start gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-xl text-amber-700">↩</div><div><h2 className="text-2xl font-extrabold text-stone-950">Return processing</h2><p className="mt-1 text-base text-stone-500">Pickup, warehouse receipt, inspection, refund or replacement actions.</p></div></div><AdminOrderReturnReplacementPanel ctx={{ orderId: order.id, currency: order.currency, paymentProvider, orderItems: order.items.map((i) => ({ id: i.id, lineTotalInPaise: i.lineTotalInPaise, qtyOrdered: i.qtyOrdered })), request: { id: request.id, caseNumber: request.caseNumber, status: request.status, returnPhysicalStatus: request.returnPhysicalStatus ?? undefined, resolutionStatus: request.resolutionStatus ?? undefined, shippingRefundPolicy: request.shippingRefundPolicy, refundTotalInPaise: request.refundTotalInPaise, refundProcessedAt: request.refundProcessedAt, items: items as never, returnShipment: request.returnShipment as never, replacementFulfillments: request.replacementFulfillments as never } }} onDone={() => void load()} showOverride /></section> : null}

      <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-xl text-violet-700">◎</div><div><h2 className="text-xl font-extrabold text-stone-950">Internal accountability</h2><p className="text-sm text-stone-500">Never shown to customers.</p></div></div><dl className="mt-5 grid gap-4"><div className="rounded-2xl bg-stone-50 p-5"><dt className="text-sm text-stone-500">Root cause</dt><dd className="mt-1 text-base font-bold text-stone-900">{human(request.rootCause)}</dd></div><div className="rounded-2xl bg-stone-50 p-5"><dt className="text-sm text-stone-500">Responsible team</dt><dd className="mt-1 text-base font-bold text-stone-900">{human(request.responsibleTeam)}</dd></div></dl></section>
        <section className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl text-blue-700">◷</div><div><h2 className="text-xl font-extrabold text-stone-950">Case timeline</h2><p className="text-sm text-stone-500">Audit trail for this return case.</p></div></div><ul className="mt-6 space-y-0">{(events as Array<{ id: string; eventType: string; message?: string; createdAt: string }>).map((ev, index) => <li key={ev.id} className="relative flex gap-4 pb-6 last:pb-0"><div className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-xs font-bold text-stone-500">{index + 1}</div>{index < events.length - 1 ? <div className="absolute left-[15px] top-8 h-[calc(100%-18px)] w-px bg-stone-200" /> : null}<div><p className="text-base font-extrabold text-stone-800">{human(ev.eventType)}</p>{ev.message ? <p className="mt-1 text-sm leading-6 text-stone-600">{ev.message}</p> : null}<p className="mt-1 text-xs text-stone-400">{new Date(ev.createdAt).toLocaleString("en-IN")}</p></div></li>)}</ul></section>
      </div>
    </div>
  );
}
