"use client";

import Image from "next/image";
import Link from "next/link";

import { formatMinorFromPaise } from "@/lib/money";
import { adminServiceRequestPhotoDownloadUrl, adminServiceRequestPhotoViewUrl } from "@/lib/order-service-request";

export type AdminServiceRequestItemRow = {
  id: string;
  orderItemId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  qtySelected: number;
  reasonLabel: string;
  reviewDecision?: string | null;
  requestedResolution?: string | null;
  message?: string | null;
  otherMessage?: string | null;
  refundAmountInPaise?: number | null;
  refundedAt?: string | null;
  photos?: Array<{ id: string; s3Url: string; fileName?: string | null }>;
};

export type AdminServiceRequestRow = {
  id: string;
  type: string;
  status: string;
  reasonLabel: string;
  caseNumber?: string | null;
  otherMessage?: string | null;
  message?: string | null;
  customerEmail: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  adminNote?: string | null;
  codRefundNote?: string | null;
  refundTotalInPaise?: number | null;
  refundProcessedAt?: string | null;
  refundProviderReference?: string | null;
  returnPhysicalStatus?: string | null;
  resolutionStatus?: string | null;
  shippingRefundPolicy?: string | null;
  returnShipment?: {
    id: string;
    awb?: string | null;
    courier?: string | null;
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
  photos?: Array<{ id: string; s3Url: string; fileName?: string | null }>;
  items?: AdminServiceRequestItemRow[];
};

export type AdminServiceRequestOrderContext = {
  currency: string;
  grandTotalInPaise: number;
  paymentStatus: string;
  paymentProvider: string | null;
  paymentRefundedInPaise?: number;
  orderItems: Array<{ id: string; lineTotalInPaise: number; qtyOrdered: number }>;
};

function PhotoThumb({
  orderId,
  photo
}: {
  orderId: string;
  photo: { id: string; fileName?: string | null };
}) {
  const viewUrl = adminServiceRequestPhotoViewUrl(orderId, photo.id);
  const downloadUrl = adminServiceRequestPhotoDownloadUrl(orderId, photo.id);
  return (
    <li className="space-y-1">
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block h-20 w-20 overflow-hidden rounded-md border border-stone-200"
      >
        <Image src={viewUrl} alt={photo.fileName || "Request photo"} fill className="object-cover" unoptimized />
      </a>
      <a
        href={downloadUrl}
        className="block text-center text-[10px] font-semibold text-amber-800 underline dark:text-amber-300"
      >
        Download
      </a>
    </li>
  );
}

function humanState(value: string | null | undefined): string {
  return (value || "—")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function providerLabel(provider: string | null): string {
  if (provider === "RAZORPAY") return "Razorpay";
  if (provider === "STRIPE") return "Stripe";
  if (provider === "PAYPAL") return "PayPal";
  if (provider === "COD") return "Cash on delivery (COD)";
  return provider ?? "Payment gateway";
}

function requestKind(req: AdminServiceRequestRow): string {
  if (req.type === "ADJUST_BEFORE_DELIVERY") return "Order change";
  if (req.type === "CANCEL_BEFORE_DELIVERY") return "Cancellation";
  return "Return / refund";
}

function statusPillClass(status: string): string {
  if (status === "PENDING_APPROVAL" || status === "NEEDS_DISCUSSION" || status === "MORE_INFO_REQUIRED") {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (status === "APPROVED" || status === "PARTIALLY_APPROVED") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (status === "REJECTED") {
    return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200";
  }
  return "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200";
}

function resolutionText(req: AdminServiceRequestRow, currency: string): string {
  if (req.resolutionStatus === "REFUNDED" && req.refundTotalInPaise != null) {
    return `Refund processed — ${formatMinorFromPaise(req.refundTotalInPaise, currency)}`;
  }
  if (req.refundProcessedAt && req.refundTotalInPaise != null) {
    return `Refund recorded — ${formatMinorFromPaise(req.refundTotalInPaise, currency)}`;
  }
  if (req.status === "APPROVED") return "Approved — complete next action in Returns desk";
  if (req.status === "PENDING_APPROVAL") return "Waiting for admin review";
  if (req.status === "REJECTED") return "Rejected";
  return humanState(req.resolutionStatus || req.status);
}

export function AdminOrderServiceRequests({
  orderId,
  requests,
  orderCtx
}: {
  orderId: string;
  requests: AdminServiceRequestRow[];
  orderCtx: AdminServiceRequestOrderContext;
  onUpdated: () => void;
}) {
  if (!requests.length) return null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="border-b border-stone-100 px-5 py-4 dark:border-stone-700">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Related cases</h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Summary only. Review, QC, replacement, and refund actions are handled from the Returns desk.
            </p>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
            {providerLabel(orderCtx.paymentProvider)} · {humanState(orderCtx.paymentStatus)}
          </span>
        </div>
      </div>

      <ul className="divide-y divide-stone-100 dark:divide-stone-700">
        {requests.map((req) => {
          const items = req.items ?? [];
          const caseHref = req.caseNumber ? `/admin/returns/${encodeURIComponent(req.caseNumber)}` : null;
          return (
            <li key={req.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {requestKind(req)}{req.caseNumber ? ` — ${req.caseNumber}` : ""}
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusPillClass(req.status)}`}>
                      {humanState(req.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {req.customerEmail} · {new Date(req.createdAt).toLocaleString("en-IN")}
                  </p>
                  <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
                    <strong>Reason:</strong> {req.reasonLabel}
                  </p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                    <strong>Status:</strong> {resolutionText(req, orderCtx.currency)}
                  </p>
                  {req.message ? (
                    <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                      <strong>Customer message:</strong> {req.message}
                    </p>
                  ) : null}
                </div>

                {caseHref ? (
                  <Link
                    href={caseHref}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#1c352a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#15291f]"
                  >
                    Open case
                  </Link>
                ) : null}
              </div>

              {items.length ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-stone-100 dark:border-stone-800">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[#faf7f2] text-[#8a7060] dark:bg-stone-800 dark:text-stone-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Item</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Customer reason</th>
                        <th className="px-3 py-2 font-semibold">Decision</th>
                        <th className="px-3 py-2 font-semibold">Refunded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-stone-900 dark:text-stone-100">{item.nameSnapshot}</p>
                            <p className="font-mono text-[11px] text-stone-500">{item.skuSnapshot}</p>
                            {item.message ? <p className="mt-1 text-[11px] text-stone-500">{item.message}</p> : null}
                          </td>
                          <td className="px-3 py-2 align-top font-semibold">{item.qtySelected}</td>
                          <td className="px-3 py-2 align-top text-stone-600 dark:text-stone-300">{item.reasonLabel}</td>
                          <td className="px-3 py-2 align-top text-stone-600 dark:text-stone-300">
                            {humanState(item.reviewDecision || req.status)}
                          </td>
                          <td className="px-3 py-2 align-top text-stone-600 dark:text-stone-300">
                            {item.refundAmountInPaise
                              ? formatMinorFromPaise(item.refundAmountInPaise, orderCtx.currency)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {req.returnShipment ? (
                <dl className="mt-4 grid gap-3 rounded-lg border border-stone-100 bg-stone-50 p-3 text-xs dark:border-stone-800 dark:bg-stone-950 sm:grid-cols-4">
                  <div>
                    <dt className="text-stone-500">Return AWB</dt>
                    <dd className="font-mono font-semibold text-stone-900 dark:text-stone-100">{req.returnShipment.awb ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Courier</dt>
                    <dd>{req.returnShipment.courier ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Physical status</dt>
                    <dd>{humanState(req.returnShipment.physicalStatus)}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Condition</dt>
                    <dd>{humanState(req.returnShipment.disposition)}</dd>
                  </div>
                </dl>
              ) : null}

              {req.refundTotalInPaise != null || req.codRefundNote || req.refundProviderReference ? (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
                  <p className="font-semibold">Refund record</p>
                  <p className="mt-1">
                    Amount: {formatMinorFromPaise(req.refundTotalInPaise ?? 0, orderCtx.currency)}
                    {req.refundProcessedAt ? ` · ${new Date(req.refundProcessedAt).toLocaleString("en-IN")}` : ""}
                    {req.refundProviderReference ? ` · Ref: ${req.refundProviderReference}` : ""}
                  </p>
                  {req.codRefundNote ? <p className="mt-1 whitespace-pre-wrap">{req.codRefundNote}</p> : null}
                </div>
              ) : null}

              {req.photos?.length || items.some((item) => item.photos?.length) ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Evidence</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {(req.photos ?? []).map((photo) => (
                      <PhotoThumb key={photo.id} orderId={orderId} photo={photo} />
                    ))}
                    {items.flatMap((item) => item.photos ?? []).map((photo) => (
                      <PhotoThumb key={photo.id} orderId={orderId} photo={photo} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
