"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { crmApi, type CrmOrderDesk } from "@/lib/crm-api";
import { COMPANY_WAREHOUSE_MAPS_URL } from "@/lib/company";
import { formatQuoteMoney } from "@/lib/quote-pricing";

function trackingWhen(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const FEEDBACK_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  SENT: "Sent",
  RECEIVED: "Received",
  NEEDS_ATTENTION: "Needs Attention",
  RESOLVED: "Resolved"
};

const ISSUE_LABEL: Record<string, string> = {
  NEGATIVE_FEEDBACK: "Negative feedback",
  PRODUCT_COMPLAINT: "Product complaint",
  RETURN: "Return / refund",
  DELIVERY: "Delivery problem",
  DEFECT: "Product defect"
};

export function ChatOrderPanel({ threadId }: { threadId: string }) {
  const [desk, setDesk] = useState<CrmOrderDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return crmApi
      .orderDesk(threadId)
      .then(setDesk)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load order"));
  }

  useEffect(() => {
    void load();
  }, [threadId]);

  async function run(action: () => Promise<CrmOrderDesk>) {
    setBusy(true);
    setError(null);
    try {
      setDesk(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the order");
    } finally {
      setBusy(false);
    }
  }

  if (!desk && !error) return <p className="text-[12px] text-[#4a6b58]">Loading order…</p>;
  if (!desk?.order) {
    return (
      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Order</p>
        <p className="mt-2 text-[12px] text-[#4a6b58]">No confirmed order yet. It will appear here after payment.</p>
        {error ? <p className="mt-2 text-[12px] text-[#991b1b]">{error}</p> : null}
      </section>
    );
  }

  const order = desk.order;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4a6b58]">Order details</p>
            <p className="mt-1 text-[15px] font-semibold">#{order.orderNumber}</p>
          </div>
          <Link href={`/admin/orders/${order.id}`} className="text-[12px] font-semibold text-[#1d4e89]">
            View
          </Link>
        </div>
        <ul className="mt-2 space-y-1 text-[12px]">
          {order.items.map((item) => (
            <li key={`${item.sku}-${item.name}`}>
              {item.qty} × {item.name}
              <span className="text-[#78716c]"> · {item.sku}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] font-semibold">{formatQuoteMoney(order.grandTotalInPaise, order.currency)}</p>
      </section>

      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold text-[#1e3a5f]">Delivery & Tracking</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-semibold text-[#166534]">{order.currentLabel}</span>
            {order.trackingUrl ? (
              <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#1d4e89] px-2 py-0.5 text-[11px] font-semibold text-[#1d4e89]">
                View Tracking
              </a>
            ) : (
              <Link href={`/admin/shipments/${order.id}`} className="rounded-full border border-[#1d4e89] px-2 py-0.5 text-[11px] font-semibold text-[#1d4e89]">
                View Tracking
              </Link>
            )}
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[#64748b]">
          {order.courier ? `Courier, ${order.courier}` : order.shippingMethod}
          {order.awb ? `  |  Tracking No: ${order.awb}` : ""}
        </p>
        <ol className="mt-3">
          {order.events.map((event, index) => {
            const reached = event.state !== "upcoming";
            const nextReached = order.events[index + 1]?.state !== "upcoming";
            const when = trackingWhen(event.at);
            return (
              <li key={event.id} className="flex gap-3">
                <div className="flex w-4 flex-col items-center">
                  <span
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2"
                    style={{ borderColor: reached ? "#16a34a" : "#d6d3d1", background: reached ? "#16a34a" : "#fff" }}
                  />
                  {index < order.events.length - 1 ? (
                    <span className="min-h-7 w-0.5 flex-1" style={{ background: reached && nextReached ? "#86efac" : "#e7e5e4" }} />
                  ) : null}
                </div>
                <div className="pb-3">
                  <p className={reached ? "text-[13px] font-semibold text-[#1e293b]" : "text-[13px] text-[#a8a29e]"}>{event.label}</p>
                  {when ? <p className="text-[11px] text-[#64748b]">{when}</p> : null}
                  {event.detail ? <p className="text-[11px] text-[#64748b]">{event.detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
        <Link href={`/admin/shipments/${order.id}`} className="inline-block text-[12px] font-semibold text-[#1d4e89]">
          Open shipment
        </Link>
        <p className="mt-2 text-[12px]">{order.collection}</p>
        <p className="mt-1 text-[11px] font-semibold" style={{ color: order.dispatchApproved ? "#166534" : "#991b1b" }}>
          {order.dispatchApproved ? "Dispatch approved" : "Dispatch on hold"}
        </p>
        {order.rto ? <p className="mt-2 text-[12px] font-semibold text-[#991b1b]">RTO. Shiva has been notified. Settlement is separate.</p> : null}
        {order.shippingError ? <p className="mt-2 text-[12px] text-[#991b1b]">{order.shippingError}</p> : null}
      </section>

      {desk.returnCase ? (
        <section className="rounded-xl border border-[#be185d]/20 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#be185d]">Return / refund</p>
              <p className="mt-1 text-[13px] font-semibold">{desk.returnCase.caseNumber}</p>
            </div>
            <Link href={`/admin/returns/${encodeURIComponent(desk.returnCase.caseNumber)}`} className="text-[12px] font-semibold text-[#1d4e89]">
              Full case
            </Link>
          </div>
          <p className="mt-2 text-[12px] font-semibold">{desk.returnCase.stageLabel}</p>
          {desk.returnCase.reason ? <p className="mt-1 text-[12px]">{desk.returnCase.reason}</p> : null}
          {desk.returnCase.comment ? <p className="mt-1 text-[12px] text-[#4a6b58]">{desk.returnCase.comment}</p> : null}
          <p className="mt-2 text-[11px] text-[#78716c]">{desk.returnCase.assignee}</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Post-delivery feedback</p>
        {desk.feedback ? (
          <>
            <p className="mt-2 text-[12px] font-semibold">{FEEDBACK_LABEL[desk.feedback.status] ?? desk.feedback.status}</p>
            <p className="mt-1 text-[11px] text-[#78716c]">
              {desk.feedback.status === "SCHEDULED"
                ? `Scheduled ${new Date(desk.feedback.scheduledFor).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : desk.feedback.sentAt
                  ? `Sent ${new Date(desk.feedback.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : "Waiting for a reply"}
            </p>
            {desk.feedback.rating ? <p className="mt-1 text-[12px]">Rating {desk.feedback.rating}/5</p> : null}
            {desk.feedback.response ? <p className="mt-1 text-[12px]">{desk.feedback.response}</p> : null}
            <label className="mt-2 flex items-center gap-2 text-[11px] text-[#57534e]">
              <input
                type="checkbox"
                checked={desk.feedback.consent}
                disabled={busy}
                onChange={(event) => void run(() => crmApi.setFeedbackConsent(threadId, event.target.checked))}
              />
              Customer agrees to a feedback message
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !desk.feedback.consent}
                className="rounded-lg bg-[#1d4e89] px-2 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                onClick={() => void run(() => crmApi.sendOrderFeedback(threadId))}
              >
                Send feedback
              </button>
              {desk.feedback.status === "NEEDS_ATTENTION" ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px] font-semibold"
                  onClick={() => void run(() => crmApi.resolveOrderFeedback(threadId))}
                >
                  Mark resolved
                </button>
              ) : null}
            </div>
            <form
              className="mt-3 space-y-2 border-t border-[#1c352a]/10 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const next = await crmApi.recordOrderFeedback(threadId, {
                    rating: Number(rating),
                    response: comment || null
                  });
                  setComment("");
                  return next;
                });
              }}
            >
              <p className="text-[12px] font-semibold">Save the customer's reply</p>
              <div className="flex gap-2">
                <select value={rating} disabled={busy} onChange={(event) => setRating(event.target.value)} className="rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px]">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <input
                  value={comment}
                  disabled={busy}
                  placeholder="What they said"
                  onChange={(event) => setComment(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px]"
                />
              </div>
              <button type="submit" disabled={busy} className="text-[12px] font-semibold text-[#1d4e89] disabled:opacity-40">
                Save response
              </button>
            </form>
            <a href={COMPANY_WAREHOUSE_MAPS_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] font-semibold text-[#1d4e89]">
              Google review link
            </a>
          </>
        ) : (
          <p className="mt-2 text-[12px] text-[#4a6b58]">A feedback message is scheduled 2 days after confirmed delivery.</p>
        )}
      </section>

      {desk.issues.length > 0 ? (
        <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
          <p className="text-[12px] font-semibold">Issues</p>
          <div className="mt-2 space-y-2">
            {desk.issues.map((issue) => (
              <div key={issue.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
                <p className="font-semibold">{ISSUE_LABEL[issue.kind] ?? issue.kind}</p>
                <p className="mt-1">{issue.summary}</p>
                <p className="mt-1 text-[11px] text-[#57534e]">
                  {issue.sku ? `${issue.sku}` : "No SKU"}
                  {issue.ownerEmail ? ` · ${issue.ownerEmail.split("@")[0]}` : ""}
                  {issue.supplier ? ` · ${issue.supplier}` : ""}
                </p>
                <input
                  defaultValue={issue.correctiveAction ?? ""}
                  placeholder="Corrective action"
                  className="mt-2 w-full rounded-lg border border-[#d6dde6] px-2 py-1 text-[12px]"
                  onBlur={(event) => {
                    if (event.target.value === (issue.correctiveAction ?? "")) return;
                    void run(() => crmApi.updateOrderIssue(threadId, issue.id, { correctiveAction: event.target.value }));
                  }}
                />
                <select
                  value={issue.status}
                  disabled={busy}
                  className="mt-2 rounded-lg border border-[#d6dde6] bg-white px-2 py-1 text-[12px]"
                  onChange={(event) => void run(() => crmApi.updateOrderIssue(threadId, issue.id, { status: event.target.value }))}
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {error ? <p className="text-[12px] text-[#991b1b]">{error}</p> : null}
    </div>
  );
}
