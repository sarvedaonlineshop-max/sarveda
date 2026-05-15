import Link from "next/link";

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
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-stone-900">Track shipment</h1>
      {!data ? (
        <p className="mt-6 text-stone-600">
          We could not find tracking for AWB <strong>{awb}</strong>.
          {email ? " Check that the email matches your order." : null}
        </p>
      ) : (
        <div className="mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-stone-500">AWB</p>
          <p className="font-mono text-lg font-semibold text-stone-900">{data.waybill}</p>
          <p className="text-sm text-stone-500">Courier</p>
          <p className="text-stone-800">{data.courier}</p>
          <p className="text-sm text-stone-500">Status</p>
          <p className="text-lg font-medium text-amber-800">{data.shipmentStatus.replace(/_/g, " ")}</p>
          <p className="text-sm text-stone-500">Order</p>
          <p className="text-stone-800">{data.orderNumber}</p>
          {data.trackingUrl ? (
            <a
              href={data.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-amber-800 underline"
            >
              Open carrier tracking
            </a>
          ) : null}
        </div>
      )}
      <p className="mt-8">
        <Link href="/shop" className="text-sm font-medium text-stone-700 underline">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
