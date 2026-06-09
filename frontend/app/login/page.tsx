"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OtpLoginForm } from "@/components/auth/OtpLoginForm";
import { PasswordInput } from "@/components/auth/PasswordInput";
import type { PublicUser } from "@/lib/auth-client";
import {
  loginWithPassword,
  resolvePostLoginPath
} from "@/lib/auth-client";

const inputClass =
  "w-full rounded-xl border border-stone-600 bg-stone-950/70 px-3 py-2.5 text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

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
  /** Stored in OAuth cookie — backend also applies role-based landing. */
  const googleNextPath = next ?? (adminOnly ? "/admin" : "/");

  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(() => {
    if (err === "google") return "Google sign-in was cancelled or failed. Please try again.";
    if (err === "google_profile") return "We could not read your Google profile. Try another account.";
    if (err) return `Sign-in error: ${err}`;
    if (reason === "reauth") return "Please sign in again — your session needs to be refreshed for admin access.";
    return "";
  });

  function finishLogin(user: PublicUser) {
    const destination = resolvePostLoginPath(user, next, { adminOnly });
    router.replace(destination);
    router.refresh();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const user = await loginWithPassword(email, password);
      finishLogin(user);
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  const subtitle =
    mode === "otp"
      ? adminOnly
        ? "Enter your admin email and we will send a one-time sign-in code."
        : "Sign in with a one-time code sent to your email."
      : adminOnly
        ? "Use your Sarveda admin account, or continue with Google."
        : "Sign in with email, OTP, or Google to continue shopping.";

  return (
    <AuthShell
      title={adminOnly ? "Admin sign-in" : "Welcome back"}
      subtitle={subtitle}
      footer={
        <div className="space-y-3 text-center text-sm text-stone-400">
          {!adminOnly ? (
            <p>
              New here?{" "}
              <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-amber-400 hover:text-amber-300">
                Create an account
              </Link>
            </p>
          ) : null}
          <Link href="/" className="block text-amber-500 hover:text-amber-400">
            Back to storefront
          </Link>
        </div>
      }
    >
      <GoogleSignInButton nextPath={googleNextPath} />

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-stone-500">
        <span className="h-px flex-1 bg-stone-700" />
        <span>or sign in with</span>
        <span className="h-px flex-1 bg-stone-700" />
      </div>

      <div className="mb-6 flex rounded-xl border border-stone-700 bg-stone-950/50 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setMessage("");
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mode === "password"
              ? "bg-amber-500 text-stone-900"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("otp");
            setMessage("");
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mode === "otp"
              ? "bg-amber-500 text-stone-900"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          Email OTP
        </button>
      </div>

      {mode === "otp" ? (
        <OtpLoginForm inputClass={inputClass} onSuccess={finishLogin} />
      ) : (
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
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
            <p className="mt-2 text-right text-sm">
              <Link href="/forgot-password" className="text-amber-400 hover:text-amber-300">
                Forgot password?
              </Link>
            </p>
          </div>
          {message ? (
            <p className="text-sm text-red-400" role="alert">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-stone-900 transition-colors hover:bg-amber-400 disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-400">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
