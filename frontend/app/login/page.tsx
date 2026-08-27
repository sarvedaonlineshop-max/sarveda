"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OtpLoginForm } from "@/components/auth/OtpLoginForm";
import { PasswordInput } from "@/components/auth/PasswordInput";
import type { PublicUser } from "@/lib/auth-client";
import {
  AuthError,
  fetchMe,
  isAdminRole,
  loginWithPassword,
  navigateAfterAuth
} from "@/lib/auth-client";

const inputClass =
  "w-full rounded-xl border border-[#E3D9C8] bg-white px-3 py-2.5 font-sans text-brand-ink placeholder:text-brand-ink/45 focus:border-[#166D46] focus:outline-none focus:ring-2 focus:ring-[#166D46]/20";

const BTN_GREEN =
  "w-full rounded-full bg-[#166D46] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#145a3a] disabled:opacity-60 sm:py-3";

type LoginMode = "password" | "otp";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const err = searchParams.get("error");
  const reason = searchParams.get("reason");
  const adminOnly = useMemo(
    () => Boolean(next?.startsWith("/admin") || searchParams.get("admin") === "1"),
    [next, searchParams]
  );
  /** Stored in OAuth cookie — backend also forces /admin for admin roles. */
  const googleNextPath = next ?? (adminOnly ? "/admin" : "/");

  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordExpired, setPasswordExpired] = useState(false);
  const [message, setMessage] = useState(() => {
    if (err === "google") return "Google sign-in was cancelled or failed. Please try again.";
    if (err === "google_profile") return "We could not read your Google profile. Try another account.";
    if (err) return `Sign-in error: ${err}`;
    if (reason === "reauth") return "Please sign in again — your session needs to be refreshed for admin access.";
    return "";
  });

  // Already signed in as admin → go straight to admin (never stay on storefront login).
  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((user) => {
      if (cancelled || !user || !isAdminRole(user.role)) return;
      window.location.assign(next?.startsWith("/admin") ? next : "/admin");
    });
    return () => {
      cancelled = true;
    };
  }, [next]);

  function finishLogin(user: PublicUser) {
    void navigateAfterAuth(user, next, {
      adminOnly,
      softNavigate: (path) => {
        router.replace(path);
        router.refresh();
      }
    }).catch((ex) => {
      setMessage(ex instanceof Error ? ex.message : "Sign-in failed");
    });
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    setPasswordExpired(false);
    try {
      const user = await loginWithPassword(email, password);
      finishLogin(user);
    } catch (ex) {
      if (ex instanceof AuthError && ex.code === "MIGRATED_ACCOUNT_USE_OTP") {
        setPasswordExpired(true);
      } else {
        setMessage(ex instanceof Error ? ex.message : "Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setMessage("");
    setPasswordExpired(false);
  }

  return (
    <AuthShell
      variant="light"
      showMobileLogo
      compactMobile
      title={adminOnly ? "Admin sign-in" : "Welcome back"}
      footer={
        !adminOnly ? (
          <p className="text-center text-sm">
            <span className="text-brand-gold">New here?</span>{" "}
            <Link
              href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-semibold text-[#166D46] hover:text-[#145a3a]"
            >
              Create an account
            </Link>
          </p>
        ) : null
      }
    >
      <GoogleSignInButton nextPath={googleNextPath} compact />

      <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-ink/50 sm:my-5">
        <span className="h-px flex-1 bg-brand-cream-dark" />
        <span>OR</span>
        <span className="h-px flex-1 bg-brand-cream-dark" />
      </div>

      {/* Sliding mode toggle — content swaps so OTP does not inherit password form height */}
      <div className="relative mb-3 rounded-full border border-brand-cream-dark bg-brand-cream p-1 sm:mb-5">
        <div
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#166D46] shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: mode === "otp" ? "translateX(100%)" : "translateX(0)" }}
          aria-hidden
        />
        <div className="relative z-10 grid grid-cols-2">
          <button
            type="button"
            onClick={() => switchMode("password")}
            className={`rounded-full px-2 py-2 text-[13px] font-semibold transition-colors duration-300 sm:px-3 sm:py-2.5 sm:text-sm ${
              mode === "password" ? "text-white" : "text-brand-ink/70 hover:text-brand-ink"
            }`}
          >
            Password login
          </button>
          <button
            type="button"
            onClick={() => switchMode("otp")}
            className={`rounded-full px-2 py-2 text-[13px] font-semibold transition-colors duration-300 sm:px-3 sm:py-2.5 sm:text-sm ${
              mode === "otp" ? "text-white" : "text-brand-ink/70 hover:text-brand-ink"
            }`}
          >
            OTP Login
          </button>
        </div>
      </div>

      <div
        key={mode}
        className="animate-[fadeSlide_280ms_ease-out]"
      >
        {mode === "otp" ? (
          <OtpLoginForm
            key={`otp-${email.trim().toLowerCase()}`}
            inputClass={inputClass}
            onSuccess={finishLogin}
            initialEmail={email}
            compact
          />
        ) : (
          <form className="space-y-3 sm:space-y-4" onSubmit={handlePasswordSubmit}>
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={setPassword}
                placeholder="Password"
                className={inputClass}
              />
              <p className="mt-1.5 text-right text-sm sm:mt-2">
                <Link
                  href={
                    email.trim()
                      ? `/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`
                      : "/forgot-password"
                  }
                  className="font-medium text-[#166D46] hover:text-[#145a3a]"
                >
                  Forgot password?
                </Link>
              </p>
            </div>
            {passwordExpired ? (
              <p className="text-sm text-red-600" role="alert">
                Password expired. Please set your new password using{" "}
                <Link
                  href={`/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                  className="font-medium text-[#166D46] underline hover:text-[#145a3a]"
                >
                  this link
                </Link>{" "}
                or{" "}
                <button
                  type="button"
                  className="font-medium text-[#166D46] underline hover:text-[#145a3a]"
                  onClick={() => switchMode("otp")}
                >
                  use OTP login
                </button>
                .
              </p>
            ) : message ? (
              <p className="text-sm text-red-600" role="alert">
                {message}
              </p>
            ) : null}
            <button type="submit" disabled={submitting} className={BTN_GREEN}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>

      {!adminOnly ? (
        <Link
          href="/shop"
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-[#166D46] bg-white text-sm font-semibold text-[#166D46] transition-colors hover:bg-[#166D46]/5 sm:mt-4 sm:min-h-[48px] md:hidden"
        >
          Shop as guest
        </Link>
      ) : null}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-cream font-sans text-brand-ink/70">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
