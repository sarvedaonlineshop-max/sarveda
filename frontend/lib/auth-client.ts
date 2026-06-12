import { getApiBase } from "@/lib/api";
import { mergeGuestCartSession, setAccountCartOnly } from "@/lib/cart-api";
import { syncPricingZoneFromGeo } from "@/lib/pricing-zone";
import { parseApiResponse } from "@/lib/parse-api-response";

export type PublicUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  phone: string | null;
};

export class AuthError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export type RegisterInput = {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
};

export async function registerAccount(input: RegisterInput): Promise<PublicUser> {
  const res = await fetch(`${getApiBase()}/api/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      confirmPassword: input.confirmPassword,
      name: input.name.trim()
    })
  });
  const json = (await res.json()) as
    | { success: true; data: { user: PublicUser } }
    | { success: false; error?: string };
  if (!res.ok || !json.success || !("data" in json)) {
    throw new Error("error" in json ? String(json.error) : `Sign up failed (${res.status})`);
  }
  return json.data.user;
}

export function googleSignInUrl(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : "/";
  return `${getApiBase()}/api/auth/google?next=${encodeURIComponent(next)}`;
}

/**
 * Where to send the user after a successful credential login or sign-up.
 * - Admins → `/admin` (or a deeper `/admin/...` if `next` is under `/admin`).
 * - Customers → `next` when safe, otherwise home (`/`).
 * - Customers must not land on `/admin` (throws).
 */
export function resolvePostLoginPath(
  user: PublicUser,
  next: string | null,
  options?: { adminOnly?: boolean }
): string {
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  if (isAdminRole(user.role)) {
    if (target?.startsWith("/admin")) return target;
    return "/admin";
  }

  if (options?.adminOnly || target?.startsWith("/admin")) {
    throw new Error("This account does not have admin access.");
  }

  if (target) return target;
  return "/";
}

async function completeAuthSession(user: PublicUser): Promise<PublicUser> {
  await mergeGuestCartSession();
  await syncPricingZoneFromGeo();
  notifyAuthChanged(user);
  return user;
}

export async function sendLoginOtp(target: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/auth/send-otp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ target: target.trim().toLowerCase() })
  });
  const json = await parseApiResponse<unknown>(res);
  if (!res.ok || !json.success) {
    throw new Error("error" in json ? json.error : `Failed to send OTP (${res.status})`);
  }
}

export async function verifyLoginOtp(target: string, code: string): Promise<PublicUser> {
  const res = await fetch(`${getApiBase()}/api/auth/verify-otp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      target: target.trim().toLowerCase(),
      code: code.trim()
    })
  });
  const json = await parseApiResponse<{ user: PublicUser }>(res);
  if (!res.ok || !json.success || !("data" in json)) {
    throw new Error("error" in json ? json.error : `OTP verification failed (${res.status})`);
  }
  return completeAuthSession(json.data.user);
}

export async function loginWithPassword(
  email: string,
  password: string
): Promise<PublicUser> {
  const res = await fetch(`${getApiBase()}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password })
  });
  const json = (await res.json()) as
    | { success: true; data: { user: PublicUser } }
    | { success: false; error?: string; code?: string };
  if (!res.ok || !json.success || !("data" in json)) {
    throw new AuthError(
      "error" in json ? String(json.error) : `Login failed (${res.status})`,
      "code" in json ? json.code : undefined
    );
  }
  return completeAuthSession(json.data.user);
}

export async function logoutSession(): Promise<void> {
  await fetch(`${getApiBase()}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  setAccountCartOnly(false);
  notifyAuthChanged(null);
}

export function notifyAuthChanged(user: PublicUser | null): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sarveda-auth-changed", { detail: user }));
  }
}

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export function isAdminRole(role: string | undefined | null): boolean {
  if (typeof role !== "string") return false;
  const normalized = role.trim().toUpperCase();
  return ADMIN_ROLES.has(normalized);
}

export type UpdateProfileInput = {
  name: string;
  phone?: string | null;
};

export async function updateProfile(input: UpdateProfileInput): Promise<PublicUser> {
  const res = await fetch(`${getApiBase()}/api/auth/me`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: input.name.trim(),
      phone: input.phone?.trim() ? input.phone.trim() : null
    })
  });
  const json = (await res.json()) as
    | { success: true; data: { user: PublicUser } }
    | { success: false; error?: string };
  if (!res.ok || !json.success || !("data" in json)) {
    throw new Error("error" in json ? String(json.error) : `Profile update failed (${res.status})`);
  }
  return json.data.user;
}

/** Current session user, or null if not logged in. */
export async function fetchMe(): Promise<PublicUser | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/me`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: { user: PublicUser } };
    if (!json.success || !json.data?.user) return null;
    return json.data.user;
  } catch {
    return null;
  }
}
