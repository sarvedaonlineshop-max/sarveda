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
  "w-full rounded-full border border-[#E3D9C8] bg-white/88 px-4 py-3 font-sans text-[13px] text-brand-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] placeholder:text-[11px] placeholder:text-brand-ink/42 transition focus:border-[#5fbe48] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#5fbe48]/18";

const BTN_GREEN =
  "w-full rounded-full bg-gradient-to-b from-[#8fd46a] to-[#5fbe48] py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(95,190,72,0.32)] transition duration-300 hover:-translate-y-0.5 hover:from-[#7fc85c] hover:to-[#52b03e] hover:shadow-[0_14px_30px_rgba(95,190,72,0.4)] disabled:opacity-60";

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

  const [mode, setMode] = useState<LoginMode>("otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordExpired, setPasswordExpired] = useState(false);
  const [message, setMessage] = useState(() => {
    if (err === "google") return "Google sign-in was cancelled or failed. Please try again.";
    if (err === "google_profile") return "We could not read your Google profile. Try another account.";
    if (err) return `Sign-in error: ${err}`;
    if (reason === "reauth") return "Please sign in again to continue.";
    return "";
  });

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
      title="Welcome back"
      subtitle="Sign in to continue your Sarveda journey."
      footer={
        <div>
          {mode === "password" ? (
            <>
              <div className="h-px w-full bg-[#eadfcd]" />
              <p className="py-2.5 text-center">
                <Link
                  href={
                    email.trim()
                      ? `/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`
                      : "/forgot-password"
                  }
                  className="text-sm font-medium text-[#4a8c3f] underline underline-offset-2 hover:text-[#3f7a36]"
                >
                  Forgot password?
                </Link>
              </p>
              <div className="h-px w-full bg-[#eadfcd]" />
            </>
          ) : null}
          <p className={`${mode === "password" ? "mt-2" : "mt-0"} text-center text-sm`}>
            <span className="text-[#526158]">New here?</span>{" "}
            <Link
              href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="font-bold text-[#b98a3e] hover:text-[#9a6f2d]"
            >
              Create an account
            </Link>
          </p>
          {!adminOnly ? (
            <p className="mt-2 text-center text-sm">
              <Link href="/store" className="font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                Shop as guest
              </Link>
            </p>
          ) : null}
        </div>
      }
    >
      <GoogleSignInButton nextPath={googleNextPath} compact variant="primary" />

      <div className="my-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-ink/45">
        <span className="h-px flex-1 bg-brand-cream-dark" />
        <span>OR</span>
        <span className="h-px flex-1 bg-brand-cream-dark" />
      </div>

      {/* Slim sliding mode toggle — leaf green to match the nature background. */}
      <div className="relative mb-3 rounded-full border border-[#c5d6b8] bg-[#eef5e8] p-1 shadow-[inset_0_1px_2px_rgba(16,32,26,0.04)]">
        <div
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-b from-[#8fd46a] to-[#5fbe48] shadow-[0_7px_18px_rgba(95,190,72,0.3)] transition-transform duration-300 ease-out"
          style={{ transform: mode === "password" ? "translateX(100%)" : "translateX(0)" }}
          aria-hidden
        />
        <div className="relative z-10 grid grid-cols-2">
          <button
            type="button"
            onClick={() => switchMode("otp")}
            className={`rounded-full px-2 py-1.5 text-[13px] font-bold transition-colors duration-300 sm:px-3 sm:py-2 sm:text-sm ${
              mode === "otp" ? "text-white" : "text-[#3f5a38]/75 hover:text-[#2f4529]"
            }`}
          >
            OTP Login
          </button>
          <button
            type="button"
            onClick={() => switchMode("password")}
            className={`rounded-full px-2 py-1.5 text-[13px] font-bold transition-colors duration-300 sm:px-3 sm:py-2 sm:text-sm ${
              mode === "password" ? "text-white" : "text-[#3f5a38]/75 hover:text-[#2f4529]"
            }`}
          >
            Password Login
          </button>
        </div>
      </div>

      <div key={mode} className="animate-[fadeSlide_280ms_ease-out]">
        {mode === "otp" ? (
          <OtpLoginForm
            inputClass={inputClass}
            onSuccess={finishLogin}
            initialEmail={email}
            onEmailChange={setEmail}
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
            </div>
            {passwordExpired ? (
              <p className="text-sm text-red-600" role="alert">
                Password expired. Please set your new password using{" "}
                <Link
                  href={`/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                  className="font-medium text-[#4a8c3f] underline hover:text-[#3f7a36]"
                >
                  this link
                </Link>{" "}
                or{" "}
                <button
                  type="button"
                  className="font-medium text-[#4a8c3f] underline hover:text-[#3f7a36]"
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
