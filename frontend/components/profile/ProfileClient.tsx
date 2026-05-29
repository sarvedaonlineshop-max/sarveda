"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { YourOrders } from "@/components/profile/YourOrders";
import type { PublicUser } from "@/lib/auth-client";
import { fetchMe, isAdminRole, logoutSession, updateProfile } from "@/lib/auth-client";

export function ProfileClient() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((session) => {
      if (!cancelled) {
        setUser(session);
        setName(session?.name?.trim() ?? "");
        setPhone(session?.phone?.trim() ?? "");
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await updateProfile({
        name,
        phone: phone.trim() ? phone.trim() : null
      });
      setUser(updated);
      setName(updated.name?.trim() ?? "");
      setPhone(updated.phone?.trim() ?? "");
      setMessage("Profile updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-10 text-center text-brand-muted md:px-0" role="status">
        Loading your profile…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 md:px-0">
        <div className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-6 text-center shadow-sm">
          <p className="text-xl font-semibold text-brand-ink">Sign in to view your account</p>
          <p className="mt-2 text-sm text-brand-muted">
            Orders, saved details, and checkout preferences appear here after you sign in.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login?next=/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet-deep px-6 text-sm font-semibold text-brand-gold"
            >
              Sign in
            </Link>
            <Link
              href="/signup?next=/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[rgba(196,176,232,0.35)] px-6 text-sm font-semibold text-brand-ink"
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
      <section className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-6 shadow-sm">
        <p className="text-sm text-brand-muted">Hello,</p>
        <h2 className="display-text text-2xl font-semibold text-brand-ink">{displayName}</h2>
        <p className="mt-1 text-sm text-brand-muted">{user.email}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[rgba(196,176,232,0.35)] px-5 text-sm font-semibold text-brand-ink"
          >
            Sign out
          </button>
          {isAdminRole(user.role) ? (
            <Link
              href="/admin"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-violet-light0 px-5 text-sm font-semibold text-brand-ink"
            >
              Admin panel
            </Link>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="display-text text-lg font-semibold text-brand-ink">Your orders</h3>
        </div>
        <YourOrders email={user.email} />
      </section>

      <section className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white p-6 shadow-sm">
        <h3 className="display-text text-sm font-semibold uppercase tracking-[0.18em] text-brand-muted">Your details</h3>
        <form onSubmit={(event) => void handleSave(event)} className="mt-4 space-y-4">
          <div>
            <label htmlFor="profile-name" className="mb-2 block text-sm font-medium text-brand-mid">
              Name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-[rgba(196,176,232,0.25)] px-4 text-sm text-brand-ink focus:border-brand-lavender-mid focus:outline-none focus:ring-2 focus:ring-brand-lavender-mid/30"
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-brand-mid">
              Email
            </label>
            <input
              id="profile-email"
              value={user.email}
              readOnly
              className="min-h-[48px] w-full rounded-xl border border-[rgba(196,176,232,0.25)] bg-brand-bg px-4 text-sm text-brand-muted"
            />
          </div>
          <div>
            <label htmlFor="profile-phone" className="mb-2 block text-sm font-medium text-brand-mid">
              Phone
            </label>
            <input
              id="profile-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              className="min-h-[48px] w-full rounded-xl border border-[rgba(196,176,232,0.25)] px-4 text-sm text-brand-ink focus:border-brand-lavender-mid focus:outline-none focus:ring-2 focus:ring-brand-lavender-mid/30"
              autoComplete="tel"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-brand-sage">{message}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet-deep px-6 text-sm font-semibold text-brand-gold disabled:cursor-not-allowed disabled:bg-brand-violet-light disabled:text-brand-muted"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>
    </div>
  );
}
