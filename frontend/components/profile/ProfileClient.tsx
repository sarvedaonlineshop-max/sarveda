"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import { YourLearning } from "@/components/profile/YourLearning";
import { YourOrders } from "@/components/profile/YourOrders";
import type { PublicUser } from "@/lib/auth-client";
import {
  fetchProfileDetails,
  logoutSession,
  updateProfile,
  type PrimaryAddress
} from "@/lib/auth-client";
import { INDIAN_STATES } from "@/lib/indian-states";
import { validateProfileForm, type ProfileFieldErrors } from "@/lib/profile-validation";

type TabKey = "details" | "orders" | "courses" | "events";

const MOBILE_TITLES: Record<TabKey, string> = {
  details: "My profile",
  orders: "My orders",
  courses: "My Courses",
  events: "My events"
};

function isTabKey(value: string | null): value is TabKey {
  return value === "details" || value === "orders" || value === "courses" || value === "events";
}

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
          ? "bg-[#108967] text-white shadow-sm"
          : "border border-brand-cream-dark bg-white text-brand-ink hover:bg-[#108967]/10"
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
  const searchParams = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shippingFullName, setShippingFullName] = useState("");
  const [addressPhone, setAddressPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("IN");
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "details";
    const tab = new URLSearchParams(window.location.search).get("tab");
    return isTabKey(tab) ? tab : "details";
  });
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
    const tab = searchParams.get("tab");
    setActiveTab(isTabKey(tab) ? tab : "details");
  }, [searchParams]);

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    const next = tab === "details" ? "/profile" : `/profile?tab=${tab}`;
    router.replace(next, { scroll: false });
  }

  function applyPrimaryAddress(addr: PrimaryAddress | null, sessionUser: PublicUser) {
    if (!addr) return;
    setShippingFullName(addr.fullName);
    setAddressPhone(addr.phone.replace(/^\+\d+/, ""));
    setLine1(addr.line1);
    setLine2(addr.line2 ?? "");
    setCity(addr.city);
    setState(addr.state);
    setPostalCode(addr.postalCode);
    setCountry(addr.country || "IN");
    if (!sessionUser.phone?.trim()) {
      setPhone(addr.phone.replace(/^\+\d+/, ""));
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchProfileDetails().then((session) => {
      if (cancelled || !session) {
        if (!cancelled) setLoading(false);
        return;
      }
      setUser(session.user);
      setName(session.user.name?.trim() ?? "");
      setPhone(session.user.phone?.replace(/^\+\d+/, "") ?? "");
      applyPrimaryAddress(session.primaryAddress, session.user);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await logoutSession();
    setUser(null);
    router.replace("/");
    router.refresh();
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const form = {
      name,
      phone,
      email: user.email,
      shippingFullName: shippingFullName || name,
      line1,
      line2,
      city,
      state,
      postalCode,
      country
    };
    const validation = validateProfileForm(form);
    setShowAllErrors(true);
    setFieldErrors(validation.fieldErrors);
    if (validation.message) {
      setError(validation.message);
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await updateProfile({
        name: form.name,
        phone: form.phone,
        address: {
          fullName: form.shippingFullName,
          phone: addressPhone.trim() || form.phone,
          line1: form.line1,
          line2: form.line2.trim() || null,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: form.country
        }
      });
      setUser(updated.user);
      setName(updated.user.name?.trim() ?? "");
      setPhone(updated.user.phone?.replace(/^\+\d+/, "") ?? "");
      applyPrimaryAddress(updated.primaryAddress, updated.user);
      setMessage("Profile and delivery address saved.");
      setShowAllErrors(false);
      setFieldErrors({});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  function fieldState(key: keyof ProfileFieldErrors): "idle" | "invalid" {
    if (!showAllErrors) return "idle";
    return fieldErrors[key] ? "invalid" : "idle";
  }

  function fieldClass(key: keyof ProfileFieldErrors): string {
    const base =
      "min-h-[44px] w-full rounded-xl border px-4 text-sm text-brand-ink focus:outline-none focus:ring-2";
    return fieldState(key) === "invalid"
      ? `${base} border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-red-500/20`
      : `${base} border-[#E3D9C8] bg-white focus:border-brand-gold focus:ring-brand-gold/30`;
  }

  function FieldError({ name }: { name: keyof ProfileFieldErrors }) {
    if (!showAllErrors || !fieldErrors[name]) return null;
    return (
      <p className="mt-1 text-xs text-red-600" role="alert">
        {fieldErrors[name]}
      </p>
    );
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
              href={`/login?next=${encodeURIComponent(`/profile?tab=${activeTab}`)}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#22c55e] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#16a34a]"
            >
              Sign in
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(`/profile?tab=${activeTab}`)}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#dc2626] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b91c1c]"
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
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="inline-flex min-h-[36px] items-center justify-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1ebe57]"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 md:gap-4 md:px-0">
      <MobileSubpageHeader title={MOBILE_TITLES[activeTab]} backHref="/" />

      <div className="hidden sticky top-[var(--storefront-header-live-offset)] z-20 space-y-4 border-b border-brand-cream-dark/70 bg-white/95 pb-4 backdrop-blur-md md:block">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-serif text-3xl font-semibold text-brand-ink">My account</h1>
          {accountActions}
        </div>

        <nav
          role="tablist"
          aria-label="Account sections"
          className="shrink-0 gap-2 md:grid md:grid-cols-4"
        >
          <TabButton tab="details" label="My Details" active={activeTab === "details"} onSelect={selectTab} />
          <TabButton tab="orders" label="My Orders" count={orderCount} active={activeTab === "orders"} onSelect={selectTab} />
          <TabButton tab="courses" label="My Courses" count={courseCount} active={activeTab === "courses"} onSelect={selectTab} />
          <TabButton tab="events" label="My Events" count={eventCount} active={activeTab === "events"} onSelect={selectTab} />
        </nav>
      </div>

      {/* Single page scroll — no nested overflow */}
      <div className="px-3 pb-6 md:px-0 md:pb-0">
        <section
          role="tabpanel"
          id="profile-panel-details"
          aria-labelledby="profile-tab-details"
          hidden={activeTab !== "details"}
          className="rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card md:p-8"
        >
          <form onSubmit={(event) => void handleSave(event)} className="space-y-6">
            <div>
              <h2 className="font-serif text-xl font-semibold text-brand-ink">Personal details</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="mb-2 block text-sm font-medium text-brand-ink">
                  Name
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={fieldClass("name")}
                  autoComplete="name"
                />
                <FieldError name="name" />
              </div>
              <div>
                <label htmlFor="profile-phone" className="mb-2 block text-sm font-medium text-brand-ink">
                  Mobile number
                </label>
                <input
                  id="profile-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  className={fieldClass("phone")}
                  autoComplete="tel"
                  placeholder="10-digit mobile"
                />
                <FieldError name="phone" />
              </div>
            </div>

            <div>
              <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-brand-ink">
                Email
              </label>
              <input
                id="profile-email"
                value={user.email}
                readOnly
                className="min-h-[44px] w-full rounded-xl border border-[#E3D9C8] bg-brand-cream px-4 text-sm text-brand-muted"
              />
              <p className="mt-1 text-xs text-brand-muted">Cannot modify - contact admin</p>
            </div>

            <div className="border-t border-brand-cream-dark pt-6">
              <h3 className="font-serif text-lg font-semibold text-brand-ink">Primary delivery address</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="profile-recipient" className="mb-2 block text-sm font-medium text-brand-ink">
                  Recipient name
                </label>
                <input
                  id="profile-recipient"
                  value={shippingFullName}
                  onChange={(event) => setShippingFullName(event.target.value)}
                  className={fieldClass("shippingFullName")}
                  autoComplete="shipping name"
                />
                <FieldError name="shippingFullName" />
              </div>
              <div>
                <label htmlFor="profile-address-phone" className="mb-2 block text-sm font-medium text-brand-ink">
                  Delivery phone
                </label>
                <input
                  id="profile-address-phone"
                  value={addressPhone}
                  onChange={(event) => setAddressPhone(event.target.value)}
                  inputMode="tel"
                  className={fieldClass("phone")}
                  autoComplete="tel"
                  placeholder="Same as mobile if blank"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profile-line1" className="mb-2 block text-sm font-medium text-brand-ink">
                Address line 1
              </label>
              <input
                id="profile-line1"
                value={line1}
                onChange={(event) => setLine1(event.target.value)}
                className={fieldClass("line1")}
                autoComplete="address-line1"
              />
              <FieldError name="line1" />
            </div>

            <div>
              <label htmlFor="profile-line2" className="mb-2 block text-sm font-medium text-brand-ink">
                Address line 2 (optional)
              </label>
              <input
                id="profile-line2"
                value={line2}
                onChange={(event) => setLine2(event.target.value)}
                className={fieldClass("line2")}
                autoComplete="address-line2"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="profile-city" className="mb-2 block text-sm font-medium text-brand-ink">
                  City
                </label>
                <input
                  id="profile-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className={fieldClass("city")}
                  autoComplete="address-level2"
                />
                <FieldError name="city" />
              </div>
              <div>
                <label htmlFor="profile-state" className="mb-2 block text-sm font-medium text-brand-ink">
                  State
                </label>
                <select
                  id="profile-state"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  className={fieldClass("state")}
                  autoComplete="address-level1"
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <FieldError name="state" />
              </div>
              <div>
                <label htmlFor="profile-pin" className="mb-2 block text-sm font-medium text-brand-ink">
                  PIN code
                </label>
                <input
                  id="profile-pin"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  className={fieldClass("postalCode")}
                  autoComplete="postal-code"
                />
                <FieldError name="postalCode" />
              </div>
            </div>

            {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
            {message ? <p className="text-sm text-brand-sage">{message}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#25D366] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe57] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
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
