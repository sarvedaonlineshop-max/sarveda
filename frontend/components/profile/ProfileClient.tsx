"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { YourLearning } from "@/components/profile/YourLearning";
import { YourOrders } from "@/components/profile/YourOrders";
import type { PublicUser } from "@/lib/auth-client";
import { fetchMe, isAdminRole, logoutSession, updateProfile } from "@/lib/auth-client";

type TabKey = "details" | "orders" | "courses" | "events";

const tabIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

function TabIcon({ tab }: { tab: TabKey }) {
  if (tab === "details") {
    return (
      <svg {...tabIconProps}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (tab === "orders") {
    return (
      <svg {...tabIconProps}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <line x1="12" y1="22" x2="12" y2="12" />
      </svg>
    );
  }
  if (tab === "courses") {
    return (
      <svg {...tabIconProps}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  return (
    <svg {...tabIconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function TabButton({
  tab,
  label,
  count,
  active,
  onSelect
}: {
  tab: TabKey;
  label: string;
  count?: number | null;
  active: boolean;
  onSelect: (tab: TabKey) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`profile-tab-${tab}`}
      aria-selected={active}
      aria-controls={`profile-panel-${tab}`}
      onClick={() => onSelect(tab)}
      className={`inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[13px] font-semibold transition-colors sm:gap-2 sm:px-3 sm:text-sm ${
        active
          ? "bg-brand-forest text-brand-cream"
          : "border border-brand-cream-dark bg-white text-brand-ink hover:bg-brand-forest/5"
      }`}
      title={label}
    >
      <TabIcon tab={tab} />
      <span className="truncate">{label}</span>
      {typeof count === "number" ? (
        <span
          className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
            active ? "bg-[#FAC775] text-[#633806]" : "bg-brand-cream text-brand-muted"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function ProfileClient() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("details");
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [courseCount, setCourseCount] = useState<number | null>(null);
  const [eventCount, setEventCount] = useState<number | null>(null);

  const handleLearningCounts = useCallback(
    (counts: { courses: number; events: number }) => {
      setCourseCount(counts.courses);
      setEventCount(counts.events);
    },
    []
  );

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
      <div className="px-4 py-10 text-center text-stone-500 md:px-0" role="status">
        Loading your profile…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="px-4 md:px-0">
        <div className="rounded-2xl border border-brand-cream-dark bg-white p-6 text-center shadow-card">
          <p className="font-serif text-xl font-semibold text-brand-ink">Sign in to view your account</p>
          <p className="mt-2 text-sm text-brand-muted">
            Orders, saved details, and checkout preferences appear here after you sign in.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login?next=/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
            >
              Sign in
            </Link>
            <Link
              href="/signup?next=/profile"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-brand-forest/25 px-6 text-sm font-semibold text-brand-forest hover:bg-brand-forest/5"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const learningTabActive = activeTab === "courses" || activeTab === "events";

  const accountActions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {isAdminRole(user.role) ? (
        <Link
          href="/admin"
          className="inline-flex min-h-[36px] items-center justify-center rounded-full bg-brand-cream px-4 text-sm font-semibold text-brand-forest transition-colors hover:bg-white"
        >
          Admin panel
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-red-600 px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div
      className="flex flex-col gap-4 md:px-0"
      style={{ height: "calc(100dvh - var(--profile-offset, 10rem))", minHeight: "24rem" }}
    >
      <MobileSubpageHeader title="My account" backHref="/" trailing={accountActions} />

      <div className="hidden items-center justify-between gap-4 px-4 md:flex md:px-0">
        <h1 className="font-serif text-3xl font-semibold text-brand-ink">My account</h1>
        {accountActions}
      </div>

      {/* ── Tab bar (pinned): 2×2 on mobile, 4-across on desktop, no scrollbar ── */}
      <nav
        role="tablist"
        aria-label="Account sections"
        className="grid shrink-0 grid-cols-2 gap-2 px-4 sm:grid-cols-4 md:px-0"
      >
        <TabButton tab="details" label="My Details" active={activeTab === "details"} onSelect={setActiveTab} />
        <TabButton tab="orders" label="My Orders" count={orderCount} active={activeTab === "orders"} onSelect={setActiveTab} />
        <TabButton tab="courses" label="My Courses" count={courseCount} active={activeTab === "courses"} onSelect={setActiveTab} />
        <TabButton tab="events" label="My Events" count={eventCount} active={activeTab === "events"} onSelect={setActiveTab} />
      </nav>

      {/* ── Scrollable content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl px-4 md:px-0">
        <section
          role="tabpanel"
          id="profile-panel-details"
          aria-labelledby="profile-tab-details"
          hidden={activeTab !== "details"}
          className="rounded-2xl border border-brand-cream-dark bg-white p-6 shadow-card"
        >
          <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
            <div>
              <label htmlFor="profile-name" className="mb-2 block text-sm font-medium text-brand-ink">
                Name
              </label>
              <input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[#E3D9C8] bg-white px-4 text-sm text-brand-ink focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-brand-ink">
                Email
              </label>
              <input
                id="profile-email"
                value={user.email}
                readOnly
                className="min-h-[48px] w-full rounded-xl border border-[#E3D9C8] bg-brand-cream px-4 text-sm text-brand-muted"
              />
            </div>
            <div>
              <label htmlFor="profile-phone" className="mb-2 block text-sm font-medium text-brand-ink">
                Phone
              </label>
              <input
                id="profile-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                className="min-h-[48px] w-full rounded-xl border border-[#E3D9C8] bg-white px-4 text-sm text-brand-ink focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                autoComplete="tel"
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-brand-sage">{message}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        <section
          role="tabpanel"
          id="profile-panel-orders"
          aria-labelledby="profile-tab-orders"
          hidden={activeTab !== "orders"}
          className="rounded-2xl border border-brand-cream-dark bg-white p-6 shadow-card"
        >
          <YourOrders accountEmail={user.email} onCount={setOrderCount} />
        </section>

        <section
          role="tabpanel"
          id={activeTab === "events" ? "profile-panel-events" : "profile-panel-courses"}
          aria-labelledby={activeTab === "events" ? "profile-tab-events" : "profile-tab-courses"}
          hidden={!learningTabActive}
          className="rounded-2xl border border-brand-cream-dark bg-white p-6 shadow-card"
        >
          <YourLearning show={activeTab === "events" ? "events" : "courses"} onCounts={handleLearningCounts} />
        </section>
      </div>
    </div>
  );
}
