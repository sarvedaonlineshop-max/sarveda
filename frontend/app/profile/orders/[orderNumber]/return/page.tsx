"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { OrderServiceRequestForm } from "@/components/orders/OrderServiceRequestForm";
import { fetchMe } from "@/lib/auth-client";
import {
  fetchReturnEligibility,
  REFUND_AFTER_DELIVERY_REASONS,
  submitOrderRefundRequest,
  type CustomerReturnEligibilityLine
} from "@/lib/order-service-request";
import { fetchMyOrders, type OrderLineItem } from "@/lib/orders-api";
import { delhiveryTrackUrl } from "@/lib/shipment-labels";

type ReturnLineItem = OrderLineItem & {
  returnEligibility?: {
    orderedQty: number;
    alreadyInReturnQty: number;
    rejectedLockedQty: number;
    remainingEligibleQty: number;
    maxReturnableQty: number;
    unavailableReason: string | null;
  };
};

type HistoryRef = {
  caseNumber: string;
  requestId: string;
  qtySelected: number;
  reviewDecision: string;
  caseStatus: string;
  reasonLabel?: string | null;
  requestedResolution?: string | null;
  customerFacingNote?: string | null;
  createdAt?: string;
  returnPhysicalStatus?: string;
  resolutionStatus?: string;
  refundTotalInPaise?: number | null;
  refundCompletedAt?: string | null;
  refundProcessedAt?: string | null;
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  shipmentPhysicalStatus?: string | null;
};

type HistoryCase = {
  requestId: string;
  caseNumber: string;
  status: string;
  createdAt?: string;
  resolutionStatus?: string;
  refundTotalInPaise: number;
  refundAt?: string | null;
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  shipmentPhysicalStatus?: string | null;
  items: Array<{
    orderItemId: string;
    name: string;
    sku: string;
    qty: number;
    decision: string;
    reason?: string | null;
    resolution?: string | null;
    note?: string | null;
  }>;
};

function toFormLine(
  orderLine: OrderLineItem,
  elig: CustomerReturnEligibilityLine | undefined
): ReturnLineItem {
  const maxReturnableQty = elig?.maxReturnableQty ?? 0;
  return {
    ...orderLine,
    quantity: Math.max(0, maxReturnableQty),
    returnEligibility: elig
      ? {
          orderedQty: elig.orderedQty,
          alreadyInReturnQty: elig.alreadyInReturnQty,
          rejectedLockedQty: elig.rejectedLockedQty,
          remainingEligibleQty: elig.remainingEligibleQty,
          maxReturnableQty: elig.maxReturnableQty,
          unavailableReason: elig.unavailableReason
        }
      : undefined
  };
}

function human(value?: string | null) {
  return value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : "—";
}

function money(paise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(paise / 100);
}

