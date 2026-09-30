"use client";

import { logoutSession } from "@/lib/auth-client";

export const LOGOUT_START_EVENT = "sarveda-logout-start";

/** Storefront sign-out: show overlay (if mounted), clear session, go to login. */
export async function signOutToLogin(): Promise<void> {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOGOUT_START_EVENT));
  }
  try {
    await logoutSession();
  } finally {
    window.location.assign("/login");
  }
}
