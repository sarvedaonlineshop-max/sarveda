/**
 * Sanitize / truncate attribution fields before DB persist.
 * Never fail checkout — return null to skip attribution entirely.
 */

import {
  classifySourceType,
  deriveSourceMedium,
  extractReferringDomain,
  type AttributionSourceType
} from "./source-classifier";
import { classifyDeviceFromUserAgent, type DeviceType } from "./device";

const MAX_SHORT = 200;
const MAX_URL = 2048;
const MAX_CLICK_ID = 256;
const APPROVED_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid"
]);

const BLOCKED_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "code",
  "auth",
  "password",
  "reset",
  "session",
  "sid",
  "key",
  "secret",
  "signature",
  "payment_intent",
  "client_secret",
  "razorpay_payment_id",
  "razorpay_signature"
]);

export type AttributionClientPayload = Record<string, unknown>;

export type SanitizedAttribution = {
  sourceType: AttributionSourceType;
  firstSource: string | null;
  firstMedium: string | null;
  firstCampaign: string | null;
  firstReferrer: string | null;
  firstLandingPage: string | null;
  lastSource: string | null;
  lastMedium: string | null;
  lastCampaign: string | null;
  lastReferrer: string | null;
  lastLandingPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  referringDomain: string | null;
  landingPath: string | null;
  deviceType: DeviceType;
  sessionPageViews: number | null;
  sessionStartedAt: Date | null;
  capturedAt: Date;
};

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") {
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return null;
  }
  return v;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
}

function truncate(s: string | null, max: number): string | null {
  if (s == null) return null;
  const t = stripHtml(s).trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function sanitizeShort(v: unknown): string | null {
  return truncate(asString(v), MAX_SHORT);
}

function sanitizeClickId(v: unknown): string | null {
  const s = truncate(asString(v), MAX_CLICK_ID);
  if (!s) return null;
  // Click ids are typically alphanumeric / URL-safe
  if (!/^[A-Za-z0-9_\-.=]+$/.test(s)) {
    return truncate(s.replace(/[^A-Za-z0-9_\-.=]/g, ""), MAX_CLICK_ID);
  }
  return s;
}

/** Pathname + approved attribution query params only. */
export function sanitizeLandingUrl(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  try {
    const base = s.startsWith("http") ? s : `https://sarveda.local${s.startsWith("/") ? s : `/${s}`}`;
    const u = new URL(base);
    const path = u.pathname || "/";
    const kept = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      const k = key.toLowerCase();
      if (BLOCKED_QUERY_KEYS.has(k)) return;
      if (APPROVED_QUERY_KEYS.has(k) && value) {
        kept.set(k, value.slice(0, MAX_SHORT));
      }
    });
    const q = kept.toString();
    return truncate(q ? `${path}?${q}` : path, MAX_URL);
  } catch {
    // Fallback: strip to pathname-like segment
    const pathOnly = s.split("?")[0]?.split("#")[0] ?? "";
    if (pathOnly.startsWith("/")) return truncate(pathOnly, MAX_URL);
    return truncate(pathOnly.slice(0, MAX_URL), MAX_URL);
  }
}

export function sanitizeReferrer(raw: unknown): string | null {
  const s = truncate(asString(raw), MAX_URL);
  if (!s) return null;
  try {
    const href = s.includes("://") ? s : `https://${s}`;
    const u = new URL(href);
    // Host + path only — drop query/hash (may contain tokens)
    return truncate(`${u.origin}${u.pathname}`, MAX_URL);
  } catch {
    return s;
  }
}

function parseDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function parsePageViews(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.floor(n), 100_000);
}

/**
 * Soft-parse client attribution. Returns null if unusable — caller continues checkout.
 */
export function sanitizeAttributionPayload(
  raw: unknown,
  opts?: { userAgent?: string | null }
): SanitizedAttribution | null {
  try {
    if (raw == null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    const p = raw as AttributionClientPayload;

    const utmSource = sanitizeShort(p.utmSource);
    const utmMedium = sanitizeShort(p.utmMedium);
    const utmCampaign = sanitizeShort(p.utmCampaign);
    const utmContent = sanitizeShort(p.utmContent);
    const utmTerm = sanitizeShort(p.utmTerm);
    const gclid = sanitizeClickId(p.gclid);
    const fbclid = sanitizeClickId(p.fbclid);

    const firstReferrer = sanitizeReferrer(p.firstReferrer);
    const lastReferrer = sanitizeReferrer(p.lastReferrer);
    const firstLandingPage = sanitizeLandingUrl(p.firstLandingPage);
    const lastLandingPage = sanitizeLandingUrl(p.lastLandingPage);

    let referringDomain = sanitizeShort(p.referringDomain);
    if (!referringDomain) {
      referringDomain = extractReferringDomain(lastReferrer) ?? extractReferringDomain(firstReferrer);
    }

    let landingPath = sanitizeShort(p.landingPath);
    if (!landingPath && lastLandingPage) {
      landingPath = lastLandingPage.split("?")[0] ?? lastLandingPage;
    }
    if (!landingPath && firstLandingPage) {
      landingPath = firstLandingPage.split("?")[0] ?? firstLandingPage;
    }

    const classifyBase = {
      utmSource,
      utmMedium,
      utmCampaign,
      gclid,
      fbclid,
      referrer: lastReferrer ?? firstReferrer,
      referringDomain
    };

    const sourceType = classifySourceType(classifyBase);
    const derivedLast = deriveSourceMedium(classifyBase);

    const firstSource =
      sanitizeShort(p.firstSource) ??
      deriveSourceMedium({
        utmSource: sanitizeShort(p.firstUtmSource) ?? utmSource,
        utmMedium: sanitizeShort(p.firstUtmMedium) ?? utmMedium,
        utmCampaign: sanitizeShort(p.firstCampaign) ?? utmCampaign,
        gclid,
        fbclid,
        referrer: firstReferrer,
        referringDomain: extractReferringDomain(firstReferrer)
      }).source;
    const firstMedium =
      sanitizeShort(p.firstMedium) ??
      deriveSourceMedium({
        referrer: firstReferrer,
        referringDomain: extractReferringDomain(firstReferrer),
        utmSource: sanitizeShort(p.firstUtmSource),
        utmMedium: sanitizeShort(p.firstUtmMedium)
      }).medium;

    const lastSource = sanitizeShort(p.lastSource) ?? derivedLast.source;
    const lastMedium = sanitizeShort(p.lastMedium) ?? derivedLast.medium;
    const firstCampaign = sanitizeShort(p.firstCampaign);
    const lastCampaign = sanitizeShort(p.lastCampaign) ?? utmCampaign;

    const deviceType = classifyDeviceFromUserAgent(opts?.userAgent);

    const sessionPageViews = parsePageViews(p.sessionPageViews);
    const sessionStartedAt = parseDate(p.sessionStartedAt);
    const capturedAt = parseDate(p.capturedAt) ?? new Date();

    return {
      sourceType,
      firstSource,
      firstMedium,
      firstCampaign,
      firstReferrer,
      firstLandingPage,
      lastSource,
      lastMedium,
      lastCampaign,
      lastReferrer,
      lastLandingPage,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      gclid,
      fbclid,
      referringDomain,
      landingPath,
      deviceType,
      sessionPageViews,
      sessionStartedAt,
      capturedAt
    };
  } catch {
    return null;
  }
}
