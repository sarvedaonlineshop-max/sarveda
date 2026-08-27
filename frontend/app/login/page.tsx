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
  "w-full rounded-full bg-[#166D46] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#145a3a] disabled:opacity-60";

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

  const subtitle =
    mode === "otp"
      ? adminOnly
        ? "Enter your admin email and we will send a one-time sign-in code."
        : "Sign in with a one-time code sent to your email."
      : adminOnly
        ? "Use your Sarveda admin account, or continue with Google."
        : "Sign in with email, OTP, or Gmail to continue shopping.";

  return (
    <AuthShell
      variant="light"
      showMobileLogo
      title={adminOnly ? "Admin sign-in" : "Welcome back"}
      subtitle={subtitle}
      footer={
        !adminOnly ? (
          <p className="text-center text-sm text-brand-ink/75">
            New here?{" "}
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
      <GoogleSignInButton nextPath={googleNextPath} />

      <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-ink/55">
        <span className="h-px flex-1 bg-brand-cream-dark" />
        <span>or sign in with</span>
        <span className="h-px flex-1 bg-brand-cream-dark" />
      </div>

      {/* Sliding mode toggle */}
      <div className="relative mb-6 rounded-full border border-brand-cream-dark bg-brand-cream p-1">
        <div
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#166D46] shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: mode === "otp" ? "translateX(100%)" : "translateX(0)" }}
          aria-hidden
        />
        <div className="relative z-10 grid grid-cols-2">
          <button
            type="button"
            onClick={() => switchMode("password")}
            className={`rounded-full px-3 py-2.5 text-sm font-semibold transition-colors duration-300 ${
              mode === "password" ? "text-white" : "text-brand-ink/70 hover:text-brand-ink"
            }`}
          >
            Login with Password
          </button>
          <button
            type="button"
            onClick={() => switchMode("otp")}
            className={`rounded-full px-3 py-2.5 text-sm font-semibold transition-colors duration-300 ${
              mode === "otp" ? "text-white" : "text-brand-ink/70 hover:text-brand-ink"
            }`}
          >
            Login with OTP
          </button>
        </div>
      </div>

      {/* Sliding panels */}
      <div className="overflow-hidden">
        <div
          className="flex w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: mode === "otp" ? "translateX(-50%)" : "translateX(0)" }}
        >
          <div className="w-1/2 shrink-0 pr-0.5">
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <div>
                <label htmlFor="email" className="sr-only">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required={mode === "password"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className={inputClass}
                  tabIndex={mode === "password" ? 0 : -1}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  required={mode === "password"}
                  value={password}
                  onChange={setPassword}
                  placeholder="Password"
                  className={inputClass}
                />
                <p className="mt-2 text-right text-sm">
                  <Link
                    href={
                      email.trim()
                        ? `/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`
                        : "/forgot-password"
                    }
                    className="font-medium text-[#166D46] hover:text-[#145a3a]"
                    tabIndex={mode === "password" ? 0 : -1}
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
              ) : message && mode === "password" ? (
                <p className="text-sm text-red-600" role="alert">
                  {message}
                </p>
              ) : null}
              <button type="submit" disabled={submitting} className={BTN_GREEN} tabIndex={mode === "password" ? 0 : -1}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <div className="w-1/2 shrink-0 pl-0.5" aria-hidden={mode !== "otp"}>
            <OtpLoginForm
              key={`otp-${email.trim().toLowerCase()}`}
              inputClass={inputClass}
              onSuccess={finishLogin}
              initialEmail={email}
            />
          </div>
        </div>
      </div>

      {!adminOnly ? (
        <Link
          href="/shop"
          className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-full border-2 border-[#166D46] bg-white text-sm font-semibold text-[#166D46] transition-colors hover:bg-[#166D46]/5 md:hidden"
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
