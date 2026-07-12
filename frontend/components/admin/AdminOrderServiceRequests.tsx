"use client";

import Image from "next/image";
import { useState } from "react";

import {
  adminServiceRequestPhotoDownloadUrl,
  adminServiceRequestPhotoViewUrl,
  approveServiceRequest,
  rejectServiceRequest
} from "@/lib/order-service-request";

export type AdminServiceRequestItemRow = {
  id: string;
  nameSnapshot: string;
  skuSnapshot: string;
  qtySelected: number;
  reasonLabel: string;
  message?: string | null;
  otherMessage?: string | null;
  photos?: Array<{ id: string; s3Url: string; fileName?: string | null }>;
};

export type AdminServiceRequestRow = {
  id: string;
  type: string;
  status: string;
  reasonLabel: string;
  otherMessage?: string | null;
  message?: string | null;
  customerEmail: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  adminNote?: string | null;
  photos?: Array<{ id: string; s3Url: string; fileName?: string | null }>;
  items?: AdminServiceRequestItemRow[];
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

export function AdminOrderServiceRequests({
  orderId,
  requests,
  onUpdated
}: {
  orderId: string;
  requests: AdminServiceRequestRow[];
  onUpdated: () => void;
}) {
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!requests.length) return null;

  async function handleReview(requestId: string, approve: boolean) {
    setBusyId(requestId);
    setError(null);
    try {
      if (approve) {
        await approveServiceRequest(orderId, requestId, note);
      } else {
        await rejectServiceRequest(orderId, requestId, note);
      }
      setNote("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
        Cancel / refund requests
      </h2>
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      <ul className="mt-3 space-y-4">
        {requests.map((req) => {
          const pending = req.status === "PENDING_APPROVAL";
          const kind = req.type === "CANCEL_BEFORE_DELIVERY" ? "Cancellation" : "Return / refund";
          return (
            <li
              key={req.id}
              className="rounded-lg border border-amber-200/80 bg-white p-4 dark:border-amber-900 dark:bg-stone-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-stone-900 dark:text-stone-100">
                    {kind} — {req.reasonLabel}
                  </p>
                  <p className="text-xs text-stone-500">
                    {req.customerEmail} · {new Date(req.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    req.status === "PENDING_APPROVAL"
                      ? "bg-amber-100 text-amber-900"
                      : req.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-stone-200 text-stone-700"
                  }`}
                >
                  {req.status.replaceAll("_", " ")}
                </span>
              </div>
              {req.message ? (
                <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
                  <strong>Overall message:</strong> {req.message}
                </p>
              ) : null}

              {req.items?.length ? (
                <ul className="mt-3 space-y-3">
                  {req.items.map((item) => (
                    <li key={item.id} className="rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
                      <p className="font-medium text-stone-900 dark:text-stone-100">
                        {item.nameSnapshot}{" "}
                        <span className="text-xs font-normal text-stone-500">
                          × {item.qtySelected} · {item.skuSnapshot}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                        <strong>Reason:</strong> {item.reasonLabel}
                      </p>
                      {item.message ? (
                        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{item.message}</p>
                      ) : null}
                      {item.photos?.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {item.photos.map((photo) => (
                            <PhotoThumb key={photo.id} orderId={orderId} photo={photo} />
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {!req.items?.length && req.photos?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-stone-500">Photos</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {req.photos.map((photo) => (
                      <PhotoThumb key={photo.id} orderId={orderId} photo={photo} />
                    ))}
                  </ul>
                </div>
              ) : null}

              {req.reviewedAt ? (
                <p className="mt-2 text-xs text-stone-500">
                  Reviewed {new Date(req.reviewedAt).toLocaleString("en-IN")}
                  {req.reviewedByEmail ? ` by ${req.reviewedByEmail}` : ""}
                  {req.adminNote ? ` — ${req.adminNote}` : ""}
                </p>
              ) : null}
              {pending ? (
                <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                    Note to customer (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void handleReview(req.id, true)}
                      className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      Approve (sanction)
                    </button>
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void handleReview(req.id, false)}
                      className="rounded-full border border-stone-400 px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:text-stone-200"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
