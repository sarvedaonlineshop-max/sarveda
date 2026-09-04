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

export default function AdminReturnCaseDetailPage() {
  const params = useParams();
  const caseNumber = decodeURIComponent(String(params.caseNumber ?? ""));
  const [data, setData] = useState<Awaited<ReturnType<typeof adminFetchReturnCaseByNumber>> | null>(
    null
  );
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
      const d = await adminFetchReturnCaseByNumber(caseNumber);
      setData(d);
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

  if (loading) return <div className="p-6">Loading return case…</div>;
  if (!data) return <div className="p-6 text-red-700">{error || "Not found"}</div>;

  const { request, order, paymentProvider, stageLabel, events } = data;
  const pending =
    request.status === "PENDING_APPROVAL" ||
    request.status === "MORE_INFO_REQUIRED" ||
    request.status === "PARTIALLY_APPROVED";
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
  const multiLine = items.length > 1 || items.some((i) => i.qtySelected > 1);
  const shippingSummary = (request as { shippingPolicySummary?: string }).shippingPolicySummary;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            <Link href="/admin/returns" className="hover:underline">
              Returns
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-stone-900">{request.caseNumber}</h1>
          <p className="mt-1 text-sm text-stone-600">
            Stage: <strong>{stageLabel}</strong>
            {" · "}
            Status:{" "}
            <strong>
              {(request as { statusLabel?: string }).statusLabel ??
                request.status.replace(/_/g, " ")}
            </strong>
            {" · "}
            Order{" "}
            <Link href={`/admin/orders/${order.id}`} className="font-semibold underline">
              {request.orderNumber}
            </Link>
            {" · "}
            {request.customerEmail}
          </p>
          <p className="text-xs text-stone-500">
            Created {new Date(request.createdAt).toLocaleString("en-IN")}
            {shippingSummary === "MIXED"
              ? " · Shipping policy: Mixed"
              : shippingSummary
                ? ` · Shipping: ${String(shippingSummary).replace(/_/g, " ")}`
                : ""}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Customer request</h2>
        {multiLine ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-stone-500">
                <th className="py-1">Item</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>Shipping policy</th>
                <th>Decision</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const ordered = order.items.find((o) => o.id === item.orderItemId);
                return (
                  <tr key={item.id} className="border-t border-stone-100">
                    <td className="py-2 font-medium">{item.nameSnapshot}</td>
                    <td>{item.skuSnapshot || "—"}</td>
                    <td>
                      {item.qtySelected}
                      {ordered ? ` / ${ordered.qtyOrdered}` : ""}
                    </td>
                    <td>{item.reasonLabel}</td>
                    <td className="text-xs">
                      {item.shippingRefundPolicy === "SHIPPING_REFUNDABLE"
                        ? "Refundable"
                        : item.shippingRefundPolicy === "SHIPPING_RETAINED"
                          ? "Retained"
                          : item.shippingRefundPolicy?.replace(/_/g, " ") || "—"}
                    </td>
                    <td>{item.reviewDecision ?? "PENDING"}</td>
                    <td>{item.requestedResolution?.replace(/_/g, " ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="mt-3 space-y-1 text-sm">
            <p>
              <strong>{items[0]?.nameSnapshot ?? request.reasonLabel}</strong>
              {items[0] ? ` × ${items[0].qtySelected}` : ""}
            </p>
            <p className="text-stone-600">Reason: {items[0]?.reasonLabel ?? request.reasonLabel}</p>
            <p className="text-stone-600">
              Resolution: {items[0]?.requestedResolution?.replace(/_/g, " ") ?? "—"}
            </p>
          </div>
        )}
        {request.message ? (
          <p className="mt-2 text-sm text-stone-700">Customer note: {request.message}</p>
        ) : null}
      </section>

      {pending && request.type === "REFUND_AFTER_DELIVERY" ? (
        <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Per-line review</h2>
          {items.map((item) => {
            const decision = item.reviewDecision ?? "PENDING";
            const lineNote = lineNotes[item.id] ?? "";
            const canDecide = decision === "PENDING" || decision === "MORE_INFO_REQUIRED";
            return (
              <div key={item.id} className="rounded-lg border border-stone-200 p-3">
                <p className="text-sm font-semibold">
                  {item.nameSnapshot} × {item.qtySelected}
                </p>
                <p className="text-xs text-stone-500">
                  {item.reasonLabel} · {decision}
                  {item.customerFacingNote ? ` · Note: ${item.customerFacingNote}` : ""}
                </p>
                {canDecide ? (
                  <>
                    <textarea
                      rows={2}
                      value={lineNote}
                      onChange={(e) =>
                        setLineNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="mt-2 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                      placeholder="Customer-facing note (required for reject / more info)"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() =>
                          void run(`approve-${item.id}`, () =>
                            adminReviewReturnCaseLine(order.id, request.id, item.id, {
                              decision: "APPROVED",
                              customerFacingNote: lineNote.trim() || "Approved"
                            })
                          )
                        }
                      >
                        Approve line
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null || !lineNote.trim()}
                        className="rounded-full border border-stone-400 px-3 py-1 text-xs font-semibold disabled:opacity-50"
                        onClick={() =>
                          void run(`reject-${item.id}`, () =>
                            adminReviewReturnCaseLine(order.id, request.id, item.id, {
                              decision: "REJECTED",
                              customerFacingNote: lineNote.trim()
                            })
                          )
                        }
                      >
                        Reject line
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null || !lineNote.trim()}
                        className="rounded-full border border-amber-600 px-3 py-1 text-xs font-semibold text-amber-900 disabled:opacity-50"
                        onClick={() =>
                          void run(`info-${item.id}`, () =>
                            adminReviewReturnCaseLine(order.id, request.id, item.id, {
                              decision: "MORE_INFO_REQUIRED",
                              moreInfoPrompt: lineNote.trim(),
                              customerFacingNote: lineNote.trim()
                            })
                          )
                        }
                      >
                        More info
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 text-xs text-stone-500">Or approve / reject remaining lines at once:</p>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
              placeholder="Bulk note (required for reject-all)"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run("approve-all", () =>
                    approveServiceRequest(order.id, request.id, note.trim() || undefined)
                  )
                }
                className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Approve all pending
              </button>
              <button
                type="button"
                disabled={busy !== null || !note.trim()}
                onClick={() =>
                  void run("reject-all", () => rejectServiceRequest(order.id, request.id, note.trim()))
                }
                className="rounded-full border border-stone-400 px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Reject case
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {request.type === "REFUND_AFTER_DELIVERY" ? (
        <AdminOrderReturnReplacementPanel
          ctx={{
            orderId: order.id,
            currency: order.currency,
            paymentProvider,
            orderItems: order.items.map((i) => ({
              id: i.id,
              lineTotalInPaise: i.lineTotalInPaise,
              qtyOrdered: i.qtyOrdered
            })),
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
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          Internal accountability
        </h2>
        <p className="mt-1 text-xs text-stone-500">Never shown to customers.</p>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-stone-500">Root cause</dt>
            <dd>{request.rootCause?.replace(/_/g, " ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Responsible team</dt>
            <dd>{request.responsibleTeam?.replace(/_/g, " ") || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Case timeline</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {(
            events as Array<{ id: string; eventType: string; message?: string; createdAt: string }>
          ).map((ev) => (
            <li key={ev.id} className="border-t border-stone-100 pt-2 first:border-0 first:pt-0">
              <span className="font-medium">{ev.eventType}</span>
              {ev.message ? ` — ${ev.message}` : ""}
              <span className="block text-xs text-stone-500">
                {new Date(ev.createdAt).toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-500">
          Order total {formatMinorFromPaise(order.grandTotalInPaise, order.currency)}
        </p>
      </section>
    </div>
  );
}
