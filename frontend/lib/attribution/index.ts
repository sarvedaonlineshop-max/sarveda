import {
  classifySourceType,
  deriveSourceMedium,
  extractReferringDomain,
  isInternalHost,
  isInternalReferrer
} from "./classifier";
import { readFirstTouchCookie, readSessionState, writeFirstTouchCookie, writeSessionState } from "./storage";
import { ATTR_SESSION_IDLE_MS, type AttributionCheckoutPayload, type AttributionTouch } from "./types";

const APPROVED_QUERY = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid"
]);

const BLOCKED_QUERY = new Set([
  "token",
  "access_token",
  "refresh_token",
  "code",
  "password",
  "reset",
  "session",
  "secret",
  "signature",
  "client_secret"
]);

function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function sanitizeLandingFromLocation(pathname: string, search: string): string {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : search ? `?${search}` : "");
    const kept = new URLSearchParams();
    params.forEach((value, key) => {
      const k = key.toLowerCase();
      if (BLOCKED_QUERY.has(k)) return;
      if (APPROVED_QUERY.has(k) && value) kept.set(k, value.slice(0, 200));
    });
    const q = kept.toString();
    const path = pathname || "/";
    return truncate(q ? `${path}?${q}` : path, 2048) ?? path;
  } catch {
    return pathname || "/";
  }
}

export function sanitizeReferrerUrl(raw: string | null | undefined): string | null {
  const s = truncate(raw, 2048);
  if (!s) return null;
  try {
    const href = s.includes("://") ? s : `https://${s}`;
    const u = new URL(href);
    return truncate(`${u.origin}${u.pathname}`, 2048);
  } catch {
    return s;
  }
}

function readUtmAndClicks(search: string): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search : search ? `?${search}` : "");
  const get = (k: string) => truncate(params.get(k), 200);
  return {
    utmSource: get("utm_source"),
    utmMedium: get("utm_medium"),
    utmCampaign: get("utm_campaign"),
    utmContent: get("utm_content"),
    utmTerm: get("utm_term"),
    gclid: get("gclid"),
    fbclid: get("fbclid")
  };
}

function hasMeaningfulCampaignMarkers(utm: ReturnType<typeof readUtmAndClicks>): boolean {
  return Boolean(
    utm.utmSource ||
      utm.utmMedium ||
      utm.utmCampaign ||
      utm.utmContent ||
      utm.utmTerm ||
      utm.gclid ||
      utm.fbclid
  );
}

function buildTouch(opts: {
  referrer: string | null;
  landingPage: string;
  utm: ReturnType<typeof readUtmAndClicks>;
}): AttributionTouch {
  const referrer = sanitizeReferrerUrl(opts.referrer);
  const referringDomain = extractReferringDomain(referrer);
  const classifyInput = {
    ...opts.utm,
    referrer,
    referringDomain
  };
  const sourceType = classifySourceType(classifyInput);
  const { source, medium } = deriveSourceMedium(classifyInput);
  return {
    source,
    medium,
    campaign: opts.utm.utmCampaign,
    referrer,
    landingPage: opts.landingPage,
    utmSource: opts.utm.utmSource,
    utmMedium: opts.utm.utmMedium,
    utmCampaign: opts.utm.utmCampaign,
    utmContent: opts.utm.utmContent,
    utmTerm: opts.utm.utmTerm,
    gclid: opts.utm.gclid,
    fbclid: opts.utm.fbclid,
    referringDomain,
    sourceType,
    capturedAt: new Date().toISOString()
  };
}

/** True when this hit should update last-touch (and possibly seed first-touch). */
export function shouldUpdateLastTouch(opts: {
  documentReferrer: string;
  search: string;
}): boolean {
  const utm = readUtmAndClicks(opts.search);
  if (hasMeaningfulCampaignMarkers(utm)) return true;

  const ref = (opts.documentReferrer ?? "").trim();
  if (!ref) return false;
  if (isInternalReferrer(ref)) return false;
  const domain = extractReferringDomain(ref);
  if (!domain || isInternalHost(domain)) return false;
  return true;
}

export function isAttributionTrackedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/complaints")) return false;
  return true;
}

/**
 * Capture / refresh attribution for a storefront landing or navigation.
 * First touch is never overwritten by internal navigation.
 * Last touch updates only on external referrer / UTM / click id.
 */
