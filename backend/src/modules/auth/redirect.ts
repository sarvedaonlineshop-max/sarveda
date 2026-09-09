import type { Request } from "express";

import {
  getCorsOrigins,
  isAllowedCorsOrigin,
  isSarvedaVercelFrontendOrigin
} from "../../config/corsOrigins";

export const OAUTH_NEXT_COOKIE = "sarveda_oauth_next";
/** Origin the browser started Google OAuth from — must match where the auth cookie is usable. */
export const OAUTH_RETURN_ORIGIN_COOKIE = "sarveda_oauth_return";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

function isTrustedFrontendOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    return false;
  }
  if (isAllowedCorsOrigin(normalized, getCorsOrigins())) return true;
  return isSarvedaVercelFrontendOrigin(normalized);
}

export function getPrimaryFrontendBase(): string {
  return getCorsOrigins()[0] ?? "http://localhost:3000";
}

/**
 * Prefer the site the user started OAuth on (cookie / Referer / forwarded host)
 * so we never bounce them to a different FRONTEND_URL host without the auth cookie.
 */
export function resolveOAuthFrontendBase(req: Request): string {
  const fromCookie = req.cookies?.[OAUTH_RETURN_ORIGIN_COOKIE];
  if (typeof fromCookie === "string" && isTrustedFrontendOrigin(fromCookie)) {
    return normalizeOrigin(fromCookie);
  }

  const referer = req.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const origin = `${url.protocol}//${url.host}`;
      if (isTrustedFrontendOrigin(origin)) return normalizeOrigin(origin);
    } catch {
      /* ignore */
    }
  }

  const xfHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const xfProto = (req.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https").replace(
    /:$/,
    ""
  );
  if (xfHost) {
    const origin = `${xfProto}://${xfHost}`;
    if (isTrustedFrontendOrigin(origin)) return normalizeOrigin(origin);
  }

  return getPrimaryFrontendBase();
}

/** Capture return origin when starting Google OAuth (Referer or forwarded host). */
export function captureOAuthReturnOrigin(req: Request): string {
  const referer = req.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const origin = `${url.protocol}//${url.host}`;
      if (isTrustedFrontendOrigin(origin)) return normalizeOrigin(origin);
    } catch {
      /* ignore */
    }
  }

  const xfHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const xfProto = (req.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https").replace(
    /:$/,
    ""
  );
  if (xfHost) {
    const origin = `${xfProto}://${xfHost}`;
    if (isTrustedFrontendOrigin(origin)) return normalizeOrigin(origin);
  }

  return getPrimaryFrontendBase();
}

export function safeRelativeRedirect(next: string | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  return next;
}

/** After Google OAuth: admins always land on /admin (never storefront). Customers keep next or home. */
export function postOAuthFrontendPath(role: string, rawNext: string | undefined): string {
  const nextPath =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const normalizedRole = role.trim().toUpperCase();
  if (ADMIN_ROLES.has(normalizedRole)) {
    // Ignore storefront `next` (e.g. `/` or `/profile`) — admins belong in the admin app.
    return nextPath?.startsWith("/admin") ? nextPath : "/admin";
  }
  if (nextPath?.startsWith("/admin")) {
    return "/";
  }
  return nextPath ?? "/";
}
