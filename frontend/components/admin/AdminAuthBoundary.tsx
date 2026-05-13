"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchMe, isAdminRole } from "@/lib/auth-client";

type Props = {
  children: React.ReactNode;
};

/**
 * Client guard for /admin (middleware is primary). Handles stale sessions after DB role changes.
 */
export function AdminAuthBoundary({ children }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((user) => {
      if (cancelled) return;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent("/admin")}&reason=reauth`);
        return;
      }
      if (!isAdminRole(user.role)) {
        router.replace("/");
        return;
      }
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

  return <>{children}</>;
}
