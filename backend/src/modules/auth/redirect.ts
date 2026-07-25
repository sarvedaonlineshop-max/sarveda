import { getCorsOrigins } from "../../config/corsOrigins";

export const OAUTH_NEXT_COOKIE = "sarveda_oauth_next";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export function getPrimaryFrontendBase(): string {
  return getCorsOrigins()[0] ?? "http://localhost:3000";
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
