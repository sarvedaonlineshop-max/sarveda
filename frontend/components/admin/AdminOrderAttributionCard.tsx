"use client";

import { useState } from "react";

export type AdminOrderAttribution = {
  sourceType?: string | null;
  firstSource?: string | null;
  firstMedium?: string | null;
  firstCampaign?: string | null;
  firstReferrer?: string | null;
  firstLandingPage?: string | null;
  lastSource?: string | null;
  lastMedium?: string | null;
  lastCampaign?: string | null;
  lastReferrer?: string | null;
  lastLandingPage?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referringDomain?: string | null;
  landingPath?: string | null;
  deviceType?: string | null;
  sessionPageViews?: number | null;
  sessionStartedAt?: string | null;
  capturedAt?: string | null;
};

function text(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

function deviceLabel(v: string | null | undefined): string | null {
  const d = text(v);
  if (!d) return null;
  switch (d.toUpperCase()) {
    case "DESKTOP":
      return "Desktop";
    case "MOBILE":
      return "Mobile";
    case "TABLET":
      return "Tablet";
    case "OTHER":
      return "Other";
    default:
      return d;
  }
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const v = text(value);
  if (!v) return null;
  return (
    <div className="grid grid-cols-[minmax(7rem,9rem)_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="break-words font-medium text-stone-800 dark:text-stone-100">{v}</dd>
    </div>
  );
}

export function AdminOrderAttributionCard({
  attribution
}: {
  attribution: AdminOrderAttribution | null | undefined;
}) {
  const [techOpen, setTechOpen] = useState(false);

  if (!attribution) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">
          Order Attribution
        </h2>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Attribution was not captured for this order.
        </p>
      </section>
    );
  }

  const originDomain = text(attribution.referringDomain);
  const origin = originDomain
    ? `Referral: ${originDomain}`
    : text(attribution.sourceType) === "Direct"
      ? "Direct"
      : text(attribution.sourceType);
  const sourceMedium =
    text(attribution.lastSource) || text(attribution.lastMedium)
      ? `${text(attribution.lastSource) ?? "—"} / ${text(attribution.lastMedium) ?? "—"}`
      : text(attribution.utmSource) || text(attribution.utmMedium)
        ? `${text(attribution.utmSource) ?? "—"} / ${text(attribution.utmMedium) ?? "—"}`
        : null;

  const campaign =
    text(attribution.lastCampaign) ?? text(attribution.utmCampaign) ?? text(attribution.firstCampaign);

  const landing =
    text(attribution.landingPath) ??
    text(attribution.lastLandingPage) ??
    text(attribution.firstLandingPage);

  const firstLine =
    text(attribution.firstSource) || text(attribution.firstMedium)
      ? `${text(attribution.firstSource) ?? "—"} / ${text(attribution.firstMedium) ?? "—"}${
          text(attribution.firstLandingPage) ? ` · ${text(attribution.firstLandingPage)}` : ""
        }`
      : text(attribution.firstLandingPage);

  const lastLine =
    text(attribution.lastSource) || text(attribution.lastMedium)
      ? `${text(attribution.lastSource) ?? "—"} / ${text(attribution.lastMedium) ?? "—"}${
          text(attribution.lastLandingPage) ? ` · ${text(attribution.lastLandingPage)}` : ""
        }`
      : text(attribution.lastLandingPage);

  const hasTech = Boolean(
    text(attribution.gclid) ||
      text(attribution.fbclid) ||
      text(attribution.lastReferrer) ||
      text(attribution.firstReferrer) ||
      text(attribution.utmContent) ||
      text(attribution.utmTerm)
  );

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">
        Order Attribution
      </h2>
      <dl className="mt-4 space-y-2.5">
        {origin ? <Row label="Origin" value={origin} /> : null}
        <Row label="Source type" value={attribution.sourceType} />
        <Row label="Source / Medium" value={sourceMedium} />
        <Row label="Campaign" value={campaign} />
        <Row label="Landing page" value={landing} />
        <Row label="Device" value={deviceLabel(attribution.deviceType)} />
        {attribution.sessionPageViews != null && Number.isFinite(attribution.sessionPageViews) ? (
          <Row label="Session page views" value={String(attribution.sessionPageViews)} />
        ) : null}
        <Row label="First touch" value={firstLine} />
        <Row label="Last touch" value={lastLine} />
      </dl>

      {hasTech ? (
        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setTechOpen((o) => !o)}
            className="text-xs font-semibold uppercase tracking-wide text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
          >
            {techOpen ? "Hide" : "Show"} technical / marketing details
          </button>
          {techOpen ? (
            <dl className="mt-3 space-y-2">
              <Row label="gclid" value={attribution.gclid} />
              <Row label="fbclid" value={attribution.fbclid} />
              <Row label="utm_content" value={attribution.utmContent} />
              <Row label="utm_term" value={attribution.utmTerm} />
              <Row label="Last referrer" value={attribution.lastReferrer} />
              <Row label="First referrer" value={attribution.firstReferrer} />
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
