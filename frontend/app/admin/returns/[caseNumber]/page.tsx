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
    case "APPROVED":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "REJECTED":
      return "bg-red-50 text-red-700 border-red-200";
    case "MORE_INFO_REQUIRED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-stone-100 text-stone-700 border-stone-200";
  }
}

function stageIndex(request: {
  status: string;
  returnPhysicalStatus?: string | null;
  resolutionStatus?: string | null;
  refundProcessedAt?: string | null;
}) {
  if (request.refundProcessedAt || request.resolutionStatus === "REFUNDED") return 5;
  if (request.resolutionStatus === "REFUND_PROCESSING") return 5;
  if (request.returnPhysicalStatus === "INSPECTED") return 4;
  if (request.returnPhysicalStatus === "RECEIVED") return 3;
  if (request.returnPhysicalStatus === "IN_TRANSIT") return 2;
  if (["APPROVED", "PARTIALLY_APPROVED"].includes(request.status)) return 2;
  if (["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) return 1;
  return 0;
}

const STEPS = ["Request", "Review", "Return", "Received", "Decision", "Refund"];

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
    try {
      setData(await adminFetchReturnCaseByNumber(caseNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [caseNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-6 text-sm text-stone-600">Loading return case…</div>;
  if (!data) return <div className="p-6 text-sm text-red-700">{error || "Not found"}</div>;

  const { request, order, paymentProvider, stageLabel, events } = data;
  const pending = ["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "PARTIALLY_APPROVED"].includes(request.status);
  const items = (request.items ?? []) as Array<{
    id: string;
    nameSnapshot: string;
    skuSnapshot?: string;
    qtySelected: number;
    reasonLabel: string;
    reasonCode?: string;
    requestedResolution?: string | null;
    message?: string | null;
    orderItemId?: string;
    reviewDecision?: string;
    shippingRefundPolicy?: string | null;
    customerFacingNote?: string | null;
  }>;
  const shippingSummary = (request as { shippingPolicySummary?: string }).shippingPolicySummary;
  const statusLabel = (request as { statusLabel?: string }).statusLabel ?? human(request.status);
  const currentStep = stageIndex(request);
  const approvedCount = items.filter((i) => i.reviewDecision === "APPROVED").length;
  const rejectedCount = items.filter((i) => i.reviewDecision === "REJECTED").length;
  const pendingCount = items.filter((i) => !i.reviewDecision || ["PENDING", "MORE_INFO_REQUIRED"].includes(i.reviewDecision)).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/returns" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-900">
          <span aria-hidden="true">←</span> Back to returns
        </Link>
        <Link href={`/admin/orders/${order.id}`} className="text-sm font-semibold text-stone-700 hover:underline">
          Order {request.orderNumber} →
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-stone-100 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Return case</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-stone-950">{request.caseNumber}</h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{stageLabel}</span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">{statusLabel}</span>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              {request.customerEmail} · Created {new Date(request.createdAt).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="grid min-w-[260px] grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="text-stone-500">Order total</p>
              <p className="mt-1 font-bold text-stone-900">{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</p>
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="text-stone-500">Shipping policy</p>
              <p className="mt-1 font-bold text-stone-900">{shippingSummary === "MIXED" ? "Mixed" : human(shippingSummary)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto px-5 py-4">
          <div className="flex min-w-[650px] items-start">
            {STEPS.map((label, index) => {
              const complete = index < currentStep;
              const active = index === currentStep;
              return (
                <div key={label} className="flex flex-1 items-start last:flex-none">
                  <div className="flex w-24 flex-col items-center text-center">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold ${complete ? "border-emerald-700 bg-emerald-700 text-white" : active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-stone-200 bg-stone-100 text-stone-500"}`}>
                      {complete ? "✓" : index + 1}
                    </div>
                    <span className={`mt-2 text-xs font-semibold ${active ? "text-blue-700" : complete ? "text-emerald-800" : "text-stone-500"}`}>{label}</span>
                  </div>
                  {index < STEPS.length - 1 ? <div className={`mt-4 h-px flex-1 ${index < currentStep ? "bg-emerald-500" : "bg-stone-200"}`} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Items in this return</h2>
            <p className="mt-1 text-xs text-stone-500">Customer request, decision, shipping policy and resolution in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Approved {approvedCount}</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Rejected {rejectedCount}</span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">Pending {pendingCount}</span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const ordered = order.items.find((o) => o.id === item.orderItemId);
            const decision = item.reviewDecision ?? "PENDING";
            return (
              <div key={item.id} className="grid gap-3 rounded-xl border border-stone-200 p-4 md:grid-cols-[1.6fr_.65fr_1.2fr_.8fr_1fr] md:items-center">
                <div>
                  <p className="font-semibold text-stone-900">{item.nameSnapshot}</p>
                  <p className="mt-1 text-xs text-stone-500">SKU: {item.skuSnapshot || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Requested</p>
                  <p className="mt-1 text-sm font-bold text-stone-800">{item.qtySelected}{ordered ? ` / ${ordered.qtyOrdered}` : ""}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Reason</p>
                  <p className="mt-1 text-sm text-stone-700">{item.reasonLabel}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Decision</p>
                  <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${decisionPill(decision)}`}>{human(decision)}</span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Resolution</p>
                  <p className="mt-1 text-sm font-medium text-stone-700">{human(item.requestedResolution)}</p>
                  <p className="mt-1 text-xs text-stone-500">{item.shippingRefundPolicy === "SHIPPING_REFUNDABLE" ? "Shipping refundable" : item.shippingRefundPolicy === "SHIPPING_RETAINED" ? "Shipping retained" : human(item.shippingRefundPolicy)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {request.message ? <div className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-700"><strong>Customer note:</strong> {request.message}</div> : null}
      </section>

      {pending && request.type === "REFUND_AFTER_DELIVERY" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Review pending items</h2>
            <p className="mt-1 text-xs text-stone-500">Decide only the lines still waiting for review. Completed decisions stay visible above.</p>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((item) => {
              const decision = item.reviewDecision ?? "PENDING";
              const lineNote = lineNotes[item.id] ?? "";
              const canDecide = decision === "PENDING" || decision === "MORE_INFO_REQUIRED";
              if (!canDecide) return null;
              return (
                <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900">{item.nameSnapshot} × {item.qtySelected}</p>
                      <p className="mt-1 text-xs text-stone-500">{item.reasonLabel} · {human(decision)}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${decisionPill(decision)}`}>{human(decision)}</span>
                  </div>
                  <textarea rows={2} value={lineNote} onChange={(e) => setLineNotes((prev) => ({ ...prev, [item.id]: e.target.value }))} className="mt-3 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" placeholder="Customer-facing note (required for reject or more info)" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void run(`approve-${item.id}`, () => adminReviewReturnCaseLine(order.id, request.id, item.id, { decision: "APPROVED", customerFacingNote: lineNote.trim() || "Approved" }))}>Approve</button>
                    <button type="button" disabled={busy !== null || !lineNote.trim()} className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50" onClick={() => void run(`reject-${item.id}`, () => adminReviewReturnCaseLine(order.id, request.id, item.id, { decision: "REJECTED", customerFacingNote: lineNote.trim() }))}>Reject</button>
                    <button type="button" disabled={busy !== null || !lineNote.trim()} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50" onClick={() => void run(`info-${item.id}`, () => adminReviewReturnCaseLine(order.id, request.id, item.id, { decision: "MORE_INFO_REQUIRED", moreInfoPrompt: lineNote.trim(), customerFacingNote: lineNote.trim() }))}>Request more info</button>
                  </div>
                </div>
              );
            })}
          </div>

          {pendingCount > 0 ? (
            <div className="mt-4 border-t border-stone-100 pt-4">
              <p className="mb-2 text-xs font-semibold text-stone-500">Bulk action for all remaining pending items</p>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="Customer-facing note (required to reject all)" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void run("approve-all", () => approveServiceRequest(order.id, request.id, note.trim() || undefined))} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve all pending</button>
                <button type="button" disabled={busy !== null || !note.trim()} onClick={() => void run("reject-all", () => rejectServiceRequest(order.id, request.id, note.trim()))} className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Reject all pending</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {request.type === "REFUND_AFTER_DELIVERY" ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-stone-900">Return processing</h2>
            <p className="mt-1 text-xs text-stone-500">Pickup, warehouse receipt, inspection, refund or replacement actions.</p>
          </div>
          <AdminOrderReturnReplacementPanel
            ctx={{
              orderId: order.id,
              currency: order.currency,
              paymentProvider,
              orderItems: order.items.map((i) => ({ id: i.id, lineTotalInPaise: i.lineTotalInPaise, qtyOrdered: i.qtyOrdered })),
              request: {
                id: request.id,
                caseNumber: request.caseNumber,
                status: request.status,
                returnPhysicalStatus: request.returnPhysicalStatus ?? undefined,
                resolutionStatus: request.resolutionStatus ?? undefined,
                shippingRefundPolicy: request.shippingRefundPolicy,
                refundTotalInPaise: request.refundTotalInPaise,
                refundProcessedAt: request.refundProcessedAt,
                items: items as never,
                returnShipment: request.returnShipment as never,
                replacementFulfillments: request.replacementFulfillments as never
              }
            }}
            onDone={() => void load()}
            showOverride
          />
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Internal accountability</h2>
          <p className="mt-1 text-xs text-stone-500">Never shown to customers.</p>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-xs text-stone-500">Root cause</dt>
              <dd className="mt-1 font-semibold text-stone-900">{human(request.rootCause)}</dd>
            </div>
            <div>
              <dt className="text-xs text-stone-500">Responsible team</dt>
              <dd className="mt-1 font-semibold text-stone-900">{human(request.responsibleTeam)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Case timeline</h2>
          <ul className="mt-4 space-y-0">
            {(events as Array<{ id: string; eventType: string; message?: string; createdAt: string }>).map((ev, index) => (
              <li key={ev.id} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="relative z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-[10px] font-bold text-stone-500">{index + 1}</div>
                {index < events.length - 1 ? <div className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-stone-200" /> : null}
                <div>
                  <p className="text-sm font-semibold text-stone-800">{human(ev.eventType)}</p>
                  {ev.message ? <p className="mt-0.5 text-xs text-stone-600">{ev.message}</p> : null}
                  <p className="mt-1 text-[11px] text-stone-400">{new Date(ev.createdAt).toLocaleString("en-IN")}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
