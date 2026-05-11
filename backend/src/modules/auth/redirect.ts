import { getCorsOrigins } from "../../config/corsOrigins";

export const OAUTH_NEXT_COOKIE = "sarveda_oauth_next";

export function getPrimaryFrontendBase(): string {
  return getCorsOrigins()[0] ?? "http://localhost:3000";
}

export function safeRelativeRedirect(next: string | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  return next;
}
