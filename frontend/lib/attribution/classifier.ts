import type { AttributionSourceType } from "./types";

export type ClassifyInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  referringDomain?: string | null;
};

const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid_search",
  "paid-social",
  "paidsocial",
  "paid_social",
  "display",
  "retargeting",
  "cpm",
  "cpa"
]);

const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "l.facebook.com",
  "twitter.com",
  "x.com",
  "t.co",
  "linkedin.com",
  "lnkd.in",
  "pinterest.com",
  "pin.it",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "whatsapp.com",
  "wa.me",
  "threads.net"
];

const SEARCH_HOSTS = [
  "google.",
  "bing.com",
  "yahoo.com",
  "duckduckgo.com",
  "baidu.com",
  "yandex.",
  "ecosia.org",
  "search.brave.com"
];

const SOCIAL_UTM_SOURCES = new Set([
  "facebook",
  "fb",
  "instagram",
  "ig",
  "meta",
  "twitter",
  "x",
  "linkedin",
  "pinterest",
  "tiktok",
  "youtube",
  "reddit",
  "whatsapp",
  "threads"
]);

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export function extractReferringDomain(referrer: string | null | undefined): string | null {
  const raw = (referrer ?? "").trim();
  if (!raw) return null;
  try {
    const href = raw.includes("://") ? raw : `https://${raw}`;
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function hostMatches(domain: string, needles: string[]): boolean {
  const d = domain.toLowerCase();
  return needles.some((n) =>
    n.endsWith(".") ? d.includes(n) || d.endsWith(n.slice(0, -1)) : d === n || d.endsWith(`.${n}`)
  );
}

function isPaidMedium(medium: string): boolean {
  return PAID_MEDIUMS.has(medium) || medium.includes("paid");
}

function isSocialSourceOrHost(source: string, domain: string | null): boolean {
  if (source && SOCIAL_UTM_SOURCES.has(source)) return true;
  if (domain && hostMatches(domain, SOCIAL_HOSTS)) return true;
  return false;
}

function isSearchHost(domain: string | null): boolean {
  if (!domain) return false;
  return SEARCH_HOSTS.some((n) => domain.includes(n.replace(/\.$/, "")) || domain.startsWith(n));
}

export function classifySourceType(input: ClassifyInput): AttributionSourceType {
  const utmSource = norm(input.utmSource);
  const utmMedium = norm(input.utmMedium);
  const gclid = (input.gclid ?? "").trim();
  const fbclid = (input.fbclid ?? "").trim();
  const domain =
    extractReferringDomain(input.referringDomain) ??
    extractReferringDomain(input.referrer) ??
    null;

  if (
    gclid ||
    (utmSource.includes("google") && isPaidMedium(utmMedium)) ||
    utmMedium === "cpc" ||
    utmMedium === "ppc"
  ) {
    if (isSocialSourceOrHost(utmSource, domain) || fbclid) {
      return "Paid Social";
    }
    return "Paid Search";
  }
  if (fbclid || (isSocialSourceOrHost(utmSource, domain) && isPaidMedium(utmMedium))) {
    return "Paid Social";
  }
  if (isPaidMedium(utmMedium)) {
    if (isSocialSourceOrHost(utmSource, domain)) return "Paid Social";
    if (utmSource.includes("google") || utmSource.includes("bing") || utmSource.includes("yahoo")) {
      return "Paid Search";
    }
    return "Other";
  }

  if (utmMedium === "email" || utmMedium === "e-mail" || utmSource === "email" || utmSource === "newsletter") {
    return "Email";
  }

  if (isSocialSourceOrHost(utmSource, domain)) {
    return "Social";
  }

  if (isSearchHost(domain) && !isPaidMedium(utmMedium)) {
    return "Organic Search";
  }

  if (domain) {
    return "Referral";
  }

  if (!utmSource && !utmMedium && !(input.utmCampaign ?? "").trim() && !gclid && !fbclid) {
    return "Direct";
  }

  return "Other";
}

export function deriveSourceMedium(input: ClassifyInput): { source: string; medium: string } {
  const type = classifySourceType(input);
  const utmSource = (input.utmSource ?? "").trim();
  const utmMedium = (input.utmMedium ?? "").trim();
  if (utmSource || utmMedium) {
    return {
      source: utmSource || "(not set)",
      medium: utmMedium || "(not set)"
    };
  }
  const domain =
    extractReferringDomain(input.referringDomain) ??
    extractReferringDomain(input.referrer) ??
    null;

  switch (type) {
    case "Direct":
      return { source: "(direct)", medium: "(none)" };
    case "Organic Search":
      return { source: domain ?? "organic", medium: "organic" };
    case "Referral":
      return { source: domain ?? "referral", medium: "referral" };
    case "Social":
      return { source: domain ?? "social", medium: "social" };
    case "Paid Search":
      return { source: utmSource || "google", medium: utmMedium || "cpc" };
    case "Paid Social":
      return { source: utmSource || domain || "facebook", medium: utmMedium || "paid" };
    case "Email":
      return { source: utmSource || "email", medium: "email" };
    default:
      return { source: utmSource || domain || "(other)", medium: utmMedium || "(other)" };
  }
}

const INTERNAL_HOST_SUFFIXES = [
  "sarveda.com",
  "sarveda-demo.xyz",
  "localhost",
  "127.0.0.1"
];

export function isInternalHost(hostname: string | null | undefined): boolean {
  const h = (hostname ?? "").toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  if (h.endsWith(".vercel.app")) return true;
  return INTERNAL_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

export function isInternalReferrer(referrer: string | null | undefined): boolean {
  const domain = extractReferringDomain(referrer);
  return domain ? isInternalHost(domain) : false;
}
