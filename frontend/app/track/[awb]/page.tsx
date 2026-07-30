import Link from "next/link";
import type { ReactNode } from "react";

import { getApiBase } from "@/lib/api";

type TrackData = {
  waybill: string;
  courier: string;
  shipmentStatus: string;
  trackingUrl: string | null;
  deliveredAt: string | null;
  orderNumber: string;
  orderStatus: string;
};

async function fetchTrack(awb: string, email?: string): Promise<TrackData | null> {
  const q = email ? `?email=${encodeURIComponent(email)}` : "";
  const url = `${getApiBase()}/api/shipping/public/track/${encodeURIComponent(awb)}${q}`;
  const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  const json = (await res.json()) as { success?: boolean; data?: TrackData };
  if (!res.ok || !json.success || !json.data) return null;
  return json.data;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function Row({
  icon,
  label,
  value,
  valueClassName = "text-stone-900"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex gap-3 border-b border-stone-200/90 py-4 last:border-b-0 last:pb-0 first:pt-0">
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#e0d8ce] bg-[#faf8f5]"
        style={{ color: "#1e3a2f" }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
        <p className={`mt-1 break-words text-base font-semibold ${valueClassName}`}>{value}</p>
      </div>
    </div>
  );
}

export default async function TrackPage({
  params,
  searchParams
}: {
  params: { awb: string };
  searchParams: { email?: string };
}) {
  const awb = params.awb?.trim() ?? "";
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;
  const data = awb ? await fetchTrack(awb, email) : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-center font-serif text-3xl font-semibold text-stone-900">Track shipment</h1>

      {!data ? (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-stone-600">
            We could not find tracking for AWB <strong className="text-stone-900">{awb || "—"}</strong>.
            {email ? " Check that the email matches your order." : null}
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-[#e0d8ce] bg-white shadow-sm">
          <div className="border-b border-[#e0d8ce] px-5 py-4" style={{ background: "#1e3a2f" }}>
            <p className="text-sm font-semibold" style={{ color: "#f5d88a" }}>
              Shipment details
            </p>
          </div>

          <div className="px-5 py-2">
            <Row
              label="AWB"
              value={data.waybill}
              valueClassName="font-mono text-stone-900"
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                  <path
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              }
            />
            <Row
              label="Courier"
              value={data.courier}
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                  <path
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-1.875a1.125 1.125 0 01-1.125-1.125v-6.75a1.125 1.125 0 011.125-1.125h3.038c.32 0 .623.139.838.382l2.122 2.4c.197.223.308.51.308.81v4.283c0 .621-.504 1.125-1.125 1.125H16.5z"
                  />
                </svg>
              }
            />
            <Row
              label="Status"
              value={statusLabel(data.shipmentStatus)}
              valueClassName="uppercase tracking-wide text-amber-800"
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                  <path
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
                  />
                </svg>
              }
            />
            <Row
              label="Order"
              value={data.orderNumber}
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor">
                  <path
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
            />
          </div>

          {data.trackingUrl ? (
            <div className="border-t border-[#e0d8ce] px-5 py-5">
              <a
                href={data.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-center text-sm font-bold transition hover:opacity-95"
                style={{ background: "#1e3a2f", color: "#f5d88a" }}
              >
                Click here to track your Order
              </a>
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-8 text-center">
        <Link href="/shop" className="text-sm font-medium text-stone-700 underline underline-offset-2">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