export function captureAttributionOnLanding(opts: {
  pathname: string;
  search: string;
  documentReferrer: string;
}): void {
  if (typeof window === "undefined") return;
  if (!isAttributionTrackedPath(opts.pathname)) return;

  const landingPage = sanitizeLandingFromLocation(opts.pathname, opts.search);
  const utm = readUtmAndClicks(opts.search);
  const now = new Date().toISOString();
  const updateLast = shouldUpdateLastTouch({
    documentReferrer: opts.documentReferrer,
    search: opts.search
  });

  const existingFirst = readFirstTouchCookie();
  if (!existingFirst) {
    const firstTouch = buildTouch({
      referrer: opts.documentReferrer || null,
      landingPage,
      utm
    });
    writeFirstTouchCookie(firstTouch);
  }

  let session = readSessionState();
  const idleExpired =
    session != null &&
    Date.now() - new Date(session.lastActivityAt).getTime() > ATTR_SESSION_IDLE_MS;

  if (!session || idleExpired) {
    const seedTouch =
      updateLast
        ? buildTouch({
            referrer: opts.documentReferrer || null,
            landingPage,
            utm
          })
        : existingFirst ??
          buildTouch({
            referrer: opts.documentReferrer || null,
            landingPage,
            utm
          });
    session = {
      last: seedTouch,
      sessionStartedAt: now,
      sessionPageViews: 0,
      lastActivityAt: now
    };
  } else if (updateLast) {
    session = {
      ...session,
      last: buildTouch({
        referrer: opts.documentReferrer || null,
        landingPage,
        utm
      }),
      lastActivityAt: now
    };
  } else {
    session = { ...session, lastActivityAt: now };
  }

  writeSessionState(session);
}

/** Increment session page views for meaningful storefront navigations. */
export function recordAttributionPageView(pathname: string | null | undefined): void {
  if (!isAttributionTrackedPath(pathname)) return;
  if (typeof sessionStorage === "undefined" || typeof window === "undefined") return;

  const search = typeof window !== "undefined" ? window.location.search : "";
  const dedupeKey = `${pathname ?? ""}${search}`;
  const DEDUPE = "sarveda_attr_last_pv";
  try {
    if (sessionStorage.getItem(DEDUPE) === dedupeKey) return;
    sessionStorage.setItem(DEDUPE, dedupeKey);
  } catch {
    // continue without dedupe
  }

  const session = readSessionState();
  if (!session) return;
  const now = new Date().toISOString();
  const idleExpired = Date.now() - new Date(session.lastActivityAt).getTime() > ATTR_SESSION_IDLE_MS;
  if (idleExpired) {
    writeSessionState({
      ...session,
      sessionStartedAt: now,
      sessionPageViews: 1,
      lastActivityAt: now
    });
    return;
  }
  writeSessionState({
    ...session,
    sessionPageViews: session.sessionPageViews + 1,
    lastActivityAt: now
  });
}

export function getAttributionCheckoutPayload(): AttributionCheckoutPayload | null {
  try {
    const first = readFirstTouchCookie();
    const session = readSessionState();
    if (!first && !session) return null;
    const last = session?.last ?? first;
    if (!last) return null;
    const ft = first ?? last;
    const landingPath = (last.landingPage ?? ft.landingPage ?? "/").split("?")[0] ?? "/";
    return {
      sourceType: last.sourceType,
      firstSource: ft.source,
      firstMedium: ft.medium,
      firstCampaign: ft.campaign,
      firstReferrer: ft.referrer,
      firstLandingPage: ft.landingPage,
      lastSource: last.source,
      lastMedium: last.medium,
      lastCampaign: last.campaign,
      lastReferrer: last.referrer,
      lastLandingPage: last.landingPage,
      utmSource: last.utmSource ?? ft.utmSource,
      utmMedium: last.utmMedium ?? ft.utmMedium,
      utmCampaign: last.utmCampaign ?? ft.utmCampaign,
      utmContent: last.utmContent ?? ft.utmContent,
      utmTerm: last.utmTerm ?? ft.utmTerm,
      gclid: last.gclid ?? ft.gclid,
      fbclid: last.fbclid ?? ft.fbclid,
      referringDomain: last.referringDomain ?? ft.referringDomain,
      landingPath,
      sessionPageViews: session?.sessionPageViews ?? 1,
      sessionStartedAt: session?.sessionStartedAt ?? ft.capturedAt,
      capturedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
