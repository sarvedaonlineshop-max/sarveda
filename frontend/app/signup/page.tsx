"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { loginWithPassword, registerAccount } from "@/lib/auth-client";

const inputClass =
  "w-full rounded-xl border border-[#E3D9C8] bg-white px-3 py-2.5 text-brand-ink placeholder:text-brand-muted/70 focus:border-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-forest/20";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const googleNextPath = next ?? "/shop";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    const q = params.toString();
    return q ? `/login?${q}` : "/login";
  }, [next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    if (password !== confirmPassword) {
      setMessage("Passwords do not match. Please re-enter the same password.");
      setSubmitting(false);
      return;
    }
    try {
      await registerAccount({ name, email, password, confirmPassword });
      await loginWithPassword(email, password);
      setSuccess(true);
      window.setTimeout(() => {
        const destination = next?.startsWith("/") ? next : "/shop";
        router.replace(destination);
        router.refresh();
      }, 2000);
    } catch (ex) {
      setMessage(ex instanceof Error ? ex.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <AuthShell
        variant="light"
        title="Account created"
        subtitle="A confirmation email is on its way. Redirecting you to the Sarveda shop…"
      >
        <p className="rounded-xl border border-brand-forest/20 bg-brand-forest/5 px-4 py-3 text-sm text-brand-forest" role="status">
          Welcome to Sarveda! Your account was created successfully.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      variant="light"
      title="Create your account"
      subtitle="Join Sarveda with email or Google. Password must be at least 8 characters."
      footer={
        <p className="text-center text-sm text-brand-muted">
          Already have an account?{" "}
          <Link href={loginHref} className="text-brand-gold hover:text-brand-forest">
            Sign in
          </Link>
        </p>
      }
    >
      <GoogleSignInButton nextPath={googleNextPath} label="Sign up with Google" />

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-brand-muted">
        <span className="h-px flex-1 bg-brand-cream-dark" />
        <span>or email</span>
        <span className="h-px flex-1 bg-brand-cream-dark" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name" className="sr-only">
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={inputClass}
          />
        </div>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            placeholder="Password (8+ characters)"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="sr-only">
            Re-enter password
          </label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter password"
            className={inputClass}
          />
        </div>
        {message ? (
          <p className="text-sm text-red-600" role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-brand-forest py-3 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-brand-cream text-brand-muted">
          Loading…
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
