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

/** After Google OAuth: admins default to /admin; customers default to /my-account. */
export function postOAuthFrontendPath(role: string, rawNext: string | undefined): string {
  const nextPath =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const normalizedRole = role.trim().toUpperCase();
  if (ADMIN_ROLES.has(normalizedRole)) {
    return nextPath?.startsWith("/admin") ? nextPath : "/admin";
  }
  if (nextPath?.startsWith("/admin")) {
    return "/my-account";
  }
  return nextPath ?? "/my-account";
}
