"use client";

import { useEffect, useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import {
  convertAdjustmentToCancellation,
  executeAdjustment,
  fetchAdjustmentPreview,
  markAdjustmentNeedsDiscussion,
  rejectServiceRequest,
  adminCreateSupplementaryPayment,
  type AdjustmentPreview
} from "@/lib/order-service-request";

type Props = {
  orderId: string;
  requestId: string;
  currency: string;
  status: string;
  reasonLabel: string;
  onUpdated: () => void;
};

export function AdminOrderAdjustmentPanel({
  orderId,
  requestId,
  currency,
  status,
  reasonLabel,
  onUpdated
}: Props) {
  const [preview, setPreview] = useState<AdjustmentPreview | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchAdjustmentPreview(orderId, requestId);
        setPreview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load preview");
      }
    })();
  }, [orderId, requestId]);

  const pending = status === "PENDING_APPROVAL" || status === "NEEDS_DISCUSSION";
  const fmt = (p: number) => formatMinorFromPaise(p, currency);

  async function run(action: "execute" | "discussion" | "convert" | "reject" | "payment") {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      if (action === "execute") {
        const res = await executeAdjustment(orderId, requestId, note);
        setMsg(res.message);
      } else if (action === "payment") {
        const session = await adminCreateSupplementaryPayment(orderId, requestId);
        setMsg(
          session.razorpayOrderId
            ? `Payment session created — customer pays ${fmt(session.amountInPaise)} via Razorpay`
            : session.stripeCheckoutUrl
              ? `Stripe checkout ready — ${fmt(session.amountInPaise)}`
              : `PayPal session ready — ${fmt(session.amountInPaise)}`
        );
      } else if (action === "discussion") {
        await markAdjustmentNeedsDiscussion(orderId, requestId, note);
        setMsg("Marked as needs discussion");
      } else if (action === "convert") {
        await convertAdjustmentToCancellation(orderId, requestId, note);
        setMsg("Converted to cancellation — Phase 1A workflow applied");
      } else {
        await rejectServiceRequest(orderId, requestId, note);
        setMsg("Request rejected");
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-800 dark:text-violet-300">
        Order change request
      </p>
      <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{reasonLabel}</p>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {preview ? (
        <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Commercial impact</dt>
            <dd className="font-semibold">{preview.classification.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Delta</dt>
            <dd>{fmt(preview.deltaPaise)}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Old total</dt>
            <dd>{fmt(preview.oldGrandTotalPaise)}</dd>
          </div>
          <div>
            <dt className="text-stone-500">New total</dt>
            <dd>{fmt(preview.newGrandTotalPaise)}</dd>
          </div>
          {!preview.eligible ? (
            <div className="sm:col-span-2 text-amber-800 dark:text-amber-300">
              {preview.blockMessage ?? "Not eligible for automatic execution"}
            </div>
          ) : (
            <div className="sm:col-span-2 text-emerald-800 dark:text-emerald-300">Safe to execute</div>
          )}
          {preview.warnings.map((w) => (
            <div key={w} className="sm:col-span-2 text-amber-700">
              {w}
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-stone-500">Loading commercial preview…</p>
      )}

      {pending ? (
        <>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Admin note (optional)"
            className="mt-3 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-950"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {preview?.classification === "ADDITIONAL_PAYMENT_REQUIRED" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run("payment")}
                className="rounded-full bg-amber-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Create payment link
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || (!preview?.eligible && preview?.classification !== "REFUND_REQUIRED")}
                onClick={() => void run("execute")}
                className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Execute change
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("discussion")}
              className="rounded-full border border-violet-600 px-4 py-1.5 text-xs font-semibold text-violet-900 disabled:opacity-50 dark:text-violet-200"
            >
              Needs discussion
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("convert")}
              className="rounded-full border border-amber-700 px-4 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"
            >
              Convert to cancellation
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("reject")}
              className="rounded-full border border-stone-400 px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-stone-600">{msg}</p> : null}
    </div>
  );
}