function decisionClass(decision: string) {
  if (decision === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (decision === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (decision === "MORE_INFO_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function visibleCustomerNote(note?: string | null): string | null {
  const value = note?.trim();
  if (!value) return null;
  if (/^(approved|your proposal is approved)$/i.test(value)) return null;
  return value;
}

function returnTrackingHref(entry: HistoryCase): string | null {
  const explicit = entry.trackingUrl?.trim();
  if (explicit) return explicit;
  if (entry.awb?.trim() && entry.courier?.toLowerCase().includes("delhivery")) {
    return delhiveryTrackUrl(entry.awb.trim());
  }
  return null;
}

export default function ReturnOrderRequestPage() {
  const params = useParams();
  const router = useRouter();
  const orderNumber = String(params.orderNumber ?? "");
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [returnBlockMessage, setReturnBlockMessage] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<ReturnLineItem[]>([]);
  const [history, setHistory] = useState<HistoryCase[]>([]);
  const [currency, setCurrency] = useState("INR");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (!me) {
        router.replace(`/login?next=/profile/orders/${encodeURIComponent(orderNumber)}/return`);
        return;
      }
      const orders = await fetchMyOrders();
      const order = orders.find((o) => o.orderNumber === orderNumber);
      if (!order) {
        if (!cancelled) setFatalError("Order not found.");
        return;
      }
      if (!order.lineItems?.length) {
        if (!cancelled) setFatalError("Order items could not be loaded. Please try again later.");
        return;
      }

      let eligibility;
      try {
        eligibility = await fetchReturnEligibility(orderNumber);
      } catch {
        if (!cancelled) setFatalError("Could not load return information. Please try again later.");
        return;
      }

      const byId = new Map(eligibility.lines.map((l) => [l.orderItemId, l]));
      const mapped = order.lineItems.map((li) => toFormLine(li, byId.get(li.id)));

      const historyByRequest = new Map<string, HistoryCase>();
      for (const line of eligibility.lines) {
        const refs = (line.relatedCaseRefs ?? []) as unknown as HistoryRef[];
        for (const ref of refs) {
          const existing = historyByRequest.get(ref.requestId) ?? {
            requestId: ref.requestId,
            caseNumber: ref.caseNumber,
            status: ref.caseStatus,
            createdAt: ref.createdAt,
            resolutionStatus: ref.resolutionStatus,
            refundTotalInPaise: ref.refundTotalInPaise ?? 0,
            refundAt: ref.refundCompletedAt ?? ref.refundProcessedAt ?? null,
            courier: ref.courier,
            awb: ref.awb,
            trackingUrl: ref.trackingUrl,
            shipmentPhysicalStatus: ref.shipmentPhysicalStatus,
            items: []
          };
          existing.items.push({
            orderItemId: line.orderItemId,
            name: line.nameSnapshot,
            sku: line.skuSnapshot,
            qty: ref.qtySelected,
            decision: ref.reviewDecision,
            reason: ref.reasonLabel,
            resolution: ref.requestedResolution,
            note: ref.customerFacingNote
          });
          historyByRequest.set(ref.requestId, existing);
        }
      }

      const cases = Array.from(historyByRequest.values()).sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      });

      const rawBlockMessage = eligibility.orderMessage ?? "No items are currently eligible for return.";
      const suppressExhaustedMessage = rawBlockMessage.includes(
        "All eligible units are already part of an active or approved return case."
      );
      const blockedMessage = !eligibility.orderEligible && !suppressExhaustedMessage ? rawBlockMessage : null;

      if (!cancelled) {
        setLineItems(mapped);
        setHistory(cases);
        setCurrency(eligibility.currency || order.currency);
        setReturnBlockMessage(blockedMessage);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, router]);

  const eligibleCount = useMemo(
    () => lineItems.reduce((sum, item) => sum + (item.returnEligibility?.remainingEligibleQty ?? 0), 0),
    [lineItems]
  );

  return (
    <div className="min-h-[60vh] bg-brand-cream md:py-8">
      <MobileSubpageHeader title="Refund & return history" backHref="/profile?tab=orders" backLabel="Back to My Orders" />
      <div className="mx-auto w-[92%] max-w-[1100px] space-y-5 py-4">
        {fatalError ? (
          <div className="rounded-2xl border border-brand-cream-dark bg-white p-6 text-center shadow-card">
            <p className="text-sm text-brand-muted">{fatalError}</p>
            <Link href="/profile?tab=orders" className="mt-4 inline-block text-sm font-semibold text-brand-forest underline">
              Back to My Orders
            </Link>
          </div>
        ) : ready ? (
          <>
            <div className="hidden md:block">
              <Link
                href="/profile?tab=orders"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-brand-forest/20 bg-white px-4 text-sm font-bold text-brand-forest shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-forest/5 hover:shadow-md active:translate-y-0"
              >
                <span aria-hidden="true">←</span>
                Back to My Orders
              </Link>
            </div>

            <section className="rounded-[24px] border border-brand-cream-dark bg-white p-5 shadow-card md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-700">₹</div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-brand-muted">Order {orderNumber}</p>
                    <h1 className="mt-1 text-2xl font-extrabold text-brand-forest">Refund & return history</h1>
                    <p className="mt-1 text-sm text-brand-muted">Past requests, approvals, rejections, pickup tracking and refunds for this order.</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-emerald-800">
                  <div className="text-2xl font-extrabold">{eligibleCount}</div>
                  <div className="text-xs font-bold uppercase tracking-wide">Eligible now</div>
                </div>
              </div>
            </section>

            {returnBlockMessage ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-950">
                {returnBlockMessage}
              </section>
            ) : null}

            {eligibleCount > 0 ? (
              <section>
                <div className="mb-3 flex items-center gap-3 px-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg">↩</div>
                  <div>
                    <h2 className="text-xl font-extrabold text-brand-forest">Items eligible for return</h2>
                    <p className="text-sm text-brand-muted">Select only the remaining quantities you want to return or replace.</p>
                  </div>
                </div>
                <OrderServiceRequestForm
                  orderNumber={orderNumber}
                  currency={currency}
                  kind="refund"
                  title="Return or replace items"
                  subtitle="Select delivered item(s) and a reason. Returns and replacements are available for 7 days after delivery."
                  reasons={REFUND_AFTER_DELIVERY_REASONS}
                  lineItems={lineItems}
                  backHref="/profile?tab=orders"
                  onSubmit={(payload) => submitOrderRefundRequest(orderNumber, payload)}
                />
              </section>
            ) : null}

            <section className="space-y-4">
              {history.length === 0 ? (
                <div className="rounded-[24px] border border-brand-cream-dark bg-white p-6 text-center text-sm text-brand-muted shadow-card">
                  No previous return or refund requests for this order.
                </div>
              ) : (
                history.map((entry) => {
                  const trackingHref = returnTrackingHref(entry);
                  const refundLabel = entry.refundTotalInPaise > 0
                    ? entry.refundAt
                      ? "Refund completed"
                      : "Refund initiated"
                    : null;

                  return (
                    <article key={entry.requestId} className="overflow-hidden rounded-[22px] border border-stone-200 bg-white shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/80 px-4 py-4 md:px-5">
                        <span className="text-base font-extrabold text-stone-950">{entry.caseNumber}</span>
                        {entry.createdAt ? (
                          <div className="text-right text-xs text-brand-muted">
                            <div className="font-semibold text-stone-600">Requested</div>
                            <div>{new Date(entry.createdAt).toLocaleString("en-IN")}</div>
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-3 p-4 md:p-5">
                        {entry.items.map((item, index) => {
                          const note = visibleCustomerNote(item.note);
                          return (
                            <div key={`${item.orderItemId}-${index}`} className="grid gap-3 rounded-xl border border-stone-100 bg-stone-50/50 p-3 md:grid-cols-[1.45fr_.45fr_.7fr] md:items-center">
                              <div>
                                <p className="font-bold text-stone-950">{item.name}</p>
                                <p className="mt-0.5 text-xs text-brand-muted">SKU {item.sku} · Qty {item.qty}{item.reason ? ` · ${item.reason}` : ""}</p>
                                {note ? <p className="mt-1 text-xs text-stone-600">{note}</p> : null}
                              </div>
                              <div>
                                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${decisionClass(item.decision)}`}>{human(item.decision)}</span>
                              </div>
                              <div className="text-sm font-semibold text-stone-700">{human(item.resolution)}</div>
                            </div>
                          );
                        })}

                        {(entry.courier || entry.awb) ? (
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-950">
                            <span><b>Return pickup:</b> {entry.courier || "Courier"}</span>
                            {entry.awb ? (
                              trackingHref ? (
                                <a href={trackingHref} target="_blank" rel="noreferrer" className="font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900">
                                  AWB: {entry.awb} · Track return
                                </a>
                              ) : (
                                <span><b>AWB:</b> {entry.awb}</span>
                              )
                            ) : null}
                          </div>
                        ) : null}

                        {refundLabel ? (
                          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${entry.refundAt ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950"}`}>
                            <div>
                              <span className="font-extrabold">{refundLabel}</span>
                              {entry.refundAt ? <span className="ml-2 text-xs text-emerald-800">{new Date(entry.refundAt).toLocaleString("en-IN")}</span> : null}
                            </div>
                            <span className="text-lg font-extrabold">{money(entry.refundTotalInPaise, currency)}</span>
                          </div>
                        ) : entry.status === "REJECTED" || entry.items.every((i) => i.decision === "REJECTED") ? (
                          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">This request was not approved. No refund was issued.</div>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-brand-muted" role="status">Loading…</p>
        )}
      </div>
    </div>
  );
}
