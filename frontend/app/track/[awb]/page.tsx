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
      <h1 className="display-text font-serif text-3xl font-semibold text-brand-ink">Track shipment</h1>
      {!data ? (
        <p className="mt-6 text-brand-mid">
          We could not find tracking for AWB <strong>{awb}</strong>.
          {email ? " Check that the email matches your order." : null}
        </p>
      ) : (
        <div className="mt-8 space-y-4 rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-6 shadow-sm">
          <p className="text-sm text-brand-muted">AWB</p>
          <p className="font-mono text-lg font-semibold text-brand-ink">{data.waybill}</p>
          <p className="text-sm text-brand-muted">Courier</p>
          <p className="text-brand-ink">{data.courier}</p>
          <p className="text-sm text-brand-muted">Status</p>
          <p className="text-lg font-medium text-brand-violet">{data.shipmentStatus.replace(/_/g, " ")}</p>
          <p className="text-sm text-brand-muted">Order</p>
          <p className="text-brand-ink">{data.orderNumber}</p>
          {data.trackingUrl ? (
            <a
              href={data.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-brand-violet underline"
            >
              Open carrier tracking
            </a>
          ) : null}
        </div>
      )}
      <p className="mt-8">
        <Link href="/shop" className="text-sm font-medium text-brand-mid underline">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
