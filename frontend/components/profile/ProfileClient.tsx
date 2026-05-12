"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PublicUser } from "@/lib/auth-client";
import { fetchMe, isAdminRole, logoutSession } from "@/lib/auth-client";

export function ProfileClient() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((session) => {
      if (!cancelled) {
        setUser(session);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await logoutSession();
    setUser(null);
    router.replace("/login?next=/profile");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="px-4 py-10 text-center text-stone-500 md:px-0" role="status">
        Loading your profile…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 md:px-0">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <p className="font-serif text-xl font-semibold text-stone-900">Sign in to view your profile</p>
          <p className="mt-2 text-sm text-stone-500">
            Orders, saved details, and checkout preferences appear here after you sign in.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login?next=/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-stone-900 px-6 text-sm font-semibold text-amber-400"
            >
              Sign in
            </Link>
            <Link
              href="/signup?next=/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-stone-300 px-6 text-sm font-semibold text-stone-800"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayName = user.name?.trim() || user.email.split("@")[0] || "Customer";

  return (
    <div className="space-y-6 px-4 md:px-0">
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-stone-500">Hello,</p>
        <h2 className="font-serif text-2xl font-semibold text-stone-900">{displayName}</h2>
        <p className="mt-1 text-sm text-stone-500">{user.email}</p>
        {user.phone ? <p className="mt-1 text-sm text-stone-500">{user.phone}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-300 px-5 text-sm font-semibold text-stone-800"
          >
            Sign out
          </button>
          {isAdminRole(user.role) ? (
            <Link
              href="/admin"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-semibold text-stone-900"
            >
              Admin panel
            </Link>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Your Sarveda account</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-stone-500">Name</dt>
            <dd className="font-medium text-stone-900">{user.name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-stone-500">Email</dt>
            <dd className="font-medium text-stone-900">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-stone-100 pb-3">
            <dt className="text-stone-500">Phone</dt>
            <dd className="font-medium text-stone-900">{user.phone || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Role</dt>
            <dd className="font-medium text-stone-900">{user.role}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-5 text-sm text-stone-600">
        Order history and saved addresses will appear here as your account area expands.
      </section>
    </div>
  );
}
