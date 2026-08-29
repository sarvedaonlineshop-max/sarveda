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

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/^www\./, "");
}

function isPlaceholder(v: string | null | undefined): boolean {
  const n = norm(v);
  return !n || n === "(direct)" || n === "(none)" || n === "(not set)" || n === "(other)" || n === "—";
}

/** Known hosts / tokens → display name. Return null if not confidently identifiable. */
function humanizeSourceName(raw: string | null | undefined): string | null {
  const n = norm(raw);
  if (!n || isPlaceholder(raw)) return null;

  if (n === "google" || n === "google.com" || n.endsWith(".google.com") || n.startsWith("google.")) {
    return "Google";
  }
  if (n === "bing" || n === "bing.com" || n.endsWith(".bing.com")) return "Bing";
  if (n === "yahoo" || n === "yahoo.com" || n.endsWith(".yahoo.com") || n.includes("yahoo.")) {
    return "Yahoo";
  }
  if (n === "duckduckgo" || n === "duckduckgo.com" || n.endsWith(".duckduckgo.com")) {
    return "DuckDuckGo";
  }
  if (
    n === "facebook" ||
    n === "fb" ||
    n === "meta" ||
    n === "facebook.com" ||
    n === "fb.com" ||
    n === "m.facebook.com" ||
    n === "l.facebook.com" ||
    n.endsWith(".facebook.com")
  ) {
    return "Facebook";
  }
  if (n === "instagram" || n === "ig" || n === "instagram.com" || n.endsWith(".instagram.com")) {
    return "Instagram";
  }
  if (n === "twitter" || n === "x" || n === "twitter.com" || n === "x.com" || n === "t.co") {
    return "X (Twitter)";
  }
  if (n === "linkedin" || n === "linkedin.com" || n === "lnkd.in" || n.endsWith(".linkedin.com")) {
    return "LinkedIn";
  }
  if (n === "pinterest" || n === "pinterest.com" || n === "pin.it" || n.endsWith(".pinterest.com")) {
    return "Pinterest";
  }
  if (n === "tiktok" || n === "tiktok.com" || n.endsWith(".tiktok.com")) return "TikTok";
  if (n === "youtube" || n === "youtu.be" || n === "youtube.com" || n.endsWith(".youtube.com")) {
    return "YouTube";
  }
  if (n === "reddit" || n === "reddit.com" || n.endsWith(".reddit.com")) return "Reddit";
  if (n === "whatsapp" || n === "wa.me" || n === "whatsapp.com") return "WhatsApp";
  if (n === "chatgpt" || n === "chatgpt.com" || n === "chat.openai.com" || n === "openai.com") {
    return "ChatGPT";
  }
  if (n === "email" || n === "newsletter") return "Email";
  if (n === "organic") return null;
  if (n === "referral" || n === "social") return null;

  // Bare brand-like tokens without TLD — title-case only if simple
  if (/^[a-z][a-z0-9_-]{1,24}$/.test(n) && !n.includes(".")) {
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // Unknown domains: do not invent a brand — show hostname as-is (cleaned)
  if (n.includes(".")) return n;
  return null;
}

function humanizeMediumLabel(
  raw: string | null | undefined,
  sourceType?: string | null
): string | null {
  const n = norm(raw);
  const st = text(sourceType);

  if (isPlaceholder(raw)) {
    if (st === "Organic Search") return "Organic Search";
    if (st === "Referral") return "Referral";
    if (st === "Social") return "Social";
    if (st === "Paid Search") return "Paid Search";
    if (st === "Paid Social") return "Paid Social";
    if (st === "Email") return "Email";
    return null;
  }

  if (n === "organic" || n === "organic search") return "Organic Search";
  if (n === "referral") return "Referral";
  if (n === "social") return "Social";
  if (n === "email" || n === "e-mail") return "Email";
  if (n === "cpc" || n === "ppc" || n === "paidsearch" || n === "paid_search") return "Paid Search";
  if (n === "paid" || n === "paidsocial" || n === "paid_social" || n === "paid-social") {
    return st === "Paid Search" ? "Paid Search" : "Paid Social";
  }
  if (n === "display" || n === "cpm" || n === "cpa" || n === "retargeting") {
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // Unknown medium — title-case token, do not invent channel
  if (/^[a-z][a-z0-9_-]{0,24}$/.test(n)) {
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  return text(raw);
}

function isDirectTouch(
  source: string | null | undefined,
  medium: string | null | undefined,
  sourceType?: string | null
): boolean {
  if (text(sourceType) === "Direct") return true;
  const s = norm(source);
  const m = norm(medium);
  return (
    (s === "(direct)" || s === "direct" || !s) &&
    (m === "(none)" || m === "none" || !m || isPlaceholder(medium))
  );
}

/** Primary Source / Medium line for admins. */
function formatHumanSourceMedium(
  source: string | null | undefined,
  medium: string | null | undefined,
  sourceType?: string | null
): string | null {
  if (isDirectTouch(source, medium, sourceType)) {
    return "Direct";
  }

  const humanSource = humanizeSourceName(source);
  const humanMedium = humanizeMediumLabel(medium, sourceType);
  const st = text(sourceType);

  // Prefer source type when medium is organic/referral-like and source is known
  if (humanSource && humanMedium) {
    return `${humanSource} / ${humanMedium}`;
  }
  if (humanSource && st && st !== "Direct" && st !== "Other") {
    return `${humanSource} / ${st}`;
  }
  if (humanSource) return humanSource;
  if (humanMedium && st && st !== "Other") return `${humanMedium}`;
  if (st && st !== "Other") return st;

  // Fall back to cleaned raw only when we have something real (not placeholders)
  const rawS = !isPlaceholder(source) ? text(source) : null;
  const rawM = !isPlaceholder(medium) ? text(medium) : null;
  if (rawS && rawM) return `${rawS} / ${rawM}`;
  if (rawS) return rawS;
  if (rawM) return rawM;
  return null;
}

function formatRawSourceMedium(
  source: string | null | undefined,
  medium: string | null | undefined
): string | null {
  const s = text(source);
  const m = text(medium);
  if (s && m) return `${s} / ${m}`;
  return s ?? m;
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

function humanizeOrigin(
  referringDomain: string | null | undefined,
  sourceType: string | null | undefined
): string | null {
  const st = text(sourceType);
  if (st === "Direct" && !text(referringDomain)) return "Direct";

  const domain = text(referringDomain);
  if (domain) {
    const brand = humanizeSourceName(domain);
    return `Referral: ${brand ?? domain}`;
  }
  return st;
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

function TouchBlock({
  label,
  hint,
  source,
  medium,
  sourceType,
  landingPage
}: {
  label: string;
  hint: string;
  source: string | null | undefined;
  medium: string | null | undefined;
  sourceType?: string | null;
  landingPage: string | null | undefined;
}) {
  const primary = formatHumanSourceMedium(source, medium, sourceType);
  const landing = text(landingPage);
  if (!primary && !landing) return null;

  return (
    <div className="grid grid-cols-[minmax(7rem,9rem)_1fr] gap-x-3 gap-y-0.5 text-sm">
      <dt className="pt-0.5 text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="min-w-0">
        {primary ? (
          <p className="font-medium text-stone-800 dark:text-stone-100">{primary}</p>
        ) : null}
        {landing ? (
          <p className="mt-0.5 text-stone-600 dark:text-stone-300">
            <span className="text-stone-500 dark:text-stone-400">Landing page:</span> {landing}
          </p>
        ) : null}
        <p className="mt-1 text-xs leading-snug text-stone-400 dark:text-stone-500">{hint}</p>
      </dd>
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

  const origin = humanizeOrigin(attribution.referringDomain, attribution.sourceType);

  const sourceMedium =
    formatHumanSourceMedium(
      attribution.lastSource ?? attribution.utmSource,
      attribution.lastMedium ?? attribution.utmMedium,
      attribution.sourceType
    ) ??
    formatHumanSourceMedium(attribution.utmSource, attribution.utmMedium, attribution.sourceType);

  const campaign =
    text(attribution.lastCampaign) ?? text(attribution.utmCampaign) ?? text(attribution.firstCampaign);

  const landing =
    text(attribution.landingPath) ??
    text(attribution.lastLandingPage) ??
    text(attribution.firstLandingPage);

  const rawFirst = formatRawSourceMedium(attribution.firstSource, attribution.firstMedium);
  const rawLast = formatRawSourceMedium(attribution.lastSource, attribution.lastMedium);
  const rawUtm =
    text(attribution.utmSource) || text(attribution.utmMedium)
      ? `${text(attribution.utmSource) ?? "—"} / ${text(attribution.utmMedium) ?? "—"}`
      : null;

  const hasTech = Boolean(
    rawFirst ||
      rawLast ||
      rawUtm ||
      text(attribution.gclid) ||
      text(attribution.fbclid) ||
      text(attribution.lastReferrer) ||
      text(attribution.firstReferrer) ||
      text(attribution.utmContent) ||
      text(attribution.utmTerm) ||
      text(attribution.referringDomain) ||
      text(attribution.firstLandingPage) ||
      text(attribution.lastLandingPage)
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
        <TouchBlock
          label="First touch"
          hint="How the customer originally discovered Sarveda."
          source={attribution.firstSource}
          medium={attribution.firstMedium}
          sourceType={
            isDirectTouch(attribution.firstSource, attribution.firstMedium) ? "Direct" : null
          }
          landingPage={attribution.firstLandingPage}
        />
        <TouchBlock
          label="Last touch"
          hint="The customer's most recent source before this order."
          source={attribution.lastSource}
          medium={attribution.lastMedium}
          sourceType={attribution.sourceType}
          landingPage={attribution.lastLandingPage}
        />
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
              <Row label="Raw first source / medium" value={rawFirst} />
              <Row label="Raw last source / medium" value={rawLast} />
              <Row label="Raw UTM source / medium" value={rawUtm} />
              <Row label="Referring domain" value={attribution.referringDomain} />
              <Row label="First landing (raw)" value={attribution.firstLandingPage} />
              <Row label="Last landing (raw)" value={attribution.lastLandingPage} />
              <Row label="gclid" value={attribution.gclid} />
              <Row label="fbclid" value={attribution.fbclid} />
              <Row label="utm_campaign" value={attribution.utmCampaign} />
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

/** Presentation helpers exported for light verification. */
export const attributionPresentation = {
  formatHumanSourceMedium,
  humanizeSourceName,
  humanizeMediumLabel,
  isDirectTouch
};
