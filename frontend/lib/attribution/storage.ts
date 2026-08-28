import {
  ATTR_FIRST_COOKIE,
  ATTR_FIRST_TTL_DAYS,
  ATTR_SESSION_KEY,
  type AttributionSessionState,
  type AttributionTouch
} from "./types";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readFirstTouchCookie(): AttributionTouch | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ATTR_FIRST_COOKIE}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return safeParse<AttributionTouch>(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function writeFirstTouchCookie(touch: AttributionTouch): void {
  if (typeof document === "undefined") return;
  const maxAge = ATTR_FIRST_TTL_DAYS * 24 * 60 * 60;
  const value = encodeURIComponent(JSON.stringify(touch));
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTR_FIRST_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function readSessionState(): AttributionSessionState | null {
  if (typeof sessionStorage === "undefined") return null;
  return safeParse<AttributionSessionState>(sessionStorage.getItem(ATTR_SESSION_KEY));
}

export function writeSessionState(state: AttributionSessionState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ATTR_SESSION_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode — ignore
  }
}
