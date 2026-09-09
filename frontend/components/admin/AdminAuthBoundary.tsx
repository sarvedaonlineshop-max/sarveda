"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminUserProvider } from "@/components/admin/AdminUserContext";
import { fetchMe, isAdminRole, type PublicUser } from "@/lib/auth-client";

type Props = {
  children: React.ReactNode;
};

async function fetchMeWithRetry(attempts = 3): Promise<PublicUser | null> {
  for (let i = 0; i < attempts; i++) {
    const me = await fetchMe();
    if (me) return me;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }
  return null;
}

/**
 * Client guard for /admin (middleware is primary). Handles stale sessions after DB role changes.
 * Retries /me briefly after Google OAuth so a just-set cookie is visible before reauth.
 */
export function AdminAuthBoundary({ children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMeWithRetry().then((me) => {
      if (cancelled) return;
      if (!me) {
        router.replace(`/login?next=${encodeURIComponent("/admin")}&reason=reauth`);
        return;
      }
      if (!isAdminRole(me.role)) {
        router.replace("/");
        return;
      }
      setUser(me);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-2 bg-stone-950 px-4 text-center text-stone-400"
        role="status"
        aria-live="polite"
      >
        <span className="text-sm font-medium text-stone-300">Checking admin access…</span>
        <span className="text-xs text-stone-500">One moment</span>
      </div>
    );
  }

  return <AdminUserProvider user={user}>{children}</AdminUserProvider>;
}
