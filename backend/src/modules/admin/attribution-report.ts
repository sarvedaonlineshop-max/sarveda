import { dateKeyKolkata, timeKeyKolkata } from "../../utils/reporting-time";

export type AttributionSnapshot = {
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
};

export type AttributionLineInput = {
  orderNumber: string;
  skuSnapshot: string;
  nameSnapshot: string;
  qtyOrdered: number;
  placedAt: Date;
  productName?: string | null;
  variantSku?: string | null;
  variantAttributes?: Array<{ name?: string | null; value?: string | null }>;
  attribution?: AttributionSnapshot | null;
};

export type AttributionReportRow = {
  orderNumber: string;
  productName: string;
  variant: string;
  sku: string;
  qty: number;
  date: string;
  time: string;
  origin: string;
  sourceType: string;
  sourceMedium: string;
  campaign: string;
  landingPage: string;
  device: string;
  sessionPageViews: string;
  firstTouch: string;
  firstLandingPage: string;
  lastTouch: string;
  lastLandingPage: string;
  referringDomain: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  gclid: string;
  fbclid: string;
  firstReferrer: string;
  lastReferrer: string;
};

export const ATTRIBUTION_REPORT_COLUMNS: Array<{ header: string; key: keyof AttributionReportRow; width?: number }> = [
  { header: "Order", key: "orderNumber", width: 18 },
  { header: "Product name", key: "productName", width: 36 },
  { header: "Variant", key: "variant", width: 28 },
  { header: "SKU", key: "sku", width: 18 },
  { header: "Qty", key: "qty", width: 8 },
  { header: "Date", key: "date", width: 12 },
  { header: "Time", key: "time", width: 12 },
  { header: "Origin", key: "origin", width: 22 },
  { header: "Source type", key: "sourceType", width: 16 },
  { header: "Source / Medium", key: "sourceMedium", width: 24 },
  { header: "Campaign", key: "campaign", width: 22 },
  { header: "Landing page", key: "landingPage", width: 32 },
  { header: "Device", key: "device", width: 12 },
  { header: "Session page views", key: "sessionPageViews", width: 16 },
  { header: "First touch", key: "firstTouch", width: 24 },
  { header: "First landing page", key: "firstLandingPage", width: 32 },
  { header: "Last touch", key: "lastTouch", width: 24 },
  { header: "Last landing page", key: "lastLandingPage", width: 32 },
  { header: "Referring domain", key: "referringDomain", width: 22 },
  { header: "utm_source", key: "utmSource", width: 16 },
  { header: "utm_medium", key: "utmMedium", width: 14 },
  { header: "utm_campaign", key: "utmCampaign", width: 20 },
  { header: "utm_content", key: "utmContent", width: 18 },
  { header: "utm_term", key: "utmTerm", width: 16 },
  { header: "gclid", key: "gclid", width: 22 },
  { header: "fbclid", key: "fbclid", width: 22 },
  { header: "First referrer", key: "firstReferrer", width: 36 },
  { header: "Last referrer", key: "lastReferrer", width: 36 }
];

function text(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function norm(v: string | null | undefined): string {
  return text(v).toLowerCase().replace(/^www\./, "");
}

function isPlaceholder(v: string | null | undefined): boolean {
  const n = norm(v);
  return !n || n === "(direct)" || n === "(none)" || n === "(not set)" || n === "(other)" || n === "—";
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

function formatSourceMedium(
  source: string | null | undefined,
  medium: string | null | undefined,
  sourceType?: string | null
): string {
  if (isDirectTouch(source, medium, sourceType)) return "Direct";
  const s = isPlaceholder(source) ? "" : text(source);
  const m = isPlaceholder(medium) ? "" : text(medium);
  if (s && m) return `${s} / ${m}`;
  if (s) return s;
  if (m) return m;
  return text(sourceType);
}

function humanizeOrigin(
  referringDomain: string | null | undefined,
  sourceType: string | null | undefined
): string {
  const st = text(sourceType);
  const domain = text(referringDomain);
  if (st === "Direct" && !domain) return "Direct";
  if (domain) return `Referral: ${domain.replace(/^www\./i, "")}`;
  return st;
}

function deviceLabel(v: string | null | undefined): string {
  const d = text(v);
  if (!d) return "";
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

export function formatVariantLabel(
  nameSnapshot: string,
  attributes?: Array<{ name?: string | null; value?: string | null }>
): string {
  const fromAttrs = (attributes ?? [])
    .map((row) => {
      const value = text(row.value);
      if (!value) return "";
      const name = text(row.name);
      return name ? `${name}: ${value}` : value;
    })
    .filter(Boolean)
    .join(" · ");
  if (fromAttrs) return fromAttrs;
  const match = nameSnapshot.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() ?? "";
}

export function formatProductName(nameSnapshot: string, productName?: string | null): string {
  const live = text(productName);
  if (live) return live;
  const match = nameSnapshot.match(/^(.*)\s+\([^)]+\)\s*$/);
  return match?.[1]?.trim() || text(nameSnapshot);
}

export function toAttributionReportRow(input: AttributionLineInput): AttributionReportRow {
  const attr = input.attribution ?? null;
  const placedAt = input.placedAt;
  const sourceMedium = attr
    ? formatSourceMedium(
        attr.lastSource ?? attr.utmSource,
        attr.lastMedium ?? attr.utmMedium,
        attr.sourceType
      ) || formatSourceMedium(attr.utmSource, attr.utmMedium, attr.sourceType)
    : "";
  const campaign = attr
    ? text(attr.lastCampaign) || text(attr.utmCampaign) || text(attr.firstCampaign)
    : "";
  const landing = attr
    ? text(attr.landingPath) || text(attr.lastLandingPage) || text(attr.firstLandingPage)
    : "";

  return {
    orderNumber: input.orderNumber,
    productName: formatProductName(input.nameSnapshot, input.productName),
    variant: formatVariantLabel(input.nameSnapshot, input.variantAttributes),
    sku: text(input.variantSku) || text(input.skuSnapshot),
    qty: input.qtyOrdered,
    date: dateKeyKolkata(placedAt),
    time: timeKeyKolkata(placedAt),
    origin: attr ? humanizeOrigin(attr.referringDomain, attr.sourceType) : "",
    sourceType: text(attr?.sourceType),
    sourceMedium,
    campaign,
    landingPage: landing,
    device: deviceLabel(attr?.deviceType),
    sessionPageViews:
      attr?.sessionPageViews != null && Number.isFinite(attr.sessionPageViews)
        ? String(attr.sessionPageViews)
        : "",
    firstTouch: attr ? formatSourceMedium(attr.firstSource, attr.firstMedium) : "",
    firstLandingPage: text(attr?.firstLandingPage),
    lastTouch: attr ? formatSourceMedium(attr.lastSource, attr.lastMedium, attr.sourceType) : "",
    lastLandingPage: text(attr?.lastLandingPage),
    referringDomain: text(attr?.referringDomain),
    utmSource: text(attr?.utmSource),
    utmMedium: text(attr?.utmMedium),
    utmCampaign: text(attr?.utmCampaign),
    utmContent: text(attr?.utmContent),
    utmTerm: text(attr?.utmTerm),
    gclid: text(attr?.gclid),
    fbclid: text(attr?.fbclid),
    firstReferrer: text(attr?.firstReferrer),
    lastReferrer: text(attr?.lastReferrer)
  };
}
