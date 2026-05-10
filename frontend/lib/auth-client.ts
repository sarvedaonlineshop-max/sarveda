import { getApiBase } from "@/lib/api";

export type PublicUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  phone: string | null;
};

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
    | { success: false; error?: string };
  if (!res.ok || !json.success || !("data" in json)) {
    throw new Error("error" in json ? String(json.error) : `Login failed (${res.status})`);
  }
  return json.data.user;
}

export async function logoutSession(): Promise<void> {
  await fetch(`${getApiBase()}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
}

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export function isAdminRole(role: string | undefined | null): boolean {
  return typeof role === "string" && ADMIN_ROLES.has(role);
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
